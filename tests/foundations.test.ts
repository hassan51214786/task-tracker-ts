import { describe, it, expect } from "vitest";
import { mapAsyncState, taskState, assertNever } from "../src/types.js";
import { parseTask, parseTaskList } from "../src/validation.js";
import { task } from "./helpers.js";
describe("validation", () => {
  const raw = {
    id: "a",
    title: " Read ",
    priority: "high",
    tags: ["work"],
    createdAt: "2026-01-01",
    completedAt: null,
  };
  it("normalizes valid input and copies dates and tags", () => {
    const source = task();
    const result = parseTask(source);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.task).toEqual(source);
      expect(result.task.tags).not.toBe(source.tags);
      expect(result.task.createdAt).not.toBe(source.createdAt);
    }
    expect(parseTask(raw)).toEqual({
      ok: true,
      task: { ...raw, title: "Read", createdAt: new Date("2026-01-01") },
    });
  });
  it.each([null, 4, [], undefined])("rejects a non-object %s", (value) => {
    expect(parseTask(value)).toEqual({
      ok: false,
      errors: ["Task must be an object"],
    });
  });
  it.each([
    { title: "  " },
    { title: "x".repeat(121) },
    { id: "" },
    { id: undefined },
    { priority: "urgent" },
    { tags: [3] },
    { tags: "tag" },
    { createdAt: new Date("bad") },
    { createdAt: null },
    { completedAt: "bad-date" },
    { completedAt: undefined },
  ])("rejects invalid fields %j", (fields) => {
    const r = parseTask({ ...raw, ...fields });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
  });
  it("collects all field errors in one pass", () => {
    const r = parseTask({
      id: 0,
      title: "",
      priority: "bad",
      tags: null,
      createdAt: "bad",
      completedAt: 4,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(6);
  });
  it("accepts valid completion dates", () => {
    const r = parseTask({ ...raw, completedAt: "2026-01-02" });
    if (!r.ok) throw new Error("Expected success");
    expect(r.task.completedAt).toEqual(new Date("2026-01-02"));
  });
  it("preserves good records beside invalid ones", () => {
    const r = parseTaskList([raw, { ...raw, title: "" }]);
    expect(r.tasks).toHaveLength(1);
    expect(r.rejected).toEqual([
      { index: 1, errors: ["title must be non-empty"] },
    ]);
  });
  it("handles a non-array gracefully", () => {
    expect(parseTaskList({})).toEqual({
      tasks: [],
      rejected: [{ index: -1, errors: ["Expected an array of tasks"] }],
    });
  });
});
describe("async state", () => {
  it("maps only success", () => {
    expect(mapAsyncState({ status: "success", data: 4 }, (n) => n * 2)).toEqual(
      { status: "success", data: 8 },
    );
  });
  it.each([
    { status: "loading" },
    { status: "empty" },
    { status: "error", message: "Oops" },
  ] satisfies import("../src/types.js").AsyncState<unknown>[])(
    "preserves $status",
    (state) => {
      expect(mapAsyncState(state, () => "unused")).toBe(state);
    },
  );
  it("classifies empty and successful lists", () => {
    expect(taskState([])).toEqual({ status: "empty" });
    expect(taskState([task()]).status).toBe("success");
  });
  it("fails loudly for an unreachable runtime variant", () => {
    // A deliberate runtime fault injection; normal callers cannot supply never.
    // @ts-expect-error Deliberately violates the never contract.
    expect(() => assertNever("new variant")).toThrow("Unhandled variant");
  });
});
