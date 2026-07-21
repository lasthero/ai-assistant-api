// ai-assistant-api/src/handlers/me.ts
// Personal endpoint for chihho-dev.info only — the only place in this API
// that fetches Chih-Ho's own resume from S3. Kept fully separate from the
// general-purpose /career endpoint used by CareerForge (mobile) and other
// callers, so the general API never carries any of this personal data or logic.
import { Request, Response } from 'express';
import { invokeLlama } from '../lib/bedrock';
import { fetchResumeText } from '../lib/resume';

let cachedResumeText: string | null = null;

async function getMyResumeText(): Promise<string> {
  if (!cachedResumeText) {
    cachedResumeText = await fetchResumeText();
  }
  return cachedResumeText;
}

export async function myCareerHandler(req: Request, res: Response) {
  try {
    const { messages } = req.body as {
      messages: { role: string; content: string }[];
    };

    if (!messages?.length) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const resumeText = await getMyResumeText();

    const result = await invokeLlama({
      system: `You are a career advisor who knows this candidate's background in detail.

Candidate resume:
${resumeText.slice(0, 2500)}

Your role:
- Help with interview prep, salary negotiation, and how to position experience
- Be specific, direct, and practical — reference their actual experience when relevant
- Keep responses concise and conversational
- Plain text only, no markdown headers or bullet symbols`,
      messages,
      maxTokens: 1024,
      temperature: 0.4,
    });

    return res.json({ content: result });
  } catch (err: any) {
    console.error('My career handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}