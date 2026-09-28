/**
 * Local project hooks (SQLite via ProjectsRepository). Projects are
 * local-first: main's backend has no /api/v1/projects endpoint yet.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getProjectsRepository } from "../database";
import type { DraftRequirements, ProjectRunStatus } from "../database/schema/types";
import type { FieldErrors } from "../validation/schemas";
import { useAutosave } from "./useAutosave";

export const PROJECTS_LIST_QUERY_KEY = ["projects", "list"] as const;

export function projectRecordQueryKey(id: string | undefined) {
  return ["projects", "record", id] as const;
}

function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export function useProjectsList() {
  return useQuery({
    queryKey: PROJECTS_LIST_QUERY_KEY,
    queryFn: async () => unwrap(await (await getProjectsRepository()).listProjects()),
  });
}

export function useProjectRecord(id: string | undefined) {
  return useQuery({
    queryKey: projectRecordQueryKey(id),
    queryFn: async () => {
      const record = unwrap(await (await getProjectsRepository()).getProject(id as string));
      if (!record) throw new Error("Project not found.");
      return record;
    },
    enabled: Boolean(id),
  });
}

function useInvalidateProject(id?: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: PROJECTS_LIST_QUERY_KEY });
    if (id) void queryClient.invalidateQueries({ queryKey: projectRecordQueryKey(id) });
  };
}

export function useCreateDraft() {
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: async ({ name, requirements }: { name: string; requirements?: DraftRequirements }) =>
      unwrap(await (await getProjectsRepository()).createDraft(name, requirements)),
    onSuccess: invalidate,
  });
}

export function useDeleteProject() {
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await (await getProjectsRepository()).deleteProject(id)),
    onSuccess: invalidate,
  });
}

export function useRestoreProject() {
  const invalidate = useInvalidateProject();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await (await getProjectsRepository()).restoreProject(id)),
    onSuccess: invalidate,
  });
}

export function useRenameProject(id: string | undefined) {
  const invalidate = useInvalidateProject(id);
  return useMutation({
    mutationFn: async (name: string) => unwrap(await (await getProjectsRepository()).renameProject(id as string, name)),
    onSuccess: invalidate,
  });
}

interface DraftSavePayload {
  requirements: DraftRequirements;
  step: number;
}

/** Wires ProjectsRepository.saveDraft into the debounce/flush machinery of useAutosave. */
export function useDraftAutosave(id: string | undefined) {
  const invalidate = useInvalidateProject(id);
  return useAutosave<DraftSavePayload>(async ({ requirements, step }) => {
    if (!id) return;
    unwrap(await (await getProjectsRepository()).saveDraft(id, requirements, step));
    invalidate();
  });
}

export function useMarkReady(id: string | undefined) {
  const invalidate = useInvalidateProject(id);
  return useMutation<void, FieldErrors, void>({
    mutationFn: async () => {
      const result = await (await getProjectsRepository()).markReady(id as string);
      if (!result.ok) throw result.error;
    },
    onSuccess: invalidate,
  });
}

export function useRevertToDraft(id: string | undefined) {
  const invalidate = useInvalidateProject(id);
  return useMutation({
    mutationFn: async () => unwrap(await (await getProjectsRepository()).revertToDraft(id as string)),
    onSuccess: invalidate,
  });
}

export function useRecordRunStatus(id: string | undefined) {
  const invalidate = useInvalidateProject(id);
  return useMutation({
    mutationFn: async (input: { status: ProjectRunStatus; recommendedDesignId?: string | null; error?: string | null }) =>
      unwrap(
        await (await getProjectsRepository()).recordRunStatus(id as string, input.status, {
          recommendedDesignId: input.recommendedDesignId,
          error: input.error,
        })
      ),
    onSuccess: invalidate,
  });
}

export function useSelectDesign(id: string | undefined) {
  const invalidate = useInvalidateProject(id);
  return useMutation({
    mutationFn: async (designId: string | null) =>
      unwrap(await (await getProjectsRepository()).selectDesign(id as string, designId)),
    onSuccess: invalidate,
  });
}
