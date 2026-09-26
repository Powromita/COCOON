"""M6 phase 3 tests: hard constraints."""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import timedelta
from types import SimpleNamespace

import pytest
from cocoon_contracts.simulation import SimulationEngineMode as Mode

from design_generator import generate_designs, resolve_user_geometry
from optimization import constraints as C
from optimization.constraints import (
    POST_CHECK,
    PRE_CHECKS,
    ConstraintError,
    ConstraintLimits,
    apply_post_simulation,
    check_candidate,
    check_pre_simulation,
    footprint_m2,
    partition,
)
from optimization.objectives import ObjectiveResult, ObjectiveValue
from optimization.rc_verification import SimulationJob, analyse_checked, run_checked
from optimization.tests.conftest import REPO_ROOT, T0, WEATHER_ID, load_fixture

LIMITS = ConstraintLimits.from_requirements(load_fixture("requirements_ladakh_30p.json"))


@pytest.fixture(scope="module")
def generated():
    return generate_designs(load_fixture("requirements_ladakh_30p.json"), load_fixture("material_snapshot_standard.json"),
                            seed=42, count=4, created_at=T0)


@pytest.fixture(scope="module")
def cand(generated):
    return generated.candidates[0]


@pytest.fixture(scope="module")
def econ(cand, evaluator, economics):
    # Start warm. From the default -25 C the cold-start burst (~170 kW) would price a 2 million INR heater and
    # blow the 2.5 million budget on its own: heater sizing and economics must exclude the warm-up (phase 5).
    sim = run_checked(evaluator, SimulationJob.from_candidate(
        cand, weather_snapshot_id=WEATHER_ID, mode=Mode.IDEAL_LOAD_CONDITIONED, window_start=T0,
        window_end=T0 + timedelta(days=3), setpoint_c=15.0, timestep_seconds=3600, initial_temperature_c=15.0))
    return analyse_checked(economics, cand.building, cand.quantities, sim, "econ_standin_expected_v0")


def full_check(cand, econ, limits=LIMITS, **kw):
    kw.setdefault("heater_fuel", "kerosene")
    return check_candidate(cand, limits, economics=econ, **kw)


# ------------------------------------------------------------------ limits
def test_limits_come_from_the_requirements():
    assert LIMITS == ConstraintLimits(
        maximum_footprint_m2=48.0, maximum_floors=2, maximum_capex_inr=2500000.0, maximum_mass_kg=15000.0,
        max_assembly_time_hours=72.0, available_material_ids=("mat_stone", "mat_puf", "mat_plywood", "mat_steel_panel"),
        heater_fuels=("kerosene",), maximum_unmet_hours=12.0)
    assert ConstraintLimits().maximum_mass_kg is None and ConstraintLimits().available_material_ids == ()


# ------------------------------------------------------------------ a clean candidate
def test_a_clean_candidate_passes_everything_that_can_be_checked(cand, econ):
    r = full_check(cand, econ)
    assert r.ok and r.failed == () and r.flags == ()
    assert set(r.passed) == set(PRE_CHECKS) - {"assembly_time_within_limit"}
    assert [n for n, _ in r.skipped] == ["assembly_time_within_limit"] and not r.verified      # a set limit that cannot be checked


def test_without_an_assembly_time_limit_a_clean_candidate_is_fully_verified(cand, econ):
    r = full_check(cand, econ, limits=replace(LIMITS, max_assembly_time_hours=None))
    assert r.ok and r.verified and r.passed == PRE_CHECKS and r.skipped == ()


def test_every_m2_candidate_passes_the_independent_checks(generated, econ):
    for c in generated.candidates:
        r = check_candidate(c, replace(LIMITS, max_assembly_time_hours=None, maximum_capex_inr=None), heater_fuel="kerosene")
        assert r.ok, r.failed
        assert footprint_m2(c.building) == pytest.approx(c.layout.footprint_area_m2)      # agrees with M2's own geometry


# ------------------------------------------------------------------ one breakage per rule
def _mass(c):
    return round(sum(m.mass_kg for m in c.quantities.materials), 1)


BREAKAGES = {
    "footprint_within_cap":     dict(limits=replace(LIMITS, maximum_footprint_m2=40.0)),
    "floor_count_within_limit": dict(limits=replace(LIMITS, maximum_floors=1)),
    "materials_allowed":        dict(limits=replace(LIMITS, available_material_ids=("mat_stone", "mat_plywood"))),
    "mass_within_limit":        dict(limits=replace(LIMITS, maximum_mass_kg=5000.0)),
    "capex_within_budget":      dict(limits=replace(LIMITS, maximum_capex_inr=1.0)),
    "heater_fuel_allowed":      dict(heater_fuel="electricity"),
}


@pytest.mark.parametrize("name", list(BREAKAGES))
def test_each_rule_rejects_exactly_its_own_violation(cand, econ, name):
    kw = dict(BREAKAGES[name])
    r = full_check(cand, econ, **kw)
    assert not r.ok and r.failed_constraints == (name,), [f.reason for f in r.failed]
    assert set(r.passed) == set(PRE_CHECKS) - {name, "assembly_time_within_limit"}          # everything else still passes
    f = r.failed[0]
    assert f.reason and f.limit is not None and f.value is not None


def test_the_failures_carry_the_numbers(cand, econ):
    assert full_check(cand, econ, limits=replace(LIMITS, maximum_footprint_m2=40.0)).failed[0].value == pytest.approx(cand.layout.footprint_area_m2)
    assert full_check(cand, econ, limits=replace(LIMITS, maximum_floors=1)).failed[0].value == 2
    assert full_check(cand, econ, limits=replace(LIMITS, maximum_mass_kg=5000.0)).failed[0].value == pytest.approx(_mass(cand))
    assert full_check(cand, econ, limits=replace(LIMITS, maximum_capex_inr=1.0)).failed[0].value == pytest.approx(econ.capex.total_capex_inr)
    bad = full_check(cand, econ, limits=replace(LIMITS, available_material_ids=("mat_stone", "mat_plywood"))).failed[0]
    assert bad.value == ["mat_puf"] and "mat_puf" in bad.reason


def test_a_design_that_fails_several_rules_reports_all_of_them(cand, econ):
    limits = replace(LIMITS, maximum_footprint_m2=1.0, maximum_floors=1, maximum_mass_kg=1.0)
    assert set(full_check(cand, econ, limits=limits).failed_constraints) == {"footprint_within_cap", "floor_count_within_limit", "mass_within_limit"}


def test_a_limit_exactly_met_is_not_a_failure(cand, econ):
    exact = replace(LIMITS, maximum_footprint_m2=footprint_m2(cand.building), maximum_mass_kg=_mass(cand),
                    maximum_capex_inr=econ.capex.total_capex_inr, maximum_floors=2)
    assert full_check(cand, econ, limits=exact).ok


def test_m2s_own_rejection_is_carried_in(generated):
    rejected = next(r for r in generated.rejected if r.report is not None)
    r = check_pre_simulation(rejected.building, LIMITS, m2_report=rejected.report, heater_fuel="kerosene")
    assert not r.ok and "m2_validation" in r.failed_constraints
    f = next(x for x in r.failed if x.constraint == "m2_validation")
    assert "envelope_mass_within_limit" in f.value and "M2 rejected" in f.reason and "kg" in f.reason


# ------------------------------------------------------------------ set but unverifiable is skipped, not passed
def test_limits_that_cannot_be_checked_yet_are_skipped_with_reasons(cand):
    r = check_pre_simulation(cand.building, LIMITS)                        # nothing supplied besides the building
    skipped = dict(r.skipped)
    assert set(skipped) == {"m2_validation", "mass_within_limit", "capex_within_budget", "heater_fuel_allowed", "assembly_time_within_limit"}
    assert "no bill of quantities" in skipped["mass_within_limit"] and "M7" in skipped["capex_within_budget"]
    assert "no heater fuel" in skipped["heater_fuel_allowed"] and "assembly-time model" in skipped["assembly_time_within_limit"]
    assert r.ok and not r.verified                                          # not failed, but not verified either
    assert set(r.passed) == {"footprint_within_cap", "floor_count_within_limit", "materials_allowed"}


def test_unknown_masses_are_skipped_not_treated_as_zero(cand):
    q = SimpleNamespace(materials=[SimpleNamespace(mass_kg=10.0), SimpleNamespace(mass_kg=None)])
    r = check_pre_simulation(cand.building, replace(LIMITS, maximum_mass_kg=1.0), quantities=q)
    assert r.ok and "unknown" in dict(r.skipped)["mass_within_limit"]


def test_limits_that_are_not_set_pass_vacuously(cand):
    r = check_pre_simulation(cand.building, ConstraintLimits(), m2_report=cand.report)
    assert r.ok and r.verified and r.passed == PRE_CHECKS


def test_no_fuel_restriction_means_any_fuel_is_fine(cand):
    r = check_pre_simulation(cand.building, replace(LIMITS, heater_fuels=()), heater_fuel="wood")
    assert "heater_fuel_allowed" in r.passed


def test_it_works_on_a_user_defined_building_where_m2_skipped_the_requirement_checks():
    shelter = json.loads((REPO_ROOT / "design_generator" / "fixtures" / "existing_shelter_valid.json").read_text(encoding="utf-8"))
    result = resolve_user_geometry(shelter, load_fixture("material_snapshot_standard.json"), created_at=T0)
    assert footprint_m2(result.building) == pytest.approx(24.0)                       # ground floor 6.0 x 4.0; the upper room sits above
    tight = check_pre_simulation(result.building, ConstraintLimits(maximum_footprint_m2=20.0, maximum_floors=1))
    assert set(tight.failed_constraints) == {"footprint_within_cap", "floor_count_within_limit"}
    assert check_pre_simulation(result.building, ConstraintLimits(maximum_footprint_m2=24.0, maximum_floors=2)).ok


def test_an_overhanging_upper_room_counts_toward_the_footprint():
    shelter = {
        "zones": [{"id": "low", "type": "living", "floor_level": 0, "origin_m": {"x": 0.0, "y": 0.0}, "size_m": {"length_m": 4.0, "width_m": 4.0}},
                  {"id": "up", "type": "sleeping", "floor_level": 1, "origin_m": {"x": 2.0, "y": 0.0}, "size_m": {"length_m": 4.0, "width_m": 4.0}}],
        "assemblies": {"wall": [["mat_stone", 200]], "roof": [["mat_plywood", 100]], "floor": [["mat_stone", 150]],
                       "interfloor": [["mat_plywood", 25]]},
    }
    b = resolve_user_geometry(shelter, load_fixture("material_snapshot_standard.json"), created_at=T0).building
    assert footprint_m2(b) == pytest.approx(16.0 + 8.0)                                # 4x4 plus the 2 m x 4 m that hangs out


# ------------------------------------------------------------------ after simulation: a flag, not a deletion
def _objectives(building, unmet):
    return ObjectiveResult(building.design_id, building.revision_id,
                           {"unmet_hours": ObjectiveValue("unmet_hours", unmet, None if unmet is not None else "no run")},
                           True, (), None, False)


@pytest.mark.parametrize("unmet, flagged", [(0.0, False), (12.0, False), (12.0001, True), (200.0, True)])
def test_too_many_unmet_hours_is_a_flag_and_the_design_stays(cand, econ, unmet, flagged):
    pre = full_check(cand, econ)
    post = apply_post_simulation(pre, _objectives(cand.building, unmet), LIMITS)
    assert post.ok and post.failed == pre.failed                             # never a hard failure
    assert bool(post.flags) is flagged
    if flagged:
        f = post.flags[0]
        assert f.constraint == POST_CHECK and f.value == unmet and f.limit == 12.0 and POST_CHECK not in post.passed
    else:
        assert POST_CHECK in post.passed and post.flags == ()
    kept, rejected = partition([post])
    assert kept == [post] and rejected == []


def test_unknown_unmet_hours_and_unset_limit(cand, econ):
    pre = full_check(cand, econ)
    unknown = apply_post_simulation(pre, _objectives(cand.building, None), LIMITS)
    assert (POST_CHECK, "no capacity-limited run, so unmet hours are unknown") in unknown.skipped and unknown.ok
    assert POST_CHECK in apply_post_simulation(pre, _objectives(cand.building, 999.0), replace(LIMITS, maximum_unmet_hours=None)).passed


def test_post_check_keeps_the_earlier_results(cand, econ):
    pre = full_check(cand, econ, limits=replace(LIMITS, maximum_mass_kg=5000.0))
    post = apply_post_simulation(pre, _objectives(cand.building, 50.0), LIMITS)
    assert post.failed_constraints == ("mass_within_limit",) and post.flags and post.skipped == pre.skipped


# ------------------------------------------------------------------ populations and inputs that do not belong together
def test_partition_splits_on_hard_failures_only_and_keeps_order(cand, econ):
    good = full_check(cand, econ)
    bad = full_check(cand, econ, limits=replace(LIMITS, maximum_floors=1))
    flagged = apply_post_simulation(good, _objectives(cand.building, 99.0), LIMITS)
    kept, rejected = partition([bad, good, flagged, bad])
    assert kept == [good, flagged] and rejected == [bad, bad]


def test_economics_for_another_design_is_refused(cand, generated, econ):
    other = generated.candidates[1]
    with pytest.raises(ConstraintError) as e:
        check_pre_simulation(other.building, LIMITS, economics=econ)
    assert e.value.code == "EVALUATION_MISMATCH"


def test_objectives_for_another_design_are_refused(cand, generated, econ):
    pre = full_check(cand, econ)
    with pytest.raises(ConstraintError) as e:
        apply_post_simulation(pre, _objectives(generated.candidates[1].building, 1.0), LIMITS)
    assert e.value.code == "EVALUATION_MISMATCH"


def test_check_candidate_matches_the_explicit_call(cand, econ):
    explicit = check_pre_simulation(cand.building, LIMITS, m2_report=cand.report, quantities=cand.quantities, economics=econ,
                                    heater_fuel="kerosene")
    assert check_candidate(cand, LIMITS, economics=econ, heater_fuel="kerosene") == explicit


def test_reports_are_deterministic_and_json(cand, econ):
    a, b = full_check(cand, econ), full_check(cand, econ)
    assert a == b
    d = apply_post_simulation(a, _objectives(cand.building, 50.0), LIMITS).to_dict()
    json.dumps(d)
    assert d["ok"] is True and d["verified"] is False and d["flags"][0]["constraint"] == POST_CHECK
    assert d["skipped"][0]["constraint"] == "assembly_time_within_limit"
