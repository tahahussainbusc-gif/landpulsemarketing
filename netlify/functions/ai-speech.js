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

function respondWithAudio(audioData) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-store"
    },
    body: Buffer.from(audioData, "base64").toString("base64"),
    isBase64Encoded: true
  };
}

exports.handler = async event => {
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Use POST to generate speech." });
  }
  if (!process.env.GEMINI_API_KEY) {
    return respond(503, { error: "Natural AI voice is not configured. Add GEMINI_API_KEY in Netlify." });
  }

  let request;
  try {
    request = JSON.parse(event.body || "{}");
  } catch {
    return respond(400, { error: "Invalid request." });
  }

  const text = typeof request.text === "string" ? request.text.trim() : "";
  if (!text) {
    return respond(400, { error: "Speech text is required." });
  }
  if (text.length > 2000) {
    return respond(413, { error: "Speech text is too long." });
  }

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts",
        input: [{
          type: "user_input",
          content: [{
            type: "text",
            text,
            annotations: [{
              type: "speech_metadata",
              style: "A natural, warm female conversational voice with a gentle Pakistani Urdu accent. Speak clearly at a relaxed, human pace. Read meaningful numbers naturally. Do not vocalize punctuation, markdown, or decorative symbols."
            }]
          }]
        }],
        response_format: { type: "audio" },
        generation_config: {
          speech_config: [{ voice: process.env.GEMINI_TTS_VOICE || "Leda" }]
        }
      })
    });

    if (!response.ok) {
      const providerError = await response.text();
      console.error(`Gemini TTS returned ${response.status}: ${providerError}`);
      return respond(502, { error: "Natural voice could not be generated." });
    }

    const result = await response.json();
    const audio = result.output_audio?.data || result.steps
      ?.filter(step => step.type === "model_output")
      .flatMap(step => Array.isArray(step.content) ? step.content : [])
      .filter(item => item.type === "audio")
      .pop()?.data;
    if (typeof audio !== "string" || !audio) {
      return respond(502, { error: "Gemini did not return speech audio." });
    }

    return respondWithAudio(audio);
  } catch (error) {
    console.error("Gemini TTS request failed:", error.message);
    return respond(502, { error: "Natural voice service is unavailable." });
  }
};
