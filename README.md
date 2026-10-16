# お手入れリマインダー

家電・家事などの定期的なお手入れ時期を、LINE / メール / Pushoverで通知し、Google/Appleカレンダーにも連携できる家族向けWebアプリです。Cloudflare Workersの無料枠で完結し、サーバー費用はかかりません。

アーキテクチャや実装上の注意点は [CLAUDE.md](CLAUDE.md) を参照してください。ここでは機能の概要と、リポジトリをクローンして自分の環境で動かすための手順をまとめます。

## 主な機能

- **お手入れアイテムの管理**: 周期・通知時刻・何日前に通知するかをアイテムごとに設定。完了・スヌーズの操作は履歴として記録されます。
- **通知**: LINE / メール(Resend) / Pushoverで、期限が近いアイテムをまとめて通知(Cronで30分おきに判定)。月初には月次サマリーも送ります。
- **カレンダー連携**: ICS購読フィード(`/feed/:token.ics`)をGoogle/Appleカレンダーに登録できます。
- **世帯ごとのデータ分離**: データは世帯単位で管理し、ログインしたメールアドレスが所属する世帯のデータだけを表示します。
- **管理画面(`/admin`)**: 世帯の作成・削除、メンバー(メールアドレス)の追加、LINE連携用の招待コード発行を行います。管理者のときだけヘッダーにリンクが表示されます。
- **PWA**: スマートフォンのホーム画面に追加して使えます。

## 事前に必要なもの

- Node.js(LTS系。開発時はNode.js 24系)
- Cloudflareアカウント(Workers・D1・Cron Triggers・Accessを無料枠で利用)
- 通知チャネルごとに以下のアカウント(使わないチャネルは無効のままでも動きます)
  - LINE: [LINE Developers](https://developers.line.biz/) でMessaging APIチャネルを作成
  - メール: [Resend](https://resend.com) アカウント(独自ドメインのDNS認証を推奨)
  - Pushover: [Pushover](https://pushover.net) でアプリを登録してAPI Tokenを発行

## セットアップ手順

### 1. 依存関係のインストール

```
npm install
```

npm workspaces構成(`packages/shared`, `backend`, `frontend`)なので、ルートで一度実行すれば全ワークスペース分入ります。

### 2. Cloudflareにログイン

```
cd backend
npx wrangler login
```

### 3. D1データベースを作成

```
npx wrangler d1 create maintenance-reminder-db
```

出力される `database_id` を `backend/wrangler.toml` の `[[d1_databases]]` セクションに転記してください(リポジトリに入っているIDは開発者のデータベースのものなので、必ず自分のものに書き換えます)。

### 4. マイグレーション適用

```
npm run db:migrations:apply:local --workspace=backend
npm run db:migrations:apply:remote --workspace=backend
```

マイグレーション `0010` で、最初の世帯(`自宅`)とそのメンバー `owner@example.com` が作られます。本番では、管理画面で自分のメールアドレスを世帯のメンバーに追加してください。

### 5. ローカル開発用の設定

```
cp backend/.dev.vars.example backend/.dev.vars
```

`backend/.dev.vars` を開き、各キーに値を入れてください(このファイルは`.gitignore`対象なのでコミットされません)。

| キー | 内容 |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers > 対象チャネル > Messaging API設定 |
| `LINE_CHANNEL_SECRET` | LINE Developers > 対象チャネル > チャネル基本設定 |
| `RESEND_API_KEY` | Resendダッシュボード |
| `RESEND_FROM_ADDRESS` | Resendでドメイン認証済みの送信元アドレス |
| `PUSHOVER_API_TOKEN` | Pushoverのアプリ登録画面 |
| `ADMIN_EMAIL` | 管理画面を使えるメールアドレス |
| `DEV_HOUSEHOLD_EMAIL` | ローカルでログインしているとみなすメールアドレス(例: `owner@example.com`)。ローカルにはCloudflare Accessがないため使います。本番では設定しないでください |
| `ACCESS_AUD` | 空にする。`wrangler.toml`の値を上書きして、ローカルではAccessのJWT検証を無効にします |

### 6. 本番用シークレットを設定

デプロイ先(Cloudflare Workers)にも登録します。

```
cd backend
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put PUSHOVER_API_TOKEN
npx wrangler secret put ADMIN_EMAIL
```

### 7. wrangler.tomlを自分の環境向けに調整

`backend/wrangler.toml` の以下の値はプレースホルダー(`example.com`等)です。

- `[[routes]] pattern`(Cloudflare Accessで保護するため、Cloudflareで管理している独自ドメインが必要です)
- `[vars] ACCESS_TEAM_DOMAIN`, `[vars] ACCESS_AUD`(後述のCloudflare Accessの設定で確認できる値)
- `[vars] RESEND_FROM_ADDRESS`
- `[vars] APP_BASE_URL`(通知メッセージ内のリンクに使われるアプリのURL。上記のドメイン設定と合わせてください)
- `[vars] LINE_INVITE_URL`(LINE公式アカウントの友だち追加URL。通知設定画面に表示されます)

GitHub Actionsでデプロイする場合は、ファイルを書き換えずに後述のSecretsで値を差し込めます。

### 8. ローカル起動

```
npm run dev:backend    # http://localhost:8787 でWorkerが起動
npm run dev:frontend   # http://localhost:5173 でVite dev server起動
```

### 9. デプロイ

GitHub Actions(後述)を使うのがおすすめです。手元からデプロイする場合は、手順7の値を書き換えたうえで実行してください。

```
npm run deploy
```

フロントエンドのビルド後、`wrangler deploy`が実行されます。

## GitHub Actions CI/CD

`.github/workflows/deploy.yml` が、mainブランチへのpushでテスト → D1マイグレーション適用 → デプロイを行います。つまりpushすると本番に反映されます。

リポジトリの **Settings > Secrets and variables > Actions** に以下を登録してください。

| Secret | 内容 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | [API Tokens](https://dash.cloudflare.com/profile/api-tokens) で「Edit Cloudflare Workers」テンプレートに`D1: 編集`を追加して発行したトークン |
| `PROD_HOSTNAME` | 本番のドメイン(例: `reminder.your-domain.com`) |
| `RESEND_FROM_ADDRESS` | 本番の送信元アドレス |
| `LINE_INVITE_URL` | LINE公式アカウントの友だち追加URL |
| `ACCESS_TEAM_DOMAIN` | Cloudflare Accessのteam domain(例: `your-team.cloudflareaccess.com`) |

デプロイ直前に、`wrangler.toml`のプレースホルダーをこれらの値で置き換えます。`wrangler.toml`に直接自分の値を書く場合は、`deploy.yml`の「Inject production values into wrangler.toml」ステップを削除してください。

## Cloudflare Accessの設定

アプリにはログイン機能がなく、認証はCloudflare Access(Zero Trust)に任せています。Accessが付与するJWT(`Cf-Access-Jwt-Assertion`)の署名・aud・issuerを検証し、そのメールアドレスで世帯を判定します(`backend/src/middleware/accessAuth.ts`)。**本番では必ずAccessでアプリ全体を保護してください**。

- Zero Trustダッシュボードで、デプロイ先ドメインを保護するアプリケーションを作成します。
- `/feed/*`(カレンダー購読)と`/webhook/*`(LINE Webhook)は外部サービスから直接アクセスされるため、これらのパスだけ「Bypass」ポリシーの別アプリケーションとして除外します。
- 作成したアプリケーションのAUDタグ(Access > Applications > 該当アプリ)を`wrangler.toml`の`ACCESS_AUD`に、team domainを`ACCESS_TEAM_DOMAIN`に設定します。
- `workers_dev = false`と`preview_urls = false`のままにしてください。workers.devとPreview URLはAccessで保護されません。

## LINE連携

- LINE DevelopersのチャネルでWebhook URLに`https://<デプロイ先ドメイン>/webhook/line`を指定し、Webhookを有効にします。応答メッセージ機能はオフにしてください(Botの自動応答と競合するため)。
- 家族がLINE公式アカウントを友だち追加すると、Botが招待コードを尋ねます。管理画面で発行した招待コード(有効期限7日)を送ると、その世帯の通知先として登録されます。

## よく使うコマンド

```
npm run typecheck   # 全ワークスペースの型チェック
npm run test        # 全ワークスペースのテスト
```

## ライセンス

[MIT License](LICENSE)

アイコン(`assets/line/line-official-account-bg.svg`等)の一部に[Material Icons](https://fonts.google.com/icons)(Google, [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0))の図形を使用しています。
