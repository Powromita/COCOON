"""
backend/routes/economics.py — Module M7 integration surface (PRD §16.1, §16.5).

    GET  /api/v1/economic-assumption-sets
    GET  /api/v1/economic-assumption-sets/{set_id}[?version=]
    POST /api/v1/economics
    GET  /api/v1/economics/{analysis_id}

POST takes an exact BuildingModel revision plus its conditioned RC
SimulationResult (and optionally a comparable baseline revision), freezes
the chosen versioned assumption set into the result and returns the full
EconomicAnalysisReport (low/expected/high M0 EconomicAnalysisResult objects
plus quantities, cash flows, comparison and sensitivity). The calculation
is milliseconds, so it runs in-request; the report is persisted as JSON so
GET survives restarts (§15.5), and quantity overrides are appended to an
audit log (§13.3).

An `Idempotency-Key` header (§15.4) replays the stored analysis for an
identical body and rejects reuse with a different body (409).
"""

import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Header, Response
from fastapi.responses import JSONResponse

from cocoon_contracts import ErrorCode, ErrorDetail, ErrorEnvelope, MaterialSnapshot
from economics import (EconomicAnalysisReport, EconomicsRequest, list_assumption_sets,
                       load_assumption_set, run_analysis)
from economics.assumptions import SCENARIOS
from economics.errors import EconomicsError

from .. import settings

router = APIRouter(prefix="/api/v1", tags=["economics"])

_ANALYSIS_ID = re.compile(r"^econ_run_[0-9a-f]{12}$")


def _error(status: int, code: ErrorCode, message: str, details: dict | None = None,
           retryable: bool = False) -> JSONResponse:
    env = ErrorEnvelope(error=ErrorDetail(code=code, message=message, details=details or {},
                                          trace_id=str(uuid4()), retryable=retryable))
    return JSONResponse(status_code=status, content=env.model_dump(mode="json"))


@lru_cache(maxsize=1)
def _code_commit() -> str:
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], cwd=settings.REPO_ROOT,
                             capture_output=True, text=True, timeout=5)
        return out.stdout.strip() or "unknown"
    except Exception:                                           # noqa: BLE001
        return "unknown"


def _contained(base: Path, name: str) -> Path | None:
    """Resolved-path containment (PRD §15.5), not a string-prefix check."""
    p = (base / name).resolve()
    try:
        p.relative_to(base.resolve())
    except ValueError:
        return None
    return p


def _write_atomic(path: Path, text: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


# ----------------------------------------------------------------------
# Assumption sets
# ----------------------------------------------------------------------

@router.get("/economic-assumption-sets")
def get_assumption_sets():
    try:
        sets = list_assumption_sets(settings.ECONOMIC_ASSUMPTIONS_DIR)
    except Exception as exc:                                    # noqa: BLE001
        return _error(500, ErrorCode.VALIDATION_ERROR, f"invalid assumption set store: {exc}")
    return {
        "assumption_sets": [{
            "id": s.id,
            "version": s.version,
            "name": s.name,
            "currency": s.currency,
            "effective_date": s.effective_date.isoformat(),
            "source": s.source,
            "owner": s.owner,
            "project_lifetime_years": s.project_lifetime_years,
            "checksum_sha256": s.checksum(),
            "scenario_assumption_set_ids": {sc.value: s.scenario_set_id(sc) for sc in SCENARIOS},
            "href": f"/api/v1/economic-assumption-sets/{s.id}?version={s.version}",
        } for s in sets],
    }


@router.get("/economic-assumption-sets/{set_id}")
def get_assumption_set(set_id: str, version: str | None = None):
    s = load_assumption_set(settings.ECONOMIC_ASSUMPTIONS_DIR, set_id, version)
    if s is None:
        return _error(404, ErrorCode.MISSING_REFERENCE,
                      f"unknown economic assumption set '{set_id}'"
                      + (f" v{version}" if version else ""))
    return {"assumption_set": s.model_dump(mode="json"), "checksum_sha256": s.checksum(),
            "m0_assumption_sets": {sc.value: s.to_m0(sc).model_dump(mode="json") for sc in SCENARIOS}}


# ----------------------------------------------------------------------
# Analyses
# ----------------------------------------------------------------------

def _append_audit(report: EconomicAnalysisReport) -> None:
    rows = []
    for role, rev in (("design", report.design), ("baseline", report.baseline)):
        if rev is None:
            continue
        for o in rev.quantities.overrides_applied:
            rows.append({"event": "quantity_override", "analysis_id": report.analysis_id,
                         "role": role, "revision_id": rev.revision_id,
                         **o.model_dump(mode="json")})
    if rows:
        with open(settings.ECONOMICS_DIR / "audit_log.jsonl", "a", encoding="utf-8") as fh:
            for r in rows:
                fh.write(json.dumps(r) + "\n")


@router.post("/economics", status_code=201, response_model=EconomicAnalysisReport)
def create_analysis(body: EconomicsRequest, response: Response,
                    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")):
    body_hash = hashlib.sha256(body.model_dump_json().encode("utf-8")).hexdigest()
    idem_path = None
    if idempotency_key:
        idem_dir = settings.ECONOMICS_DIR / "idempotency"
        idem_dir.mkdir(exist_ok=True)
        idem_path = idem_dir / (hashlib.sha256(idempotency_key.encode("utf-8")).hexdigest() + ".json")
        if idem_path.exists():
            seen = json.loads(idem_path.read_text(encoding="utf-8"))
            if seen["request_sha256"] != body_hash:
                return _error(409, ErrorCode.VALIDATION_ERROR,
                              "Idempotency-Key was already used with a different request body")
            stored = settings.ECONOMICS_DIR / f"{seen['analysis_id']}.json"
            if stored.exists():
                response.status_code = 200
                return EconomicAnalysisReport.model_validate_json(stored.read_text(encoding="utf-8"))

    if body.assumption_set is not None:
        aset = body.assumption_set
    else:
        aset = load_assumption_set(settings.ECONOMIC_ASSUMPTIONS_DIR, body.assumption_set_id,
                                   body.assumption_set_version)
        if aset is None:
            return _error(422, ErrorCode.MISSING_REFERENCE,
                          f"unknown economic assumption set '{body.assumption_set_id}'"
                          + (f" v{body.assumption_set_version}" if body.assumption_set_version else ""),
                          {"available": "/api/v1/economic-assumption-sets"})

    if body.materials is not None:
        materials = body.materials
    elif settings.ECONOMICS_DEFAULT_MATERIALS.exists():
        materials = MaterialSnapshot.model_validate_json(
            settings.ECONOMICS_DEFAULT_MATERIALS.read_text(encoding="utf-8"))
    else:
        return _error(422, ErrorCode.MISSING_REFERENCE, "provide 'materials' (no default snapshot bundled)")

    try:
        report = run_analysis(body, aset, materials, code_commit=_code_commit(),
                              now=datetime.now(timezone.utc))
    except EconomicsError as exc:
        return _error(422, exc.code, exc.message, exc.details)

    _write_atomic(settings.ECONOMICS_DIR / f"{report.analysis_id}.json", report.model_dump_json())
    _append_audit(report)
    if idem_path is not None:
        _write_atomic(idem_path, json.dumps({"analysis_id": report.analysis_id,
                                             "request_sha256": body_hash}))
    return report


@router.get("/economics/{analysis_id}", response_model=EconomicAnalysisReport)
def get_analysis(analysis_id: str):
    path = _contained(settings.ECONOMICS_DIR, f"{analysis_id}.json") if _ANALYSIS_ID.match(analysis_id) else None
    if path is None or not path.is_file():
        return _error(404, ErrorCode.MISSING_REFERENCE, f"unknown economic analysis '{analysis_id}'")
    return EconomicAnalysisReport.model_validate_json(path.read_text(encoding="utf-8"))
