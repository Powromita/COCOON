"""
Records real backend responses for the mobile tests (tests/fixtures/templates/*.json).

    python mobile-app/scripts/record-template-fixtures.py        # from the repo root, backend importable

Every file is a verbatim response of the in-process COCOON API for the M0 sample requirements (or a stated
variation of them), so the tests exercise the real catalogue and real compatibility results. Re-run it when the
M2 templates or the compatibility response change.
"""

import copy
import json
from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import app

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "mobile-app" / "tests" / "fixtures" / "templates"
SAMPLE = ROOT / "packages" / "packages" / "contracts" / "fixtures" / "valid" / "requirements_ladakh_30p.json"


def main() -> None:
    client = TestClient(app)
    OUT.mkdir(parents=True, exist_ok=True)
    req = json.loads(SAMPLE.read_text(encoding="utf-8"))

    def compat(name: str, requirements: dict, **extra) -> None:
        r = client.post("/api/v1/design-compatibility", json={"requirements": requirements, **extra})
        r.raise_for_status()
        (OUT / f"compatibility_{name}.json").write_text(json.dumps(r.json(), indent=1), encoding="utf-8")

    (OUT / "catalog.json").write_text(json.dumps(client.get("/api/v1/templates").json(), indent=1), encoding="utf-8")
    compat("sample_ok", req)

    tiny = copy.deepcopy(req)
    tiny["constraints"]["maximum_footprint_m2"] = 20.0
    compat("footprint_too_small", tiny)

    pair = copy.deepcopy(req)
    pair["mission"].update(required_rooms=["medical", "command"], occupants=4)
    pair["constraints"].update(maximum_floors=1, maximum_footprint_m2=60.0)
    compat("no_template", pair, room_arrangement={"medical": "dedicated", "command": "dedicated"})

    compat("partial", {"mission": {"type": "living", "occupants": 4, "required_rooms": ["living", "sleeping"]},
                       "constraints": {"maximum_floors": 1, "maximum_footprint_m2": 40}})

    r = client.post("/api/v1/generate-designs", json={"requirements": tiny, "count": 2})
    (OUT / "error_physical_infeasibility.json").write_text(json.dumps(r.json(), indent=1), encoding="utf-8")
    print(f"wrote {len(list(OUT.glob('*.json')))} files to {OUT}")


if __name__ == "__main__":
    main()
