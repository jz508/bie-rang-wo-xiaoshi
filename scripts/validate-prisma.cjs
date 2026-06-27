const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const schemaPath = path.join(repoRoot, "prisma", "schema.prisma");
const prismaCli = require.resolve("prisma/build/index.js");

const result = spawnSync(
  process.execPath,
  [prismaCli, "validate", "--schema", schemaPath],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ||
        "postgresql://prisma:prisma@localhost:5432/prisma_validate",
    },
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
