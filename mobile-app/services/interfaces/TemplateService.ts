/**
 * TemplateService — the M2 template catalogue and the backend's requirement
 * compatibility check. The app never keeps its own copy of the templates:
 * which rooms, arrangements, floor counts and materials can be offered all
 * come from GET /api/v1/templates, and every compatibility decision comes
 * from POST /api/v1/design-compatibility (and is repeated by the backend
 * before it generates anything).
 */
import type { CompatibilityResult, RoomArrangement, TemplateCatalog } from "../../types/backend";

export interface CompatibilityInput {
  /** A full or partial M0 RequirementsContract — the backend reports every missing field. */
  requirements: Record<string, unknown>;
  templateId?: string | null;
  roomArrangement?: Record<string, RoomArrangement>;
  materialsSnapshotId?: string;
}

export interface TemplateService {
  getCatalog(): Promise<TemplateCatalog>;
  checkCompatibility(input: CompatibilityInput, signal?: AbortSignal): Promise<CompatibilityResult>;
}
