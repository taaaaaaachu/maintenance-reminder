// Cloudflare Accessのセッション切れ検出と再ログイン誘導。
//
// PWAのService Workerがアプリシェルをキャッシュ配信するため、Accessのセッションが
// 切れてもSPA自体は起動してしまう。その状態でAPIをfetchすると、Accessが
// ログインページ(クロスオリジン)への302を返し、fetchはCORSでブロックされて
// "TypeError: Failed to fetch" になる。
// fetchに redirect: "manual" を指定するとこのリダイレクトは opaqueredirect として
// 観測できるので、検出したら /api/auth/refresh へトップレベル遷移して
// Accessログイン→アプリ復帰の流れに乗せる。

const GUARD_KEY = "access-relogin-redirected-at";
const GUARD_WINDOW_MS = 60_000;

export function handleAccessRedirect(res: Response): void {
  if (res.type !== "opaqueredirect") return;

  // ログイン後に戻ってきてもまだ失敗する場合の無限リダイレクトループ防止
  const last = Number(sessionStorage.getItem(GUARD_KEY) ?? 0);
  if (Date.now() - last > GUARD_WINDOW_MS) {
    sessionStorage.setItem(GUARD_KEY, String(Date.now()));
    window.location.assign("/api/auth/refresh");
  }
  throw new Error("ログインセッションの有効期限が切れました。再ログインしています…");
}
