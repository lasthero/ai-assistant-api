// Job-cache warmer — runs on a schedule inside the ECS server (see server.ts).
// Previously a separate Lambda; moved here so the app no longer needs a
// NAT Gateway just to give a VPC-bound Lambda internet access to Adzuna.
import { fetchAdzunaJobs } from '../lib/adzuna';
import { getRedisClient, getTopQueries } from '../lib/cache';

// only used when query_popularity has no data yet (e.g. right after a fresh deploy)
const SEED_QUERIES = [
  'software engineer',
  'product manager',
  'data analyst',
  'registered nurse',
  'accountant',
  'sales representative',
  'marketing manager',
  'project manager',
  'customer service representative',
  'administrative assistant',
];

const CACHE_TTL_SECONDS = 60 * 60 * 4; // 4hr — matches the scrape interval

export async function runJobScraper(): Promise<void> {
  console.log('[scraper] job scraper started');

  const topQueries = await getTopQueries(20);
  const queries = topQueries.length ? topQueries : SEED_QUERIES;
  console.log(`[scraper] warming cache for ${queries.length} queries ` +
    (topQueries.length ? '(from query_popularity)' : '(seed list — no usage data yet)'));

  const redis = await getRedisClient();

  for (const query of queries) {
    try {
      const jobs = await fetchAdzunaJobs(query);
      const key = `jobs:${query.replace(/\s+/g, '_').toLowerCase()}`;
      await redis.setEx(key, CACHE_TTL_SECONDS, JSON.stringify(jobs));
      console.log(`[scraper] cached ${jobs.length} jobs for "${query}"`);
    } catch (err) {
      console.error(`[scraper] failed to fetch/cache "${query}":`, err);
    }
  }

  console.log('[scraper] job scraper completed');
}
