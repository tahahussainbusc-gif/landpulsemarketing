import { generateText, readRequest, RequestError, respond } from "../lib/ai.mjs";
import { isAuthenticated } from "../lib/admin-auth.mjs";

export default async request => {
  if (request.method !== "POST") {
    return respond(405, { error: "Use POST to generate content." });
  }

  try {
    if (!await isAuthenticated(request)) {
      return respond(401, { error: "Sign in with an approved admin account before generating content." });
    }
  } catch {
    console.error("Could not verify admin access.");
    return respond(503, { error: "Could not verify your admin session. Please sign in again and retry." });
  }

  let data;
  try {
    data = await readRequest(request, 12000);
  } catch (error) {
    if (error instanceof RequestError) return respond(error.status, { error: error.message });
    return respond(400, { error: "Invalid request." });
  }

  if (!["property", "project"].includes(data.type) || !["title", "description"].includes(data.field) ||
      !data.data || typeof data.data !== "object" || Array.isArray(data.data)) {
    return respond(400, { error: "Choose a valid project or property title/description to generate." });
  }

  const details = {};
  for (const key of [
    "title", "description", "location", "priceRange", "badge", "category", "size",
    "listingType", "price", "beds", "baths", "projectTitle", "instruction"
  ]) {
    const value = data.data[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" && typeof value !== "number") {
      return respond(400, { error: `The ${key} value must be text.` });
    }
    const text = String(value).trim();
    if (text.length > 1000) return respond(400, { error: `The ${key} value is too long.` });
    details[key] = text;
  }

  const isTownProject = data.type === "project" && /\btown\b/i.test(`${details.title || ""} ${details.location || ""}`);
  const instruction = data.field === "title"
    ? `Write one clear, appealing ${data.type} title in at most 12 words.`
    : `Write a concise, polished ${data.type} description in 2-4 sentences.`;
  const adminInstruction = details.instruction ? ` Admin instruction: ${details.instruction}` : "";
  const systemPrompt = [
    "You write accurate real-estate listing copy.",
    "Use only facts present in the supplied JSON. Never invent amenities, approvals, returns, availability, measurements, or legal claims.",
    "Do not include a price unless the supplied details contain one.",
    isTownProject ? "This is a Town project: do not mention or suggest any price." : "",
    "Return only the requested text, without quotes or markdown."
  ].filter(Boolean).join(" ");

  try {
    const content = await generateText(systemPrompt, `${instruction}${adminInstruction}\nDetails: ${JSON.stringify(details)}`);
    return respond(200, { content });
  } catch {
    console.error("AI content generation failed.");
    return respond(502, { error: "The AI service could not generate content. Please try again shortly." });
  }
};
