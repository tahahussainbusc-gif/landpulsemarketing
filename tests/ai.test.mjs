import assert from "node:assert/strict";
import { test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import chat from "../netlify/functions/ai-chat.mjs";
import generate from "../netlify/functions/generate-content.mjs";

const project = "landpulsemarketing-a7bce";

function request(body, headers = {}) {
  return new Request("https://site.example/.netlify/functions/ai-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

function mockProvider(t, handler) {
  for (const [key, value] of Object.entries({
    OPENAI_API_KEY: "test-placeholder",
    OPENAI_BASE_URL: "https://gateway.example.invalid/v1",
    GEMINI_API_KEY: "invalid-unused-placeholder"
  })) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  return t.mock.method(globalThis, "fetch", handler);
}

function aiResponse(text = "Please share your property budget.") {
  return Response.json({
    choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }]
  });
}

async function session(options = {}) {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...await exportJWK(publicKey), kid: "test-signing-key", alg: "RS256", use: "sig" };
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setSubject("test-admin")
    .setIssuer(`https://securetoken.google.com/${project}`)
    .setAudience(options.audience || project)
    .setIssuedAt()
    .setExpirationTime(options.expired ? Math.floor(Date.now() / 1000) - 60 : "1h")
    .sign(privateKey);
  return { jwk, headers: { Authorization: `Bearer ${token}` } };
}

function mockAdmin(t, jwk, { role = "admin", status = 200, provider = () => aiResponse("A welcoming home in Sargodha.") } = {}) {
  return mockProvider(t, async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://www.googleapis.com/")) return Response.json({ keys: [jwk] });
    if (url.startsWith("https://firestore.googleapis.com/")) {
      assert.ok(url.endsWith("/admins/test-admin"));
      assert.ok(init.headers.Authorization.startsWith("Bearer "));
      return Response.json({ fields: { role: { stringValue: role } } }, { status });
    }
    if (url.startsWith("https://gateway.example.invalid/")) return provider(input, init);
    throw new Error("Unexpected network request in test.");
  });
}

test("chat calls the configured gateway using the SDK and returns the existing response shape", async t => {
  const network = mockProvider(t, async (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, "https://gateway.example.invalid");
    assert.equal(url.pathname, "/v1/chat/completions");
    const body = JSON.parse(init.body);
    assert.equal(body.model, "gpt-4o-mini");
    assert.ok(body.messages[0].content.includes("Test listing"));
    assert.equal(body.messages[1].content, "Koi ghar hai?");
    return aiResponse("Ji, apna budget batayein.");
  });
  const response = await chat(request({ message: "Koi ghar hai?", properties: [{ title: "Test listing" }] }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { content: "Ji, apna budget batayein." });
  assert.equal(network.mock.callCount(), 1);
});

test("invalid chat input never calls an AI provider", async t => {
  const network = mockProvider(t, () => { throw new Error("Must not contact AI."); });
  for (const [body, status] of [
    ["not json", 400], ["null", 400], [[], 400], [{}, 400],
    [{ message: " " }, 400], [{ message: "a".repeat(501) }, 413],
    [{ message: "hello", properties: ["a".repeat(64000)] }, 413]
  ]) {
    assert.equal((await chat(request(body))).status, status);
  }
  const response = await chat(new Request("https://site.example/"));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "POST");
  assert.equal(network.mock.callCount(), 0);
});

test("provider rejection, invalid JSON, empty text and network failure return a safe error", async t => {
  t.mock.method(console, "error", () => {});
  for (const handler of [
    () => Response.json({ error: { message: "private-provider-details" } }, { status: 401 }),
    () => new Response("invalid-json"),
    () => Response.json({ choices: [] }),
    () => { throw new Error("private-provider-details"); }
  ]) {
    const network = mockProvider(t, handler);
    const response = await chat(request({ message: "Hello" }));
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes("private-provider-details"));
    network.mock.restore();
  }
});

test("content generation rejects missing and malformed sessions before contacting AI", async t => {
  const network = mockProvider(t, () => { throw new Error("Must not contact AI."); });
  assert.equal((await generate(request({}))).status, 401);
  assert.equal((await generate(request({}, { Authorization: "Bearer invalid" }))).status, 401);
  assert.equal(network.mock.callCount(), 0);
});

test("content generation accepts the existing Firebase admin session", async t => {
  const { jwk, headers } = await session();
  mockAdmin(t, jwk, { provider: (input, init) => {
    const body = JSON.parse(init.body);
    assert.ok(body.messages[0].content.includes("Town project"));
    assert.ok(body.messages[1].content.includes("at most 12 words"));
    return aiResponse("Find Your Home in Test Town");
  } });
  const response = await generate(request({ type: "project", field: "title", data: { title: "Test Town" } }, headers));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { content: "Find Your Home in Test Town" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("expired and wrong-project Firebase sessions cannot generate content", async t => {
  for (const options of [{ expired: true }, { audience: "unrelated-project" }]) {
    const { jwk, headers } = await session(options);
    const network = mockAdmin(t, jwk);
    const response = await generate(request({}, headers));
    assert.equal(response.status, 401);
    assert.equal(network.mock.callCount(), 1);
    network.mock.restore();
  }
});

test("a forged Firebase signature cannot generate content", async t => {
  const legitimate = await session();
  const forged = await session();
  const network = mockAdmin(t, legitimate.jwk);
  assert.equal((await generate(request({}, forged.headers))).status, 401);
  assert.equal(network.mock.callCount(), 1);
});

test("admin authorization rejects ordinary users and missing or inaccessible role documents", async t => {
  const { jwk, headers } = await session();
  for (const options of [{ role: "viewer" }, { status: 401 }, { status: 403 }, { status: 404 }]) {
    const network = mockAdmin(t, jwk, options);
    assert.equal((await generate(request({}, headers))).status, 401);
    assert.equal(network.mock.callCount(), 2);
    network.mock.restore();
  }
});

test("authorization service failures do not allow content generation", async t => {
  t.mock.method(console, "error", () => {});
  const { jwk, headers } = await session();
  const network = mockAdmin(t, jwk, { status: 503 });
  assert.equal((await generate(request({}, headers))).status, 503);
  assert.equal(network.mock.callCount(), 2);
});

test("authenticated content requests validate fields and payload size before calling AI", async t => {
  const { jwk, headers } = await session();
  const network = mockAdmin(t, jwk, { provider: () => { throw new Error("Must not contact AI."); } });
  for (const [body, status] of [
    ["null", 400], ["broken", 400], [{ type: "invalid", field: "title", data: {} }, 400],
    [{ type: "project", field: "invalid", data: {} }, 400],
    [{ type: "project", field: "title", data: { title: [] } }, 400],
    [{ type: "project", field: "title", data: { title: "a".repeat(1001) } }, 400],
    ["a".repeat(12001), 413]
  ]) {
    assert.equal((await generate(request(body, headers))).status, status);
  }
  assert.ok(network.mock.calls.every(call => !String(call.arguments[0]).includes("gateway.example.invalid")));
});
