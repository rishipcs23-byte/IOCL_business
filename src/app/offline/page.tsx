"use client";

import React, { useState, useEffect } from "react";
import { WifiOff, RotateCw, Fuel, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function OfflinePage() {
  const [isRetrying, setIsRetrying] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleRetry = () => {
    setIsRetrying(true);
    setTimeout(() => {
      if (navigator.onLine) {
        window.location.href = "/dashboard";
      } else {
        setIsRetrying(false);
      }
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full google-card text-center p-8 space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
          <WifiOff className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-sm">
            <Fuel className="w-4 h-4" />
            <span>IOCL Petrol Bunk Accounting</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">You are offline</h1>
          <p className="text-[var(--text-secondary)] text-sm">
            {isOnline
              ? "Connection restored! Click below to return to your dashboard."
              : "No internet connection detected. Please check your mobile data or Wi-Fi to sync latest shift sales and tank dips."}
          </p>
        </div>

        <div className="pt-2 flex flex-col gap-3">
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="btn-primary w-full justify-center py-3 font-semibold shadow-md transition-all active:scale-[0.99] disabled:opacity-50"
          >
            <RotateCw className={`w-4 h-4 ${isRetrying ? "animate-spin" : ""}`} />
            <span>{isRetrying ? "Checking Connection..." : "Retry Connection"}</span>
          </button>

          <Link
            href="/dashboard"
            className="btn-secondary w-full justify-center py-2.5 text-sm font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Main Menu</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
