"""
persist.py - atomic writers for the files backend/routes/pipeline.py serves.

    <runs_dir>/<run_id>/result.json
    <runs_dir>/<run_id>/candidates/<design_id>.building.json     one per generated design

status.json belongs to the backend and is never written here. Windows can briefly deny a replace while another
thread reads the target, so the replace is retried.
"""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any, Iterable


def atomic_write(path: Path, text: str, attempts: int = 40, delay: float = 0.025) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + f".{uuid.uuid4().hex[:6]}.tmp")
    tmp.write_text(text, encoding="utf-8")
    for i in range(attempts):
        try:
            tmp.replace(path)
            return
        except PermissionError:
            if i == attempts - 1:
                tmp.unlink(missing_ok=True)
                raise
            time.sleep(delay)


def write_run(run_dir: Path, result_doc: dict[str, Any], buildings: Iterable[Any], files: dict[str, str] | None = None) -> None:
    """Candidates and extra files first, result.json last, so a reader that sees result.json sees everything else too."""
    for b in buildings:
        atomic_write(run_dir / "candidates" / f"{b.design_id}.building.json", b.model_dump_json(indent=1))
    for name, text in (files or {}).items():
        atomic_write(run_dir / name, text)
    atomic_write(run_dir / "result.json", json.dumps(result_doc, indent=1, default=str))
