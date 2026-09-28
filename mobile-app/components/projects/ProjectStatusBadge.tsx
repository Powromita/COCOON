import React from "react";

import type { ProjectDisplayStatus } from "../../database/schema/types";
import { Tag, type TagTone } from "../common/Tag";

export const PROJECT_STATUS_LABELS: Record<ProjectDisplayStatus, string> = {
  DRAFT: "Draft",
  REQUIREMENTS_COMPLETE: "Requirements complete",
  GENERATING: "Generating",
  CANDIDATES_READY: "Candidates ready",
  FAILED: "Generation failed",
  NEEDS_MIGRATION: "Older format",
  CORRUPT: "Unreadable draft",
};

const TONES: Record<ProjectDisplayStatus, TagTone> = {
  DRAFT: "neutral",
  REQUIREMENTS_COMPLETE: "accent",
  GENERATING: "warning",
  CANDIDATES_READY: "ready",
  FAILED: "danger",
  NEEDS_MIGRATION: "warning",
  CORRUPT: "danger",
};

export function ProjectStatusBadge({ status }: { status: ProjectDisplayStatus }) {
  return <Tag label={PROJECT_STATUS_LABELS[status]} tone={TONES[status]} />;
}
