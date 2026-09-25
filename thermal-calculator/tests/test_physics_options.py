"""physics_level / physics_features resolution and plumbing."""

import pytest

import golden_cases as gc
from environment.adapters import (
    IMPLEMENTED_FEATURES, PHYSICS_FEATURES, PhysicsOptions,
    require_implemented, resolve_physics_options,
)


def test_default_is_legacy_all_off():
    opts = resolve_physics_options({})
    assert opts.level == "legacy"
    assert opts.is_legacy
    assert opts.enabled_features == frozenset()


def test_enhanced_turns_every_feature_on():
    opts = resolve_physics_options({"physics_level": "enhanced"})
    assert opts.enabled_features == frozenset(PHYSICS_FEATURES)
    assert not opts.is_legacy


def test_single_feature_toggle_on_legacy():
    opts = resolve_physics_options(
        {"physics_level": "legacy", "physics_features": {"enhanced_ground": True}})
    assert opts.enabled_features == {"enhanced_ground"}


def test_single_feature_toggle_off_on_enhanced():
    opts = resolve_physics_options(
        {"physics_level": "enhanced", "physics_features": {"enhanced_sky": False}})
    assert opts.enabled_features == frozenset(PHYSICS_FEATURES) - {"enhanced_sky"}


def test_override_level_wins_over_config():
    opts = resolve_physics_options({"physics_level": "enhanced"},
                                   level_override="legacy")
    assert opts.is_legacy


@pytest.mark.parametrize("cfg, match", [
    ({"physics_level": "turbo"}, "physics_level"),
    ({"physics_features": {"enhanced_sollar": True}}, "unknown physics_features"),
    ({"physics_features": {"enhanced_solar": "yes"}}, "true/false"),
    ({"physics_features": ["enhanced_solar"]}, "mapping"),
])
def test_invalid_options_raise(cfg, match):
    with pytest.raises(ValueError, match=match):
        resolve_physics_options(cfg)


def test_options_are_frozen():
    opts = resolve_physics_options({})
    with pytest.raises(Exception):
        opts.enhanced_solar = True  # type: ignore[misc]


def test_nothing_implemented_yet_in_phase0():
    assert IMPLEMENTED_FEATURES == frozenset()
    require_implemented(PhysicsOptions(level="legacy"))  # no raise
    with pytest.raises(NotImplementedError, match="enhanced_solar"):
        require_implemented(resolve_physics_options(
            {"physics_features": {"enhanced_solar": True}}))


# ------------------------------ plumbing ------------------------------

def test_shelter_config_validate_accepts_and_does_not_insert():
    import shelter_config as sc
    cfg = sc.from_shelter_config()
    assert "physics_level" not in cfg and "physics_features" not in cfg
    tagged = {**cfg, "physics_level": "enhanced",
              "physics_features": {"enhanced_air": False}}
    assert sc.validate(tagged) is tagged


def test_shelter_config_validate_rejects_bad_level():
    import shelter_config as sc
    with pytest.raises(ValueError, match="physics_level"):
        sc.validate({**sc.from_shelter_config(), "physics_level": "legacyy"})


def test_simulate_refuses_unimplemented_enhanced():
    case = gc.cases()[0]
    with pytest.raises(NotImplementedError):
        gc.run_case(case, physics_level="enhanced")
    with pytest.raises(NotImplementedError):
        gc.run_case(dict(case, cfg={**case["cfg"], "physics_level": "enhanced"}))
