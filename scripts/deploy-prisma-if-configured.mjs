import { spawnSync } from "node:child_process";

const schemaPath = process.argv[2] ?? "prisma/schema.prisma";
const databaseUrl = process.env.DATABASE_URL ?? "";

if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
  console.log("Prisma migrate deploy skipped: DATABASE_URL is not configured.");
  process.exit(0);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  command,
  ["prisma", "migrate", "deploy", "--schema", schemaPath],
  {
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
