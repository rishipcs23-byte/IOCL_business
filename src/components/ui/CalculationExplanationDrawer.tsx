'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Calculator, HelpCircle } from 'lucide-react';

interface CalculationItem {
  label: string;
  amount: number;
  type: 'add' | 'subtract' | 'result';
  note?: string;
}

interface CalculationExplanationDrawerProps {
  title: string;
  finalValue: string | number;
  items: CalculationItem[];
  defaultOpen?: boolean;
}

export default function CalculationExplanationDrawer({
  title,
  finalValue,
  items,
  defaultOpen = false
}: CalculationExplanationDrawerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="google-card overflow-hidden transition-all my-3">
      {/* Header Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-200 dark:border-blue-800">
            <Calculator className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{title}</div>
            <div className="text-lg font-bold text-[var(--text-primary)]">{finalValue}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs font-semibold">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>{isOpen ? 'Hide Breakdown' : 'How is this calculated?'}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded Breakdown */}
      {isOpen && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-2 text-xs">
            {items.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between p-2.5 rounded-xl ${
                  item.type === 'result'
                    ? 'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/40 font-bold text-blue-700 dark:text-blue-300'
                    : 'bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                      item.type === 'add'
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                        : item.type === 'subtract'
                        ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                        : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                    }`}
                  >
                    {item.type === 'add' ? '+' : item.type === 'subtract' ? '-' : '='}
                  </span>
                  <div>
                    <span className="text-[var(--text-primary)] font-medium">{item.label}</span>
                    {item.note && <span className="text-slate-400 text-xs ml-2">({item.note})</span>}
                  </div>
                </div>

                <span
                  className={`font-mono ${
                    item.type === 'add'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : item.type === 'subtract'
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-blue-700 dark:text-blue-300 font-bold'
                  }`}
                >
                  ₹{Number(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
