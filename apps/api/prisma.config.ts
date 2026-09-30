// Prisma CLI configuration.
// Runtime connections use the `@prisma/adapter-pg` driver adapter in
// `src/lib/prisma.ts`; this file is only read by the `prisma` CLI.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"]!,
    // Only used by `prisma migrate diff --from-migrations`, which replays
    // migrations into this scratch database. Point it at a disposable DB.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
