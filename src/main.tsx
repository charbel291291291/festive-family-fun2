import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  });
}

// Listen for beforeinstallprompt to show an install affordance. We store it on window
declare global {
  interface Window {
    deferredPrompt?: BeforeInstallPromptEvent;
  }
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

if (typeof window !== "undefined") {
  window.addEventListener(
    "beforeinstallprompt",
    (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      window.deferredPrompt = e;
      window.dispatchEvent(new CustomEvent("pwa-beforeinstallprompt"));
    }
  );
}
