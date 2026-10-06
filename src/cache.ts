export interface CacheOptions {
  readonly ttlMs: number;
  readonly now?: () => number;
}
export function createCache<K, V>(
  fetchFn: (key: K) => Promise<V>,
  options: CacheOptions,
) {
  const now = options.now ?? Date.now;
  const entries = new Map<K, { value: V; expiresAt: number }>();
  const pending = new Map<K, Promise<V>>();
  const errors = new Map<K, unknown>();
  function refresh(key: K): Promise<V> {
    const active = pending.get(key);
    if (active) return active;
    const promise = Promise.resolve()
      .then(() => fetchFn(key))
      .then((value) => {
        entries.set(key, { value, expiresAt: now() + options.ttlMs });
        errors.delete(key);
        return value;
      })
      .catch((error: unknown) => {
        errors.set(key, error);
        throw error;
      })
      .finally(() => {
        pending.delete(key);
      });
    pending.set(key, promise);
    return promise;
  }
  return {
    get(key: K): Promise<V> {
      const entry = entries.get(key);
      if (!entry) return refresh(key);
      if (entry.expiresAt <= now()) void refresh(key).catch(() => {});
      return Promise.resolve(entry.value);
    },
    refresh,
    getError: (key: K) => errors.get(key),
  };
}
