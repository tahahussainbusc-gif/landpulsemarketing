const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

function respond(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(payload)
  };
}

exports.handler = async event => {
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Use POST to chat." });
  }

  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
    return respond(503, { error: "AI chat is not configured. Netlify mein GEMINI_API_KEY set karein." });
  }

  let request;
  try {
    request = JSON.parse(event.body || "{}");
  } catch {
    return respond(400, { error: "Invalid request." });
  }

  const message = typeof request.message === "string" ? request.message.trim() : "";
  if (!message) {
    return respond(400, { error: "Please enter a message." });
  }
  if (message.length > 500) {
    return respond(413, { error: "Message too long." });
  }

  const history = Array.isArray(request.history)
    ? request.history.slice(-10).filter(item =>
      item &&
      (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string" &&
      item.content.trim() &&
      item.content.length <= 1500
    ).map(item => ({ role: item.role, content: item.content.trim() }))
    : [];
  const properties = Array.isArray(request.properties) ? request.properties.slice(0, 12) : [];
  const projects = Array.isArray(request.projects) ? request.projects.slice(0, 12) : [];

  const systemPrompt = [
    "You are a friendly, helpful, general-purpose conversational AI assistant for Land Pulse Marketing.",
    "You can discuss any topic and answer general questions; do not restrict the conversation to real estate.",
    "Reply naturally in the user's language and script, including Roman Urdu, Urdu, or simple English.",
    "For questions about Land Pulse Marketing properties, projects, prices, or availability, use only the supplied current inventory. Never invent property details, prices, approvals, or amenities.",
    "Be clear when you are uncertain or do not have current information.",
    "Keep answers warm, professional, useful, and concise for natural voice conversation. Use plain spoken sentences, avoid markdown, emoji, decorative symbols, and unnecessary numbers. Preserve important amounts and read them naturally.",
    `Current properties: ${JSON.stringify(properties)}`,
    `Current projects: ${JSON.stringify(projects)}`
  ].join(" ");

  const providers = [];
  if (process.env.GEMINI_API_KEY) {
    providers.push({
      name: "Gemini",
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL || "gemini-2.5-flash")}:generateContent`,
      key: process.env.GEMINI_API_KEY,
      type: "gemini"
    });
  }
  if (process.env.GROQ_API_KEY) {
    providers.push({
      name: "Groq",
      url: GROQ_API_URL,
      key: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
    });
  }
  if (process.env.OPENAI_API_KEY) {
    providers.push({
      name: "OpenAI",
      url: "https://api.openai.com/v1/chat/completions",
      key: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini"
    });
  }

  let lastError;
  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, {
        method: "POST",
        headers: {
          ...(provider.type === "gemini"
            ? { "x-goog-api-key": provider.key }
            : { Authorization: `Bearer ${provider.key}` }),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(provider.type === "gemini" ? {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [
            ...history.map(item => ({
              role: item.role === "assistant" ? "model" : "user",
              parts: [{ text: item.content }]
            })),
            { role: "user", parts: [{ text: message }] }
          ],
          generationConfig: { temperature: 0.5, maxOutputTokens: 350 }
        } : {
          model: provider.model,
          temperature: 0.5,
          max_tokens: 350,
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: message }
          ]
        })
      });

      if (!response.ok) {
        const providerError = await response.text();
        lastError = `${provider.name} returned ${response.status}`;
        console.error(`${lastError}: ${providerError}`);
        continue;
      }

      let result;
      try {
        result = await response.json();
      } catch {
        lastError = `${provider.name} ne invalid response bheja`;
        continue;
      }

      const content = provider.type === "gemini"
        ? result.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("")
        : result.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) {
        return respond(200, { content: content.trim() });
      }
      lastError = `${provider.name} ne jawab nahi diya`;
    } catch (error) {
      lastError = `${provider.name} service reachable nahi thi`;
      console.error(`${provider.name} chat request failed:`, error.message);
    }
  }

  return respond(502, { error: lastError || "AI service abhi jawab generate nahi kar saki." });
};
