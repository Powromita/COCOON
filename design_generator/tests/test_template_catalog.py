"""Stage 1 tests: template loading, filtering and malformed-template handling."""

from __future__ import annotations

import json
import shutil

import pytest

from design_generator.template_catalog import (
    TEMPLATE_DIR,
    TemplateLoadError,
    filter_templates,
    get_template,
    list_templates,
)

EXPECTED_IDS = {
    "single_room",
    "airlock_living",
    "airlock_living_equipment",
    "living_sleeping_storage",
    "command_post",
    "medical_post",
    "two_floor_compact",
}


def test_all_templates_load():
    assert {t.id for t in list_templates()} == EXPECTED_IDS


def test_get_template_and_unknown_id():
    assert get_template("two_floor_compact").floor_count == 2
    with pytest.raises(KeyError):
        get_template("nope")


def test_ladakh_request_matches_expected_templates(requirements_ladakh):
    rooms = requirements_ladakh["mission"]["required_rooms"]
    floors = requirements_ladakh["constraints"]["maximum_floors"]
    matches = {m.template.id: m for m in filter_templates(rooms, floors)}
    assert set(matches) == {"airlock_living", "airlock_living_equipment", "two_floor_compact"}
    # exact match, nothing merged
    assert matches["two_floor_compact"].merged == {}
    # merges are reported, never hidden
    assert matches["airlock_living"].merged == {"sleeping": "living", "equipment": "living"}
    assert matches["airlock_living_equipment"].merged == {"sleeping": "living"}


def test_floor_limit_excludes_two_floor():
    ids = {m.template.id for m in filter_templates(["airlock", "living", "sleeping", "equipment"], 1)}
    assert "two_floor_compact" not in ids
    assert ids == {"airlock_living", "airlock_living_equipment"}


def test_airlock_required_excludes_templates_without_one():
    ids = {m.template.id for m in filter_templates(["airlock", "living"], 2)}
    assert "single_room" not in ids and "living_sleeping_storage" not in ids


def test_unsatisfiable_request_returns_nothing():
    assert filter_templates(["airlock", "laboratory"], 2) == []


def test_single_room_serves_everything_but_airlock():
    ids = {m.template.id for m in filter_templates(["living", "sleeping", "storage"], 1)}
    assert "single_room" in ids


def _copy_templates(tmp_path):
    for p in TEMPLATE_DIR.glob("*.json"):
        shutil.copy(p, tmp_path / p.name)
    return tmp_path


def _break(tmp_path, name, mutate):
    path = tmp_path / f"{name}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    mutate(data)
    path.write_text(json.dumps(data), encoding="utf-8")


@pytest.mark.parametrize(
    "mutate, expected",
    [
        (lambda d: d["rooms"][1].update(id="airlock"), "duplicate room id"),
        (lambda d: d["links"].append({"a": "airlock", "b": "ghost", "kind": "door"}), "unknown room 'ghost'"),
        (lambda d: d["rooms"][1].update(is_primary_occupied=False), "exactly one primary"),
        (lambda d: d["links"].clear(), "not reachable"),
        (lambda d: d["rooms"][0].update(floor_level=3), "floor_level"),
        (lambda d: d["rooms"][0].update(weight=0), "weight"),
        (lambda d: d["rooms"][0].update(colour="red"), "colour"),
    ],
)
def test_malformed_template_fails_loudly(tmp_path, mutate, expected):
    directory = _copy_templates(tmp_path)
    _break(directory, "airlock_living", mutate)
    with pytest.raises(TemplateLoadError) as err:
        list_templates(directory)
    assert "airlock_living.json" in str(err.value)
    assert expected in str(err.value)


def test_id_must_match_file_name(tmp_path):
    directory = _copy_templates(tmp_path)
    _break(directory, "command_post", lambda d: d.update(id="something_else"))
    with pytest.raises(TemplateLoadError, match="must equal the file name"):
        list_templates(directory)


def test_invalid_json_reports_file(tmp_path):
    directory = _copy_templates(tmp_path)
    (directory / "medical_post.json").write_text("{ not json", encoding="utf-8")
    with pytest.raises(TemplateLoadError, match="medical_post.json: invalid JSON"):
        list_templates(directory)


def test_airlock_rule_violation_detected(tmp_path):
    directory = _copy_templates(tmp_path)
    # primary room opens directly outdoors although an airlock is required
    _break(directory, "airlock_living", lambda d: d["rooms"][1].update(exterior_access=True))
    with pytest.raises(TemplateLoadError, match="primary room must not open directly outdoors"):
        list_templates(directory)
