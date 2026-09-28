/**
 * Test J (M12.3 §13): the web module path never imports expo-sqlite.
 * Checked two ways: (1) statically, reading openDatabase.web.ts's own
 * source, and (2) behaviorally, importing it directly (Jest doesn't do
 * Metro's platform-extension resolution for a fully-qualified path like
 * this, so this exercises the file itself) and confirming it rejects
 * with DbUnavailableOnWebError rather than touching SQLite.
 */
import fs from "node:fs";
import path from "node:path";

import { DbUnavailableOnWebError } from "../../database/DbDriver";
import { openProjectsDb } from "../../database/openDatabase.web";

describe("openDatabase.web — J. no expo-sqlite in the web module path", () => {
  it("openDatabase.web.ts's source does not import expo-sqlite", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../database/openDatabase.web.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/from\s+["']expo-sqlite["']/);
    expect(source).not.toMatch(/require\(\s*["']expo-sqlite["']\s*\)/);
  });

  it("calling it rejects with DbUnavailableOnWebError instead of touching SQLite", async () => {
    await expect(openProjectsDb()).rejects.toBeInstanceOf(DbUnavailableOnWebError);
  });
});
