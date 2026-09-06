/**
 * Petroleum Bunk Management System - Standardized Formatting Utilities
 */

/**
 * Format currency in Indian Rupees format (e.g. ₹20,000.00)
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return '₹0.00';
  }
  const val = Number(amount);
  return `₹${val.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format fuel litres volume (e.g. 12,000.00 L)
 */
export function formatLitres(litres: number | null | undefined, showUnit = true): string {
  if (litres === null || litres === undefined || isNaN(Number(litres))) {
    return showUnit ? '0.00 L' : '0.00';
  }
  const val = Number(litres);
  const formatted = val.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return showUnit ? `${formatted} L` : formatted;
}

/**
 * Format rate per litre (e.g. ₹96.72/L)
 */
export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || isNaN(Number(rate))) {
    return '₹0.00/L';
  }
  const val = Number(rate);
  return `₹${val.toFixed(2)}/L`;
}

/**
 * Format Indian date string (e.g. 02 Sep 2026)
 */
export function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '-';
  }
}

/**
 * Format Indian date and time string (e.g. 02 Sep 2026, 06:30 PM)
 */
export function formatDateTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '-';
  }
}
