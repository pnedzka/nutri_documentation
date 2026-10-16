import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const EFFORT = (process.env.CLAUDE_EFFORT as Effort | undefined) || 'medium';

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ maxRetries: 3 }));

/** A failure the user should see as is. */
export class PipelineError extends Error {}

export type UserContent = Anthropic.Beta.BetaContentBlockParam[];

/**
 * One structured-output request. Streams (long transcriptions take minutes) and parses the JSON answer.
 * Server-side refusal fallbacks are on: a declined request is re-run on a fallback model in the same call.
 * Set CLAUDE_FALLBACKS=off to disable them.
 */
export async function structuredCall<T>(args: {
  system: string;
  content: UserContent;
  schema: Record<string, unknown>;
  effort?: Effort;
}): Promise<T> {
  const useFallbacks = process.env.CLAUDE_FALLBACKS !== 'off';
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    ...(useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    thinking: { type: 'adaptive' },
    output_config: { effort: args.effort ?? EFFORT, format: { type: 'json_schema', schema: args.schema } },
    system: args.system,
    messages: [{ role: 'user', content: args.content }],
  });
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await stream.finalMessage();
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new PipelineError('Invalid ANTHROPIC_API_KEY.');
    if (error instanceof Anthropic.RateLimitError) throw new PipelineError('Claude request limit exceeded. Try again in a moment.');
    if (error instanceof Anthropic.BadRequestError) throw new PipelineError(`Claude rejected the request: ${error.message}`);
    if (error instanceof Anthropic.APIError) throw new PipelineError(`Claude API error (${error.status ?? 'no connection'}). Try again.`);
    throw error;
  }
  if (message.stop_reason === 'refusal') throw new PipelineError('Claude declined to process this document.');
  if (message.stop_reason === 'max_tokens') {
    throw new PipelineError('The document is too long to process in full. Split it into smaller files.');
  }
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new PipelineError('Claude\'s response is not valid JSON. Try processing the document again.');
  }
}
