import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Job } from './cache';

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

const MODEL_ID = 'meta.llama3-1-8b-instruct-v1:0';

export type JobMatch = {
  jobId:          string;
  jobTitle:       string;
  company:        string;
  matchScore:     number; // 0–100
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
  // limit to top 10 jobs to stay within context window
  const topJobs = jobs.slice(0, 10);

  const prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
You are an expert career coach and technical recruiter specializing in software engineering roles.
Analyze the candidate's resume against job postings and return structured JSON only.
<|eot_id|><|start_header_id|>user<|end_header_id|>

Resume:
${resumeText.slice(0, 3000)}

Job Postings:
${topJobs.map((j, i) => `
[${i + 1}] ID: ${j.id}
Title: ${j.title} at ${j.company}
Location: ${j.location} ${j.remote ? '(Remote)' : ''}
Description: ${j.description.slice(0, 500)}
`).join('\n')}

Return ONLY this JSON structure with no explanation:
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
      "gaps": ["gap 1", "gap 2"],
      "recommendation": "yes",
      "applyUrl": "url"
    }
  ],
  "skillGaps": ["skill gap across all jobs"]
}

Include only top 5 matches, sorted by matchScore descending.
<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      prompt,
      max_gen_len: 2048,
      temperature: 0.2,
      top_p: 0.9,
    }),
  }));

  const raw = JSON.parse(new TextDecoder().decode(response.body));
  const text = raw.generation as string;

  // extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in Bedrock response');

  // attach apply URLs from original job data
  const result = JSON.parse(jsonMatch[0]) as AnalysisResult;
  result.topMatches = result.topMatches.map(match => ({
    ...match,
    applyUrl: topJobs.find(j => j.id === match.jobId)?.url ?? match.applyUrl,
  }));

  return result;
}

// src/lib/bedrock.ts
export async function invokeLlama({
  system,
  messages,
}: {
  system: string;
  messages: { role: string; content: string }[];
}): Promise<string> {

  // build Llama chat format
  const conversation = messages
    .map(m => `<|start_header_id|>${m.role}<|end_header_id|>\n${m.content}<|eot_id|>`)
    .join('\n');

  const prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
${system}<|eot_id|>
${conversation}
<|start_header_id|>assistant<|end_header_id|>`;

  const response = await bedrock.send(new InvokeModelCommand({
    modelId: 'meta.llama3-1-8b-instruct-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      prompt,
      max_gen_len: 1024,
      temperature: 0.3,
      top_p: 0.9,
    }),
  }));

  const raw = JSON.parse(new TextDecoder().decode(response.body));
  return (raw.generation as string).trim();
}