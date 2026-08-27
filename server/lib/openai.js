// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// Generic OpenAI client. Nothing here knows about any particular game; the prompts and
// the validation live with the game that needs them (see games/island/ai.js).
const API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TIMEOUT_MS = 20_000;

// Tests and offline development run against a deterministic stand-in instead of the API.
export const MOCK = process.env.MOCK_AI === '1';

export function aiAvailable() {
  return MOCK || Boolean(process.env.OPENAI_API_KEY);
}

export function aiStatus() {
  if (!aiAvailable()) return 'unavailable, set OPENAI_API_KEY in .env to enable';
  return MOCK ? 'MOCK mode' : `enabled (${MODEL})`;
}

// One round trip in JSON mode. Throws on anything that is not a parseable object, so
// callers only ever deal with a result or an error.
export async function chatJSON({ system, user, temperature = 0.2, maxTokens = 300 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('OpenAI returned an empty response');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}
