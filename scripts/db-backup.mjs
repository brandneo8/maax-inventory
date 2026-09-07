import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

mkdirSync("supabase/backups", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = `supabase/backups/data-${stamp}.sql`;

const result = spawnSync(
  "npx",
  ["supabase", "db", "dump", "--linked", "--data-only", "--yes", "-f", file],
  { stdio: "inherit", shell: true },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Saved data dump to ${file}`);
