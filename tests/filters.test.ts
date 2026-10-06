import { it, expect, describe } from "vitest";
import {
  filterTasks,
  sortTasks,
  sortTasksBy,
  groupBy,
  groupTasksByPriority,
} from "../src/filters.js";
import { task } from "./helpers.js";
const tasks = [
  task("b", {
    title: "Beta",
    priority: "high",
    tags: ["home"],
    createdAt: new Date("2026-01-02"),
  }),
  task("a", {
    title: "alpha",
    priority: "low",
    tags: ["work"],
    createdAt: new Date("2026-01-01"),
    completedAt: new Date("2026-01-03"),
  }),
  task("c", {
    title: "ALPHA",
    priority: "medium",
    tags: ["work", "home"],
    createdAt: new Date("2026-01-03"),
    completedAt: new Date("2026-01-04"),
  }),
];
const ids = (items: typeof tasks) => items.map((t) => t.id);
describe("sorts", () => {
  it.each([
    { by: "title", expected: ["a", "c", "b"] },
    { by: "priority", expected: ["a", "c", "b"] },
    { by: "createdAt", expected: ["a", "b", "c"] },
    { by: "completedAt", expected: ["a", "c", "b"] },
    { by: "id", expected: ["a", "b", "c"] },
    { by: "tags", expected: ["b", "a", "c"] },
  ] satisfies { by: keyof (typeof tasks)[number]; expected: string[] }[])(
    "sorts by $by",
    ({ by, expected }) => {
      expect(ids(sortTasks(tasks, by, "asc"))).toEqual(expected);
    },
  );
  it("keeps nulls last when descending", () => {
    expect(ids(sortTasks(tasks, "completedAt", "desc"))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
  it("keeps equal null completion times stable", () => {
    const open = [task("z"), task("a")];
    expect(sortTasks(open, "completedAt", "desc")).toEqual(open);
  });
  it("keeps case-insensitive ties in input order", () => {
    expect(
      ids(sortTasks([tasks[2] ?? task(), tasks[1] ?? task()], "title", "asc")),
    ).toEqual(["c", "a"]);
  });
  it("breaks title ties with a second key", () => {
    expect(
      ids(
        sortTasksBy(tasks, [
          { by: "title", direction: "asc" },
          { by: "priority", direction: "desc" },
        ]),
      ),
    ).toEqual(["c", "a", "b"]);
  });
  it("does not mutate frozen arrays or objects", () => {
    const frozen = Object.freeze(tasks.map((t) => Object.freeze(t)));
    expect(sortTasks(frozen, "id", "asc")).toHaveLength(3);
    expect(frozen.map((t) => t.id)).toEqual(["b", "a", "c"]);
  });
  it("leaves input order intact with no keys", () => {
    expect(sortTasksBy(tasks, [])).toEqual(tasks);
  });
});
describe("filters and grouping", () => {
  it("returns all tasks for no criteria", () => {
    expect(filterTasks(tasks, {})).toEqual(tasks);
  });
  it("combines priority completion tags and range using AND", () => {
    expect(
      ids(
        filterTasks(tasks, {
          priority: "medium",
          completed: true,
          tags: ["home", "other"],
          from: new Date("2026-01-03"),
          to: new Date("2026-01-03"),
        }),
      ),
    ).toEqual(["c"]);
  });
  it("includes open tasks only", () => {
    expect(ids(filterTasks(tasks, { completed: false }))).toEqual(["b"]);
  });
  it("uses any-of matching for tags", () => {
    expect(ids(filterTasks(tasks, { tags: ["nope", "work"] }))).toEqual([
      "a",
      "c",
    ]);
    expect(filterTasks(tasks, { tags: [] })).toEqual(tasks);
  });
  it("excludes out-of-range dates and mismatching criteria", () => {
    expect(filterTasks(tasks, { from: new Date("2026-01-04") })).toEqual([]);
    expect(filterTasks(tasks, { to: new Date("2025-01-01") })).toEqual([]);
    expect(filterTasks(tasks, { priority: "high", completed: true })).toEqual(
      [],
    );
  });
  it("does not mutate filter inputs", () => {
    const before = JSON.stringify(tasks);
    filterTasks(Object.freeze(tasks), { tags: ["work"] });
    expect(JSON.stringify(tasks)).toBe(before);
  });
  it("groups by priority with all keys available", () => {
    expect(groupTasksByPriority(tasks).high).toEqual([tasks[0]]);
    expect(groupTasksByPriority([])).toEqual({ low: [], medium: [], high: [] });
  });
  it("groups prototype-like keys safely", () => {
    expect(
      groupBy(["__proto__", "__proto__", "constructor"], (v) => v).__proto__,
    ).toEqual(["__proto__", "__proto__"]);
  });
  it("supports symbol and number group keys", () => {
    const key = Symbol("group");
    expect(groupBy([1, 2], () => key)[key]).toEqual([1, 2]);
    expect(groupBy([1, 2, 3], (n) => n % 2)[1]).toEqual([1, 3]);
  });
  it("satisfies idempotence and filter-subset properties across generated inputs", () => {
    for (let n = 0; n < 40; n++) {
      const input = Array.from({ length: n }, (_, i) =>
        task(String(i), {
          title: String((i * 17) % 11),
          priority: i % 2 ? "high" : "low",
        }),
      );
      const sorted = sortTasks(input, "title", "asc");
      expect(sortTasks(sorted, "title", "asc")).toEqual(sorted);
      const filtered = filterTasks(input, { priority: "high" });
      expect(filtered.length).toBeLessThanOrEqual(input.length);
      expect(filtered.every((t) => input.includes(t))).toBe(true);
    }
  });
});
// Uncalled code still participates in tsc; wrong keys and unbranded ids must fail.
function typeContracts() {
  // @ts-expect-error Not a field of Task.
  sortTasks(tasks, "deadline", "asc");
  const acceptId = (id: import("../src/types.js").TaskId) => id;
  // @ts-expect-error A raw string has not crossed validation.
  acceptId("random");
}
void typeContracts;
