import type { MaterialRecord } from "@cocoon/contracts";

export interface MaterialSnapshotSummary {
  snapshotId: string;
  checksum: string;
  materialIds: string[];
  /**
   * Full M0 records, or null when the provider only exposes ids
   * (GET /api/v1/materials returns ids and checksums, not properties).
   */
  materials: MaterialRecord[] | null;
}

export interface MaterialCatalog {
  defaultSnapshotId: string;
  snapshots: MaterialSnapshotSummary[];
}

export interface MaterialsService {
  getCatalog(): Promise<MaterialCatalog>;
}
