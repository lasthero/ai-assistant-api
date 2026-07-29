import express from 'express';
import cron from 'node-cron';
import { analyzeHandler } from './handlers/analyze';
import { careerHandler } from './handlers/career';
import { codeHandler } from './handlers/code';
import { myCareerHandler } from './handlers/me';
import { parsePdfHandler } from './handlers/resume';
import { rateLimiter } from './middleware/rateLimiter';
import { runJobScraper } from './jobs/scraper';

const app = express();
app.use(express.json({ limit: '20mb' })); // large limit for base64 PDF

app.get('/health', (_, res) => res.json({
  status: 'ok',
  endpoints: ['/analyze', '/career', '/code', '/resume/parse-pdf', '/me/career'],
}));

// TODO: uncomment this before release
app.use(['/analyze', '/career', '/code', '/resume/parse-pdf', '/me/career'], rateLimiter);

// ── General-purpose endpoints (CareerForge mobile, any future client) ───────
// These carry no personal data — callers always provide their own resumeText.
app.post('/analyze',          analyzeHandler);
app.post('/career',           careerHandler);
app.post('/resume/parse-pdf', parsePdfHandler);

// ── chihho-dev.info only ─────────────────────────────────────────────────────
// These are personal to Chih-Ho's website and fetch his resume from S3.
app.post('/code',       codeHandler);
app.post('/me/career',  myCareerHandler);

// warm the job cache every 4 hours — replaces the old NAT-Gateway-dependent
// Lambda scraper now that this runs inside the ECS server itself.
cron.schedule('0 */4 * * *', () => {
  runJobScraper().catch(err => console.error('[scraper] unhandled error:', err));
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`AI Assistant API running on port ${PORT}`));