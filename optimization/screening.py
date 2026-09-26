"""
screening.py - Use M5's fast predictions to shortlist candidates for the accurate runs (PRD sections 11.7 and 12).

ML only SCREENS. It decides which candidates are worth the expensive RC verification; it never supplies a final number.
Predictions are kept in ``ScreeningResult`` and nowhere else: nothing in this module builds an ObjectiveResult, and the
verified values that decide the recommendation come only from ``rc_verification``.

The interface M6 expects from M5 (duck-typed; see ``Predictor`` / ``Prediction``):
    predictor.predict(candidates) -> one prediction per candidate, same order, each with
        status         "ok" | "out_of_distribution" | "model_unavailable"
        values         {target: float} when ok. Targets M5 predicts: min/max occupied temperature, comfort hours,
                       peak heating kW, heating energy kWh, max zone imbalance
        reason, model_version, label_source ("m4" | "stand_in")

Routing (every candidate ends up in exactly one place):
    ok + complete           -> ML decides: shortlisted for RC, or discarded (SCREENED_BY_ML)
    out_of_distribution     -> straight to RC (the model has not seen designs like this)
    model_unavailable       -> straight to RC (no model, or it failed)
    incomplete / dev-only   -> straight to RC (a prediction that lacks a needed value, or came from a stand-in model)
    rejected by constraints -> excluded (when constraint reports are given)
A predictor that crashes is treated as unavailable: ML never blocks the physics.

The safety margin. A candidate is discarded only if some other candidate is better by MORE than twice the margin on
EVERY screening dimension and strictly better on at least one (margin = ``safety_margin`` x the range of that dimension
among the screened candidates). If every prediction is within one margin of the truth, a truly Pareto-optimal design can
therefore never be discarded: the discard rule implies true dominance. The optional size cap (``shortlist_size``) is a
budget, not a safety property; when it bites, the best-ranked designs (non-dominated layer, then a normalised sum, then
id) are kept and the rest carry the reason "beyond the shortlist limit".
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Literal, Mapping, Protocol, Sequence, runtime_checkable

from cocoon_contracts.simulation import RecommendationState

from optimization.constraints import ConstraintReport

STATUS_OK, STATUS_OOD, STATUS_UNAVAILABLE = "ok", "out_of_distribution", "model_unavailable"
STATUSES = (STATUS_OK, STATUS_OOD, STATUS_UNAVAILABLE)
ML_TARGETS = ("min_occupied_temperature_c", "mean_occupied_temperature_c", "max_occupied_temperature_c", "comfort_hours",
              "peak_heating_kw", "heating_energy_kwh", "max_zone_imbalance_c")

# routes
ML_SHORTLIST = "ml_shortlist"
ML_DOMINATED = "ml_discarded_dominated"
ML_OVER_LIMIT = "ml_discarded_over_limit"
DIRECT_UNAVAILABLE = "direct_model_unavailable"
DIRECT_OOD = "direct_out_of_distribution"
DIRECT_INCOMPLETE = "direct_incomplete_prediction"
DIRECT_DEV_ONLY = "direct_development_only"
DIRECT_NO_DIMENSION = "direct_no_common_dimension"
EXCLUDED = "excluded_by_constraints"


class ScreeningError(ValueError):
    code = "SCREENING_ERROR"

    def __init__(self, message: str, code: str | None = None, details: dict | None = None):
        if code:
            self.code = code
        self.details = details or {}
        super().__init__(message)


# ----- the interface to M5 ----------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Prediction:
    status: str
    values: Mapping[str, float] | None = None
    reason: str | None = None
    model_version: str | None = None
    label_source: str | None = "m4"


@runtime_checkable
class Predictor(Protocol):
    def predict(self, candidates: Sequence[Any]) -> Sequence[Any]: ...


class NoModel:
    """Used until M5 is connected (or when no model has been trained): every candidate goes to the physics."""

    def predict(self, candidates: Sequence[Any]) -> list[Prediction]:
        return [Prediction(STATUS_UNAVAILABLE, None, "no trained model (M5 not connected, or not trained yet)") for _ in candidates]


# ----- settings -----------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class ScreeningDimension:
    name: str
    direction: Literal["min", "max"]
    source: Literal["predicted", "known"]          # predicted by M5, or known exactly from the candidate
    key: str                                       # prediction target, or the known quantity


SCREENING_DIMENSIONS: Mapping[str, ScreeningDimension] = {d.name: d for d in (
    ScreeningDimension("heating_energy_kwh", "min", "predicted", "heating_energy_kwh"),
    ScreeningDimension("peak_heating_kw", "min", "predicted", "peak_heating_kw"),
    ScreeningDimension("max_occupied_temperature_c", "min", "predicted", "max_occupied_temperature_c"),     # overheating proxy
    ScreeningDimension("min_occupied_temperature_c", "max", "predicted", "min_occupied_temperature_c"),     # cold-side proxy
    ScreeningDimension("comfort_hours", "max", "predicted", "comfort_hours"),
    ScreeningDimension("max_zone_imbalance_c", "min", "predicted", "max_zone_imbalance_c"),
    ScreeningDimension("mass_kg", "min", "known", "mass_kg"),
)}
DEFAULT_DIMENSIONS = ("heating_energy_kwh", "peak_heating_kw", "max_occupied_temperature_c", "min_occupied_temperature_c", "mass_kg")


@dataclass(frozen=True)
class ScreeningSettings:
    dimensions: tuple[str, ...] = DEFAULT_DIMENSIONS
    safety_margin: float = 0.10                    # PLACEHOLDER: fraction of each dimension's range
    shortlist_size: int | None = 20                # PLACEHOLDER: at most this many ML-screened designs go to RC (None = no cap)
    min_shortlist: int = 5                         # PLACEHOLDER: at least this many ML-screened designs go to RC
    allow_development_predictions: bool = False    # predictions from a stand-in model are ignored unless this is set

    def __post_init__(self) -> None:
        if not self.dimensions or len(set(self.dimensions)) != len(self.dimensions):
            raise ScreeningError("dimensions must be a non-empty list without repeats", "INVALID_SETTINGS")
        unknown = [d for d in self.dimensions if d not in SCREENING_DIMENSIONS]
        if unknown:
            raise ScreeningError(f"unknown screening dimensions {unknown}", "INVALID_SETTINGS", {"unknown": unknown})
        if not 0.0 <= self.safety_margin < 1.0:
            raise ScreeningError("safety_margin must be in [0, 1)", "INVALID_SETTINGS")
        if self.shortlist_size is not None and self.shortlist_size < 1:
            raise ScreeningError("shortlist_size must be at least 1 (or None)", "INVALID_SETTINGS")
        if self.min_shortlist < 0 or (self.shortlist_size is not None and self.min_shortlist > self.shortlist_size):
            raise ScreeningError("min_shortlist must be >= 0 and not above shortlist_size", "INVALID_SETTINGS")


# ----- result -----------------------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class ScreeningRecord:
    design_id: str
    decision: Literal["send_to_rc", "discard", "exclude"]
    route: str
    reason: str
    ml_status: str | None = None
    predicted: Mapping[str, float] | None = None          # what M5 said. Never a final value.
    model_version: str | None = None
    label_source: str | None = None
    recommendation_state: RecommendationState | None = None        # SCREENED_BY_ML when ML decided; None otherwise
    ml_rank: int | None = None                                      # 1 = best predicted layer
    dominated_by: tuple[str, ...] = ()


@dataclass(frozen=True)
class ScreeningResult:
    records: tuple[ScreeningRecord, ...]                   # input order
    dimensions_used: tuple[str, ...]
    ml_used: bool
    model_versions: tuple[str, ...]
    warnings: tuple[str, ...]
    development_only: bool

    @property
    def to_rc(self) -> tuple[str, ...]:
        return tuple(r.design_id for r in self.records if r.decision == "send_to_rc")

    @property
    def discarded(self) -> tuple[str, ...]:
        return tuple(r.design_id for r in self.records if r.decision == "discard")

    @property
    def excluded(self) -> tuple[str, ...]:
        return tuple(r.design_id for r in self.records if r.decision == "exclude")

    @property
    def predictions(self) -> dict[str, Mapping[str, float]]:
        """What M5 predicted, by design. For reporting only."""
        return {r.design_id: r.predicted for r in self.records if r.predicted is not None}

    def record(self, design_id: str) -> ScreeningRecord:
        return next(r for r in self.records if r.design_id == design_id)

    def summary(self) -> dict[str, int]:
        out: dict[str, int] = {"candidates": len(self.records), "send_to_rc": len(self.to_rc), "discarded": len(self.discarded),
                               "excluded": len(self.excluded)}
        for r in self.records:
            out[r.route] = out.get(r.route, 0) + 1
        return out

    def to_dict(self) -> dict:
        return {
            "dimensions_used": list(self.dimensions_used), "ml_used": self.ml_used, "model_versions": list(self.model_versions),
            "warnings": list(self.warnings), "development_only": self.development_only, "summary": self.summary(),
            "records": [{"design_id": r.design_id, "decision": r.decision, "route": r.route, "reason": r.reason,
                         "ml_status": r.ml_status, "predicted": dict(r.predicted) if r.predicted else None,
                         "model_version": r.model_version, "label_source": r.label_source,
                         "recommendation_state": r.recommendation_state.value if r.recommendation_state else None,
                         "ml_rank": r.ml_rank, "dominated_by": list(r.dominated_by)} for r in self.records]}


# ----- helpers -------------------------------------------------------------------------------------------------------------
def _known_value(candidate: Any, key: str) -> float | None:
    if key == "mass_kg":
        q = getattr(candidate, "quantities", None)
        masses = [m.mass_kg for m in getattr(q, "materials", ())] if q is not None else None
        return None if not masses or any(m is None for m in masses) else float(sum(masses))
    return None


def _dominates(u: Sequence[float], v: Sequence[float]) -> bool:
    return all(a <= b for a, b in zip(u, v)) and any(a < b for a, b in zip(u, v))


def _layers(vectors: Mapping[str, tuple[float, ...]], order: Sequence[str]) -> dict[str, int]:
    rank, remaining, layer = {}, list(order), 1
    while remaining:
        current = [i for i in remaining if not any(_dominates(vectors[j], vectors[i]) for j in remaining if j != i)]
        if not current:                                    # cannot happen for a strict partial order
            raise ScreeningError("dominance formed a cycle", "DOMINANCE_CYCLE")
        for i in current:
            rank[i] = layer
        remaining = [i for i in remaining if i not in current]
        layer += 1
    return rank


def _safely_dominates(b: Sequence[float], a: Sequence[float], margins: Sequence[float]) -> bool:
    """b beats a even after b is made worse and a is made better by the margin (all vectors are 'lower is better')."""
    b_worse = [x + m for x, m in zip(b, margins)]
    a_better = [x - m for x, m in zip(a, margins)]
    return _dominates(b_worse, a_better)


# ----- the screening ---------------------------------------------------------------------------------------------------------
def screen_candidates(
    candidates: Sequence[Any],
    predictor: Predictor,
    settings: ScreeningSettings | None = None,
    *,
    reports: Mapping[str, ConstraintReport] | None = None,
) -> ScreeningResult:
    """Decide which candidates go to RC verification. ``candidates`` need ``.building.design_id`` (and ``.quantities``
    for the known dimensions), as an M2 Candidate has."""
    settings = settings or ScreeningSettings()
    ids = [c.building.design_id for c in candidates]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        raise ScreeningError(f"duplicate design ids {dup}", "DUPLICATE_DESIGN", {"ids": dup})

    warnings: list[str] = []
    records: dict[str, ScreeningRecord] = {}
    active = []
    for c in candidates:
        rep = reports.get(c.building.design_id) if reports is not None else None
        if rep is not None and not rep.ok:
            records[c.building.design_id] = ScreeningRecord(
                c.building.design_id, "exclude", EXCLUDED, "rejected by hard constraints: " + "; ".join(f.reason for f in rep.failed))
        else:
            active.append(c)

    predictions: list[Any] | None
    if not active:
        predictions = []
    else:
        try:
            predictions = list(predictor.predict(active))
        except Exception as exc:                            # ML must never block the physics
            predictions = None
            warnings.append(f"the predictor failed ({type(exc).__name__}: {exc}); every candidate goes to RC")
        if predictions is not None and len(predictions) != len(active):
            raise ScreeningError(f"the predictor returned {len(predictions)} predictions for {len(active)} candidates",
                                 "PREDICTOR_MISMATCH")

    dims = [SCREENING_DIMENSIONS[n] for n in settings.dimensions]
    needed_keys = [d.key for d in dims if d.source == "predicted"]
    screenable: list[tuple[Any, Any]] = []                  # (candidate, prediction) the model can speak for
    for i, c in enumerate(active):
        did = c.building.design_id
        p = None if predictions is None else predictions[i]
        if p is None:
            records[did] = ScreeningRecord(did, "send_to_rc", DIRECT_UNAVAILABLE, "the predictor failed; verified directly")
            continue
        status = getattr(p, "status", None)
        meta = dict(ml_status=status, model_version=getattr(p, "model_version", None), label_source=getattr(p, "label_source", None))
        if status == STATUS_UNAVAILABLE:
            records[did] = ScreeningRecord(did, "send_to_rc", DIRECT_UNAVAILABLE,
                                           f"no usable model: {getattr(p, 'reason', None) or 'unavailable'}; verified directly", **meta)
        elif status == STATUS_OOD:
            records[did] = ScreeningRecord(did, "send_to_rc", DIRECT_OOD,
                                           f"outside what the model has seen: {getattr(p, 'reason', None) or 'out of distribution'}; "
                                           "verified directly", **meta)
        elif status == STATUS_OK:
            values = getattr(p, "values", None) or {}
            dev = getattr(p, "label_source", "m4") == "stand_in" or bool(getattr(p, "development_only", False))
            missing = [k for k in needed_keys if k not in values or not math.isfinite(values[k])]
            if dev and not settings.allow_development_predictions:
                records[did] = ScreeningRecord(did, "send_to_rc", DIRECT_DEV_ONLY,
                                               "the prediction comes from a development-only model and is ignored; verified directly", **meta)
            elif missing:
                records[did] = ScreeningRecord(did, "send_to_rc", DIRECT_INCOMPLETE,
                                               f"the prediction lacks {missing}; verified directly", predicted=dict(values), **meta)
            else:
                screenable.append((c, p))
        else:
            raise ScreeningError(f"unknown prediction status '{status}' for {did}", "UNKNOWN_PREDICTION_STATUS", {"design": did})

    dims_used: list[ScreeningDimension] = []
    for d in dims:
        if d.source == "known" and any(_known_value(c, d.key) is None for c, _ in screenable):
            warnings.append(f"'{d.name}' is not known for every screened candidate, so it is not used")
        else:
            dims_used.append(d)

    if screenable and not dims_used:
        for c, p in screenable:
            did = c.building.design_id
            records[did] = ScreeningRecord(did, "send_to_rc", DIRECT_NO_DIMENSION, "no screening dimension is available; verified directly",
                                           ml_status=STATUS_OK, model_version=getattr(p, "model_version", None),
                                           label_source=getattr(p, "label_source", None))
        screenable = []

    model_versions: list[str] = []
    dev_used = False
    if screenable:
        order = [c.building.design_id for c, _ in screenable]
        raw: dict[str, list[float]] = {}
        for c, p in screenable:
            raw[c.building.design_id] = [float(p.values[d.key]) if d.source == "predicted" else float(_known_value(c, d.key))
                                         for d in dims_used]
        lo = [min(raw[i][k] for i in order) for k in range(len(dims_used))]
        hi = [max(raw[i][k] for i in order) for k in range(len(dims_used))]
        spans = [h - l for h, l in zip(hi, lo)]
        margins = [settings.safety_margin * s for s in spans]
        sign = [1.0 if d.direction == "min" else -1.0 for d in dims_used]
        vec = {i: tuple(sign[k] * raw[i][k] for k in range(len(dims_used))) for i in order}
        layer = _layers(vec, order)
        col_min = [min(vec[j][k] for j in order) for k in range(len(dims_used))]
        norm = {i: sum(((vec[i][k] - col_min[k]) / spans[k]) if spans[k] > 0 else 0.0 for k in range(len(dims_used)))
                for i in order}
        ranked = sorted(order, key=lambda i: (layer[i], norm[i], i))
        dominators = {i: [j for j in order if j != i and _safely_dominates(vec[j], vec[i], margins)] for i in order}
        safe = [i for i in ranked if not dominators[i]]
        chosen = safe if settings.shortlist_size is None else safe[:settings.shortlist_size]
        if len(chosen) < settings.min_shortlist:
            chosen = chosen + [i for i in ranked if i not in chosen][:settings.min_shortlist - len(chosen)]
        chosen_set = set(chosen)
        for c, p in screenable:
            did = c.building.design_id
            v = getattr(p, "model_version", None)
            if v and v not in model_versions:
                model_versions.append(v)
            dev_used = dev_used or getattr(p, "label_source", "m4") == "stand_in" or bool(getattr(p, "development_only", False))
            meta = dict(ml_status=STATUS_OK, predicted={d.name: raw[did][k] for k, d in enumerate(dims_used)},
                        model_version=v, label_source=getattr(p, "label_source", None),
                        recommendation_state=RecommendationState.SCREENED_BY_ML, ml_rank=layer[did])
            if did in chosen_set:
                reason = "shortlisted for RC verification" if did in safe else \
                    "kept to reach the minimum shortlist although the model ranks it lower"
                records[did] = ScreeningRecord(did, "send_to_rc", ML_SHORTLIST, reason, **meta)
            elif dominators[did]:
                records[did] = ScreeningRecord(
                    did, "discard", ML_DOMINATED,
                    f"predicted worse than {dominators[did][0]} by more than the safety margin on every dimension",
                    dominated_by=tuple(dominators[did]), **meta)
            else:
                records[did] = ScreeningRecord(did, "discard", ML_OVER_LIMIT,
                                               f"beyond the shortlist limit of {settings.shortlist_size} (best-ranked designs were kept)", **meta)

    ordered = tuple(records[i] for i in ids)
    return ScreeningResult(
        records=ordered, dimensions_used=tuple(d.name for d in dims_used) if screenable else (),
        ml_used=any(r.recommendation_state == RecommendationState.SCREENED_BY_ML for r in ordered),
        model_versions=tuple(model_versions), warnings=tuple(warnings), development_only=dev_used)
