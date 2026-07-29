// ai-assistant-api/src/handlers/analyze.ts
import { Request, Response } from 'express';
import { fetchResumeText } from '../lib/resume';
import { getAllCachedJobs, getRedisClient, recordQueryPopularity } from '../lib/cache';
import { fetchAdzunaJobs } from '../lib/adzuna';
import { analyzeJobFit } from '../lib/bedrock';

const MIN_RESULTS_BEFORE_LIVE_FETCH = 5;
const LIVE_SEARCH_CACHE_TTL = 3600; // 1 hour — short TTL for on-demand searches

export async function analyzeHandler(req: Request, res: Response) {
  try {
    const { jobQuery, resumeText, location } = req.body as {
      jobQuery?:   string;  // keyword / role search — works for any industry
      resumeText?: string;  // mobile users pass their own resume text
      location?:   string;  // optional city/state for the search
    };

    // use provided resumeText (mobile) or fetch from S3 (website)
    const resume = resumeText ?? await fetchResumeText();

    // track what users actually search for — this drives the background
    // scraper's warm-cache list instead of a hardcoded set of queries,
    // so the app scales to any industry without a code change
    if (jobQuery) {
      await recordQueryPopularity(jobQuery).catch(err =>
        console.error('[analyze] failed to record query popularity:', err)
      );
    }

    let jobs: Awaited<ReturnType<typeof getAllCachedJobs>> = [];

    if (jobQuery && location) {
      // A location was explicitly requested — the background cache has no
      // concept of location, so it can't be trusted here even if it has
      // plenty of keyword matches. Always go live in this case, and key the
      // cache by query+location together so different locations for the same
      // keyword never collide and serve each other's stale results.
      console.log(`[analyze] location provided ("${location}") — always fetching live for "${jobQuery}"`);

      // NOTE: this key must never start with "jobs:" — getAllCachedJobs()
      // globs "jobs:*" for the no-location nationwide pool, and a location-
      // scoped cache entry leaking in there would bias "no location"
      // searches toward whatever location was last searched by anyone.
      const liveKey = `search:${jobQuery.replace(/\s+/g, '_').toLowerCase()}:${location.replace(/\s+/g, '_').toLowerCase()}`;
      const redis = await getRedisClient();
      const cachedLive = await redis.get(liveKey);

      if (cachedLive) {
        jobs = JSON.parse(cachedLive);
      } else {
        jobs = await fetchAdzunaJobs(jobQuery, location);
        await redis.setEx(liveKey, LIVE_SEARCH_CACHE_TTL, JSON.stringify(jobs));
      }

    } else {
      // no location specified — original behavior: try the background
      // cache first (fast, free), fall back to a live nationwide search
      // only if the cache is too thin for this keyword
      jobs = jobQuery
        ? (await getAllCachedJobs()).filter(j =>
            j.title.toLowerCase().includes(jobQuery.toLowerCase()) ||
            j.description.toLowerCase().includes(jobQuery.toLowerCase())
          )
        : await getAllCachedJobs();

      if (jobQuery && jobs.length < MIN_RESULTS_BEFORE_LIVE_FETCH) {
        console.log(`[analyze] cache had ${jobs.length} results for "${jobQuery}" — fetching live from Adzuna`);

        // same reasoning as the location-scoped key above — must stay out
        // of the "jobs:*" namespace that getAllCachedJobs() scans.
        const liveKey = `search:${jobQuery.replace(/\s+/g, '_').toLowerCase()}`;
        const redis = await getRedisClient();
        const cachedLive = await redis.get(liveKey);

        let liveJobs;
        if (cachedLive) {
          liveJobs = JSON.parse(cachedLive);
        } else {
          liveJobs = await fetchAdzunaJobs(jobQuery);
          await redis.setEx(liveKey, LIVE_SEARCH_CACHE_TTL, JSON.stringify(liveJobs));
        }

        const seen = new Set(jobs.map(j => j.id));
        jobs = [...jobs, ...liveJobs.filter((j: any) => !seen.has(j.id))];
      }
    }

    if (!jobs.length) {
      const message = location
        ? `No job postings found within 20 miles of "${location}" for this search. Try a different role, a nearby city, or leave location blank to search nationwide.`
        : 'No job postings found for this search. Try a different role or keyword.';

      return res.status(503).json({ error: message });
    }

    const analysis = await analyzeJobFit(resume, jobs);

    return res.json({
      jobsAnalyzed: jobs.length,
      ...analysis,
    });

  } catch (err: any) {
    console.error('Analyze error:', err);
    return res.status(500).json({ error: err.message });
  }
}