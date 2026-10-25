# エージェント接続の OAuth 2.1 認可サーバーは D1 上に自前で実装する

AI エージェント向けの MCP(`/mcp`)には OAuth 2.1 と手動発行の Bearer トークンの両方で接続させる。認可サーバーは Cloudflare 製の `@cloudflare/workers-oauth-provider` を使わず、D1 の上に自前で実装した。このライブラリは保存先に KV が必須で、KV の無料枠は書き込みが1日1,000回しかない。上限を超えるとその日はトークンの発行やリフレッシュが失敗するので、それを避けたかった。

## Considered Options

- `@cloudflare/workers-oauth-provider`(KV): CIMD・DCR・SSRF 対策が組み込まれていて、書くコードは最も少ない。KV の書き込み上限に加えて、リフレッシュトークンの再利用検知(古いトークンが使われたら接続ごと失効させる)ができない。
- Agents SDK の `McpAgent`: Durable Objects 前提のステートフルな作りで、操作ごとにツールを呼ぶこの用途には重い。
