"""Server-only Supabase REST persistence for private projects and runs."""
import json
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import UUID
from . import settings

def _request(table: str, method="GET", query: dict[str,str]|None=None, body: dict|None=None) -> list[dict]:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SECRET_KEY: raise RuntimeError("Supabase server configuration is missing")
    url=f"{settings.SUPABASE_URL}/rest/v1/{table}" + (("?"+urlencode(query)) if query else "")
    request=Request(url, data=json.dumps(body).encode() if body else None, method=method, headers={"apikey":settings.SUPABASE_SECRET_KEY,"Authorization":f"Bearer {settings.SUPABASE_SECRET_KEY}","Content-Type":"application/json","Prefer":"return=representation"})
    with urlopen(request, timeout=10) as response: return json.loads(response.read() or b"[]")

def ensure_project(owner_id: UUID, project_code: str, draft: dict[str,Any]) -> str:
    found=_request("projects", query={"select":"id","project_code":f"eq.{project_code}","owner_id":f"eq.{owner_id}"})
    if found: return found[0]["id"]
    return _request("projects","POST",body={"project_code":project_code,"owner_id":str(owner_id),"name":str(draft.get("project_name") or project_code),"mode":"new_shelter","draft":draft})[0]["id"]

def create_run(owner_id: UUID, project_id: str, optimization_code: str, snapshot: dict[str,Any], count: int, seed: int) -> None:
    _request("optimization_runs","POST",body={"optimization_code":optimization_code,"project_id":project_id,"requested_by":str(owner_id),"input_snapshot":snapshot,"candidate_count":count,"seed":seed,"artifact_prefix":optimization_code})

def owns_run(owner_id: UUID, optimization_code: str) -> bool:
    return bool(_request("optimization_runs",query={"select":"id","optimization_code":f"eq.{optimization_code}","requested_by":f"eq.{owner_id}","limit":"1"}))