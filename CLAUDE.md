# お手入れリマインダー(maintenance_reminder)

家電・家事などの定期的なお手入れ時期をLINE/メール/Pushoverで通知し、Google/Appleカレンダーにも連携できる家族向けWebアプリ。

クローンして自分の環境でセットアップする手順は [README.md](README.md) を参照。このファイル(CLAUDE.md)はアーキテクチャと実装上の注意点をまとめたもの。

- **1つのデプロイ・1つのD1を複数の世帯で共有し、データは世帯(`households`)単位で分離する**。世帯は管理者が管理画面(`/admin`)で作成し、メンバーのメールアドレスを登録する。セルフサインアップのSaaSではない。
- 認証は自前実装せず**Cloudflare Access(Zero Trust)**に委譲。アプリ内にログイン機能はない。
- サーバー代をかけない制約が強く、**Cloudflareの無料枠内で完結**させる設計方針。

## アーキテクチャ

Cloudflare Workers 1本(Workers Static Assets)で、フロントエンド配信・API・Cronバッチをすべて処理する。Cloudflare PagesとWorkersを分けず、`wrangler deploy`一発でフロント+バックエンドを同時デプロイする。

```
pnpm workspaces モノレポ
├── packages/shared   … フロント/バックエンド共有の型定義(Item, NotificationChannel等)
├── backend           … Cloudflare Workers本体(Hono + D1)
└── frontend          … React + Vite (SPA)
```

- **backend**: Hono + Zod。`backend/src/router.ts`が`/api/items`, `/api/settings`, `/api/notification-log`, `/api/admin`, `/api/auth`, `/api/agent-connections`, `/feed`, `/webhook`, `/mcp`, `/oauth`, `/.well-known`をマウント。D1へは素のSQL(ORM不使用、テーブル数が少なく過剰な抽象化のため)。
- **frontend**: React 19 + TanStack Query + Tailwind CSS v4。タブ切り替え(アイテム一覧/通知設定/通知履歴)のシンプルなSPA。パスが`/admin`のときだけ管理画面(`frontend/src/admin/AdminApp.tsx`)を表示し、通常画面のヘッダーには`GET /api/auth/me`が`isAdmin: true`を返したときだけ管理画面へのリンクを出す。
- **DB**: Cloudflare D1(SQLite互換)。マイグレーションは`backend/migrations/*.sql`を`wrangler d1 migrations apply`で適用。
- **通知**: LINE Messaging API(push+reply)、Resend(メール)、Pushover。`backend/src/notifications/dispatcher.ts`が宛先ごとにfan-out。
- **カレンダー連携**: OAuth不要のICS購読フィード(`/feed/:token.ics`)。Google/Apple双方に対応。

## 実装上の重要な設計判断

- **ユーザーの判定はCloudflare AccessのJWT(`Cf-Access-Jwt-Assertion`)を検証して行う**(`backend/src/middleware/accessAuth.ts`の`resolveUserEmail`)。署名・iss・aud(`ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`)・有効期限を`jose`で検証し、`email`クレームを使う。`cf-access-authenticated-user-email`ヘッダーをそのまま信用しないこと(Accessを経由しない経路から偽装できるため)。得たメールアドレスを`household_members`で引いて`householdId`を決め(`backend/src/middleware/household.ts`)、以降のDB操作はすべてこの`householdId`で絞り込む。`ACCESS_AUD`が空のローカル開発・テストでは、`DEV_HOUSEHOLD_EMAIL`が設定されている場合に限り`cf-access-authenticated-user-email`ヘッダー(なければ`DEV_HOUSEHOLD_EMAIL`)を使う。
- **管理者は`ADMIN_EMAIL`(Workers Secret)と一致するメールアドレス**。判定は`backend/src/routes/admin.ts`の`isAdmin()`に集約し、管理APIのミドルウェアと`GET /api/auth/me`の両方から使う。
- **LINEの宛先登録は招待コード経由**。管理画面で世帯ごとに招待コード(有効期限7日、`household_invites`)を発行し、LINE公式アカウントを友だち追加したユーザーがBotにコードを送ると、その世帯の通知宛先として登録される。
- **通知時刻・通知タイミングはアイテムごとの設定**(`items.notify_time`, `items.notify_days_before`)。過去に一度グローバル設定として実装したが、ユーザー要望により全面的にアイテムごとに作り直した経緯がある。**今後もこの粒度を維持すること**(グローバル設定に戻さない)。
- **通知宛先は複数登録可能**(`notification_recipients`テーブル)。チャネル(line/email/pushover)ごとに複数の宛先を登録でき、`notification_settings.config_json`(単一宛先前提の古い設計)は廃止済み(migration 0004でDROP COLUMN)。同じ設計に戻さないこと。
- **LINEはユーザーの自己登録制**。`/webhook/line`は`x-line-signature`をHMAC-SHA256で検証したうえで、上記の招待コードを受け取ると`notification_recipients`へ登録する。手動でuserIdを入力させる設計ではない。
- **秘密情報はWorkers Secretsに、宛先などの可変設定はD1に**という分離。`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `RESEND_API_KEY`, `PUSHOVER_API_TOKEN`, `ADMIN_EMAIL`はSecrets、`RESEND_FROM_ADDRESS`, `APP_BASE_URL`, `LINE_INVITE_URL`は`wrangler.toml`の`[vars]`。`[vars]`と`[[routes]]`のドメイン等はプレースホルダーで、本番値は`deploy.yml`がGitHub Secretsから差し込む(公開リポジトリに個人の値を含めないため)。
- **ICSのUIDは`{item.id}@ドメイン`で固定**。item.idは不変UUIDなので、これを変えるとGoogle/Appleカレンダー側で予定が重複登録される。
- **日付はJST基準**。Workers/D1の内部時刻はUTCなので、「今日」の判定は`backend/src/lib/date.ts`のJST変換ヘルパー(`todayJstDateString`等)に必ず集約する。バラバラに`new Date()`で当日判定しない。
- **D1の外部キーはON DELETE CASCADEが実際に効く**(notification_logはitem削除で連動削除される)。「削除後もログは残る」という前提でコードやテストを書かない。
- **通知メッセージ内のアプリURLは`env.APP_BASE_URL`(`wrangler.toml`の`[vars]`)から組み立てる**。Cronの`scheduled`ハンドラーにはHTTPリクエストが存在しないため、実行時にドメインを動的検出する手段がない。`backend/src/notifications/templates.ts`の`buildReminderMessage`が`{APP_BASE_URL}/?items={id1},{id2},...`形式でリンクを生成し、LINE/メール本文には地の文として、Pushoverは`url`/`url_title`パラメータ(開くボタン)として渡している。フロント側は`App.tsx`が`?items=`(カンマ区切り、旧`?item=`単数も後方互換で読める)クエリを読み取ってアイテム一覧タブを開き、該当する全カードをスクロール&ハイライトする(React Router等のルーティングは導入していないため)。
- **通知は同一チャネル・宛先ごとに1通へまとめる**。`checkReminders.ts`は`item×channel×recipient`ではなく`channel×recipient`単位でループし、その回の該当アイテムをすべて`buildReminderMessage`に配列で渡して1通に集約する(1件なら従来通りの詳細文面、複数件なら箇条書き)。通知履歴(`notification_log`)への記録と冪等性チェック(`hasSuccessfulNotificationSince`)はアイテム単位のまま維持している。
- **完了/スヌーズは`item_history`テーブルに全件記録する**(`backend/src/db/history.ts`)。`completeItem`/`snoozeItem`(`backend/src/db/queries.ts`)内でitems更新と同じ関数呼び出しの中でINSERTしており、履歴記録漏れを防ぐために呼び出し側(ルートハンドラー)に記録処理を分散させない。`items.recentSnoozeCount`(直近30日のスヌーズ回数)は`listItems`/`getItem`のSQLにサブクエリを埋め込んで一括計算しており、N+1を避けている。
- **月次サマリー通知は`app_config`の`last_monthly_summary_month`キーで冪等性を担保する**(`backend/src/scheduled/sendMonthlySummary.ts`)。Cronは30分おきに走るため、「JST月初かつ07:00固定」の条件だけでは同一実行タイミングでの重複送信リスクがあり、送信済み月をD1に記録して二重送信を防いでいる。通知履歴(`notification_log`)には記録しない(月次サマリーは特定のitemに紐づかないため)。
- **AIエージェントはMCP(`/mcp`)と自前のOAuth 2.1認可サーバーで繋ぐ**(用語は`CONTEXT.md`の「エージェント接続」、理由は`docs/adr/0001-own-oauth-server-on-d1.md`)。`@cloudflare/workers-oauth-provider`はKV必須で書き込み上限(1,000回/日)に当たるため使わず、接続・DCR登録・認可コードはすべてD1(`agent_connections`/`oauth_clients`/`oauth_codes`)に置く。isolate間で共有されないためメモリ上のMapにキャッシュしない。接続は発行者のメールと世帯に結びつき、使うたびに`household_members`と突き合わせる。トークンは`/mcp`以外(`/api/*`)では受け付けない。MCPのツールはアイテム操作と履歴の閲覧だけで、通知設定・ICS・招待・管理は出さない。

## ハマりどころ

- **`@cloudflare/vitest-plugin`(旧`@cloudflare/vitest-pool-workers`)は新API(`cloudflareTest` Viteプラグイン)を使う**。`defineWorkersConfig`/`cloudflare:test`は古いAPIで動かない。テスト内で環境にアクセスするときは`cloudflare:workers`から`env`/`exports`をimportする。
- **`Env`型ではなく`Cloudflare.Env`を拡張する**。`cloudflare:workers`の`env`エクスポートが実際に参照する型は`declare global { namespace Cloudflare { interface Env {...} } }`の方(`backend/src/env.d.ts`参照)。
- **`/feed/*`と`/webhook/*`はSPAフォールバックに食われるので`run_worker_first`が必須**(`wrangler.toml`の`[assets]`)。Workers Static Assetsはデフォルトでは静的アセット/SPAフォールバックを先に評価する。
- **Cron TriggersにはCloudflareアカウントのworkers.dev登録が必要**(custom domainのみでルーティングしていても)。未登録だとデプロイ時にエラーコード10063が出る。必要なのはアカウントのworkers.devサブドメインの登録で、このWorkerのworkers.dev URLは`workers_dev = false`のまま無効にしておく(Accessで保護されないため)。
- **PWA(Service Worker) + Cloudflare Accessの組み合わせで、セッション切れ時にAPIが「TypeError: Failed to fetch」になる**。SWがアプリシェルをキャッシュ配信するため、Accessセッションが切れてもSPAは起動してしまい、API fetchだけがAccessログインページ(クロスオリジン302)へのリダイレクトをCORSでブロックされて失敗する。対策として、フロントのfetchラッパー(`frontend/src/api/session.ts`)が`redirect: "manual"`でopaqueredirectを検出し、`/api/auth/refresh`(`/`へ302を返すだけのbackendルート)へトップレベル遷移してAccessログイン→アプリ復帰させている。この仕組みを外さないこと。
- **Accessのログインコールバック`/cdn-cgi/access/*`もSWの`navigateFallbackDenylist`に必ず含める**(`frontend/vite.config.ts`)。Accessは認証後ブラウザを`/cdn-cgi/access/authorized?nonce=...&state=...`へリダイレクトし、そのレスポンスでセッションクッキー(`CF_Authorization`)を再発行して本来の宛先へ302で戻す。この`/cdn-cgi/`ナビゲーションをSWのnavigateFallback(アプリシェル)が食うと、コールバックがハンドシェイクを完了できずクッキーが再発行されないため、SPAはコールバックURL上で起動してしまい以後のAPIが延々302→「再ログインしています…」ループに陥る(通常リロードではSWが介入するため再現、`Ctrl+Shift+R`はSWをバイパスするので正常表示される)。上の`redirect: "manual"`の仕組みだけでは救えず、`navigateFallbackDenylist`に`/^\/cdn-cgi\//`が入っていることが前提。
- **SWの不具合修正は「デプロイすれば直る」とは限らない(未認証端末のSW更新デッドロック)**。SWの更新チェック(`GET /sw.js`)やprecacheのアセット取得もAccess保護下にあり、未認証だと302が返ってSWスクリプトのfetchは失敗扱いになる。そのため「古いSWがAccessコールバックを食う→認証が完了しない→未認証のままだからSW更新も失敗する」の循環に陥った端末は、修正版SWをデプロイしても自力で復旧できない。復旧には端末側の操作(デスクトップ: 壊れたページで`Ctrl+Shift+R`、iOSホーム画面PWA: 削除→Safariでログイン→再追加、Android PWA: サイトデータ削除)か、Accessアプリを一時的にBypassにしてSW更新を通す時限対応が必要。この教訓から、SPAが`/cdn-cgi/`のURL上で起動してしまった場合の自己修復コード(`frontend/src/swRecovery.ts`: SW全解除→`/api/auth/refresh`へ遷移。`main.tsx`の起動時チェックから呼ぶ)を入れている。外さないこと。
- **workboxの`runtimeCaching`で`urlPattern`にRegExpを渡すとフルURL(`https://...`)に対してテストされる**。`/^\/api\//`のようなパス前提の正規表現は一切マッチしない(RegExpRouteはsame-originでも先頭一致を要求)。パス判定は`({ url }) => url.pathname.startsWith("/api/")`のように関数で書く。
- **`/mcp`・`/oauth/token`・`/oauth/register`・`/oauth/revoke`・`/.well-known/*`はAccessをBypassし、`/oauth/authorize`はAccessの内側に残す**(ダッシュボード側の設定。手順はREADME)。Bypassしたパスのハンドラーでは`resolveUserEmail`を呼ばずトークンだけで認証し、同意画面だけがAccess JWTで発行者を決める。これらのパスは`run_worker_first`とSWの`navigateFallbackDenylist`にも入れてある。同意画面のPOSTは`hono/csrf`でOriginを検査しており、`hono/csrf`が投げる`HTTPException`は`router.ts`の`onError`で素通しする(500にしない)。CIMDの取得は`redirect: "manual"`・5秒・10KBの制限付きで、`global_fetch_strictly_public`フラグで自ゾーンへの近道も塞いでいる。

## 開発運用

- 型チェック: `pnpm run typecheck`(shared→backend→frontendの順)
- テスト: `pnpm run test`(backend: vitest + @cloudflare/vitest-plugin、frontend: vitest + Testing Library)
- デプロイ: GitHub Actions(`.github/workflows/deploy.yml`)がmainブランチへのpushで自動的にD1マイグレーション適用+デプロイまで行う。**つまりpush = 即本番反映**。`wrangler.toml`のドメイン等はプレースホルダーなので、**ローカルから`pnpm run deploy`しないこと**(本番の値がプレースホルダーで上書きされる)。
- 実装のたびに対象範囲の単体テストを書いて実行し、意味のある単位でこまめにコミットする(グローバル指示`~/.claude/CLAUDE.md`のルールをこのプロジェクトでも適用)。
- 本番環境・運用手順など個人の環境に依存する指示は、gitignore対象の`CLAUDE.local.md`に書く(公開リポジトリのため)。
- **push前にはユーザーのローカル動作確認を挟むこと。** コミットまでは自動で進めてよいが、`git push`は保留し、確認してほしい項目をまとめて伝えてから、ユーザーの確認OKを待って実行する。
