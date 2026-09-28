import React from "react";

import type { CapabilityStatus } from "../../services/interfaces/CapabilitiesService";
import { Tag, type TagTone } from "./Tag";

const LABELS: Record<CapabilityStatus, string> = {
  AVAILABLE: "Available",
  DEMO: "Demo data",
  NOT_CONNECTED: "Not connected",
  UNAVAILABLE: "Unavailable",
  NOT_SUPPORTED: "Not on backend yet",
};

const TONES: Record<CapabilityStatus, TagTone> = {
  AVAILABLE: "ready",
  DEMO: "demo",
  NOT_CONNECTED: "neutral",
  UNAVAILABLE: "danger",
  NOT_SUPPORTED: "neutral",
};

/** System-capability status (see services/interfaces/CapabilitiesService.ts). */
export function StatusBadge({ status }: { status: CapabilityStatus }) {
  return <Tag label={LABELS[status]} tone={TONES[status]} />;
}
