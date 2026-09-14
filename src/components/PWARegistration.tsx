"use client";

import { useEffect } from "react";

export function PWARegistration() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("IOCL ServiceWorker registered with scope:", registration.scope);
          })
          .catch((error) => {
            console.error("IOCL ServiceWorker registration failed:", error);
          });
      });
    }
  }, []);

  return null;
}
