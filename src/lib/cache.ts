// In-process cache + rate-limit store — replaces the ElastiCache Redis
// instance that used to back this. The ECS service runs a single task
// (desired_count = 1, no horizontal scaling), so nothing here needs to be
// shared across instances; state just resets on deploy/restart, which is
// fine for a self-rewarming job cache and daily rate-limit counters.

type Entry = { value: string; expiresAt: number | null };

const kv = new Map<string, Entry>();
const zsets = new Map<string, Map<string, number>>();

function isLive(e: Entry | undefined): e is Entry {
  return !!e && (e.expiresAt === null || e.expiresAt > Date.now());
}

export const store = {
  async get(key: string): Promise<string | null> {
    const e = kv.get(key);
    return isLive(e) ? e.value : null;
  },

  async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    kv.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  },

  async keys(prefixPattern: string): Promise<string[]> {
    const prefix = prefixPattern.replace(/\*$/, '');
    return [...kv.keys()].filter(k => k.startsWith(prefix) && isLive(kv.get(k)));
  },

  async incr(key: string): Promise<number> {
    const e = kv.get(key);
    const next = (isLive(e) ? Number(e.value) : 0) + 1;
    kv.set(key, { value: String(next), expiresAt: isLive(e) ? e.expiresAt : null });
    return next;
  },

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const e = kv.get(key);
    if (e) e.expiresAt = Date.now() + ttlSeconds * 1000;
  },

  async zIncrBy(key: string, increment: number, member: string): Promise<void> {
    const z = zsets.get(key) ?? new Map<string, number>();
    z.set(member, (z.get(member) ?? 0) + increment);
    zsets.set(key, z);
  },

  async zRange(key: string, start: number, stop: number, opts?: { REV?: boolean }): Promise<string[]> {
    const z = zsets.get(key);
    if (!z) return [];
    const sorted = [...z.entries()].sort((a, b) => opts?.REV ? b[1] - a[1] : a[1] - b[1]);
    const end = stop === -1 ? sorted.length : stop + 1;
    return sorted.slice(start, end).map(([member]) => member);
  },
};

export type Job = {
  id:          string;
  title:       string;
  company:     string;
  location:    string;
  remote:      boolean;
  description: string;
  url:         string;
  posted:      string;
  salary: {
    min:    number | null;
    max:    number | null;
    period: string | null;
  };
};

export async function getJobsFromCache(query: string): Promise<Job[]> {
  const key = `jobs:${query.replace(/\s+/g, '_').toLowerCase()}`;
  const cached = await store.get(key);
  return cached ? JSON.parse(cached) : [];
}

export async function getAllCachedJobs(): Promise<Job[]> {
  const keys = await store.keys('jobs:*');
  if (!keys.length) return [];

  const results = await Promise.all(keys.map(k => store.get(k)));
  return results
    .filter(Boolean)
    .flatMap(r => JSON.parse(r!) as Job[]);
}

// ── Query popularity tracking ──────────────────────────────────────────────
// Instead of a hardcoded list of "important" job queries, we track what
// real users actually search for and let the background scraper warm-cache
// whatever is actually popular. This scales to any industry automatically —
// no code change needed when users start searching for new fields.
const POPULARITY_KEY = 'query_popularity';

export async function recordQueryPopularity(query: string): Promise<void> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return;
  await store.zIncrBy(POPULARITY_KEY, 1, normalized);
}

export async function getTopQueries(limit: number = 20): Promise<string[]> {
  return store.zRange(POPULARITY_KEY, 0, limit - 1, { REV: true });
}
