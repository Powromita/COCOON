"""
errors.py - M7 failures carrying an M0 ErrorCode so the API can return the
standard error envelope (PRD Section 16.6) without guessing.
"""

from __future__ import annotations

from typing import Any

from cocoon_contracts import ErrorCode


class EconomicsError(Exception):
    """An input that M7 refuses to price. Never retried automatically."""

    def __init__(self, code: ErrorCode, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}
