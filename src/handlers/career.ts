import { Request, Response } from 'express';
import { invokeLlama } from '../lib/bedrock';
import { fetchResumeText } from '../lib/resume';

let cachedResumeText: string | null = null;

async function getResumeText(): Promise<string> {
  if (!cachedResumeText) {
    cachedResumeText = await fetchResumeText();
  }
  return cachedResumeText;
}

export async function careerHandler(req: Request, res: Response) {
  try {
    const { messages } = req.body as {
      messages: { role: string; content: string }[];
    };

    const lastMessage = messages[messages.length - 1]?.content ?? '';
    const isParsingRequest = lastMessage.includes('Parse this resume text into JSON');

    const result = await invokeLlama({
      system: isParsingRequest
        ? `You are a resume parser. Return ONLY valid JSON matching the schema provided. No explanation, no markdown, no preamble.`
        : `You are a career advisor who knows this candidate's background.
${await getResumeText().then(t => t.slice(0, 2000)).catch(() => '')}
Be specific, direct, and practical. Plain text only.`,
      messages,
      maxTokens: isParsingRequest ? 2048 : 1024,
      temperature: isParsingRequest ? 0.1 : 0.4,
    });

    return res.json({ content: result });
  } catch (err: any) {
    console.error('Career handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}