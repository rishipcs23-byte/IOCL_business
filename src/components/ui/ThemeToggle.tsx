'use client';

import React from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme, ThemeMode } from '@/lib/ThemeContext';

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

export function ThemeToggle({ compact = false, className = '' }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();

  if (compact) {
    return (
      <button
        onClick={toggleTheme}
        type="button"
        title={`Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
        className={`p-2 rounded-xl border transition-all duration-200 flex items-center justify-center ${
          resolvedTheme === 'dark'
            ? 'bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700 hover:text-amber-200'
            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-blue-600 shadow-sm'
        } ${className}`}
      >
        {resolvedTheme === 'dark' ? (
          <Sun className="h-4 w-4 transition-transform duration-300 rotate-0 hover:rotate-45" />
        ) : (
          <Moon className="h-4 w-4 transition-transform duration-300 rotate-0 hover:-rotate-12" />
        )}
      </button>
    );
  }

  return (
    <div className={`inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold ${className}`}>
      <button
        onClick={() => setTheme('light')}
        type="button"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all ${
          theme === 'light'
            ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm font-bold'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <Sun className="h-3.5 w-3.5" />
        <span>Light</span>
      </button>

      <button
        onClick={() => setTheme('dark')}
        type="button"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all ${
          theme === 'dark'
            ? 'bg-slate-700 text-amber-300 shadow-sm font-bold'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <Moon className="h-3.5 w-3.5" />
        <span>Dark</span>
      </button>

      <button
        onClick={() => setTheme('system')}
        type="button"
        title="Follow System Theme"
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all ${
          theme === 'system'
            ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm font-bold'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <Laptop className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
