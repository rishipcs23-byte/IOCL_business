'use client';

import React, { useState } from 'react';
import { Info, X } from 'lucide-react';

interface ContextHelpTooltipProps {
  term: string;
  explanation: string;
  formula?: string;
  example?: string;
  badgeText?: string;
}

export default function ContextHelpTooltip({
  term,
  explanation,
  formula,
  example,
  badgeText = 'Help Guide'
}: ContextHelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span className="inline-flex items-center ml-1.5 relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="inline-flex items-center justify-center text-slate-400 hover:text-sky-400 transition-colors p-0.5 rounded-full hover:bg-slate-800"
        title={`What is ${term}? Click for simple explanation`}
      >
        <Info className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="bg-slate-900 border border-slate-700/80 rounded-2xl p-5 max-w-md w-full shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="bg-sky-500/10 text-sky-400 text-xs px-2.5 py-1 rounded-full font-medium border border-sky-500/20">
                  {badgeText}
                </span>
                <h4 className="font-semibold text-slate-100 text-base">{term}</h4>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-300 text-sm leading-relaxed mb-4">{explanation}</p>

            {formula && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 mb-3">
                <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">Formula</div>
                <div className="text-xs font-mono text-emerald-400 whitespace-pre-line">{formula}</div>
              </div>
            )}

            {example && (
              <div className="bg-sky-950/30 border border-sky-900/30 rounded-xl p-3 mb-4">
                <div className="text-xs uppercase tracking-wider text-sky-400 font-semibold mb-1">Example</div>
                <div className="text-xs text-slate-300">{example}</div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs rounded-xl transition-colors"
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
