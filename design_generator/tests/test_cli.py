"""Stage 9 tests: the command line."""

from __future__ import annotations

import json
import subprocess
import sys

import pytest
from cocoon_contracts.building import BuildingModel

from design_generator.__main__ import main
from design_generator.tests.conftest import FIXTURES, REPO_ROOT

REQ = str(FIXTURES / "valid" / "requirements_ladakh_30p.json")
MAT = str(FIXTURES / "valid" / "material_snapshot_standard.json")
GOOD = str(REPO_ROOT / "design_generator" / "fixtures" / "existing_shelter_valid.json")
BAD = str(REPO_ROOT / "design_generator" / "fixtures" / "existing_shelter_invalid.json")
STAMP = "2026-01-01T00:00:00+00:00"


def _run(tmp_path, *extra, name="out"):
    return main([*extra, "--materials", MAT, "--out", str(tmp_path / name), "--created-at", STAMP])


def test_generate_writes_candidates_summary_and_rejections(tmp_path, capsys):
    assert _run(tmp_path, "--requirements", REQ, "--seed", "42", "--count", "4") == 0
    out = tmp_path / "out"
    summary = json.loads((out / "summary.json").read_text())
    assert summary["complete"] and summary["valid"] == 4 and summary["requested"] == 4 and summary["seed"] == 42
    assert len(summary["candidates"]) == 4
    assert summary["attempts"] == 4 + len(json.loads((out / "rejected.json").read_text()))
    for entry in summary["candidates"]:
        building = BuildingModel.model_validate(json.loads((out / entry["file"]).read_text()))
        assert building.design_id == entry["design_id"] and building.revision_id == entry["revision_id"]
        assert entry["envelope_mass_kg"] <= 15000
        details = json.loads((out / entry["file"].replace(".building.json", ".details.json")).read_text())
        assert details["report"]["ok"] and details["extras"]["air_changes_per_hour"] > 0
        assert details["quantities"]["areas"]["exterior_wall"]["net_m2"] > 0 and details["window_placements"]
    rejected = json.loads((out / "rejected.json").read_text())
    assert rejected and all(r["stage"] and r["code"] for r in rejected)
    assert "4 of 4 candidates" in capsys.readouterr().out


def test_same_arguments_give_identical_files(tmp_path):
    args = ("--requirements", REQ, "--seed", "9", "--count", "3")
    assert _run(tmp_path, *args, name="a") == 0 and _run(tmp_path, *args, name="b") == 0
    files = sorted(p.relative_to(tmp_path / "a") for p in (tmp_path / "a").rglob("*.json"))
    assert files and files == sorted(p.relative_to(tmp_path / "b") for p in (tmp_path / "b").rglob("*.json"))
    for f in files:
        assert (tmp_path / "a" / f).read_bytes() == (tmp_path / "b" / f).read_bytes(), f


def test_incomplete_generation_exits_3_but_still_writes_results(tmp_path):
    code = _run(tmp_path, "--requirements", REQ, "--count", "5", "--max-attempts", "2")
    assert code == 3
    summary = json.loads((tmp_path / "out" / "summary.json").read_text())
    assert not summary["complete"] and summary["attempts"] == 2 and summary["max_attempts"] == 2


def test_existing_shelter_mode(tmp_path, capsys):
    assert _run(tmp_path, "--existing", GOOD) == 0
    out = tmp_path / "out"
    b = BuildingModel.model_validate(json.loads((out / "existing.building.json").read_text()))
    assert b.source.value == "user_defined"
    d = json.loads((out / "existing.details.json").read_text())
    assert d["topology"]["unreachable_zones"] == [] and d["report"]["ok"]
    assert d["quantities"]["openings"]["windows_count"] == 5
    text = capsys.readouterr().out
    assert "user_defined" in text and "all passed" in text


def _error(capsys) -> dict:
    return json.loads(capsys.readouterr().err)["error"]


def test_bad_existing_shelter_exits_2_with_an_envelope(tmp_path, capsys):
    assert _run(tmp_path, "--existing", BAD) == 2
    e = _error(capsys)
    assert e["code"] == "ZONE_GEOMETRY_INVALID" and e["details"]["m2_code"] == "OFF_GRID" and e["retryable"] is False


def test_unusable_requirements_exit_2(tmp_path, capsys):
    req = json.loads(open(REQ).read())
    req["mode"] = "existing_shelter"
    bad = tmp_path / "req.json"
    bad.write_text(json.dumps(req))
    assert _run(tmp_path, "--requirements", str(bad)) == 2
    assert _error(capsys)["details"]["m2_code"] == "UNSUPPORTED_MODE"


def test_missing_file_and_naive_timestamp_exit_2(tmp_path, capsys):
    assert main(["--requirements", str(tmp_path / "nope.json"), "--materials", MAT, "--out", str(tmp_path / "o")]) == 2
    assert _error(capsys)["code"] == "VALIDATION_ERROR"
    assert main(["--requirements", REQ, "--materials", MAT, "--out", str(tmp_path / "o"),
                 "--created-at", "2026-01-01T00:00:00"]) == 2
    assert "timezone" in _error(capsys)["message"]


def test_argument_errors_come_from_argparse(tmp_path):
    with pytest.raises(SystemExit) as e:                       # both modes at once
        main(["--requirements", REQ, "--existing", GOOD, "--materials", MAT, "--out", str(tmp_path)])
    assert e.value.code == 2
    with pytest.raises(SystemExit):                            # neither mode
        main(["--materials", MAT, "--out", str(tmp_path)])


def test_module_runs_as_a_program(tmp_path):
    r = subprocess.run([sys.executable, "-B", "-m", "design_generator", "--requirements", REQ, "--materials", MAT,
                        "--out", str(tmp_path / "prog"), "--count", "2", "--created-at", STAMP],
                       cwd=REPO_ROOT, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert "2 of 2 candidates" in r.stdout and (tmp_path / "prog" / "summary.json").exists()
