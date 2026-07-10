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
