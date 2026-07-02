import config from "../config.js";
import { findApiKey } from "../db/queries.js";

/**
 * Fastify preHandler: validate the `x-api-key` header.
 * Accepts keys from env (config.apiKeys) or the api_keys table.
 * Skipped entirely when AUTH_DISABLED=true (dev only).
 */
export async function apiKeyAuth(req, reply) {
  if (config.authDisabled) {
    req.apiKey = "dev";
    return;
  }
  const key = req.headers["x-api-key"];
  if (!key) {
    return reply.code(401).send({ error: "Missing API key. Send it in the 'x-api-key' header." });
  }
  if (config.apiKeys.includes(key)) {
    req.apiKey = key;
    return;
  }
  const row = await findApiKey(key);
  if (row && row.active) {
    req.apiKey = key;
    req.apiKeyMeta = row;
    return;
  }
  return reply.code(403).send({ error: "Invalid or inactive API key." });
}
