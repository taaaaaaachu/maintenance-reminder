/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "icon-source.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "お手入れリマインダー",
        short_name: "お手入れ",
        description: "家電・家事などの定期的なお手入れ時期を通知するリマインダーアプリ",
        lang: "ja",
        display: "standalone",
        start_url: "/",
        scope: "/",
        theme_color: "#0f172a",
        background_color: "#f8fafc",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        // /cdn-cgi/access/* はCloudflare AccessのログインコールバックURL。
        // ここをSWのnavigateFallback(=アプリシェル)で食うと、Accessがセッション
        // クッキーを再発行できず、以後のAPIが延々302→再ログインループに陥る。必ず除外する。
        navigateFallbackDenylist: [/^\/api\//, /^\/feed\//, /^\/webhook\//, /^\/cdn-cgi\//],
        runtimeCaching: [
          {
            // RegExpはフルURL(https://...)に対してテストされ /^\/api\// では一致しないため関数で判定する
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
