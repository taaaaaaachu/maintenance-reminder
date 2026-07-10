import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App.js";
import { AdminApp } from "./admin/AdminApp.js";
import { isSwallowedAccessCallback, recoverFromSwallowedCallback } from "./swRecovery.js";
import "./styles/index.css";

if (isSwallowedAccessCallback()) {
  // Accessコールバックが(古い)SWに食われた状態。アプリは起動せず修復に専念する
  void recoverFromSwallowedCallback();
} else {
  const queryClient = new QueryClient();

  const container = document.getElementById("root");
  if (!container) throw new Error("root element not found");

  const RootComponent = window.location.pathname === "/admin" ? AdminApp : App;

  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RootComponent />
      </QueryClientProvider>
    </StrictMode>,
  );
}
