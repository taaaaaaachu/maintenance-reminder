# お手入れリマインダー(maintenance_reminder)

家電・家事などの定期的なお手入れ時期をLINE/メール/Pushoverで通知し、Google/Appleカレンダーにも連携できる個人(家族)用Webアプリ。

クローンして自分の環境でセットアップする手順は [README.md](README.md) を参照。このファイル(CLAUDE.md)はアーキテクチャと実装上の注意点をまとめたもの。

- **単一世帯・単一DB前提**であり、マルチテナントSaaSではない。他世帯への提供は「ソースを渡して各自Cloudflareにデプロイしてもらう」方針(SaaS化は別プロジェクト扱いとして見送り済み)。
- 認証は自前実装せず**Cloudflare Access(Zero Trust)**に委譲。アプリ内にログイン機能はない。
- サーバー代をかけない制約が強く、**Cloudflareの無料枠内で完結**させる設計方針。

## アーキテクチャ

Cloudflare Workers 1本(Workers Static Assets)で、フロントエンド配信・API・Cronバッチをすべて処理する。Cloudflare PagesとWorkersを分けず、`wrangler deploy`一発でフロント+バックエンドを同時デプロイする。

```
npm workspaces モノレポ
├── packages/shared   … フロント/バックエンド共有の型定義(Item, NotificationChannel等)
├── backend           … Cloudflare Workers本体(Hono + D1)
└── frontend          … React + Vite (SPA)
```

- **backend**: Hono + Zod。`backend/src/router.ts`が`/api/items`, `/api/settings`, `/api/notification-log`, `/feed`, `/webhook`をマウント。D1へは素のSQL(ORM不使用、テーブル数が少なく過剰な抽象化のため)。
- **frontend**: React 19 + TanStack Query + Tailwind CSS v4。タブ切り替え(アイテム一覧/通知設定/通知履歴)のシンプルなSPA。
- **DB**: Cloudflare D1(SQLite互換)。マイグレーションは`backend/migrations/*.sql`を`wrangler d1 migrations apply`で適用。
- **通知**: LINE Messaging API(push+reply)、Resend(メール)、Pushover。`backend/src/notifications/dispatcher.ts`が宛先ごとにfan-out。
- **カレンダー連携**: OAuth不要のICS購読フィード(`/feed/:token.ics`)。Google/Apple双方に対応。

## 実装上の重要な設計判断

- **通知時刻・通知タイミングはアイテムごとの設定**(`items.notify_time`, `items.notify_days_before`)。過去に一度グローバル設定として実装したが、ユーザー要望により全面的にアイテムごとに作り直した経緯がある。**今後もこの粒度を維持すること**(グローバル設定に戻さない)。
- **通知宛先は複数登録可能**(`notification_recipients`テーブル)。チャネル(line/email/pushover)ごとに複数の宛先を登録でき、`notification_settings.config_json`(単一宛先前提の古い設計)は廃止済み(migration 0004でDROP COLUMN)。同じ設計に戻さないこと。
- **LINEはユーザーの自己登録制**。LINE公式アカウントを友だち追加すると`/webhook/line`が発火し、`x-line-signature`をHMAC-SHA256で検証した上で自動的に`notification_recipients`へ登録される。手動でuserIdを入力させる設計ではない。
- **秘密情報はWorkers Secretsに、宛先などの可変設定はD1に**という分離。`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `RESEND_API_KEY`, `PUSHOVER_API_TOKEN`はSecrets、`RESEND_FROM_ADDRESS`は`wrangler.toml`の`[vars]`。
- **ICSのUIDは`{item.id}@ドメイン`で固定**。item.idは不変UUIDなので、これを変えるとGoogle/Appleカレンダー側で予定が重複登録される。
- **日付はJST基準**。Workers/D1の内部時刻はUTCなので、「今日」の判定は`backend/src/lib/date.ts`のJST変換ヘルパー(`todayJstDateString`等)に必ず集約する。バラバラに`new Date()`で当日判定しない。
- **D1の外部キーはON DELETE CASCADEが実際に効く**(notification_logはitem削除で連動削除される)。「削除後もログは残る」という前提でコードやテストを書かない。
- **通知メッセージ内のアプリURLは`env.APP_BASE_URL`(`wrangler.toml`の`[vars]`)から組み立てる**。Cronの`scheduled`ハンドラーにはHTTPリクエストが存在しないため、実行時にドメインを動的検出する手段がない。`backend/src/notifications/templates.ts`の`buildReminderMessage`が`{APP_BASE_URL}/?items={id1},{id2},...`形式でリンクを生成し、LINE/メール本文には地の文として、Pushoverは`url`/`url_title`パラメータ(開くボタン)として渡している。フロント側は`App.tsx`が`?items=`(カンマ区切り、旧`?item=`単数も後方互換で読める)クエリを読み取ってアイテム一覧タブを開き、該当する全カードをスクロール&ハイライトする(React Router等のルーティングは導入していないため)。
- **通知は同一チャネル・宛先ごとに1通へまとめる**。`checkReminders.ts`は`item×channel×recipient`ではなく`channel×recipient`単位でループし、その回の該当アイテムをすべて`buildReminderMessage`に配列で渡して1通に集約する(1件なら従来通りの詳細文面、複数件なら箇条書き)。通知履歴(`notification_log`)への記録と冪等性チェック(`hasSuccessfulNotificationSince`)はアイテム単位のまま維持している。

## ハマりどころ

- **`@cloudflare/vitest-pool-workers`は新API(`cloudflareTest` Viteプラグイン)を使う**。`defineWorkersConfig`/`cloudflare:test`は古いAPIで動かない。テスト内で環境にアクセスするときは`cloudflare:workers`から`env`/`exports`をimportする。
- **`Env`型ではなく`Cloudflare.Env`を拡張する**。`cloudflare:workers`の`env`エクスポートが実際に参照する型は`declare global { namespace Cloudflare { interface Env {...} } }`の方(`backend/src/env.d.ts`参照)。
- **`/feed/*`と`/webhook/*`はSPAフォールバックに食われるので`run_worker_first`が必須**(`wrangler.toml`の`[assets]`)。Workers Static Assetsはデフォルトでは静的アセット/SPAフォールバックを先に評価する。
- **Cron TriggersにはCloudflareアカウントのworkers.dev登録が必要**(custom domainのみでルーティングしていても)。未登録だとデプロイ時にエラーコード10063が出る。ダッシュボードでWorker URLを一度有効化すればよい。
- **Windows環境ではNode/npm/gh等がmise管理**。PowerShell/Bashツールからは素のPATHにmiseのshimsが乗らないため、コマンド先頭で`$env:PATH = "C:\Users\you\AppData\Local\mise\shims;$env:PATH"`(PowerShell)/`export PATH="/c/Users/you/AppData/Local/mise/shims:$PATH"`(Bash)を都度追加する。

## 開発運用

- 型チェック: `npm run typecheck`(shared→backend→frontendの順)
- テスト: `npm run test`(backend: vitest + vitest-pool-workers、frontend: vitest + Testing Library)
- デプロイ: `npm run deploy`(frontendビルド→`wrangler deploy`)。GitHub Actions(`.github/workflows/deploy.yml`)がmainブランチへのpushで自動的にD1マイグレーション適用+デプロイまで行う。**つまりpush = 即本番反映**。
- 実装のたびに対象範囲の単体テストを書いて実行し、意味のある単位でこまめにコミットする(グローバル指示`~/.claude/CLAUDE.md`のルールをこのプロジェクトでも適用)。
- **push前にはユーザーのローカル動作確認を挟むこと。** コミットまでは自動で進めてよいが、`git push`は保留し、確認してほしい項目をまとめて伝えてから、ユーザーの確認OKを待って実行する。

## 本番環境

- URL: `reminder.example.com`(Cloudflare Access配下。`/feed/*`と`/webhook/*`のみAccessをBypass)
- リポジトリ: `https://github.com/taaaaaaachu/maintenance-reminder`(private)

## 共有用テンプレートリポジトリとの同期

個人情報・環境固有値(独自ドメイン、D1のdatabase_id、送信元メールアドレス等)を除去した共有用テンプレート `https://github.com/taaaaaaachu/maintenance-reminder-template`(private)を別途用意している。このリポジトリとはgit履歴が完全に独立している(テンプレート側は個人情報除去のため単一コミットで作り直したもの)ため、`git merge`等での自動同期はできない。

「テンプレートにも反映して」と言われたら、以下の手順で同期する。

1. 軽量タグ`template-synced`が指すコミットから現在のHEADまでの差分を確認する: `git diff template-synced..HEAD`
2. 環境固有ファイルは反映しない: `backend/wrangler.toml`の個人値(ドメイン・database_id・送信元アドレス)、`backend/.dev.vars`
3. **`CLAUDE.md`は他のファイルと一緒に`cp`で機械的にコピーしない。** 個人情報(独自ドメイン・GitHubユーザー名・リポジトリURL等)を含む「本番環境」セクションと、このセクション自体(「共有用テンプレートリポジトリとの同期」。本番運用手順であり、テンプレート利用者には無関係かつリポジトリURLという個人情報を含む)を必ず除外し、それ以外の差分(設計判断・ハマりどころなど)だけをテンプレート側の対応箇所に手動で追記・編集する。過去に一括`cp`で丸ごと上書きしてこれらのセクションが個人情報ごと混入した事故があった。
4. テンプレート側リポジトリ(スクラッチ領域等に別途clone)に差分を適用し、個人情報が混入していないことをgrep等で再確認してからコミット・push
5. 反映が終わったら、`template-synced`タグを最新コミットに付け直してpushする: `git tag -f template-synced <commit> && git push origin template-synced -f`
