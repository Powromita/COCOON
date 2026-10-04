from uuid import UUID
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.auth import AuthenticatedUser, require_user
from backend.main import app


@pytest.fixture(autouse=True)
def _authenticated_api_client(monkeypatch):
    """Existing route tests run as one authenticated user; auth behavior has dedicated tests."""
    monkeypatch.setattr("backend.settings.MOCK_AUTH", False)  # tests cover real token checks
    monkeypatch.setattr("backend.routes.pipeline.ensure_project", lambda *_: "10000000-0000-4000-8000-000000000099")
    monkeypatch.setattr("backend.routes.pipeline.create_run", lambda *_: None)
    monkeypatch.setattr("backend.routes.pipeline.owns_run", lambda *_: True)
    app.dependency_overrides[require_user] = lambda: AuthenticatedUser(
        id=UUID("10000000-0000-4000-8000-000000000001"),
        email="route-tests@example.test",
        role="authenticated",
        claims={},
    )
    yield
    app.dependency_overrides.pop(require_user, None)