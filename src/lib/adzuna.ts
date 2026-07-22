// ai-assistant-api/src/lib/adzuna.ts
// Shared Adzuna client — used by both the background scraper (Lambda) and
// on-demand live search (ECS server) so general job seekers aren't limited
// to a fixed set of pre-cached tech queries.
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Job } from './cache';

const secrets = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

let cachedCreds: { app_id: string; app_key: string } | null = null;

export async function getAdzunaCredentials() {
  if (cachedCreds) return cachedCreds;
  const res = await secrets.send(new GetSecretValueCommand({
    SecretId: process.env.ADZUNA_SECRET_ARN!,
  }));
  cachedCreds = JSON.parse(res.SecretString!);
  return cachedCreds!;
}

export async function fetchAdzunaJobs(
  query: string,
  location: string = '', // empty = nationwide US
  resultsPerPage: number = 20
): Promise<Job[]> {
  const { app_id, app_key } = await getAdzunaCredentials();

  const params = new URLSearchParams({
    app_id,
    app_key,
    results_per_page: String(resultsPerPage),
    what:             query,
    sort_by:          'relevance',
  });

  if (location) params.set('where', location);
  // no category filter — general job seekers search across all industries

  const url = `https://api.adzuna.com/v1/api/jobs/us/search/1?${params}`;
  const res = await fetch(url);
  const data = await res.json() as {
    results?: any[];
    count?: number;
  };

  if (!data.results || !Array.isArray(data.results)) {
    console.log('[adzuna] unexpected response:', JSON.stringify(data).slice(0, 300));
    return [];
  }

  return data.results.map((job: any) => ({
    id:          job.id,
    title:       job.title,
    company:     job.company?.display_name ?? 'Unknown',
    location:    job.location?.display_name ?? location ?? 'United States',
    remote:      /remote/i.test(job.title) || /remote/i.test(job.location?.display_name ?? ''),
    description: job.description ?? '',
    url:         job.redirect_url ?? '',
    posted:      job.created ?? new Date().toISOString(),
    salary: {
      min:     job.salary_min ?? null,
      max:     job.salary_max ?? null,
      period:  'YEAR',
      display: job.salary_min
        ? `$${Math.round(job.salary_min / 1000)}K - $${Math.round(job.salary_max / 1000)}K`
        : null,
    },
  }));
}