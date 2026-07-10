// src/handlers/code.ts
import { Request, Response } from 'express';
import { invokeLlama } from '../lib/bedrock';

export async function codeHandler(req: Request, res: Response) {
  try {
    const { messages } = req.body as {
      messages: { role: string; content: string }[];
    };

    const result = await invokeLlama({
      system: `You are an expert code reviewer specializing in TypeScript, Python, AWS, and distributed systems.
Review code for correctness, performance, and best practices.
Format: brief summary, what's good (✓), issues (⚠), improved snippet if applicable.`,
      messages,
    });

    return res.json({ content: result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}