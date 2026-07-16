const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { createClient } = require('redis');

const secrets = new SecretsManagerClient({ region: process.env.AWS_REGION_NAME });

async function getRapidApiKey() {
  const res = await secrets.send(new GetSecretValueCommand({
    SecretId: process.env.RAPIDAPI_SECRET_ARN,
  }));
  return res.SecretString;
}

async function fetchJobs(query, rapidApiKey) {
  const url = `https://jsearch.p.rapidapi.com/search-v2?query=${encodeURIComponent(query)}&num_pages=1&country=us&date_posted=week`;
  const res = await fetch(url, {
    headers: {
      'x-rapidapi-host': 'jsearch.p.rapidapi.com',
      'x-rapidapi-key': rapidApiKey,
    },
  });
  const data = await res.json();
  console.log(`Query ${query} - status: ${data.status}, jobs: ${data.data?.jobs?.length ?? 0}`);
  return data.data.jobs.map(job => ({
    id:          job.job_id,
    title:       job.job_title,
    company:     job.employer_name,
    location:    job.job_city && job.job_state
                   ? `${job.job_city}, ${job.job_state}`
                   : job.job_location ?? job.job_country,
    remote:      job.job_is_remote ?? false,
    description: job.job_description?.slice(0, 2000) ?? '',
    url:         job.job_apply_link ?? '',
    posted:      job.job_posted_at_datetime_utc ?? new Date().toISOString(),
    salary: {
      min:     job.job_min_salary ?? null,
      max:     job.job_max_salary ?? null,
      period:  job.job_salary_period ?? null,
      display: job.job_salary_string ?? null,
    },
  }));
}

exports.handler = async () => {
  const rapidApiKey = await getRapidApiKey();
  console.log('API key length:', rapidApiKey?.length ?? 0);

  const queries = JSON.parse(process.env.JOB_QUERIES);

  const redis = createClient({ socket: { host: process.env.REDIS_HOST, port: 6379 } });
  await redis.connect();

  try {
    for (const query of queries) {
      const jobs = await fetchJobs(query, rapidApiKey);
      const key = `jobs:${query.replace(/\s+/g, '_').toLowerCase()}`;
      await redis.setEx(key, 14400, JSON.stringify(jobs)); // TTL 4 hours
      console.log(`Cached ${jobs.length} jobs for "${query}"`);
    }
    console.log('Job scraper completed');
  } finally {
    await redis.disconnect();
  }
};
