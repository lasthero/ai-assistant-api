import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Job } from './cache';

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const MODEL_ID = 'us.meta.llama3-1-8b-instruct-v1:0';

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

  const system = `You are an expert career coach and technical recruiter specializing in software engineering roles.
Analyze the candidate's resume against job postings and return structured JSON only.
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

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in Bedrock response');

  const result = JSON.parse(jsonMatch[0]) as AnalysisResult;

  // attach apply URLs from original job data
  result.topMatches = result.topMatches.map(match => ({
    ...match,
    applyUrl: topJobs.find(j => j.id === match.jobId)?.url ?? match.applyUrl,
  }));

  return result;
}