/**
 * Web database open — deliberately does NOT import "expo-sqlite" (it has
 * no web implementation). This file exists so Metro's platform-extension
 * resolution picks it instead of openDatabase.native.ts for web builds,
 * keeping expo-sqlite out of the web bundle entirely. See
 * openDatabase.native.ts's doc comment and the M12.3 report §9.
 */
import type { DbDriver } from "./DbDriver";
import { DbUnavailableOnWebError } from "./DbDriver";

export async function openProjectsDb(): Promise<DbDriver> {
  throw new DbUnavailableOnWebError();
}
