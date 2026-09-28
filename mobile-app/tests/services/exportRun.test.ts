/** "Download JSON": backend documents, verbatim, labelled with their source. */
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import * as fx from "../../mocks/fixtureLoader";
import { buildRunExport, shareRunJson } from "../../utils/exportRun";

describe("run JSON export", () => {
  it("contains the backend's candidates and Pareto verbatim, labelled as demo data in fixture mode", async () => {
    const doc = await buildRunExport(fx.RECORDED_OPTIMIZATION_ID);
    expect(doc.data_source).toBe("fixture");
    expect(doc.note).toMatch(/^DEMO DATA/);
    expect(doc.candidates).toEqual(fx.getRecordedCandidates());
    expect(doc.pareto).toEqual(fx.getRecordedPareto());
  });

  it("writes a .json file and opens the share sheet", async () => {
    const uri = await shareRunJson(fx.RECORDED_OPTIMIZATION_ID);
    expect(uri).toMatch(/cocoon-opt_.*-demo\.json$/);
    const files = (FileSystem as unknown as { __files: Map<string, string> }).__files;
    expect(JSON.parse(files.get(uri) as string).optimization_id).toBe(fx.RECORDED_OPTIMIZATION_ID);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, expect.objectContaining({ mimeType: "application/json" }));
  });
});
