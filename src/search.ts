import type { AsyncState } from "./types.js";
import { errorMessage } from "./fetcher.js";
export function createSearch<T>(
  fetchFn: (query: string, signal: AbortSignal) => Promise<T>,
  options: { debounceMs: number; isEmpty?: (data: T) => boolean },
) {
  let state: AsyncState<T> = { status: "empty" };
  let version = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: AbortController | undefined;
  const listeners = new Set<(state: AsyncState<T>) => void>();
  function publish(next: AsyncState<T>) {
    state = next;
    listeners.forEach((listener) => listener(state));
  }
  function cancelWork() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    active?.abort();
  }
  return {
    getState: () => state,
    subscribe(listener: (state: AsyncState<T>) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    query(query: string) {
      const id = ++version;
      cancelWork();
      publish({ status: "loading" });
      timer = setTimeout(() => {
        timer = undefined;
        const controller = new AbortController();
        active = controller;
        void Promise.resolve()
          .then(() => fetchFn(query, controller.signal))
          .then((data) => {
            if (id === version)
              publish(
                options.isEmpty?.(data)
                  ? { status: "empty" }
                  : { status: "success", data },
              );
          })
          .catch((error: unknown) => {
            if (id === version)
              publish({ status: "error", message: errorMessage(error) });
          });
      }, options.debounceMs);
    },
    cancel() {
      version++;
      cancelWork();
      publish({ status: "empty" });
    },
    dispose() {
      version++;
      cancelWork();
      listeners.clear();
    },
  };
}
