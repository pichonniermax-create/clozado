import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js charge .env.local automatiquement ; drizzle-kit non, donc on le fait ici.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
