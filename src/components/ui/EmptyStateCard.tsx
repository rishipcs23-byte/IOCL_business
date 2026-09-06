'use client';

import React from 'react';
import { Database, Plus } from 'lucide-react';

interface EmptyStateCardProps {
  title: string;
  description: string;
  actionText?: string;
  onActionClick?: () => void;
  icon?: React.ElementType;
}

export default function EmptyStateCard({
  title,
  description,
  actionText,
  onActionClick,
  icon: IconComponent = Database
}: EmptyStateCardProps) {
  return (
    <div className="google-card border-dashed p-8 text-center flex flex-col items-center justify-center my-6 max-w-lg mx-auto shadow-sm">
      <div className="p-3.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl mb-4 border border-slate-200 dark:border-slate-700">
        <IconComponent className="w-7 h-7" />
      </div>
      <h4 className="text-base font-bold text-[var(--text-primary)] mb-1">{title}</h4>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-5 leading-relaxed font-medium">{description}</p>
      {actionText && onActionClick && (
        <button
          onClick={onActionClick}
          className="btn-primary text-xs"
        >
          <Plus className="w-4 h-4" /> {actionText}
        </button>
      )}
    </div>
  );
}
