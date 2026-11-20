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

  if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
    return respond(503, { error: "AI chat is not configured. Netlify mein GROQ_API_KEY ya OPENAI_API_KEY set karein." });
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

  const properties = Array.isArray(request.properties) ? request.properties.slice(0, 12) : [];
  const projects = Array.isArray(request.projects) ? request.projects.slice(0, 12) : [];

  const systemPrompt = [
    "You are the friendly Land Pulse Marketing real-estate assistant.",
    "Reply naturally in Roman Urdu or simple English according to the user's language.",
    "Answer only for Land Pulse Marketing properties, projects, locations, budgets, rent, and real-estate services.",
    "Use only the supplied current inventory and prices. Never invent prices, availability, approvals, or amenities.",
    "If data is missing or a question is outside scope, politely say so and offer to help with property requirements.",
    "Do not mention or compare any other real-estate website or company.",
    "Keep answers short, warm, professional, and useful.",
    `Current properties: ${JSON.stringify(properties)}`,
    `Current projects: ${JSON.stringify(projects)}`
  ].join(" ");

  const providers = [];
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
          Authorization: `Bearer ${provider.key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.5,
          max_tokens: 350,
          messages: [
            { role: "system", content: systemPrompt },
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

      const content = result.choices?.[0]?.message?.content;
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
