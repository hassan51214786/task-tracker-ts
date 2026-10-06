import { ApiError, abortError, delay } from "./api.js";
import type { AsyncState } from "./types.js";
export interface RetryOptions {
  readonly signal?: AbortSignal;
  readonly rng?: () => number;
  readonly timeoutMs?: number;
  readonly baseDelayMs?: number;
  readonly maxAttempts?: number;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
async function attempt<T>(
  fetchFn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  outer?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const stopped = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      controller.abort();
      reject(abortError());
    };
    if (outer?.aborted) {
      onAbort();
      return;
    }
    outer?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      reject(new ApiError("Request timed out", "timeout"));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      stopped,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw abortError();
        return fetchFn(controller.signal);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    outer?.removeEventListener("abort", onAbort);
    controller.abort();
  }
}
export async function withRetry<T>(
  fetchFn: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const count = Math.max(1, Math.min(3, options.maxAttempts ?? 3));
  const rng = options.rng ?? Math.random;
  for (let i = 0; i < count; i++) {
    try {
      return await attempt(fetchFn, options.timeoutMs ?? 2000, options.signal);
    } catch (error) {
      if (options.signal?.aborted) throw abortError();
      const retryable =
        error instanceof ApiError &&
        (error.kind === "network" || error.kind === "timeout");
      if (!retryable || i === count - 1) throw error;
      await delay(
        (options.baseDelayMs ?? 100) * 2 ** i * (0.5 + rng()),
        options.signal,
      );
    }
  }
  throw new ApiError("Retry attempts exhausted", "network");
}
export function createFetcher<T>(
  fetchFn: (signal: AbortSignal) => Promise<T>,
  isEmpty: (data: T) => boolean,
  options: Omit<RetryOptions, "signal"> = {},
) {
  let sequence = 0;
  let active: AbortController | undefined;
  let state: AsyncState<T> = { status: "empty" };
  const listeners = new Set<(state: AsyncState<T>) => void>();
  function publish(next: AsyncState<T>) {
    state = next;
    listeners.forEach((listener) => listener(state));
  }
  return {
    getState: () => state,
    subscribe(listener: (state: AsyncState<T>) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    cancel() {
      sequence++;
      active?.abort();
      publish({ status: "empty" });
    },
    async fetch() {
      const id = ++sequence;
      active?.abort();
      const controller = new AbortController();
      active = controller;
      publish({ status: "loading" });
      try {
        const data = await withRetry(fetchFn, {
          ...options,
          signal: controller.signal,
        });
        if (id === sequence)
          publish(
            isEmpty(data) ? { status: "empty" } : { status: "success", data },
          );
      } catch (error) {
        if (id === sequence)
          publish({ status: "error", message: errorMessage(error) });
      }
    },
  };
}
