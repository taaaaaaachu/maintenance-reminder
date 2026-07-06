# LINE公式アカウント用アセット

通知用LINE公式アカウントのプロフィール背景画像。[LINE Official Account Manager](https://manager.line.biz/) の 設定 → プロフィール → 背景画像 からPNGをアップロードして使う。

- `line-official-account-bg.svg` … 編集用ソース
- `line-official-account-bg.png` … アップロード用(推奨サイズ 1080×878px で書き出し済み)

## PNGの再生成

SVGを編集したら [@resvg/resvg-js](https://www.npmjs.com/package/@resvg/resvg-js) で書き出す(日本語テキストがあるため、システムフォント読み込み対応のresvgを使う。sharpだとフォント解決に失敗することがある)。

```js
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("line-official-account-bg.svg", "utf8");
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: 1080 },
  font: { loadSystemFonts: true, defaultFontFamily: "Yu Gothic UI" },
});
writeFileSync("line-official-account-bg.png", resvg.render().asPng());
```
