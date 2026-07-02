import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// セットアップファイルはテストごとのストレージ分離の外側で複数回実行され得るが、
// applyD1Migrations()は未適用のマイグレーションのみ適用するため繰り返し呼んでも安全
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
