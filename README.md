# お手入れリマインダー

家電・家事などの定期的なお手入れ時期を、LINE / メール / Pushoverで通知し、Google/Appleカレンダーにも連携できる個人(家族)用Webアプリです。Cloudflare Workers上で完結し、サーバー費用はかかりません。

アーキテクチャや実装上の注意点は [CLAUDE.md](CLAUDE.md) を参照してください。ここでは、リポジトリをクローンして自分の環境で動かすための手順をまとめます。

## 事前に必要なもの

- Node.js(`.nvmrc`等は用意していないため、任意の方法でLTS系を用意してください。開発時はNode.js 24系)
- Cloudflareアカウント(D1・Workers・Cron Triggersを無料枠で利用)
- 通知チャネルごとに以下のアカウント(使わないチャネルは無効のままでも動きます)
  - LINE: [LINE Developers](https://developers.line.biz/) でMessaging APIチャネルを作成
  - メール: [Resend](https://resend.com) アカウント(独自ドメインのDNS認証を推奨)
  - Pushover: [Pushover](https://pushover.net) でアプリを登録してAPI Tokenを発行

## セットアップ手順

### 1. 依存関係のインストール

```
npm install
```

npm workspaces構成(`packages/shared`, `backend`, `frontend`)なのでルートで一度実行すれば全ワークスペース分入ります。

### 2. Cloudflareにログイン

```
cd backend
npx wrangler login
```

### 3. D1データベースを作成

```
npx wrangler d1 create maintenance-reminder-db
```

出力される `database_id` を `backend/wrangler.toml` の `[[d1_databases]]` セクションに転記してください(サンプルのIDは私(開発者)のデータベースを指しているため、必ず自分のものに書き換える必要があります)。

### 4. マイグレーション適用

```
npm run db:migrations:apply:local --workspace=backend
npm run db:migrations:apply:remote --workspace=backend
```

### 5. ローカル開発用のシークレットを設定

```
cp backend/.dev.vars.example backend/.dev.vars
```

`backend/.dev.vars` を開き、各キーに実際の値を入れてください(このファイルは`.gitignore`対象なのでコミットされません)。

| キー | 取得元 |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers > 対象チャネル > Messaging API設定 |
| `LINE_CHANNEL_SECRET` | LINE Developers > 対象チャネル > チャネル基本設定 |
| `RESEND_API_KEY` | Resendダッシュボード |
| `RESEND_FROM_ADDRESS` | Resendでドメイン認証済みの送信元アドレス |
| `PUSHOVER_API_TOKEN` | Pushoverのアプリ登録画面 |

### 6. 本番用シークレットを設定

デプロイ先(Cloudflare Workers)にも同じ値を登録します。

```
cd backend
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put PUSHOVER_API_TOKEN
```

### 7. wrangler.tomlを自分の環境向けに調整

`backend/wrangler.toml` の以下の値はプレースホルダー(`example.com`等)なので書き換えてください。

- `[[routes]] pattern`(独自ドメインを使わない場合はこの`[[routes]]`ブロックごと削除し、`workers_dev = true`にすると`*.workers.dev`のURLで動きます)
- `[vars] RESEND_FROM_ADDRESS`
- `[vars] APP_BASE_URL`(通知メッセージ内のリンクに使われるアプリのURL。上記のドメイン設定と合わせてください)

### 8. ローカル起動

```
npm run dev:backend    # http://localhost:8787 でWorkerが起動
npm run dev:frontend   # http://localhost:5173 でVite dev server起動
```

### 9. デプロイ

```
npm run deploy
```

フロントエンドのビルド後、`wrangler deploy`が実行されます。

## 任意設定

- **LINEのWebhook URL**: LINE Developersのチャネル設定で `https://<デプロイ先ドメイン>/webhook/line` を指定し、Webhookを有効化してください。応答メッセージ機能はオフにしておくことを推奨します(Bot自身の自動応答と競合するため)。
- **Cloudflare Access**: アプリ全体を認証で保護したい場合、Zero Trustダッシュボードで保護対象アプリケーションを作成してください。ただし `/feed/*`(カレンダー購読)と `/webhook/*`(LINE Webhook)は外部サービスからの直接アクセスが必要なため、これらのパスだけ「Bypass」ポリシーの別アプリケーションとして除外する必要があります。
- **GitHub Actions CI/CD**: `.github/workflows/deploy.yml` がmainブランチへのpushで自動テスト→D1マイグレーション適用→デプロイを行います。使う場合はリポジトリのSecretsに `CLOUDFLARE_API_TOKEN`(D1編集・Workers編集権限が必要)を登録してください。
  - このリポジトリのワークフローは、`wrangler.toml`のプレースホルダー(`reminder.example.com`等)をデプロイ直前にSecretsの`PROD_HOSTNAME`(例: `reminder.your-domain.com`)・`RESEND_FROM_ADDRESS`・`LINE_INVITE_URL`で置き換えます。`wrangler.toml`に直接自分の値を書く場合は、`deploy.yml`の「Inject production values into wrangler.toml」ステップを削除してください。
- **管理画面(`/admin`)**: 世帯やメンバーを管理する画面です。`ADMIN_EMAIL`(管理者のメールアドレス)を`backend/.dev.vars`と本番の`npx wrangler secret put ADMIN_EMAIL`で設定すると、そのユーザーのときだけヘッダーにリンクが表示されます。

## よく使うコマンド

```
npm run typecheck   # 全ワークスペースの型チェック
npm run test         # 全ワークスペースのテスト
```

## ライセンス

[MIT License](LICENSE)

アイコン(`assets/line/line-official-account-bg.svg`等)の一部に[Material Icons](https://fonts.google.com/icons)(Google, [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0))の図形を使用しています。
