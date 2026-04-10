import "dotenv/config";
import { defineConfig, env } from "@prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma", // Caminho para o seu esquema
  datasource: {
    url: env("DATABASE_URL"), // Puxa a URL do seu arquivo .env
  },
});
