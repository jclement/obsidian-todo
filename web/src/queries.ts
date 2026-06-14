import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { toast } from "./toast";
import type { Settings, Task, TaskDraft } from "./types";

export function useBootstrap() {
  return useQuery({ queryKey: ["bootstrap"], queryFn: api.bootstrap });
}
export function useTasks(name: string, params: Record<string, string> = {}) {
  return useQuery({ queryKey: ["tasks", name, params], queryFn: () => api.tasks(params) });
}
export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: api.projects });
}
export function useTags() {
  return useQuery({ queryKey: ["tags"], queryFn: api.tags });
}
export function useCounts() {
  return useQuery({ queryKey: ["counts"], queryFn: api.counts });
}
export function useNotes() {
  return useQuery({ queryKey: ["notes"], queryFn: api.notes, staleTime: 60_000 });
}
export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: api.settings });
}

/** Apply fn to every cached task-list query. Returns a rollback snapshot. */
function patchAllLists(qc: QueryClient, fn: (tasks: Task[]) => Task[]) {
  const snapshot = qc.getQueriesData<Task[]>({ queryKey: ["tasks"] });
  for (const [key, data] of snapshot) if (data) qc.setQueryData(key, fn(data));
  return snapshot;
}

function rollback(qc: QueryClient, snapshot: [readonly unknown[], Task[] | undefined][]) {
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}

function invalidateAll(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["tasks"] });
  qc.invalidateQueries({ queryKey: ["projects"] });
  qc.invalidateQueries({ queryKey: ["tags"] });
  qc.invalidateQueries({ queryKey: ["counts"] });
}

function handleError(qc: QueryClient, err: unknown, snapshot: [readonly unknown[], Task[] | undefined][]) {
  rollback(qc, snapshot);
  if (err instanceof ApiError && err.isConflict) {
    toast("Changed in Obsidian — refreshed", "info");
  } else {
    toast(err instanceof Error ? err.message : "Something went wrong", "error");
  }
  invalidateAll(qc);
}

/** Mutations that remove the task from open views optimistically. */
function useDroppingMutation(fn: (t: Task) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onMutate: async (t: Task) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      return { snapshot: patchAllLists(qc, (tasks) => tasks.filter((x) => !(x.path === t.path && x.line === t.line))) };
    },
    onError: (err, _t, ctx) => handleError(qc, err, ctx?.snapshot ?? []),
    onSettled: () => invalidateAll(qc),
  });
}

export function useComplete() {
  return useDroppingMutation(api.complete);
}
export function useCancel() {
  return useDroppingMutation(api.cancel);
}
export function useRemove() {
  return useDroppingMutation(api.remove);
}

export function useUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ task, changes }: { task: Task; changes: Record<string, unknown> }) => api.update(task, changes),
    onMutate: async ({ task, changes }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snapshot = patchAllLists(qc, (tasks) =>
        tasks.map((x) => (x.path === task.path && x.line === task.line ? { ...x, ...changes } : x)),
      );
      return { snapshot };
    },
    onError: (err, _v, ctx) => handleError(qc, err, ctx?.snapshot ?? []),
    onSettled: () => invalidateAll(qc),
  });
}

export function useAdd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: TaskDraft) => api.add(draft),
    onSuccess: () => toast("Task added", "success"),
    onError: (err) => toast(err instanceof Error ? err.message : "Failed to add", "error"),
    onSettled: () => invalidateAll(qc),
  });
}

export function useAddMany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (drafts: TaskDraft[]) => api.addMany(drafts),
    onSettled: () => invalidateAll(qc),
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings> & { openaiKey?: string; ntfyToken?: string }) => api.saveSettings(patch),
    onSuccess: () => {
      toast("Settings saved", "success");
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
      invalidateAll(qc);
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Failed to save", "error"),
  });
}
