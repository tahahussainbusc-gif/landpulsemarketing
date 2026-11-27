import { createRemoteJWKSet, jwtVerify } from "jose";

export async function isAuthenticated(request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;

  // Match the existing admin's Firebase login and server-controlled admin role.
  // Public signing keys verify the session without a private service-account key.
  const project = "landpulsemarketing-a7bce";
  const signingKeys = createRemoteJWKSet(new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  ));

  let payload;
  try {
    ({ payload } = await jwtVerify(authorization.slice(7), signingKeys, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${project}`,
      audience: project,
      requiredClaims: ["sub", "iat", "exp"]
    }));
  } catch (error) {
    if (error.code === "ERR_JWKS_TIMEOUT" || !error.code?.startsWith("ERR_")) {
      throw new Error("Could not verify the admin session.");
    }
    return false;
  }
  if (!payload.sub || payload.sub.length > 128) return false;

  // Use the user's token so the existing Firestore rules enforce access, too.
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/admins/${encodeURIComponent(payload.sub)}`,
    { headers: { Authorization: authorization }, signal: AbortSignal.timeout(10000) }
  );
  if ([401, 403, 404].includes(response.status)) return false;
  if (!response.ok) throw new Error("Could not check admin access.");
  const admin = await response.json();
  return admin.fields?.role?.stringValue === "admin";
}
