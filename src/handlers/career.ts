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

    if (!messages?.length) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const resumeText = await getResumeText();

    const result = await invokeLlama({
      system: `You are a career advisor who knows this candidate's background in detail.

Candidate resume:
${resumeText.slice(0, 2000)}

Your role:
- Help with interview prep, salary negotiation, and how to position experience
- Be specific, direct, and practical — reference their actual experience when relevant
- Keep responses concise and conversational
- Plain text only, no markdown headers or bullet symbols
- When suggesting talking points, make them concrete and tailored to this candidate`,
      messages,
      maxTokens: 1024,
      temperature: 0.4,
    });

    return res.json({ content: result });
  } catch (err: any) {
    console.error('Career handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}