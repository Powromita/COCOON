"""M6 phase 10 tests: the command line and the example result."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from cocoon_contracts.building import BuildingModel

from optimization import __main__ as cli
from optimization.ranking import PICKS
from optimization.tests.conftest import FIXTURES, REPO_ROOT

REQS = str(FIXTURES / "valid" / "requirements_ladakh_30p.json")
MATS = str(FIXTURES / "valid" / "material_snapshot_standard.json")
GOLDEN = REPO_ROOT / "optimization" / "fixtures" / "example_result_standin.json"
CREATED = "2026-01-01T00:00:00+05:30"


def args(out, *extra, count=8):
    return ["--requirements", REQS, "--materials", MATS, "--weather-id", "wx_leh_dev", "--seed", "42", "--count", str(count),
            "--out", str(out), "--created-at", CREATED, *extra]


def read(out) -> dict:
    return json.loads((Path(out) / "result.json").read_text(encoding="utf-8"))


def stderr_envelope(capsys) -> dict:
    return json.loads(capsys.readouterr().err)["error"]


def close(a, b, path="") -> list[str]:
    """Differences between two JSON values, floats compared to 1e-6 relative."""
    if isinstance(a, dict) and isinstance(b, dict):
        out = [f"{path}: keys differ {sorted(set(a) ^ set(b))}"] if set(a) != set(b) else []
        for k in set(a) & set(b):
            out += close(a[k], b[k], f"{path}/{k}")
        return out
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [f"{path}: length {len(a)} != {len(b)}"]
        return [d for i, (x, y) in enumerate(zip(a, b)) for d in close(x, y, f"{path}[{i}]")]
    if isinstance(a, float) or isinstance(b, float):
        ok = isinstance(a, (int, float)) and isinstance(b, (int, float)) and math.isclose(a, b, rel_tol=1e-6, abs_tol=1e-9)
        return [] if ok else [f"{path}: {a} != {b}"]
    return [] if a == b else [f"{path}: {a!r} != {b!r}"]


@pytest.fixture(scope="module")
def default_run(tmp_path_factory):
    out = tmp_path_factory.mktemp("m6")
    import io
    from contextlib import redirect_stdout

    buf = io.StringIO()
    with redirect_stdout(buf):
        code = cli.main(args(out))
    return out, code, buf.getvalue()


# ------------------------------------------------------------------ a normal run
def test_a_normal_run_exits_0_and_writes_the_result_and_the_picked_buildings(default_run):
    out, code, text = default_run
    assert code == 0
    data = read(out)
    assert data["schema"].startswith("PROPOSED") and data["generation"]["generated"] == 8 and "timings_s" in data
    unique = {data["picks"]["picks"][n]["design_id"] for n in PICKS}
    assert {p.name for p in (out / "picks").iterdir()} == {f"{d}.building.json" for d in unique}
    for d in unique:
        b = BuildingModel.model_validate_json((out / "picks" / f"{d}.building.json").read_text(encoding="utf-8"))
        assert b.design_id == d and b.source.value == "generated"


def test_the_screen_output_names_the_picks_and_carries_the_stand_in_banner_first(default_run):
    _, _, text = default_run
    lines = text.splitlines()
    assert lines[0] == cli.STAND_IN_BANNER and "NOT verified by the real RC engine" in lines[0]
    assert "8 of 8 designs generated" in text and "simulator runs: 24 verification +" in text
    assert all(any(l.strip().startswith(n) for l in lines) for n in PICKS)
    assert lines[-1].startswith("-> ") and lines[-1].endswith("result.json")


def test_the_example_result_in_the_repo_is_what_the_command_produces(tmp_path):
    assert cli.main(args(tmp_path, "--omit-timings")) == 0
    diffs = close(read(tmp_path), json.loads(GOLDEN.read_text(encoding="utf-8")))
    assert diffs == [], "regenerate optimization/fixtures/example_result_standin.json if the change is intended:\n" + "\n".join(diffs[:10])


def test_the_example_result_is_stamped_and_has_no_timings():
    d = json.loads(GOLDEN.read_text(encoding="utf-8"))
    assert d["development_only"] is True and "timings_s" not in d and d["engine"]["name"].startswith("standin_")
    assert "NOT verified by M4" in d["validation"]


def test_a_run_is_reproducible_with_omit_timings(tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    cli.main(args(a, "--omit-timings"))
    cli.main(args(b, "--omit-timings"))
    assert (a / "result.json").read_bytes() == (b / "result.json").read_bytes()


# ------------------------------------------------------------------ options
def test_no_economics_makes_the_cost_picks_unavailable(tmp_path, capsys):
    assert cli.main(args(tmp_path, "--economics", "none", "--no-reliability")) == 0
    d = read(tmp_path)
    assert d["picks"]["picks"]["lowest_lcc"]["status"] == "unavailable" and d["reliability"] is None
    assert "unavailable" in capsys.readouterr().out


def test_reliability_can_be_switched_off_or_given_monte_carlo_trials(tmp_path):
    cli.main(args(tmp_path / "off", "--no-reliability"))
    assert read(tmp_path / "off")["reliability"] is None and read(tmp_path / "off")["runs"]["reliability"] == 0
    cli.main(args(tmp_path / "mc", "--reliability-trials", "3"))
    names = [c["name"] for c in read(tmp_path / "mc")["reliability"]["cases"]]
    assert [n for n in names if n.startswith("mc_")] == ["mc_001", "mc_002", "mc_003"]


def test_a_plan_over_the_budget_exits_2_with_the_reason_and_writes_nothing(tmp_path, capsys):
    assert cli.main(args(tmp_path / "o", "--max-runs", "5")) == 2
    e = stderr_envelope(capsys)
    assert e["details"]["m6_code"] == "RUN_BUDGET_EXCEEDED" and e["details"]["runs_needed"] == 24 and not (tmp_path / "o").exists()


def test_a_factory_supplies_the_evaluator_and_the_economics(tmp_path, capsys):
    code = cli.main(args(tmp_path, "--evaluator", "optimization.tests.cli_factories:cold_evaluator",
                         "--economics", "optimization.tests.cli_factories:standin_like_economics", "--no-reliability"))
    assert code == 3                                                        # nothing can meet the unmet-hours limit, and the run says so
    d = read(tmp_path)
    assert d["picks"]["picks"]["best_overall"]["flagged"] is True
    assert "no eligible design meets the unmet-hours limit" in d["warnings"]
    out = capsys.readouterr().out
    assert "[breaks the unmet-hours limit]" in out and "exit" not in out


# ------------------------------------------------------------------ input errors and an unreachable M4
@pytest.mark.parametrize("extra,detail", [
    (["--created-at", "2026-01-01T00:00:00"], "timezone"),
    (["--evaluator", "no_such_module_anywhere:make"], "no_such_module_anywhere"),
    (["--evaluator", "optimization.tests.cli_factories:nothing_here"], "nothing_here"),
    (["--evaluator", "not-a-factory"], "module:factory"),
])
def test_bad_options_exit_2_with_an_envelope(tmp_path, capsys, extra, detail):
    assert cli.main(args(tmp_path, *extra)) == 2
    e = stderr_envelope(capsys)
    assert e["code"] == "VALIDATION_ERROR" and detail in e["message"] + json.dumps(e["details"]) and e["retryable"] is False


def test_a_bad_weather_id_is_refused_before_any_work(tmp_path, capsys):
    a = args(tmp_path)
    a[a.index("--weather-id") + 1] = "standard"
    assert cli.main(a) == 2 and stderr_envelope(capsys)["details"]["m6_code"] == "INVALID_SETTINGS"


def test_a_missing_or_invalid_input_file_exits_2(tmp_path, capsys):
    a = args(tmp_path)
    a[a.index("--requirements") + 1] = str(tmp_path / "missing.json")
    assert cli.main(a) == 2 and stderr_envelope(capsys)["details"]["exception"] == "FileNotFoundError"
    (tmp_path / "bad.json").write_text('{"schema_version": "4.0"}', encoding="utf-8")
    a[a.index("--requirements") + 1] = str(tmp_path / "bad.json")
    assert cli.main(a) == 2
    e = stderr_envelope(capsys)
    assert e["details"]["m6_code"] == "VALIDATION_ERROR" and e["details"]["errors"]


def test_an_unreachable_m4_exits_5_and_the_envelope_says_it_is_retryable(tmp_path, capsys):
    assert cli.main(args(tmp_path / "o", "--evaluator", "optimization.tests.cli_factories:down_evaluator")) == 5
    e = stderr_envelope(capsys)
    assert e["retryable"] is True and e["details"]["m6_code"] == "EVALUATOR_UNAVAILABLE" and not (tmp_path / "o").exists()


def test_the_factory_loader_needs_module_and_attribute():
    assert cli._factory("optimization.tests.cli_factories:down_evaluator").__name__ == "down_evaluator"
    for bad in ("nothing", ":x", "x:"):
        with pytest.raises(ValueError):
            cli._factory(bad)
