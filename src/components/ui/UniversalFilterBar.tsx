'use client';

import React from 'react';
import { Search, Filter, X, Calendar, SlidersHorizontal, RefreshCw } from 'lucide-react';

export interface FilterState {
  searchQuery: string;
  dateShortcut: 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';
  startDate: string;
  endDate: string;
  staffId: string;
  fuelType: string;
  pumpId: string;
  paymentType: string;
}

interface UniversalFilterBarProps {
  filters: FilterState;
  onFilterChange: (updated: Partial<FilterState>) => void;
  onClearFilters: () => void;
  staffList?: { id: string; name: string }[];
  pumpsList?: { id: string; name: string }[];
  resultCount?: number;
  showStaffFilter?: boolean;
  showFuelFilter?: boolean;
  showPumpFilter?: boolean;
  showPaymentFilter?: boolean;
  placeholderText?: string;
}

export default function UniversalFilterBar({
  filters,
  onFilterChange,
  onClearFilters,
  staffList = [],
  pumpsList = [],
  resultCount,
  showStaffFilter = true,
  showFuelFilter = true,
  showPumpFilter = false,
  showPaymentFilter = false,
  placeholderText = 'Search staff, duty #, customer...'
}: UniversalFilterBarProps) {
  // Quick date shortcut helper
  const handleShortcutClick = (shortcut: FilterState['dateShortcut']) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (shortcut === 'all') {
      onFilterChange({ dateShortcut: 'all', startDate: '', endDate: '' });
      return;
    }

    if (shortcut === 'today') {
      onFilterChange({ dateShortcut: 'today', startDate: todayStr, endDate: todayStr });
      return;
    }

    if (shortcut === 'yesterday') {
      const yest = new Date(today);
      yest.setDate(yest.getDate() - 1);
      const yestStr = yest.toISOString().split('T')[0];
      onFilterChange({ dateShortcut: 'yesterday', startDate: yestStr, endDate: yestStr });
      return;
    }

    if (shortcut === 'this_week') {
      const first = today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1);
      const firstDay = new Date(today.setDate(first)).toISOString().split('T')[0];
      const nowStr = new Date().toISOString().split('T')[0];
      onFilterChange({ dateShortcut: 'this_week', startDate: firstDay, endDate: nowStr });
      return;
    }

    if (shortcut === 'this_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const nowStr = new Date().toISOString().split('T')[0];
      onFilterChange({ dateShortcut: 'this_month', startDate: firstDay, endDate: nowStr });
      return;
    }

    if (shortcut === 'custom') {
      onFilterChange({ dateShortcut: 'custom' });
    }
  };

  const isFiltered =
    filters.searchQuery !== '' ||
    filters.dateShortcut !== 'all' ||
    filters.startDate !== '' ||
    filters.endDate !== '' ||
    filters.staffId !== '' ||
    filters.fuelType !== '' ||
    filters.pumpId !== '' ||
    filters.paymentType !== '';

  return (
    <div className="google-card p-5 mb-6 shadow-sm space-y-4">
      {/* Top Search & Shortcuts Row */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
            placeholder={placeholderText}
            className="google-input w-full pl-10 pr-8 py-2.5 text-sm"
          />
          {filters.searchQuery && (
            <button
              onClick={() => onFilterChange({ searchQuery: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Date Shortcuts Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[var(--bg-surface-secondary)] p-1.5 rounded-xl border border-[var(--border-color)]">
          {[
            { key: 'all', label: 'All Time' },
            { key: 'today', label: 'Today' },
            { key: 'yesterday', label: 'Yesterday' },
            { key: 'this_week', label: 'This Week' },
            { key: 'this_month', label: 'This Month' },
            { key: 'custom', label: 'Custom' },
          ].map((sc) => (
            <button
              key={sc.key}
              type="button"
              onClick={() => handleShortcutClick(sc.key as any)}
              className={`px-3.5 py-1.5 text-sm font-semibold rounded-lg transition-all ${
                filters.dateShortcut === sc.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              {sc.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Dropdowns Row */}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--border-color)] text-sm">
        {/* Custom Date Pickers */}
        {filters.dateShortcut === 'custom' && (
          <div className="flex items-center gap-2 bg-[var(--bg-surface-secondary)] px-3.5 py-2 rounded-xl border border-[var(--border-color)]">
            <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => onFilterChange({ startDate: e.target.value })}
              className="bg-transparent text-[var(--text-primary)] outline-none text-sm font-medium"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => onFilterChange({ endDate: e.target.value })}
              className="bg-transparent text-[var(--text-primary)] outline-none text-sm font-medium"
            />
          </div>
        )}

        {/* Staff Filter */}
        {showStaffFilter && (
          <select
            value={filters.staffId}
            onChange={(e) => onFilterChange({ staffId: e.target.value })}
            className="google-input py-2 text-sm font-medium"
          >
            <option value="">All Staff</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        {/* Fuel Filter */}
        {showFuelFilter && (
          <select
            value={filters.fuelType}
            onChange={(e) => onFilterChange({ fuelType: e.target.value })}
            className="google-input py-2 text-sm font-medium"
          >
            <option value="">All Fuel Types</option>
            <option value="MS">MS (Petrol)</option>
            <option value="HSD">HSD (Diesel)</option>
          </select>
        )}

        {/* Pump Filter */}
        {showPumpFilter && (
          <select
            value={filters.pumpId}
            onChange={(e) => onFilterChange({ pumpId: e.target.value })}
            className="google-input py-2 text-sm font-medium"
          >
            <option value="">All Pumps</option>
            {pumpsList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        {/* Payment Filter */}
        {showPaymentFilter && (
          <select
            value={filters.paymentType}
            onChange={(e) => onFilterChange({ paymentType: e.target.value })}
            className="google-input py-2 text-sm font-medium"
          >
            <option value="">All Payment Modes</option>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI / Digital</option>
            <option value="CREDIT">Customer Credit</option>
          </select>
        )}

        {/* Result Indicator & Clear Button */}
        <div className="ml-auto flex items-center gap-3">
          {resultCount !== undefined && (
            <span className="text-[var(--text-secondary)] font-semibold text-xs md:text-sm bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border-color)]">
              {resultCount} {resultCount === 1 ? 'result' : 'results'}
            </span>
          )}

          {isFiltered && (
            <button
              type="button"
              onClick={onClearFilters}
              className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold hover:bg-blue-50 dark:hover:bg-blue-950/50 px-3 py-1.5 rounded-lg transition-colors border border-blue-200 dark:border-blue-800 text-xs md:text-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Date Banner Status */}
      {(filters.startDate || filters.endDate) && (
        <div className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-2 flex items-center justify-between">
          <span>
            Showing results for:{' '}
            <strong className="font-bold text-[var(--text-primary)]">
              {filters.startDate || 'Beginning'} → {filters.endDate || 'Today'}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}
