import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getPool, closePool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const pool = getPool();
  if (!pool) {
    console.error("DATABASE_URL is not set — nothing to migrate.");
    process.exit(1);
  }
  const sql = readFileSync(join(__dirname, "schema.sql"), "utf8");
  console.log("Applying schema...");
  await pool.query(sql);
  console.log("✅ Migration complete.");
  await closePool();
}

migrate().catch((e) => {
  console.error("❌ Migration failed:", e.message);
  process.exit(1);
});
