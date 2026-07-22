// ai-assistant-api/src/handlers/resume.ts
// Accepts base64 PDF from mobile, extracts text with pdf2json, parses with Bedrock
import { Request, Response } from 'express';
import { invokeLlama, extractJson } from '../lib/bedrock';

export async function parsePdfHandler(req: Request, res: Response) {
  try {
    const { pdfBase64 } = req.body as { pdfBase64: string };

    if (!pdfBase64) {
      return res.status(400).json({ error: 'pdfBase64 is required' });
    }

    const buffer = Buffer.from(pdfBase64, 'base64');
    console.log('[parsePdf] buffer size:', buffer.length);

    const PDFParser = (await import('pdf2json')).default;
    const text = await new Promise<string>((resolve, reject) => {
      const parser = new (PDFParser as any)(null, true);
      parser.on('pdfParser_dataReady', () => {
        const extracted = parser.getRawTextContent();
        console.log('[parsePdf] extracted text length:', extracted.length);
        resolve(extracted);
      });
      parser.on('pdfParser_dataError', (err: any) => reject(new Error(err.parserError)));
      parser.parseBuffer(buffer);
    });

    if (!text || text.trim().length < 50) {
      return res.status(400).json({ error: 'Could not extract text from PDF — is the file a valid resume?' });
    }

    const result = await invokeLlama({
      system: `You are a JSON resume parser for a general-audience career app. Candidates come from ALL industries — healthcare, law, education, sales, skilled trades, creative fields, engineering, finance, and more. Do not assume a technical/software background.
Return ONLY a valid JSON object. No explanation, no markdown, no preamble. Start with { and end with }.`,
      messages: [{
        role: 'user',
        content: `Parse this resume into JSON. Do not include phone number.

Schema:
{
  "name": string,
  "alias": string or null,
  "title": string,
  "industry": string or null (e.g. "Healthcare", "Software Engineering", "Education", "Sales", "Legal", "Skilled Trades"),
  "contact": { "email": string, "linkedin": string or null, "website": string or null, "portfolioUrl": string or null },
  "skills": { [category: string]: string[] },
  "experience": [{ "title": string, "company": string, "period": string, "bullets": string[] }],
  "education": [{ "degree": string, "institution": string, "year": string or null }],
  "additional": string[],
  "credentials": [{ "name": string, "issuer": string or null, "year": string or null }],
  "achievements": string[]
}

Notes on fields:
- "credentials" covers certifications, licenses (e.g. RN, PE, bar admission), and professional registrations
- "achievements" covers quantifiable wins: quota attainment, awards, publications, patents, etc.
- Adapt field content to the candidate's actual field — a nurse's "credentials" differ from an engineer's

Resume text:
${text.slice(0, 4000)}`,
      }],
      maxTokens: 2048,
      temperature: 0.1,
    });

    const resume = extractJson<any>(result);
    console.log('[parsePdf] parsed name:', resume.name, '| industry:', resume.industry);
    return res.json({ resume });

  } catch (err: any) {
    console.error('[parsePdf] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}