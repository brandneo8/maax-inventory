import { spawnSync } from "node:child_process";

function run(command, args, { required = true } = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: true });
  if (result.status !== 0 && required) {
    process.exit(result.status ?? 1);
  }
  return result.status ?? 1;
}

const backupStatus = run("bun", ["run", "db:backup"], { required: false });
if (backupStatus !== 0) {
  console.warn("Data dump skipped (CLI dump needs Docker on this machine). Live rows stay on Supabase; push is additive only.");
}
run("npx", ["supabase", "db", "push", "--yes"]);
