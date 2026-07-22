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

    // 1. try the background cache first (fast, free)
    let jobs = jobQuery
      ? (await getAllCachedJobs()).filter(j =>
          j.title.toLowerCase().includes(jobQuery.toLowerCase()) ||
          j.description.toLowerCase().includes(jobQuery.toLowerCase())
        )
      : await getAllCachedJobs();

    // 2. if the cache doesn't have enough relevant results, search Adzuna live —
    // this is what makes the app work for ANY industry/query, not just the
    // handful of tech roles the background scraper pre-caches
    if (jobQuery && jobs.length < MIN_RESULTS_BEFORE_LIVE_FETCH) {
      console.log(`[analyze] cache had ${jobs.length} results for "${jobQuery}" — fetching live from Adzuna`);

      const liveKey = `jobs:live:${jobQuery.replace(/\s+/g, '_').toLowerCase()}`;
      const redis = await getRedisClient();
      const cachedLive = await redis.get(liveKey);

      let liveJobs;
      if (cachedLive) {
        liveJobs = JSON.parse(cachedLive);
      } else {
        liveJobs = await fetchAdzunaJobs(jobQuery, location);
        await redis.setEx(liveKey, LIVE_SEARCH_CACHE_TTL, JSON.stringify(liveJobs));
      }

      // merge — live results plus whatever background cache had, de-duped by id
      const seen = new Set(jobs.map(j => j.id));
      jobs = [...jobs, ...liveJobs.filter((j: any) => !seen.has(j.id))];
    }

    if (!jobs.length) {
      return res.status(503).json({
        error: 'No job postings found for this search. Try a different role or location.',
      });
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