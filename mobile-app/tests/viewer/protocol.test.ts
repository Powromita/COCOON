/**
 * WebView ↔ app message protocol for the 3D viewer, plus a smoke check of
 * the generated viewer page.
 */
import { VIEWER_HTML } from "../../components/viewer/viewerHtml.generated";
import { parseViewerMessage, playbackTimestamps, temperatureAt, temperatureRange, toInjection } from "../../components/viewer/protocol";
import * as fx from "../../mocks/fixtureLoader";

describe("viewer messages", () => {
  it("parses a room selection from the viewer", () => {
    expect(parseViewerMessage(JSON.stringify({ type: "ROOM_SELECTED", zoneId: "living" }))).toEqual({ type: "ROOM_SELECTED", zoneId: "living" });
    expect(parseViewerMessage(JSON.stringify({ type: "ROOM_SELECTED", zoneId: null }))).toEqual({ type: "ROOM_SELECTED", zoneId: null });
  });

  it("ignores malformed or unknown messages instead of throwing", () => {
    expect(parseViewerMessage("not json")).toBeNull();
    expect(parseViewerMessage(JSON.stringify({ type: "HACK" }))).toBeNull();
    expect(parseViewerMessage(JSON.stringify(42))).toBeNull();
  });

  it("builds an injection that hands the exact model to the viewer", () => {
    const model = fx.getSampleVisualizationModel();
    const js = toInjection({ type: "LOAD_MODEL", model });
    expect(js).toContain("window.cocoonViewer.receive(");
    const payload = JSON.parse(js.slice(js.indexOf("receive(") + 8, js.lastIndexOf(");")));
    expect(payload.model).toEqual(model);
  });
});

describe("thermal playback helpers", () => {
  const model = fx.getSampleVisualizationModel();

  it("reads the legend range and values straight from temperature_series", () => {
    expect(temperatureRange(model)).toEqual({ min: -18.8, max: 17.5 });
    expect(playbackTimestamps(model)).toHaveLength(4);
    expect(temperatureAt(model, "living", 2)).toBe(17.5);
    expect(temperatureAt(model, "nope", 0)).toBeUndefined();
  });
});

describe("generated viewer page", () => {
  it("is self-contained: bundles three.js and loads nothing from the network", () => {
    expect(VIEWER_HTML).toContain("cocoonViewer");
    expect(VIEWER_HTML).toContain("WebGLRenderer");
    expect(VIEWER_HTML).not.toMatch(/<script[^>]+src=/);
    expect(VIEWER_HTML).not.toMatch(/https?:\/\/cdn/);
  });
});
