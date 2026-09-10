from fastapi import APIRouter

from ..models import ReferenceData
from ..reference_cache import get_reference

router = APIRouter(prefix="/api", tags=["reference"])


@router.get("/reference", response_model=ReferenceData)
def reference() -> ReferenceData:
    """Material DB, glazing profiles and design-space constraints —
    used to pre-fill the configure forms."""
    return get_reference()
