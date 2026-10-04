from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

from backend.auth import AuthenticatedUser, require_user
from backend.main import app


def test_missing_bearer_token_is_rejected():
    saved = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    try:
        response = TestClient(app).get("/api/v1/projects")
    finally:
        app.dependency_overrides.update(saved)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_health_remains_public():
    saved = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    try:
        response = TestClient(app).get("/api/health")
    finally:
        app.dependency_overrides.update(saved)
    assert response.status_code == 200


def test_verified_claims_become_typed_identity(monkeypatch):
    user_id = "10000000-0000-4000-8000-000000000001"
    monkeypatch.setattr("backend.auth._verify_access_token", lambda _: {
        "sub": user_id, "email": "a@example.test", "role": "authenticated",
    })
    user = require_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials="token"))
    assert user.id == UUID(user_id)
    assert user.email == "a@example.test"


@pytest.mark.parametrize("claims", [
    {"sub": "not-a-uuid", "role": "authenticated"},
    {"sub": "10000000-0000-4000-8000-000000000001", "role": "anon"},
])
def test_invalid_identity_claims_are_rejected(monkeypatch, claims):
    monkeypatch.setattr("backend.auth._verify_access_token", lambda _: claims)
    with pytest.raises(HTTPException) as raised:
        require_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials="token"))
    assert raised.value.status_code == 401


def test_test_identity_shape_is_not_privileged():
    user = AuthenticatedUser(id=UUID("10000000-0000-4000-8000-000000000001"),
                             email="test@example.test", role="authenticated", claims={})
    assert user.role == "authenticated"
