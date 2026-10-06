import { it, expect, vi } from "vitest";
import { createTaskStore, taskReducer } from "../src/store.js";
import type { MutationApi } from "../src/api.js";
import type { Task } from "../src/types.js";
import { task, deferred } from "./helpers.js";
function api(): MutationApi {
  return {
    addTask: async (task) => task,
    updateTask: async (task) => task,
    deleteTask: async () => {},
  };
}
it("optimistically adds before the save resolves", async () => {
  const d = deferred<Task>();
  const store = createTaskStore({ ...api(), addTask: () => d.promise });
  const a = task();
  const p = store.addTask(a);
  expect(store.getState()).toEqual({ tasks: [a], pending: 1, error: null });
  d.resolve(a);
  await p;
  expect(store.getState().pending).toBe(0);
});
it("rolls back failed optimistic updates", async () => {
  const d = deferred<Task>();
  const a = task();
  const store = createTaskStore({ ...api(), updateTask: () => d.promise }, [a]);
  const p = store.updateTask(a.id, { title: "edited" });
  expect(store.getState().tasks[0]?.title).toBe("edited");
  await Promise.resolve();
  d.reject(new Error("Save failed"));
  await p;
  expect(store.getState()).toEqual({
    tasks: [a],
    pending: 0,
    error: "Save failed",
  });
});
it("rebases newer pending edits when an older edit fails and saves them in FIFO order", async () => {
  const first = deferred<Task>();
  const second = deferred<Task>();
  const update = vi
    .fn()
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise);
  const a = task();
  const store = createTaskStore({ ...api(), updateTask: update }, [a]);
  const p1 = store.updateTask(a.id, { title: "first" });
  const p2 = store.updateTask(a.id, { priority: "high" });
  expect(store.getState().tasks[0]).toMatchObject({
    title: "first",
    priority: "high",
  });
  await Promise.resolve();
  expect(update).toHaveBeenCalledTimes(1);
  first.reject(new Error("first failed"));
  await p1;
  expect(store.getState().tasks[0]).toMatchObject({
    title: a.title,
    priority: "high",
  });
  await Promise.resolve();
  expect(update).toHaveBeenCalledTimes(2);
  expect(update.mock.calls[1]?.[0]).toMatchObject({
    title: a.title,
    priority: "high",
  });
  second.resolve({ ...a, priority: "high" });
  await p2;
  expect(store.getState()).toEqual({
    tasks: [{ ...a, priority: "high" }],
    pending: 0,
    error: null,
  });
});
it("a later failure restores the previous successful edit", async () => {
  const update = vi
    .fn()
    .mockResolvedValueOnce({ ...task(), title: "saved" })
    .mockRejectedValueOnce(new Error("later failed"));
  const a = task();
  const store = createTaskStore({ ...api(), updateTask: update }, [a]);
  const p1 = store.updateTask(a.id, { title: "saved" });
  const p2 = store.updateTask(a.id, { title: "unsaved" });
  await p1;
  expect(store.getState().tasks[0]?.title).toBe("unsaved");
  await p2;
  expect(store.getState().tasks[0]?.title).toBe("saved");
});
it("a late rollback cannot undo a successful change on another id", async () => {
  const a = task("a"),
    b = task("b");
  const failed = deferred<Task>();
  const store = createTaskStore(
    {
      ...api(),
      updateTask: (t) => (t.id === a.id ? failed.promise : Promise.resolve(t)),
    },
    [a, b],
  );
  const p1 = store.updateTask(a.id, { title: "bad" });
  await store.updateTask(b.id, { title: "good" });
  failed.reject(new Error("late failure"));
  await p1;
  expect(store.getState().tasks.map((t) => t.title)).toEqual([a.title, "good"]);
});
it("toggles completion both ways and deletes tasks", async () => {
  const a = task();
  const when = new Date("2026-03-01");
  const store = createTaskStore(api(), [a], () => when);
  await store.toggleComplete(a.id);
  expect(store.getState().tasks[0]?.completedAt).toEqual(when);
  await store.toggleComplete(a.id);
  expect(store.getState().tasks[0]?.completedAt).toBe(null);
  await store.deleteTask(a.id);
  expect(store.getState().tasks).toEqual([]);
});
it("rolls back failed adds and deletes", async () => {
  const a = task();
  const store = createTaskStore(
    {
      ...api(),
      addTask: async () => {
        throw new Error("add failed");
      },
      deleteTask: async () => {
        throw new Error("delete failed");
      },
    },
    [a],
  );
  await store.addTask(task("b"));
  expect(store.getState().tasks).toEqual([a]);
  await store.deleteTask(a.id);
  expect(store.getState().tasks).toEqual([a]);
  expect(store.getState().error).toBe("delete failed");
});
it("notifies exactly once per transition and never after unsubscribe", async () => {
  const store = createTaskStore(api());
  const listener = vi.fn();
  const off = store.subscribe(listener);
  await store.addTask(task());
  expect(listener).toHaveBeenCalledTimes(2);
  off();
  await store.deleteTask(task().id);
  expect(listener).toHaveBeenCalledTimes(2);
});
it("surfaces missing tasks and mismatched response ids without corrupting state", async () => {
  const store = createTaskStore(
    { ...api(), updateTask: async () => task("other") },
    [task()],
  );
  await store.updateTask(task("missing").id, { title: "x" });
  expect(store.getState().error).toBe("Task not found");
  await store.updateTask(task().id, { title: "x" });
  expect(store.getState().error).toBe("API returned a different task id");
  expect(store.getState().tasks).toEqual([task()]);
});
it("reducer leaves input tasks intact and ignores duplicate adds", () => {
  const a = Object.freeze(task());
  const input = Object.freeze([a]);
  const updated = taskReducer(input, {
    type: "update",
    id: a.id,
    patch: { tags: ["new"] },
  });
  expect(updated[0]?.tags).toEqual(["new"]);
  expect(a.tags).toEqual([]);
  expect(taskReducer(input, { type: "add", task: a })).toEqual([a]);
});
it("reducer exhaustiveness rejects unknown runtime actions", () => {
  // @ts-expect-error Deliberate runtime invalid action.
  expect(() => taskReducer([], { type: "oops" })).toThrow("Unhandled variant");
});
