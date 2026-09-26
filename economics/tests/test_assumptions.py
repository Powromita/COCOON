"""Versioned assumption sets (PRD 13.2) and the M7 dependency boundary."""

import ast
from pathlib import Path

import pytest
from cocoon_contracts import CostScenario, EconomicAssumptionSet

from economics.assumptions import Estimate, LifecycleAssumptionSet, list_assumption_sets, load_assumption_set
from economics.tests._support import COSTS_DIR, modify_set

PKG = Path(__file__).resolve().parents[1]


def test_estimate_accepts_point_and_enforces_order():
    assert Estimate.model_validate(5.0).pick(CostScenario.HIGH) == 5.0
    with pytest.raises(ValueError):
        Estimate(low=3, expected=2, high=4)


def test_every_stored_set_loads_and_projects_to_m0():
    sets = list_assumption_sets(COSTS_DIR)
    assert sets, "data/costs must ship at least one assumption set"
    for s in sets:
        assert s.source and s.owner and s.effective_date.tzinfo is not None
        assert s.fuel.lhv_source                                  # PRD 13.4: visible LHV source
        for sc in CostScenario:
            m0 = s.to_m0(sc)
            EconomicAssumptionSet.model_validate(m0.model_dump())
            assert m0.id == f"{s.id}_{sc.value}"


def test_latest_version_is_default_and_exact_version_is_honoured(tmp_path, aset):
    v2 = aset.model_copy(update={"version": "1.10.0"})
    (tmp_path / "a.json").write_text(aset.model_dump_json(), encoding="utf-8")
    (tmp_path / "b.json").write_text(v2.model_dump_json(), encoding="utf-8")
    assert load_assumption_set(tmp_path, aset.id).version == "1.10.0"      # numeric, not lexical
    assert load_assumption_set(tmp_path, aset.id, "1.0.0").version == "1.0.0"
    assert load_assumption_set(tmp_path, "econ_nope") is None


def test_duplicate_versions_are_rejected(tmp_path, aset):
    for n in ("a", "b"):
        (tmp_path / f"{n}.json").write_text(aset.model_dump_json(), encoding="utf-8")
    with pytest.raises(ValueError):
        list_assumption_sets(tmp_path)


@pytest.mark.parametrize("mutate", [
    lambda d: d.update(id="ladakh_v1"),
    lambda d: d["heater"].update(efficiency={"low": 0.5, "expected": 0.8, "high": 1.2}),
    lambda d: d["transport"].update(remote_logistics_multiplier={"low": 0.9, "expected": 1, "high": 1}),
    lambda d: d.update(discount_rate_pct={"low": -1, "expected": 5, "high": 8}),
    lambda d: d["materials"].update({"stone": d["materials"]["mat_stone"]}),
    lambda d: d.update(unexpected_field=1),
])
def test_invalid_sets_are_rejected(aset, mutate):
    with pytest.raises(ValueError):
        modify_set(aset, mutate)


def test_checksum_changes_with_any_value(aset):
    other = modify_set(aset, lambda d: d["fuel"]["price_inr_per_litre"].update(expected=86))
    assert other.checksum() != aset.checksum()
    assert LifecycleAssumptionSet.model_validate(aset.model_dump()).checksum() == aset.checksum()


FORBIDDEN = {"thermal_model", "heat_transfer", "rc_main", "multiroom_rc", "run_pipeline",
             "feature_reports", "optimizer_reliability", "design_ranker", "engine_adapter",
             "backend", "cocoon_ansys"}


def test_m7_never_imports_the_legacy_engine_or_other_modules_privates():
    """PRD 5 + M7 audit: economics depends on M0 contracts only, never thermal_model.py."""
    for py in PKG.glob("*.py"):
        tree = ast.parse(py.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module]
            for n in names:
                root = n.split(".")[0]
                assert root not in FORBIDDEN, f"{py.name} imports {n}"
                assert root in {"economics", "cocoon_contracts", "pydantic", "__future__"} or \
                    root in {"hashlib", "json", "math", "uuid", "datetime", "enum", "pathlib", "typing"}, \
                    f"{py.name} imports unexpected module {n}"
