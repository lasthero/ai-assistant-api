// src/handlers/career.ts
import { Request, Response } from 'express';
import { invokeLlama } from '../lib/bedrock';
import { fetchResumeText } from '../lib/resume';

const RESUME_CONTEXT = `...`; // or fetch live from S3

export async function careerHandler(req: Request, res: Response) {
  try {
    const { messages } = req.body as {
      messages: { role: string; content: string }[];
    };

    const resumeText = await fetchResumeText();

    const result = await invokeLlama({
      system: `You are a career advisor who knows this candidate's background:
${resumeText.slice(0, 2000)}
Help with interview prep, salary negotiation, and career positioning.
Be specific, direct, and practical. Plain text only, no markdown.`,
      messages,
    });

    return res.json({ content: result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}