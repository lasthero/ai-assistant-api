import express from 'express';
import { analyzeHandler } from './handlers/analyze';
import { careerHandler } from './handlers/career';
import { codeHandler } from './handlers/code';


const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_, res) => res.json({ status: 'ok' }));
app.post('/analyze', analyzeHandler);
app.post('/career', careerHandler);
app.post('/code', codeHandler);
const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`MCP server running on port ${PORT}`));
