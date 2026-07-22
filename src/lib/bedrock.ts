import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Job } from './cache';

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const MODEL_ID = 'us.meta.llama3-1-8b-instruct-v1:0';

// ── Robust JSON extraction ────────────────────────────────────────────────────
// Llama output can include stray text/markdown around the JSON, or truncate
// mid-structure if maxTokens is too low. A naive greedy regex (first { to last })
// can grab the wrong span. This walks brace-by-brace to find the true matching
// close for the first {, then validates it actually parses.
export function extractJson<T>(raw: string): T {
  const text = raw.trim().replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');

  const braceStart   = text.indexOf('{');
  const bracketStart = text.indexOf('[');

  // If a top-level array appears before (or instead of) any object, the model
  // wrapped its output wrong (or got truncated into just one array item).
  // Our schemas are always top-level objects, so this is always an error case —
  // silently grabbing the first { inside the array would return a single
  // fragment (e.g. one experience entry) instead of the full expected shape.
  if (bracketStart !== -1 && (braceStart === -1 || bracketStart < braceStart)) {
    console.error('[extractJson] response is array-wrapped, expected an object:', text.slice(0, 300));
    throw new Error('AI response had the wrong shape — please try again');
  }

  if (braceStart === -1) {
    throw new Error('Response did not contain any JSON');
  }

  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    if (depth === 0) { end = i; break; }
  }

  if (end === -1) {
    console.error('[extractJson] unbalanced braces — likely truncated:', text.slice(0, 500));
    throw new Error('Response was cut off before finishing — try again');
  }

  const candidate = text.slice(braceStart, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    console.error('[extractJson] JSON.parse failed on:', candidate.slice(0, 500));
    throw new Error('Could not parse the AI response');
  }

  if (Array.isArray(parsed) || typeof parsed !== 'object' || parsed === null) {
    console.error('[extractJson] parsed result is not an object:', candidate.slice(0, 300));
    throw new Error('AI response had the wrong shape — please try again');
  }

  return parsed as T;
}

// ── Generic Llama invocation ─────────────────────────────────────────────────
export async function invokeLlama({
  system,
  messages,
  maxTokens = 1024,
  temperature = 0.3,
}: {
  system: string;
  messages: { role: string; content: string }[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const conversation = messages
    .map(m => `<|start_header_id|>${m.role}<|end_header_id|>\n${m.content}<|eot_id|>`)
    .join('\n');

  const prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
${system}<|eot_id|>
${conversation}
<|start_header_id|>assistant<|end_header_id|>`;

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      prompt,
      max_gen_len: maxTokens,
      temperature,
      top_p: 0.9,
    }),
  }));

  const raw = JSON.parse(new TextDecoder().decode(response.body));
  return (raw.generation as string).trim();
}

// ── Job analysis ─────────────────────────────────────────────────────────────
export type JobMatch = {
  jobId:          string;
  jobTitle:       string;
  company:        string;
  matchScore:     number;
  matchSummary:   string;
  strengths:      string[];
  gaps:           string[];
  recommendation: 'strong yes' | 'yes' | 'maybe' | 'no';
  applyUrl:       string;
  description?:   string;
  location?:      string;
  remote?:        boolean;
  salary?:        { min: number | null; max: number | null; period: string | null; display?: string | null } | null;
};

export type AnalysisResult = {
  overallSummary: string;
  topMatches:     JobMatch[];
  skillGaps:      string[];
};

export async function analyzeJobFit(
  resumeText: string,
  jobs: Job[]
): Promise<AnalysisResult> {
  const topJobs = jobs.slice(0, 10);

  const system = `You are an expert career coach and recruiter who evaluates candidate fit across ALL industries — healthcare, law, education, sales, skilled trades, creative fields, engineering, finance, and more.
Analyze the candidate's background against job postings and return structured JSON only.
Return ONLY valid JSON with no explanation or markdown.`;

  const userMessage = `Resume:
${resumeText.slice(0, 3000)}

Job Postings:
${topJobs.map((j, i) => `
[${i + 1}] ID: ${j.id}
Title: ${j.title} at ${j.company}
Location: ${j.location} ${j.remote ? '(Remote)' : ''}
Description: ${j.description.slice(0, 500)}
`).join('\n')}

Return ONLY this JSON structure:
{
  "overallSummary": "2-3 sentence summary of candidate fit for these roles",
  "topMatches": [
    {
      "jobId": "job id",
      "jobTitle": "title",
      "company": "company",
      "matchScore": 85,
      "matchSummary": "one sentence on why this is a good match",
      "strengths": ["strength 1", "strength 2"],
      "gaps": ["gap 1"],
      "recommendation": "yes",
      "applyUrl": "url"
    }
  ],
  "skillGaps": ["gap across all jobs"]
}

Include only top 5 matches sorted by matchScore descending.`;

  const text = await invokeLlama({
    system,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 2048,
    temperature: 0.2,
  });

  const result = extractJson<AnalysisResult>(text);

  // attach apply URLs from original job data
  result.topMatches = result.topMatches.map(match => {
    const originalJob = topJobs.find(j => j.id === match.jobId);
    return {
      ...match,
      applyUrl:    originalJob?.url ?? match.applyUrl,
      description: originalJob?.description ?? '',
      location:    originalJob?.location ?? '',
      remote:      originalJob?.remote ?? false,
      salary:      originalJob?.salary ?? null,
    };
  });

  return result;
}