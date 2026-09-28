/**
 * "Download JSON" for a completed run: the backend's own run status,
 * candidates and Pareto documents, written verbatim to a .json file and
 * handed to the system share sheet. Nothing is recomputed, and the file
 * states whether it holds demo (fixture) or live backend data.
 */
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { DATA_PROVIDER } from "../constants/env";
import { candidateService, generationService } from "../services/registry";
import { AppError } from "./errors";

export interface RunExport {
  exported_at: string;
  data_source: "fixture" | "api";
  note: string;
  optimization_id: string;
  status: unknown;
  candidates: unknown;
  pareto: unknown;
}

export async function buildRunExport(optimizationId: string): Promise<RunExport> {
  const [status, candidates, pareto] = await Promise.all([
    generationService.getGenerationJob(optimizationId),
    candidateService.getCandidates(optimizationId),
    candidateService.getPareto(optimizationId),
  ]);
  return {
    exported_at: new Date().toISOString(),
    data_source: DATA_PROVIDER,
    note:
      DATA_PROVIDER === "fixture"
        ? "DEMO DATA: a recorded COCOON backend optimization run replayed for demonstration. Not a live result."
        : "Exported from the COCOON backend. Values are the backend's, unmodified.",
    optimization_id: optimizationId,
    status,
    candidates,
    pareto,
  };
}

/** Writes the export to the cache directory and opens the share sheet. Returns the file URI. */
export async function shareRunJson(optimizationId: string): Promise<string> {
  const doc = await buildRunExport(optimizationId);
  const file = new File(Paths.cache, `cocoon-${optimizationId}${DATA_PROVIDER === "fixture" ? "-demo" : ""}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(doc, null, 2));
  if (!(await Sharing.isAvailableAsync())) {
    throw new AppError({
      kind: "unavailable",
      message: "Sharing is not available on this device.",
      backendMessage: `Sharing is not available on this device. The file was saved to ${file.uri}.`,
    });
  }
  await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: `COCOON run ${optimizationId}` });
  return file.uri;
}
