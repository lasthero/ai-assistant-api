import express from 'express';
import { analyzeHandler } from './handlers/analyze';
import { careerHandler } from './handlers/career';
import { codeHandler } from './handlers/code';
import { parsePdfHandler } from './handlers/resume';
import { rateLimiter } from './middleware/rateLimiter';

const app = express();
app.use(express.json({ limit: '20mb' })); // large limit for base64 PDF

app.get('/health', (_, res) => res.json({
  status: 'ok',
  endpoints: ['/analyze', '/career', '/code', '/resume/parse-pdf'],
}));

// app.use(['/analyze', '/career', '/code', '/resume/parse-pdf'], rateLimiter);

app.post('/analyze',          analyzeHandler);
app.post('/career',           careerHandler);
app.post('/code',             codeHandler);
app.post('/resume/parse-pdf', parsePdfHandler); // mobile PDF parsing

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`AI Assistant API running on port ${PORT}`));