const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { createClient } = require('redis');

const secrets = new SecretsManagerClient({ region: process.env.AWS_REGION_NAME });

async function getAdzunaCredentials() {
  const res = await secrets.send(new GetSecretValueCommand({
    SecretId: process.env.ADZUNA_SECRET_ARN,
  }));
  return JSON.parse(res.SecretString); // { app_id, app_key }
}

async function fetchJobs(query, appId, appKey) {
  const params = new URLSearchParams({
    app_id:           appId,
    app_key:          appKey,
    results_per_page: '20',
    what:             query,
    sort_by:          'date',
    // no category filter — this app serves job seekers across all industries,
    // not just tech. Category was previously hardcoded to 'it-jobs'.
  });

  const url = `https://api.adzuna.com/v1/api/jobs/us/search/1?${params}`;
  const res = await fetch(url);
  const data = await res.json();

  console.log(`Query "${query}" - count: ${data.count ?? 0}, results: ${data.results?.length ?? 0}`);

  if (!data.results || !Array.isArray(data.results)) {
    console.log('Unexpected response:', JSON.stringify(data).slice(0, 300));
    return [];
  }

  return data.results.map(job => ({
    id:          job.id,
    title:       job.title,
    company:     job.company?.display_name ?? 'Unknown',
    location:    job.location?.display_name ?? 'United States',
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

exports.handler = async () => {
  console.log('Job scraper started');

  const { app_id, app_key } = await getAdzunaCredentials();
  console.log('Adzuna credentials fetched');

  // broad set of popular queries across industries — this is just a "warm cache"
  // for common searches. Anything not covered here is fetched live on-demand
  // by the /analyze endpoint, so the app isn't limited to this list.
  const queries = JSON.parse(process.env.JOB_QUERIES);
  console.log('Queries:', queries);

  const redis = createClient({
    socket: { host: process.env.REDIS_HOST, port: 6379 },
  });
  await redis.connect();
  console.log('Redis connected');

  try {
    for (const query of queries) {
      const jobs = await fetchJobs(query, app_id, app_key);
      const key = `jobs:${query.replace(/\s+/g, '_').toLowerCase()}`;
      await redis.setEx(key, 14400, JSON.stringify(jobs)); // 4hr TTL
      console.log(`Cached ${jobs.length} jobs for "${query}"`);
    }
    console.log('Job scraper completed successfully');
  } finally {
    await redis.disconnect();
    console.log('Redis disconnected');
  }
};