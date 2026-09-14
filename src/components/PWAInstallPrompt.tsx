"use client";

import React, { useState, useEffect } from "react";
import { Download, X, Share, Smartphone, CheckCircle } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);

  useEffect(() => {
    // Check if already running in standalone PWA mode
    const isAppStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isAppStandalone) {
      setIsStandalone(true);
      return;
    }

    // Check if user dismissed install banner recently
    const dismissed = localStorage.getItem("iocl_pwa_dismissed");
    if (dismissed && Date.now() - parseInt(dismissed, 10) < 86400000 * 3) {
      // Dismissed within last 3 days
      return;
    }

    // Detect iOS
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: boolean }).MSStream;

    if (isIOS) {
      setShowIOSPrompt(true);
      setShowBanner(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setInstalledSuccess(true);
      setTimeout(() => setShowBanner(false), 3000);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem("iocl_pwa_dismissed", Date.now().toString());
  };

  if (isStandalone || !showBanner) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-[100] transition-all duration-300 animate-in fade-in slide-in-from-bottom-5">
      <div className="google-card bg-[var(--bg-surface-elevated)] border-2 border-blue-500/30 shadow-2xl p-4 rounded-2xl relative overflow-hidden backdrop-blur-md">
        {/* Accent Top Highlight Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-orange-500 to-blue-600" />

        <div className="flex items-start gap-3 pt-1">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center text-white shrink-0 shadow-md">
            <Smartphone className="w-6 h-6 text-orange-400" />
          </div>

          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              <span>Web App Experience</span>
            </div>
            <h4 className="text-sm font-bold text-[var(--text-primary)] truncate">
              Install IOCL Petrol Bunk App
            </h4>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
              Add to your phone or laptop home screen for 1-tap instant access, full screen view & offline capability.
            </p>

            {installedSuccess ? (
              <div className="mt-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                <span>Successfully added to Home Screen!</span>
              </div>
            ) : showIOSPrompt ? (
              <div className="mt-2 text-[11px] bg-blue-50 dark:bg-blue-950/50 p-2 rounded-lg text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 flex items-center gap-1.5">
                <Share className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>Tap <strong>Share</strong> in Safari & select <strong>Add to Home Screen</strong></span>
              </div>
            ) : deferredPrompt ? (
              <button
                onClick={handleInstallClick}
                className="mt-3 btn-primary text-xs py-1.5 px-3 w-full sm:w-auto font-bold shadow-sm justify-center"
              >
                <Download className="w-4 h-4" />
                <span>Install App on Device</span>
              </button>
            ) : null}
          </div>

          <button
            onClick={handleDismiss}
            className="absolute top-2.5 right-2.5 p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
            title="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
