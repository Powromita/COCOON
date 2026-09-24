"""
Golden regression tests: physics_level="legacy" must reproduce the
pre-Person-2 engine outputs to 1e-9 after every phase.

If one of these fails, legacy physics changed. Do not regenerate the
golden to make it pass unless the change is intended and reviewed
(see make_golden.py).
"""

import contextlib
import io
import json

import numpy as np
import pandas as pd
import pytest

import golden_cases as gc

ATOL = 1e-9

CASES = gc.cases()
CASE_IDS = [c["name"] for c in CASES]


def _assert_frames_match(actual: pd.DataFrame, expected: pd.DataFrame) -> None:
    assert list(actual.columns) == list(expected.columns), "column set/order changed"
    assert len(actual) == len(expected), "row count changed"

    np.testing.assert_array_equal(
        pd.to_datetime(actual["timestamp"]).to_numpy(),
        pd.to_datetime(expected["timestamp"]).to_numpy())

    for col in expected.columns:
        if col == "timestamp":
            continue
        a = pd.to_numeric(actual[col], errors="coerce").to_numpy(float)
        e = pd.to_numeric(expected[col], errors="coerce").to_numpy(float)
        np.testing.assert_allclose(a, e, rtol=0, atol=ATOL, equal_nan=True,
                                   err_msg=f"column {col!r} drifted")


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_hourly_outputs_match_golden(case):
    hourly, _ = gc.run_case(case)
    expected = pd.read_csv(gc.output_path(case["name"]), parse_dates=["timestamp"])
    _assert_frames_match(hourly, expected)


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_explicit_legacy_level_matches_golden(case):
    """Passing physics_level='legacy' explicitly (kwarg and config key)
    is identical to the default."""
    expected = pd.read_csv(gc.output_path(case["name"]), parse_dates=["timestamp"])

    hourly, _ = gc.run_case(case, physics_level="legacy")
    _assert_frames_match(hourly, expected)

    tagged = dict(case, cfg={**case["cfg"], "physics_level": "legacy"})
    hourly, _ = gc.run_case(tagged)
    _assert_frames_match(hourly, expected)


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_key_properties_match_golden(case):
    _, props = gc.run_case(case)
    expected = json.loads(gc.props_path().read_text())[case["name"]]
    actual = gc.key_properties(props)
    assert actual.keys() == expected.keys()
    for k, v in expected.items():
        assert actual[k] == pytest.approx(v, rel=0, abs=ATOL), k


def test_golden_covers_expected_cases():
    manifest = json.loads(gc.MANIFEST_FILE.read_text())
    assert manifest["cases"] == CASE_IDS
    assert len(CASES) == 2 + len(gc.DESIGN_IDS)
    assert [d["design_id"] for d in gc.read_designs()] == list(gc.DESIGN_IDS)


# ---------------------------------------------------------------------
# weather-loader layer: the archive still yields the frozen slices
# ---------------------------------------------------------------------

@pytest.fixture(scope="module")
def archive():
    import weather_archive as wa
    return wa.load_archive()


_WEATHER_CORE = ["timestamp", "temperature_C", "solar_radiation_W_m2",
                 "wind_speed_m_s", "humidity_percent"]


def _slice_equal(actual, expected):
    _assert_frames_match(actual[_WEATHER_CORE].reset_index(drop=True),
                         expected[_WEATHER_CORE].reset_index(drop=True))


def test_archive_reproduces_worst_case_slice(archive):
    import weather_archive as wa
    with contextlib.redirect_stdout(io.StringIO()):
        got = wa.worst_case_window(archive, hours=gc.WORST_HOURS)
    _slice_equal(got, gc.read_weather("worst48"))


def test_archive_reproduces_typical_slice(archive):
    import weather_archive as wa
    with contextlib.redirect_stdout(io.StringIO()):
        got = wa.typical_window(archive, hours=gc.TYPICAL_HOURS)
    _slice_equal(got, gc.read_weather("typical168"))


def test_archive_reproduces_ground_mean(archive):
    import weather_archive as wa
    assert wa.annual_mean_air_C(archive) == gc.read_ground_mean_C()
