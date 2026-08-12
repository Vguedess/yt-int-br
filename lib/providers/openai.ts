export async function openAIJson<T>(input: { system: string; user: string; schemaName?: string }): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      store: false,
      input: [
        { role: 'developer', content: input.system },
        { role: 'user', content: input.user }
      ]
    })
  });

  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
  const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const text = payload.output_text ?? payload.output?.flatMap(x => x.content ?? []).map(x => x.text ?? '').join('') ?? '';
  return JSON.parse(text) as T;
}
