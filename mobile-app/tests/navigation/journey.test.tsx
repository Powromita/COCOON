/**
 * Navigation through the real app/ routes (expo-router testing library),
 * in fixture mode, with the SQLite layer on sql.js.
 */
jest.mock("../../database/openDatabase", () => require("../helpers/testDb").openDatabaseMock);

import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";

import { getProjectsRepository, resetDbForTests } from "../../database";
import * as fx from "../../mocks/fixtureLoader";
import { sampleRequirementsDraft } from "../../validation/templates";
import { resetTestDb } from "../helpers/testDb";

jest.setTimeout(20_000);

const APP_DIR = "./app";
const RUN = fx.RECORDED_OPTIMIZATION_ID;
const RECOMMENDED = fx.getRecordedCandidates().recommended_design_id as string;

beforeEach(() => {
  resetTestDb();
  resetDbForTests();
});

describe("new project", () => {
  it("creates a project and opens the requirements wizard at Location", async () => {
    const router = renderRouter(APP_DIR, { initialUrl: "/project/new" });
    fireEvent.changeText(await screen.findByLabelText("Project name, required"), "Forward post");
    fireEvent.press(screen.getByText("Create and continue"));

    await waitFor(() => expect(router.getPathname()).toMatch(/^\/project\/prj_[0-9a-f]+\/edit$/));
    expect(await screen.findByText("STEP 1 OF 10")).toBeTruthy();
    expect(screen.getByText("Location")).toBeTruthy();
  });
});

describe("resume draft", () => {
  it("reopens a saved draft at the step where it was left", async () => {
    const repo = await getProjectsRepository();
    const created = await repo.createDraft("Half done");
    if (!created.ok) throw new Error(created.error);
    await repo.saveDraft(created.data.id, { site: { latitude_deg: 34.1 } }, 4);

    renderRouter(APP_DIR, { initialUrl: `/project/${created.data.id}` });
    fireEvent.press(await screen.findByText("Continue requirements (Rooms)"));
    expect(await screen.findByText("STEP 5 OF 10")).toBeTruthy();
    expect(screen.getByText("Spaces the layout must include.")).toBeTruthy();
  });

  it("keeps entered values when moving back a step", async () => {
    const repo = await getProjectsRepository();
    const created = await repo.createDraft("Nav", sampleRequirementsDraft());
    if (!created.ok) throw new Error(created.error);

    renderRouter(APP_DIR, { initialUrl: `/project/${created.data.id}/edit?step=3` });
    const occupants = await screen.findByLabelText("Number of occupants in persons, required");
    fireEvent.changeText(occupants, "12");
    fireEvent.press(screen.getByText("Next"));
    expect(await screen.findByText("STEP 5 OF 10")).toBeTruthy();
    fireEvent.press(screen.getByText("Back"));
    expect((await screen.findByLabelText("Number of occupants in persons, required")).props.value).toBe("12");
  });
});

describe("generation → candidates → results", () => {
  it("shows the completed demo run and opens its candidates", async () => {
    const router = renderRouter(APP_DIR, { initialUrl: `/generation/${RUN}` });
    fireEvent.press(await screen.findByText("View candidates"));
    await waitFor(() => expect(router.getPathname()).toBe(`/candidates/${RUN}`));
    expect(await screen.findByText(/Recommended by optimization engine/)).toBeTruthy();
  });

  it("opens a candidate's results with all seven tabs", async () => {
    const router = renderRouter(APP_DIR, { initialUrl: `/candidates/${RUN}` });
    await screen.findByText(RECOMMENDED);
    fireEvent.press(screen.getAllByText("View")[0]);
    await waitFor(() => expect(router.getPathname()).toMatch(new RegExp(`^/results/${RUN}/des_`)));
    for (const tab of ["Overview", "Rooms", "Energy", "Economics", "3D", "Validation", "Evidence"]) {
      expect(screen.getByText(tab)).toBeTruthy();
    }
  });

  it("switches result tabs without losing the candidate context", async () => {
    const router = renderRouter(APP_DIR, { initialUrl: `/results/${RUN}/${RECOMMENDED}` });
    expect(await screen.findByText("Recommended by optimization engine")).toBeTruthy();
    fireEvent.press(screen.getByText("Economics"));
    expect(await screen.findByText("CAPEX breakdown")).toBeTruthy();
    expect(router.getPathname()).toBe(`/results/${RUN}/${RECOMMENDED}`);
    fireEvent.press(screen.getByText("Validation"));
    expect(await screen.findByText("Request ANSYS validation")).toBeTruthy();
    expect(screen.getByText(/ANSYS validation is currently unavailable/)).toBeTruthy();
  });
});

describe("run history", () => {
  it("keeps a completed run reachable from Reports after leaving it", async () => {
    const router = renderRouter(APP_DIR, { initialUrl: "/reports" });
    expect(await screen.findByText(RUN)).toBeTruthy();
    expect(screen.queryByText("Report (PDF)")).toBeNull();
    fireEvent.press(screen.getByText("View candidates"));
    await waitFor(() => expect(router.getPathname()).toBe(`/candidates/${RUN}`));
  });
});
