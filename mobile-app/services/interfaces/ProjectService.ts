import type { Project } from "@cocoon/contracts";

/**
 * Remote project persistence (/api/v1/projects). Projects are local-first
 * (SQLite, database/repositories/ProjectsRepository.ts). main's backend has
 * no project endpoint yet, so the API provider reports AppError
 * "not_supported" and the Projects screen shows the REMOTE section as
 * unavailable rather than empty. The sync queue calls upsertProject.
 */
export interface ProjectService {
  listProjects(): Promise<Project[]>;
  getProject(projectId: string): Promise<Project>;
  createProject(project: Project): Promise<Project>;
  updateProject(project: Project): Promise<Project>;
  /** Create-or-update, used by the sync queue. */
  upsertProject(project: Project): Promise<void>;
}
