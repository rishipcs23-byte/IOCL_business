'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 max-w-md w-full shadow-2xl space-y-4">
        <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto mb-2 text-2xl font-bold">
          ⚠️
        </div>
        <h2 className="text-xl font-bold text-slate-100">Something went wrong</h2>
        <p className="text-sm text-slate-400">
          {error?.message || 'An unexpected error occurred while loading this page.'}
        </p>
        {error?.digest && (
          <p className="text-xs font-mono text-slate-500 bg-slate-950 p-2 rounded">
            Error Digest: {error.digest}
          </p>
        )}
        <div className="pt-4 flex justify-center gap-3">
          <button
            onClick={() => reset()}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-sm transition-all shadow-md"
          >
            Try Again
          </button>
          <a
            href="/login"
            className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium rounded-lg text-sm transition-all"
          >
            Go to Login
          </a>
        </div>
      </div>
    </div>
  );
}
