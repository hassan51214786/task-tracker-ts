import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPageLoader, mergePages } from "../src/pagination.js";
import { ApiError } from "../src/api.js";
import { task, deferred } from "./helpers.js";
import type { TaskPage } from "../src/api.js";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it("deduplicates overlaps and keeps the later createdAt version", async () => {
  const old = task("a");
  const newer = task("a", { title: "new", createdAt: new Date("2026-02-01") });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ items: [old, task("b")], nextCursor: "2" })
    .mockResolvedValueOnce({ items: [newer, task("c")], nextCursor: null });
  const loader = createPageLoader(fetch);
  await loader.loadMore();
  await loader.loadMore();
  expect(loader.getState()).toEqual({
    status: "success",
    data: [newer, task("b"), task("c")],
  });
  expect(loader.hasMore()).toBe(false);
  await loader.loadMore();
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("keeps old records for earlier and tied duplicate versions", () => {
  const old = task("a", { createdAt: new Date("2026-02-01") });
  expect(mergePages([old], [task("a"), { ...old, title: "tie" }])).toEqual([
    old,
  ]);
});
it("quick repeated loadMore shares a single request and promise", async () => {
  const d = deferred<TaskPage>();
  const fetch = vi.fn(() => d.promise);
  const loader = createPageLoader(fetch);
  const one = loader.loadMore();
  const two = loader.loadMore();
  expect(one).toBe(two);
  expect(loader.isLoading()).toBe(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(1);
  d.resolve({ items: [], nextCursor: null });
  await one;
  expect(loader.getState()).toEqual({ status: "empty" });
  expect(loader.isLoading()).toBe(false);
});
it("keeps earlier pages after exhausted retries and allows retrying the failed cursor", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ items: [task()], nextCursor: "next" })
    .mockRejectedValueOnce(new ApiError("down", "network"))
    .mockRejectedValueOnce(new ApiError("down", "network"))
    .mockRejectedValueOnce(new ApiError("down", "network"))
    .mockResolvedValueOnce({ items: [task("b")], nextCursor: null });
  const loader = createPageLoader(fetch);
  await loader.loadMore();
  const p = loader.loadMore();
  await vi.runAllTimersAsync();
  await p;
  expect(loader.getError()).toBe("down");
  expect(loader.getState()).toEqual({ status: "success", data: [task()] });
  await loader.loadMore();
  expect(loader.getError()).toBe(null);
  expect(loader.getState()).toEqual({
    status: "success",
    data: [task(), task("b")],
  });
});
it("reports initial failure distinctly", async () => {
  const loader = createPageLoader(async () => {
    throw new ApiError("invalid", "validation");
  });
  await loader.loadMore();
  expect(loader.getState()).toEqual({ status: "error", message: "invalid" });
});
it("stops repeated cursors", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ items: [task()], nextCursor: "same" })
    .mockResolvedValueOnce({ items: [], nextCursor: "same" });
  const loader = createPageLoader(fetch);
  await loader.loadMore();
  await loader.loadMore();
  expect(loader.getError()).toBe("Repeated cursor prevented");
  expect(loader.hasMore()).toBe(false);
});
it("caps page count while retaining loaded items", async () => {
  const loader = createPageLoader(
    async () => ({ items: [task()], nextCursor: "more" }),
    { maxPages: 1 },
  );
  const listener = vi.fn();
  const off = loader.subscribe(listener);
  await loader.loadMore();
  expect(loader.getError()).toBe("Maximum page count reached");
  expect(listener).toHaveBeenCalledTimes(2);
  off();
  await loader.loadMore();
  expect(listener).toHaveBeenCalledTimes(2);
});
it("checks the page limit before starting a request", async () => {
  const fetch = vi.fn();
  const loader = createPageLoader(fetch, { maxPages: 0 });
  await loader.loadMore();
  expect(fetch).not.toHaveBeenCalled();
  expect(loader.getError()).toBe("Pagination loop prevented");
});
