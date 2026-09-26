"""errors.py - M4 failures carry a stable code so M6 can record why one design failed."""

from __future__ import annotations

from typing import Any


class M4Error(ValueError):
    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}
