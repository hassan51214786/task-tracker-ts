import { it, expect, vi, beforeEach, afterEach, describe } from "vitest";
import { ApiError, delay, createSimulatedApi } from "../src/api.js";
import { withRetry, createFetcher, errorMessage } from "../src/fetcher.js";
import { task, deferred } from "./helpers.js";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("retry and cancellation", () => {
  it("returns successful data", async () => {
    expect(await withRetry(async () => [task()])).toEqual([task()]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("retries network failures using exponential backoff with injected jitter", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("down", "network"))
      .mockRejectedValueOnce(new ApiError("down", "network"))
      .mockResolvedValue("ok");
    const promise = withRetry(fetch, { rng: () => 0, baseDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(49);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(await promise).toBe("ok");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("caps attempts at three and surfaces failure", async () => {
    const fetch = vi.fn().mockRejectedValue(new ApiError("down", "network"));
    const result = withRetry(fetch, { maxAttempts: 20 }).catch(errorMessage);
    await vi.runAllTimersAsync();
    expect(await result).toBe("down");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("does not retry validation or unknown errors", async () => {
    const fetch = vi.fn().mockRejectedValue(new ApiError("bad", "validation"));
    expect(await withRetry(fetch).catch(errorMessage)).toBe("bad");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      await withRetry(async () => {
        throw new Error("bug");
      }).catch(errorMessage),
    ).toBe("bug");
  });
  it("aborts while waiting in backoff and removes every timer", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockRejectedValue(new ApiError("down", "network"));
    const result = withRetry(fetch, {
      signal: controller.signal,
      baseDelayMs: 1000,
    }).catch(errorMessage);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    expect(await result).toBe("Request cancelled");
    expect(vi.getTimerCount()).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("times out each attempt even if the network ignores abort", async () => {
    const fetch = vi.fn(() => new Promise<string>(() => {}));
    const result = withRetry(fetch, {
      timeoutMs: 20,
      baseDelayMs: 10,
      rng: () => 0.5,
    }).catch(errorMessage);
    await vi.runAllTimersAsync();
    expect(await result).toBe("Request timed out");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("times out and retries cooperative network calls", async () => {
    const fetch = vi.fn(async (signal: AbortSignal) => {
      await delay(1000, signal);
      return "late";
    });
    const result = withRetry(fetch, { timeoutMs: 20, baseDelayMs: 10 }).catch(
      errorMessage,
    );
    await vi.runAllTimersAsync();
    expect(await result).toBe("Request timed out");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("aborts an active request", async () => {
    const controller = new AbortController();
    const result = withRetry(
      async (signal) => {
        await delay(1000, signal);
        return "late";
      },
      { signal: controller.signal },
    ).catch(errorMessage);
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    expect(await result).toBe("Request cancelled");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("never invokes the fetch function after pre-abort", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn(async () => "oops");
    expect(
      await withRetry(fetch, { signal: controller.signal }).catch(errorMessage),
    ).toBe("Request cancelled");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("supports direct cancellable delay and pre-abort", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await delay(10, controller.signal).catch(errorMessage)).toBe(
      "Request cancelled",
    );
    expect(errorMessage("plain")).toBe("plain");
  });
});
describe("fetcher and simulation", () => {
  it("shows loading followed by success", async () => {
    const fetcher = createFetcher(
      async () => [task()],
      (x) => x.length === 0,
    );
    const listener = vi.fn();
    const off = fetcher.subscribe(listener);
    const promise = fetcher.fetch();
    expect(fetcher.getState()).toEqual({ status: "loading" });
    await promise;
    expect(fetcher.getState()).toEqual({ status: "success", data: [task()] });
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    fetcher.cancel();
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it("renders empty results", async () => {
    const f = createFetcher(
      async () => [],
      (x) => x.length === 0,
    );
    await f.fetch();
    expect(f.getState()).toEqual({ status: "empty" });
  });
  it("renders an error after retries exhaust", async () => {
    const fetch = vi.fn().mockRejectedValue(new ApiError("offline", "network"));
    const f = createFetcher(fetch, () => false);
    const p = f.fetch();
    await vi.runAllTimersAsync();
    await p;
    expect(f.getState()).toEqual({ status: "error", message: "offline" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("ignores an old response resolving AFTER the newer response with fake timers", async () => {
    let calls = 0;
    const resolved: string[] = [];
    const f = createFetcher(
      () => {
        const call = ++calls;
        return new Promise<string>((resolve) => {
          setTimeout(
            () => {
              const value = call === 1 ? "old" : "new";
              resolved.push(value);
              resolve(value);
            },
            call === 1 ? 100 : 10,
          );
        });
      },
      () => false,
    );
    const first = f.fetch();
    await vi.advanceTimersByTimeAsync(0);
    const second = f.fetch();
    await vi.advanceTimersByTimeAsync(10);
    await second;
    expect(f.getState()).toEqual({ status: "success", data: "new" });
    await vi.advanceTimersByTimeAsync(90);
    await first;
    expect(resolved).toEqual(["new", "old"]);
    expect(f.getState()).toEqual({ status: "success", data: "new" });
  });
  it("cancel prevents stale success and clears loading", async () => {
    const d = deferred<string>();
    const f = createFetcher(
      () => d.promise,
      () => false,
    );
    const p = f.fetch();
    await vi.advanceTimersByTimeAsync(0);
    f.cancel();
    d.resolve("late");
    await p;
    expect(f.getState()).toEqual({ status: "empty" });
  });
  it("simulates success empty failure and bad input", async () => {
    const api = createSimulatedApi({
      data: [task()],
      rng: () => 0.5,
      minDelayMs: 10,
      maxDelayMs: 10,
    });
    const good = api.fetchTasks();
    await vi.runAllTimersAsync();
    expect(await good).toEqual([task()]);
    const empty = createSimulatedApi().fetchTasks();
    await vi.runAllTimersAsync();
    expect(await empty).toEqual([]);
    const bad = createSimulatedApi({ data: [{}] })
      .fetchTasks()
      .catch(errorMessage);
    await vi.runAllTimersAsync();
    expect(await bad).toContain("id must");
    const failed = createSimulatedApi({ failureRate: 1 })
      .fetchTasks()
      .catch(errorMessage);
    await vi.runAllTimersAsync();
    expect(await failed).toBe("Simulated network failure");
  });
  it("simulates overlapping pages and validates cursors", async () => {
    const api = createSimulatedApi({
      data: [task("a"), task("b"), task("c"), task("d")],
      pageSize: 3,
      overlap: 1,
    });
    const p1 = api.fetchTasksPage(null);
    await vi.runAllTimersAsync();
    expect((await p1).nextCursor).toBe("2");
    const p2 = api.fetchTasksPage("2");
    await vi.runAllTimersAsync();
    expect((await p2).items.map((t) => t.id)).toEqual(["c", "d"]);
    expect((await p2).nextCursor).toBe(null);
    expect(await api.fetchTasksPage("oops").catch(errorMessage)).toBe(
      "Invalid cursor",
    );
    expect(
      await api.fetchTasksPage("999999999999999999999999").catch(errorMessage),
    ).toBe("Invalid cursor");
  });
  it("simulated mutations add update and delete", async () => {
    const api = createSimulatedApi();
    const a = task();
    const add = api.addTask(a);
    await vi.runAllTimersAsync();
    expect(await add).toEqual(a);
    const update = api.updateTask({ ...a, title: "New" });
    await vi.runAllTimersAsync();
    expect((await update).title).toBe("New");
    const duplicate = api.addTask(a).catch(errorMessage);
    await vi.runAllTimersAsync();
    expect(await duplicate).toBe("Duplicate task id");
    const missing = api.updateTask(task("missing")).catch(errorMessage);
    await vi.runAllTimersAsync();
    expect(await missing).toBe("Task not found");
    const remove = api.deleteTask(a.id);
    await vi.runAllTimersAsync();
    await remove;
    const read = api.fetchTasks();
    await vi.runAllTimersAsync();
    expect(await read).toEqual([]);
  });
  it("simulated API rejects malformed typed mutation inputs at runtime", async () => {
    const api = createSimulatedApi({ data: [task()] });
    const add = api.addTask({ ...task("b"), title: "" }).catch(errorMessage);
    await vi.runAllTimersAsync();
    expect(await add).toBe("Invalid task");
    const update = api.updateTask({ ...task(), title: "" }).catch(errorMessage);
    await vi.runAllTimersAsync();
    expect(await update).toBe("Invalid task");
  });
});
it("simulated concurrent writes on different ids do not lose data", async () => {
  const api = createSimulatedApi({
    data: [task("a"), task("b")],
    rng: () => 0.5,
    minDelayMs: 1,
    maxDelayMs: 1,
  });
  const first = api.updateTask({ ...task("a"), title: "A saved" });
  const second = api.updateTask({ ...task("b"), title: "B saved" });
  await vi.runAllTimersAsync();
  await Promise.all([first, second]);
  const read = api.fetchTasks();
  await vi.runAllTimersAsync();
  expect((await read).map((t) => t.title)).toEqual(["A saved", "B saved"]);
});
