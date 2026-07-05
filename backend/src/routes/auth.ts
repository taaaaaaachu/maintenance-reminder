import { Hono } from "hono";
import type { HonoEnv } from "../types.js";

export const authRouter = new Hono<HonoEnv>();

// Cloudflare Accessのセッション切れからの復帰用エンドポイント。
// PWAのService Workerがアプリシェルをキャッシュ配信するため、セッションが切れても
// SPA自体は起動してしまい、APIへのfetchだけがAccessログインページへの
// クロスオリジンリダイレクト(CORSブロック)で失敗する。
// フロントはそれを検出したらこのURLへトップレベル遷移する。Access配下なので
// 未認証ならログインが要求され、認証後にここへ戻ってきて / にリダイレクトされる。
authRouter.get("/refresh", (c) => c.redirect("/", 302));
