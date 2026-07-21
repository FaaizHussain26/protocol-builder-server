import { env, azureConfigured } from '../../config/env';

const isGpt5Family = /gpt-5/i.test(env.azure.deployment);
// max_completion_tokens (gpt-5) / max_tokens (others). Skeleton (no fields) and
// each single-form enrichment both stay well under these caps.
const MAX_OUTPUT_TOKENS = isGpt5Family ? 65536 : 32768;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Hard cap on a single Azure call so one hung request can't stall an entire
// background build indefinitely (a stuck enrichment is recoverable per-form).
const REQUEST_TIMEOUT_MS = 180_000;

// One chat-completion call that returns the parsed JSON object the model emits.
// Retries on 429/503 (Azure tokens-per-minute / requests-per-minute throttling),
// honoring the Retry-After header when present, with exponential backoff.
export async function callModel(systemPrompt: string, userContent: string): Promise<any> {
  if (!azureConfigured) throw new Error('Azure OpenAI is not configured on the server.');
  const url = `${env.azure.endpoint}/openai/deployments/${env.azure.deployment}/chat/completions?api-version=${env.azure.apiVersion}`;
  const requestBody = JSON.stringify({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    ...(isGpt5Family
      ? { max_completion_tokens: MAX_OUTPUT_TOKENS, reasoning_effort: 'low' }
      : { max_tokens: MAX_OUTPUT_TOKENS, temperature: 0.3 }),
    response_format: { type: 'json_object' },
  });

  const MAX_RETRIES = 5;
  let res!: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': env.azure.apiKey },
        body: requestBody,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // Network error / timeout: retry with backoff, else surface a clear error.
      if (attempt >= MAX_RETRIES) {
        throw new Error(`Azure OpenAI request failed after ${MAX_RETRIES + 1} attempts: ${(err as Error).message}`);
      }
      await sleep(Math.min(2000 * 2 ** attempt, 30000));
      continue;
    }
    if (res.ok || (res.status !== 429 && res.status !== 503) || attempt >= MAX_RETRIES) break;
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** attempt, 30000);
    await sleep(waitMs);
  }

  if (!res.ok) {
    const errBody = await res.text();
    // Azure content management / Prompt Shields (jailbreak, hate, …) → 400 with
    // code "content_filter". Flag it so callers can retry with a neutral prompt.
    if (res.status === 400 && /content_filter|ResponsibleAIPolicy|content management policy/i.test(errBody)) {
      throw Object.assign(new Error('Azure content filter blocked the prompt (content_filter).'), { contentFilter: true });
    }
    const hint = res.status === 429
      ? ' — the deployment is throttling (tokens/requests-per-minute quota). Try again shortly or raise the deployment quota in Azure.'
      : '';
    throw new Error(`Azure OpenAI API error ${res.status}: ${errBody}${hint}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string | null }; finish_reason: string }>;
  };
  const choice = data.choices[0];
  let jsonText = choice?.message?.content?.trim() ?? '';
  jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  if (!jsonText) throw new Error(`Model returned no content (finish_reason: ${choice?.finish_reason ?? 'unknown'}).`);
  if (choice?.finish_reason === 'length') throw new Error('Model response was truncated (finish_reason: length) before the JSON was complete.');

  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error('Model returned invalid/incomplete JSON (likely truncated).');
  }
}
