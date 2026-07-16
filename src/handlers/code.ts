import { Request, Response } from 'express';
import { invokeLlama } from '../lib/bedrock';

export async function codeHandler(req: Request, res: Response) {
  try {
    const { messages } = req.body as {
      messages: { role: string; content: string }[];
    };

    if (!messages?.length) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const result = await invokeLlama({
      system: `You are an expert code reviewer specializing in TypeScript, Python, AWS, Kubernetes, and distributed systems.

When reviewing code:
1. Brief summary of what the code does
2. What is good — prefix each point with "✓"
3. Issues or suggestions — prefix each point with "⚠"
4. Provide an improved code snippet if there are meaningful changes

When answering general coding questions:
- Be concise and direct
- Show code examples where helpful
- Prefer idiomatic solutions

Plain text and code blocks only. No markdown headers.`,
      messages,
      maxTokens: 1024,
      temperature: 0.2,
    });

    return res.json({ content: result });
  } catch (err: any) {
    console.error('Code handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}