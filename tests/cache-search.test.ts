import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCache } from "../src/cache.js";
import { createSearch } from "../src/search.js";
import { deferred } from "./helpers.js";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it("serves a fresh cache entry without fetching twice", async () => {
  let now = 0;
  const fetch = vi.fn(async () => "value");
  const cache = createCache(fetch, { ttlMs: 100, now: () => now });
  expect(await cache.get("key")).toBe("value");
  now = 99;
  expect(await cache.get("key")).toBe("value");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("shares the exact underlying promise on simultaneous misses", async () => {
  const d = deferred<string>();
  const fetch = vi.fn(() => d.promise);
  const cache = createCache(fetch, { ttlMs: 100 });
  const one = cache.get("same");
  const two = cache.get("same");
  expect(one).toBe(two);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(1);
  d.resolve("one");
  expect(await one).toBe("one");
});
it("serves stale data immediately and refreshes in the background at TTL boundary", async () => {
  let now = 0;
  const d = deferred<string>();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce("old")
    .mockImplementationOnce(() => d.promise);
  const cache = createCache(fetch, { ttlMs: 100, now: () => now });
  await cache.get("k");
  now = 100;
  expect(await cache.get("k")).toBe("old");
  expect(await cache.get("k")).toBe("old");
  expect(fetch).toHaveBeenCalledTimes(2);
  d.resolve("new");
  await cache.refresh("k");
  expect(await cache.get("k")).toBe("new");
});
it("retains stale data on failed refresh and reports the background error", async () => {
  let now = 0;
  const error = new Error("offline");
  const fetch = vi
    .fn()
    .mockResolvedValueOnce("old")
    .mockRejectedValueOnce(error)
    .mockResolvedValueOnce("new");
  const cache = createCache(fetch, { ttlMs: 1, now: () => now });
  await cache.get("k");
  now = 2;
  expect(await cache.get("k")).toBe("old");
  await vi.advanceTimersByTimeAsync(0);
  expect(cache.getError("k")).toBe(error);
  expect(await cache.refresh("k")).toBe("new");
  expect(cache.getError("k")).toBeUndefined();
});
it("a failed cache miss is retryable on the next call", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("miss failed"))
    .mockResolvedValueOnce("ok");
  const cache = createCache(fetch, { ttlMs: 10 });
  await expect(cache.get("k")).rejects.toThrow("miss failed");
  expect(await cache.get("k")).toBe("ok");
});
it("uses Date.now when no clock is supplied", async () => {
  const fetch = vi.fn(async () => "default");
  const cache = createCache(fetch, { ttlMs: 100 });
  await cache.get("k");
  await cache.get("k");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("collapses rapid keystrokes into one request", async () => {
  const fetch = vi.fn(async (query: string) => [query]);
  const search = createSearch(fetch, { debounceMs: 100 });
  search.query("t");
  await vi.advanceTimersByTimeAsync(50);
  search.query("ta");
  await vi.advanceTimersByTimeAsync(50);
  search.query("task");
  await vi.advanceTimersByTimeAsync(99);
  expect(fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]?.[0]).toBe("task");
  expect(search.getState()).toEqual({ status: "success", data: ["task"] });
});
it("aborts an in-flight request and blocks a late stale response", async () => {
  const old = deferred<string>();
  const fresh = deferred<string>();
  const signals: AbortSignal[] = [];
  let count = 0;
  const search = createSearch(
    (_query, signal) => {
      signals.push(signal);
      return ++count === 1 ? old.promise : fresh.promise;
    },
    { debounceMs: 10 },
  );
  search.query("old");
  await vi.advanceTimersByTimeAsync(10);
  search.query("new");
  expect(signals[0]?.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(10);
  fresh.resolve("new");
  await vi.advanceTimersByTimeAsync(0);
  expect(search.getState()).toEqual({ status: "success", data: "new" });
  old.resolve("old");
  await vi.advanceTimersByTimeAsync(0);
  expect(search.getState()).toEqual({ status: "success", data: "new" });
});
it("suppresses errors from superseded queries", async () => {
  const old = deferred<string>();
  const search = createSearch(
    (q: string) => (q === "old" ? old.promise : Promise.resolve("new")),
    { debounceMs: 1 },
  );
  search.query("old");
  await vi.advanceTimersByTimeAsync(1);
  search.query("new");
  old.reject(new Error("late old error"));
  await vi.advanceTimersByTimeAsync(1);
  expect(search.getState()).toEqual({ status: "success", data: "new" });
});
it("shows current errors and empty results", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("broken"))
    .mockResolvedValueOnce([]);
  const search = createSearch<string[]>(fetch, {
    debounceMs: 1,
    isEmpty: (data) => data.length === 0,
  });
  search.query("one");
  await vi.advanceTimersByTimeAsync(1);
  expect(search.getState()).toEqual({ status: "error", message: "broken" });
  search.query("two");
  await vi.advanceTimersByTimeAsync(1);
  expect(search.getState()).toEqual({ status: "empty" });
});
it("cancel clears pending timers and dispose stops listeners and active results", async () => {
  const d = deferred<string>();
  const search = createSearch(() => d.promise, { debounceMs: 10 });
  const listener = vi.fn();
  const off = search.subscribe(listener);
  search.query("pending");
  search.cancel();
  expect(vi.getTimerCount()).toBe(0);
  expect(search.getState()).toEqual({ status: "empty" });
  expect(listener).toHaveBeenCalledTimes(2);
  off();
  search.query("active");
  await vi.advanceTimersByTimeAsync(10);
  search.dispose();
  d.resolve("late");
  await vi.advanceTimersByTimeAsync(0);
  expect(listener).toHaveBeenCalledTimes(2);
  expect(search.getState()).toEqual({ status: "loading" });
});
