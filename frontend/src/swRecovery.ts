// Accessのログインコールバック(/cdn-cgi/access/*)がService Workerに食われて
// アプリシェルが起動してしまった場合の自己修復。
//
// 本来この状況はsw.jsのnavigateFallbackDenylist(/^\/cdn-cgi\//)で防いでいるが、
// 除外指定の入っていない古いSWが端末に残っていると、コールバックが横取りされ続けて
// セッションクッキー(CF_Authorization)が再発行されない。さらにSWの更新チェック
// (GET /sw.js)自体もAccess保護下で302になるため失敗し、修正版SWを配信しても
// 端末側が「認証できないからSWを更新できない/SWを更新できないから認証できない」
// のデッドロックに陥る。
//
// アプリがコールバックURL上で起動してしまった=SWがコールバックを食った証拠なので、
// 検出したらSWを全解除してから認証フローをやり直す(SW解除後のトップレベル遷移は
// ネットワークに到達するため、Accessのハンドシェイクが正常に完了する)。

export function isSwallowedAccessCallback(pathname: string = window.location.pathname): boolean {
  return pathname.startsWith("/cdn-cgi/");
}

export async function recoverFromSwallowedCallback(): Promise<void> {
  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch {
    // SWの解除に失敗しても認証フローのやり直しは試みる
  }
  window.location.replace("/api/auth/refresh");
}
