// ai-assistant-api/src/handlers/resume.ts
// Accepts base64 PDF from mobile, extracts text with pdf2json, parses with Bedrock
import { Request, Response } from 'express';
import { invokeLlama } from '../lib/bedrock';

export async function parsePdfHandler(req: Request, res: Response) {
  try {
    const { pdfBase64 } = req.body as { pdfBase64: string };

    if (!pdfBase64) {
      return res.status(400).json({ error: 'pdfBase64 is required' });
    }

    // convert base64 to buffer
    const buffer = Buffer.from(pdfBase64, 'base64');
    console.log('[parsePdf] buffer size:', buffer.length);

    // extract text with pdf2json
    const PDFParser = (await import('pdf2json')).default;
    const text = await new Promise<string>((resolve, reject) => {
      const parser = new (PDFParser as any)(null, true);
      parser.on('pdfParser_dataReady', () => {
        const extracted = parser.getRawTextContent();
        console.log('[parsePdf] extracted text length:', extracted.length);
        console.log('[parsePdf] text preview:', extracted.slice(0, 200));
        resolve(extracted);
      });
      parser.on('pdfParser_dataError', (err: any) => {
        reject(new Error(err.parserError));
      });
      parser.parseBuffer(buffer);
    });

    if (!text || text.trim().length < 50) {
      return res.status(400).json({ error: 'Could not extract text from PDF — is the file a valid resume?' });
    }

    // parse extracted text with Bedrock
    const result = await invokeLlama({
      system: `You are a JSON resume parser. Return ONLY a valid JSON object. No explanation, no markdown, no preamble. Start with { and end with }.`,
      messages: [{
        role: 'user',
        content: `Parse this resume text into JSON. Do not include phone number.

Schema:
{
  "name": string,
  "alias": string or null,
  "title": string,
  "contact": { "email": string, "linkedin": string, "website": string or null },
  "skills": { [category: string]: string[] },
  "experience": [{ "title": string, "company": string, "period": string, "bullets": string[] }],
  "additional": string[],
  "certifications": [{ "name": string, "year": string }]
}

Resume text:
${text.slice(0, 4000)}`,
      }],
      maxTokens: 2048,
      temperature: 0.1,
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse resume — please try again');

    const resume = JSON.parse(jsonMatch[0]);
    console.log('[parsePdf] parsed name:', resume.name);
    return res.json({ resume });

  } catch (err: any) {
    console.error('[parsePdf] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}