import express from 'express';
import { analyzeHandler } from './handlers/analyze';
import { careerHandler } from './handlers/career';
import { codeHandler } from './handlers/code';

const app = express();
app.use(express.json({ limit: '2mb' }));

// health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// assistant modes
app.post('/analyze', analyzeHandler); // /jobs mode
app.post('/career',  careerHandler);  // /career mode
app.post('/code',    codeHandler);    // /code mode

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`ai-assistant server running on port ${PORT}`));