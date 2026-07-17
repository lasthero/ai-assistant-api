import { Request, Response } from 'express';
import { fetchResumeText } from '../lib/resume';
import { getAllCachedJobs } from '../lib/cache';
import { analyzeJobFit } from '../lib/bedrock';

export async function analyzeHandler(req: Request, res: Response) {
  try {

    const { jobQuery, resumeText } = req.body;

    // fetch resume and jobs in parallel
    const resume = resumeText ?? await fetchResumeText();
    const jobs = await getAllCachedJobs();
    

    if (!jobs.length) {
      return res.status(503).json({
        error: 'No job postings available yet — scraper may still be warming up. Try again in a few minutes.',
      });
    }

    // optionally filter by query keyword
    const filtered = jobQuery
      ? jobs.filter(j =>
          j.title.toLowerCase().includes(jobQuery.toLowerCase()) ||
          j.description.toLowerCase().includes(jobQuery.toLowerCase())
        )
      : jobs;

    const analysis = await analyzeJobFit(resumeText, filtered.length ? filtered : jobs);

    return res.json({
      jobsAnalyzed: filtered.length,
      ...analysis,
    });
  } catch (err: any) {
    console.error('Analyze error:', err);
    return res.status(500).json({ error: err.message });
  }
}
