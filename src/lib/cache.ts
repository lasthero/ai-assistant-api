import { createClient } from 'redis';

let client: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
  if (!client) {
    client = createClient({
      socket: {
        host: process.env.REDIS_HOST!,
        port: 6379,
      },
    });
    client.on('error', (err) => console.error('Redis error:', err));
    await client.connect();
  }
  return client;
}

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
  const redis = await getRedisClient();
  const key = `jobs:${query.replace(/\s+/g, '_').toLowerCase()}`;
  const cached = await redis.get(key);
  return cached ? JSON.parse(cached) : [];
}

export async function getAllCachedJobs(): Promise<Job[]> {
  const redis = await getRedisClient();
  const keys = await redis.keys('jobs:*');
  if (!keys.length) return [];

  const results = await Promise.all(keys.map(k => redis.get(k)));
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
  const redis = await getRedisClient();
  const normalized = query.trim().toLowerCase();
  if (!normalized) return;
  // ZINCRBY — sorted set, score = number of times this query has been searched
  await redis.zIncrBy(POPULARITY_KEY, 1, normalized);
}

export async function getTopQueries(limit: number = 20): Promise<string[]> {
  const redis = await getRedisClient();
  // highest score first
  return redis.zRange(POPULARITY_KEY, 0, limit - 1, { REV: true });
}