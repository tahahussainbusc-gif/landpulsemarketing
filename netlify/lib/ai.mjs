import OpenAI from "openai";

export async function generateText(systemPrompt, prompt) {
  // Construct during invocation so the modern runtime's managed credentials apply.
  const ai = new OpenAI();
  const result = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ],
    temperature: 0.5,
    max_tokens: 350
  }, { timeout: 20000, maxRetries: 0 });
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI returned no text.");
  }
  return content.trim();
}

export function respond(status, payload) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(status === 405 ? { Allow: "POST" } : {})
    }
  });
}

export class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function readRequest(request, maxBytes) {
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) {
    throw new RequestError(413, "The request is too large.");
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RequestError(400, "The request body must be valid JSON.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new RequestError(400, "The request body must be an object.");
  }
  return data;
}
