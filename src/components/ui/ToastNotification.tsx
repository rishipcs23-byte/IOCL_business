'use client';

import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, X, Info } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title?: string;
  message: string;
}

interface ToastNotificationProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export default function ToastNotification({ toasts, onDismiss }: ToastNotificationProps) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full px-4 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start p-4 rounded-2xl shadow-lg border transition-all duration-300 transform translate-y-0 animate-in slide-in-from-bottom-5 bg-white ${
            toast.type === 'success'
              ? 'border-emerald-200 text-slate-900'
              : toast.type === 'error'
              ? 'border-red-200 text-slate-900'
              : 'border-slate-200 text-slate-900'
          }`}
        >
          <div className="mr-3 mt-0.5 shrink-0">
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
            {toast.type === 'info' && <Info className="w-5 h-5 text-blue-600" />}
          </div>
          <div className="flex-1 pr-2">
            {toast.title && <div className="font-bold text-xs mb-0.5 text-slate-900">{toast.title}</div>}
            <div className="text-xs leading-relaxed text-slate-600 font-medium">{toast.message}</div>
          </div>
          <button
            onClick={() => onDismiss(toast.id)}
            className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded-lg"
            aria-label="Close notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
