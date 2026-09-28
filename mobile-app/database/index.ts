/**
 * Lazy DB singleton + repository providers — the only place screens/hooks
 * reach for a repository in production. `./openDatabase` is Metro's
 * platform-split module (openDatabase.native.ts / openDatabase.web.ts),
 * which keeps expo-sqlite out of the web bundle.
 */
import type { DbDriver } from "./DbDriver";
import { openProjectsDb } from "./openDatabase";
import { CacheRepository } from "./repositories/CacheRepository";
import { MetaRepository } from "./repositories/MetaRepository";
import { ProjectsRepository } from "./repositories/ProjectsRepository";
import { RunsRepository } from "./repositories/RunsRepository";
import { SyncQueueRepository } from "./repositories/SyncQueueRepository";

let dbPromise: Promise<DbDriver> | null = null;

/** Opens (or reuses) and migrates the DB. Throws DbOpenError/DbUnavailableOnWebError on failure. */
export function getDb(): Promise<DbDriver> {
  const pending: Promise<DbDriver> =
    dbPromise ??
    openProjectsDb().catch((cause: unknown) => {
      // Let a later call (e.g. the user tapping "Retry") try again instead of caching the failure.
      dbPromise = null;
      throw cause;
    });
  dbPromise = pending;
  return pending;
}

/** Test-only: drop the cached connection so the next getDb() opens a fresh database. */
export function resetDbForTests(): void {
  dbPromise = null;
}

export async function getProjectsRepository(): Promise<ProjectsRepository> {
  return new ProjectsRepository(await getDb());
}

export async function getCacheRepository(): Promise<CacheRepository> {
  return new CacheRepository(await getDb());
}

export async function getSyncQueueRepository(): Promise<SyncQueueRepository> {
  return new SyncQueueRepository(await getDb());
}

export async function getRunsRepository(): Promise<RunsRepository> {
  return new RunsRepository(await getDb());
}

export async function getMetaRepository(): Promise<MetaRepository> {
  return new MetaRepository(await getDb());
}

export { CacheRepository, MetaRepository, ProjectsRepository, RunsRepository, SyncQueueRepository };
export type { RunIndexEntry } from "./repositories/RunsRepository";
export * from "./DbDriver";
export * from "./schema/types";
