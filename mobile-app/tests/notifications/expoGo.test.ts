/**
 * Regression: in Expo Go (Android, SDK 53+) importing expo-notifications
 * throws at load time. The app must never import it eagerly, and in Expo Go
 * it must not load it at all.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SKIP = new Set(["node_modules", "tests", ".expo", "dist"]);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name)) return [];
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}

describe("expo-notifications is only ever loaded lazily", () => {
  it("no app source file has a runtime import of expo-notifications", () => {
    const offenders = sourceFiles(ROOT).filter((f) => {
      const src = fs.readFileSync(f, "utf8");
      // Type-only imports (`typeof import(...)`, `import type`) are erased and allowed.
      return /^\s*import\s+(?!type\b)[^;]*from\s+["']expo-notifications["']/m.test(src);
    });
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});

describe("in Expo Go", () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock("expo-constants");
  });

  it("never requires expo-notifications and reports notifications as unavailable", async () => {
    jest.resetModules();
    jest.doMock("expo-constants", () => ({
      __esModule: true,
      default: { executionEnvironment: "storeClient" },
      ExecutionEnvironment: { StoreClient: "storeClient", Standalone: "standalone", Bare: "bare" },
    }));
    const factory = jest.fn(() => {
      throw new Error("expo-notifications: removed from Expo Go");
    });
    jest.doMock("expo-notifications", factory);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../../notifications/module") as typeof import("../../notifications/module");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jobs = require("../../notifications/jobs") as typeof import("../../notifications/jobs");

    expect(mod.IS_EXPO_GO).toBe(true);
    expect(mod.getNotificationsModule()).toBeNull();
    expect(await jobs.getNotificationPermission()).toBe("expo_go");
    expect(() => jobs.installForegroundHandler()).not.toThrow();
    expect(jobs.onNotificationTap(() => undefined)).toEqual(expect.any(Function));
    expect(factory).not.toHaveBeenCalled();
  });
});
