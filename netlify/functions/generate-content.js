const allowedFields = new Set(["title", "description"]);
const allowedTypes = new Set(["property", "project"]);
const allowedDataKeys = [
  "title",
  "description",
  "location",
  "priceRange",
  "badge",
  "category",
  "size",
  "listingType",
  "price",
  "beds",
  "baths",
  "projectTitle",
  "instruction"
];

function respond(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  };
}

function getOrigin() {
  const siteUrl = process.env.URL;
  if (siteUrl) {
  try {
    const url = new URL(siteUrl);
    if (url.protocol === "https:" || url.hostname === "localhost") {
      return url.origin;
    }
  } catch (error) {
    console.error("The Netlify URL environment variable is invalid:", error.message);
  }
  }
  return "";
}

async function isAuthenticated(event) {
  const authorization = event.headers && (event.headers.authorization || event.headers.Authorization);
  const origin = getOrigin();
  if (!origin) {
  throw new Error("The Netlify URL environment variable is missing or invalid.");
  }
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return false;
  }

  const response = await fetch(`${origin}/.netlify/identity/user`, {
    headers: { Authorization: authorization }
  });
  if (response.status >= 500) {
  throw new Error(`Netlify Identity returned ${response.status}.`);
  }
  return response.ok;
}

exports.handler = async event => {
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Use POST to generate content." });
  }

  if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
    return respond(503, { error: "AI generation is not configured. Add GROQ_API_KEY or OPENAI_API_KEY in Netlify environment variables." });
  }

  let authenticated;
  try {
    authenticated = await isAuthenticated(event);
  } catch (error) {
    console.error("Could not verify CMS identity:", error.message);
    return respond(503, { error: "Could not verify your CMS session. Please sign in again and retry." });
  }
  if (!authenticated) {
    return respond(401, { error: "Sign in to the CMS before generating content." });
  }

  if (!event.body || event.body.length > 12000) {
    return respond(413, { error: "The content request is empty or too large." });
  }

  let request;
  try {
    request = JSON.parse(event.body);
  } catch {
    return respond(400, { error: "The request body must be valid JSON." });
  }
  if (!request || !allowedTypes.has(request.type) || !allowedFields.has(request.field) ||
      !request.data || typeof request.data !== "object" || Array.isArray(request.data)) {
    return respond(400, { error: "Choose a valid project or property title/description to generate." });
  }

  const details = {};
  for (const key of allowedDataKeys) {
    const value = request.data[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" && typeof value !== "number") {
      return respond(400, { error: `The ${key} value must be text.` });
    }
    const text = String(value).trim();
    if (text.length > 1000) {
      return respond(400, { error: `The ${key} value is too long.` });
    }
    details[key] = text;
  }

  const isTownProject = request.type === "project" &&
    /\btown\b/i.test(`${details.title || ""} ${details.location || ""}`);
  const instruction = request.field === "title"
    ? `Write one clear, appealing ${request.type} title in at most 12 words.`
    : `Write a concise, polished ${request.type} description in 2-4 sentences.`;
  const adminInstruction = details.instruction ? ` Admin instruction: ${details.instruction}` : "";
  const systemPrompt = [
    "You write accurate real-estate listing copy.",
    "Use only facts present in the supplied JSON. Never invent amenities, approvals, returns, availability, measurements, or legal claims.",
    "Do not include a price unless the supplied details contain one.",
    isTownProject ? "This is a Town project: do not mention or suggest any price." : "",
    "Return only the requested text, without quotes or markdown."
  ].filter(Boolean).join(" ");

  let response;
  try {
    const groqApiKey = process.env.GROQ_API_KEY;
    const groqConfigured = Boolean(groqApiKey);
    response = await fetch(groqConfigured
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqConfigured ? groqApiKey : process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: groqConfigured
          ? (process.env.GROQ_MODEL || "llama-3.3-70b-versatile")
          : (process.env.OPENAI_MODEL || "gpt-4o-mini"),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${instruction}${adminInstruction}\nDetails: ${JSON.stringify(details)}` }
        ],
        max_tokens: request.field === "title" ? 80 : 300,
        temperature: 0.6
      })
    });
  } catch (error) {
    console.error("AI provider request failed:", error.message);
    return respond(502, { error: "The AI service could not be reached. Please try again." });
  }

  if (!response.ok) {
    console.error(`AI provider returned ${response.status}.`);
    return respond(502, { error: "The AI service could not generate content. Please check its configuration and retry." });
  }

  let result;
  try {
    result = await response.json();
  } catch (error) {
    console.error("AI provider returned invalid JSON:", error.message);
    return respond(502, { error: "The AI service returned an invalid response. Please retry." });
  }
  const content = result.choices && result.choices[0] &&
    result.choices[0].message && result.choices[0].message.content;
  if (typeof content !== "string" || !content.trim()) {
    return respond(502, { error: "The AI service returned no content. Please retry." });
  }

  return respond(200, { content: content.trim() });
};
