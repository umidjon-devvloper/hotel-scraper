import { buildServer } from "./api/server.js";
import config from "./config.js";

// Stealth plugin fires _onTargetCreated async; if the browser closes first it
// throws ProtocolError: Target closed as an unhandled rejection.  That error is
// harmless (the scraper already caught it) but would crash Node v24 otherwise.
process.on("unhandledRejection", (reason) => {
  if (reason && reason.name === "ProtocolError" && String(reason.message).includes("Target closed")) {
    return; // benign race between stealth evasion setup and browser.close()
  }
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});

const app = await buildServer();

const shutdown = async (signal) => {
  app.log.info(`Received ${signal}, shutting down...`);
  await app.close();
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
