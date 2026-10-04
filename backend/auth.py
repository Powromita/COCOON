"""Supabase access-token verification for FastAPI request dependencies."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any
from uuid import UUID

import jwt
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError, PyJWKClientError

from . import settings

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    id: UUID
    email: str | None
    role: str
    claims: dict[str, Any]


def _unauthorized(detail: str = "Invalid or expired access token") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail,
                         headers={"WWW-Authenticate": "Bearer"})


@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient:
    if not settings.SUPABASE_JWKS_URL:
        raise RuntimeError("SUPABASE_JWKS_URL or SUPABASE_URL must be configured")
    return PyJWKClient(settings.SUPABASE_JWKS_URL, cache_keys=True, lifespan=300)


def _verify_access_token(token: str) -> dict[str, Any]:
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(token, signing_key.key, algorithms=["RS256", "ES256"],
                          audience=settings.SUPABASE_JWT_AUDIENCE,
                          issuer=settings.SUPABASE_JWT_ISSUER,
                          options={"require": ["exp", "iat", "sub", "aud", "iss"]})
    except (InvalidTokenError, PyJWKClientError, RuntimeError, ValueError) as exc:
        raise _unauthorized() from exc


DEV_USER = AuthenticatedUser(id=UUID("00000000-0000-4000-8000-00000000d3e0"), email="dev@local.invalid",
                             role="authenticated", claims={"dev_auth_disabled": True})


def require_user(credentials: HTTPAuthorizationCredentials | None = Security(bearer)) -> AuthenticatedUser:
    if settings.AUTH_MODE == "disabled":                            # local development only
        return DEV_USER
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized("Bearer access token required")
    claims = _verify_access_token(credentials.credentials)
    if claims.get("role") != "authenticated":
        raise _unauthorized()
    try:
        user_id = UUID(str(claims["sub"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise _unauthorized() from exc
    return AuthenticatedUser(id=user_id, email=claims.get("email"),
                             role="authenticated", claims=claims)
