// ai-assistant-api/src/handlers/career.ts
// General-purpose career advice / interview prep / resume parsing.
// This endpoint is fully generic — it has no knowledge of any specific
// person's resume. Callers must always provide their own resumeText.
import { Request, Response } from 'express';
import { invokeLlama } from '../lib/bedrock';

export async function careerHandler(req: Request, res: Response) {
  try {
    const { messages, resumeText, isParsingRequest } = req.body as {
      messages:          { role: string; content: string }[];
      resumeText?:       string;
      isParsingRequest?: boolean;
    };

    if (!messages?.length) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // ── JSON resume parsing (strict schema, no candidate context needed) ────
    const lastMessage = messages[messages.length - 1]?.content ?? '';
    const isParsing = isParsingRequest || lastMessage.includes('Parse this resume');

    if (isParsing) {
      const result = await invokeLlama({
        system: `You are a JSON resume parser for a general-audience career app used by job seekers across ALL industries — healthcare, law, education, sales, engineering, skilled trades, creative fields, and more.
Return ONLY a valid JSON object matching the schema exactly. No explanation. No markdown. No preamble.
Adapt field content to the candidate's actual field — do not assume a technical/software background.`,
        messages,
        maxTokens: 2048,
        temperature: 0.1,
      });
      return res.json({ content: result });
    }

    // ── Career advice / interview prep — requires caller's own resume ───────
    if (!resumeText) {
      return res.status(400).json({
        error: 'resumeText is required for career advice. This endpoint does not have access to any pre-stored resume.',
      });
    }

    const result = await invokeLlama({
      system: `You are a career advisor helping a job seeker who may work in any industry — healthcare, law, education, sales, skilled trades, creative fields, engineering, or elsewhere.

Candidate background:
${resumeText.slice(0, 2500)}

Your role:
- Help with interview prep, salary negotiation, and how to position experience
- Be specific, direct, and practical — reference their actual experience when relevant
- Do not assume a technical/software background unless their resume indicates one
- Keep responses concise and conversational
- Plain text only, no markdown headers or bullet symbols
- When suggesting talking points, make them concrete and tailored to this candidate's actual field`,
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