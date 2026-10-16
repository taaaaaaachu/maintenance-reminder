import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrationsPath = path.join(__dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            LINE_CHANNEL_ACCESS_TOKEN: "test-line-token",
            LINE_CHANNEL_SECRET: "test-line-channel-secret",
            RESEND_API_KEY: "test-resend-key",
            PUSHOVER_API_TOKEN: "test-pushover-token",
            ADMIN_EMAIL: "admin@example.com",
            // テストはAccess未設定のローカル相当で実行し、ユーザーはcf-access-authenticated-user-email
            // ヘッダーで切り替える。DEV_HOUSEHOLD_EMAILはどの世帯にも属さないアドレスにしておく。
            ACCESS_AUD: "",
            DEV_HOUSEHOLD_EMAIL: "dev@example.com",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
