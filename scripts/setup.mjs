import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
let exists = false;
try {
  await readFile(".env");
  exists = true;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (exists) {
  console.log(".env already exists; leaving it untouched.");
} else {
  const template = await readFile(".env.example", "utf8");
  await writeFile(
    ".env",
    template
      .replace("MASTER_KEY=", "MASTER_KEY=" + randomBytes(32).toString("hex"))
      .replace("SIGNING_KEY=", "SIGNING_KEY=" + randomBytes(32).toString("hex"))
      .replace(
        "S3_SECRET_KEY=",
        "S3_SECRET_KEY=" + randomBytes(24).toString("hex"),
      ),
    { mode: 0o600 },
  );
  console.log(
    "Generated local .env with random encryption/signing/storage secrets.",
  );
}
