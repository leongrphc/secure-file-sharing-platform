import dotenv from "dotenv";
import { spawnSync } from "node:child_process";
dotenv.config({ path: ".env", quiet: true });
const result = spawnSync("npm", ["run", "db:migrate", "-w", "@sfs/api"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
