import js from "@eslint/js";
import ts from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default ts.config(
  {
    // 生成物・外部ファイルは対象外。
    ignores: ["**/dist/", "**/.wrangler/", "**/node_modules/", ".claude/", "backend/worker-configuration.d.ts"],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // React があるのは frontend だけ。フックの呼び出し規則と依存配列だけを検査する。
    files: ["frontend/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
);
