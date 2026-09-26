'use client';

import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet, Filter, Search, Calendar, UserCheck, ArrowRight,
  TrendingUp, Download, Plus, DollarSign, Clock, ShieldCheck,
  CreditCard, Building2, Trash2, Edit3, X, CheckCircle2, AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  addCreditTransactionAction,
  updateCreditTransactionAction,
  deleteCreditTransactionAction
} from '@/lib/actions';

interface OwnerCreditLedgerProps {
  creditLedger: any[];
  staticData: any;
  historicalDuties: any[];
  onRefresh: () => Promise<void>;
  flashMessage: (msg: string, type: 'success' | 'error') => void;
}

export default function OwnerCreditLedger({
  creditLedger,
  staticData,
  historicalDuties,
  onRefresh,
  flashMessage
}: OwnerCreditLedgerProps) {
  const statementRef = useRef<HTMLDivElement>(null);

  // Filters
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('ALL');
  const [periodType, setPeriodType] = useState<'ALL' | 'SINGLE_DATE' | 'DATE_RANGE' | 'MONTH' | 'YEAR'>('ALL');
  const [singleDate, setSingleDate] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [transactionType, setTransactionType] = useState<'ALL' | 'CREDIT_SALE' | 'COLLECTION'>('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('ALL');
  const [productFilter, setProductFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const handleViewStatement = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setSearchTerm('');
    setTimeout(() => {
      statementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  // Collect Credit Payment Modal State
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [collectCustomerId, setCollectCustomerId] = useState('');
  const [collectAmount, setCollectAmount] = useState<number | ''>('');
  const [collectMethod, setCollectMethod] = useState<string>('CASH');
  const [collectRef, setCollectRef] = useState('');
  const [collectBank, setCollectBank] = useState('');
  const [collectDate, setCollectDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [collectRemarks, setCollectRemarks] = useState('');
  const [isSubmittingCollect, setIsSubmittingCollect] = useState(false);

  // Edit Collection Modal State
  const [editingTx, setEditingTx] = useState<any | null>(null);
  const [editAmount, setEditAmount] = useState<number | ''>('');
  const [editMethod, setEditMethod] = useState<string>('CASH');
  const [editRef, setEditRef] = useState('');
  const [editBank, setEditBank] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const customers = staticData?.customers || [];

  // Flatten all transactions across customers
  const allTransactions: Array<{
    id: string;
    customerId: string;
    customerName: string;
    timestamp: string;
    dutyNumber: string;
    indentNumber: string;
    productName: string;
    quantity: number | null;
    unitPrice: number | null;
    amount: number;
    transactionType: 'CREDIT_SALE' | 'COLLECTION';
    description: string | null;
    paymentMethod: string | null;
    paymentReference: string | null;
    bankName: string | null;
    paymentDate: string | null;
  }> = [];

  for (const c of creditLedger) {
    for (const t of c.transactions || []) {
      allTransactions.push({
        ...t,
        customerId: c.id,
        customerName: c.name,
        dutyNumber: t.dutySession ? `#${t.dutySession.dutyNumber}` : 'Direct',
      });
    }
  }

  // Filter transactions
  const filteredTransactions = allTransactions.filter(t => {
    if (selectedCustomerId !== 'ALL' && t.customerId !== selectedCustomerId) return false;
    if (transactionType !== 'ALL' && t.transactionType !== transactionType) return false;

    // Payment Method filter for collections
    if (paymentMethodFilter !== 'ALL') {
      if (t.transactionType === 'COLLECTION') {
        const method = (t.paymentMethod || 'CASH').toUpperCase();
        if (method !== paymentMethodFilter) return false;
      } else {
        return false;
      }
    }

    if (productFilter !== 'ALL' && (!t.productName || !t.productName.toLowerCase().includes(productFilter.toLowerCase()))) return false;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = t.customerName.toLowerCase().includes(q);
      const matchIndent = t.indentNumber && t.indentNumber.toLowerCase().includes(q);
      const matchProd = t.productName && t.productName.toLowerCase().includes(q);
      const matchRef = t.paymentReference && t.paymentReference.toLowerCase().includes(q);
      const matchBank = t.bankName && t.bankName.toLowerCase().includes(q);
      const matchDesc = t.description && t.description.toLowerCase().includes(q);
      if (!matchName && !matchIndent && !matchProd && !matchRef && !matchBank && !matchDesc) return false;
    }

    const tDateStr = new Date(t.timestamp).toLocaleDateString('en-CA');
    const tMonthStr = tDateStr.slice(0, 7);
    const tYearStr = tDateStr.slice(0, 4);

    if (periodType === 'SINGLE_DATE' && singleDate && tDateStr !== singleDate) return false;
    if (periodType === 'DATE_RANGE') {
      if (startDate && tDateStr < startDate) return false;
      if (endDate && tDateStr > endDate) return false;
    }
    if (periodType === 'MONTH' && selectedMonth && tMonthStr !== selectedMonth) return false;
    if (periodType === 'YEAR' && selectedYear && tYearStr !== selectedYear) return false;

    return true;
  });

  // Calculate Filtered Customers
  const filteredCustomers = customers.filter((cust: any) => {
    if (selectedCustomerId !== 'ALL' && cust.id !== selectedCustomerId) return false;

    const hasTxFilters = periodType !== 'ALL' || transactionType !== 'ALL' || paymentMethodFilter !== 'ALL' || productFilter !== 'ALL';
    const hasMatchingTx = filteredTransactions.some(t => t.customerId === cust.id);

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = cust.name.toLowerCase().includes(q) || (cust.phone && cust.phone.includes(q));
      if (!matchName && !hasMatchingTx) return false;
    } else if (hasTxFilters && !hasMatchingTx) {
      return false;
    }

    return true;
  });

  // Calculate Customer Summaries (2A)
  const customerSummaries = filteredCustomers.map((cust: any) => {
    const custLedgerItem = creditLedger.find((cl: any) => cl.id === cust.id);
    const txs = custLedgerItem?.transactions || [];

    const totalCreditSales = txs.filter((t: any) => t.transactionType === 'CREDIT_SALE').reduce((sum: number, t: any) => sum + t.amount, 0);
    const totalCollections = txs.filter((t: any) => t.transactionType === 'COLLECTION').reduce((sum: number, t: any) => sum + t.amount, 0);
    const openingBalance = cust.balance - totalCreditSales + totalCollections;

    // Use filteredTransactions directly so it matches the global page filters
    const matchingTxs = filteredTransactions.filter(t => t.customerId === cust.id);
    const periodCreditGiven = matchingTxs.filter((t: any) => t.transactionType === 'CREDIT_SALE').reduce((sum: number, t: any) => sum + t.amount, 0);
    const periodCollections = matchingTxs.filter((t: any) => t.transactionType === 'COLLECTION').reduce((sum: number, t: any) => sum + t.amount, 0);

    return {
      id: cust.id,
      name: cust.name,
      phone: cust.phone,
      openingBalance: openingBalance,
      creditGiven: periodCreditGiven,
      collections: periodCollections,
      currentBalance: cust.balance,
    };
  });

  // Calculate Sequential Running Balance for Customer Statement (Strictly Oldest -> Newest/Latest at Bottom)
  const selectedCustomerObj = customers.find((c: any) => c.id === selectedCustomerId);
  const selectedCustSummary = customerSummaries.find((cs: any) => cs.id === selectedCustomerId);
  
  let runningBalance = selectedCustSummary ? selectedCustSummary.openingBalance : 0;

  // Strictly sort transactions by date and time ASCENDING (oldest first, newest/latest at bottom)
  const chronologicalTxs = [...filteredTransactions].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    if (timeA !== timeB) return timeA - timeB;

    const createA = (a as any).createdAt ? new Date((a as any).createdAt).getTime() : 0;
    const createB = (b as any).createdAt ? new Date((b as any).createdAt).getTime() : 0;
    if (createA !== createB) return createA - createB;

    return (a.id || '').localeCompare(b.id || '');
  });

  const detailedTxsWithRunningBalance = chronologicalTxs.map((t) => {
    if (t.transactionType === 'CREDIT_SALE') {
      runningBalance += t.amount;
    } else {
      runningBalance -= t.amount;
    }
    return { ...t, runningBalance: Number(runningBalance.toFixed(2)) };
  });

  // Method Breakdown for Collections
  const collectionTxs = filteredTransactions.filter(t => t.transactionType === 'COLLECTION');
  const cashCollections = collectionTxs.filter(t => (t.paymentMethod || 'CASH') === 'CASH').reduce((sum, t) => sum + t.amount, 0);
  const chequeCollections = collectionTxs.filter(t => t.paymentMethod === 'CHEQUE').reduce((sum, t) => sum + t.amount, 0);
  const rtgsCollections = collectionTxs.filter(t => t.paymentMethod === 'RTGS').reduce((sum, t) => sum + t.amount, 0);
  const neftCollections = collectionTxs.filter(t => t.paymentMethod === 'NEFT').reduce((sum, t) => sum + t.amount, 0);
  const upiCollections = collectionTxs.filter(t => t.paymentMethod === 'UPI').reduce((sum, t) => sum + t.amount, 0);
  const bankCollections = collectionTxs.filter(t => t.paymentMethod === 'BANK_TRANSFER').reduce((sum, t) => sum + t.amount, 0);
  const otherCollections = collectionTxs.filter(t => t.paymentMethod === 'OTHER').reduce((sum, t) => sum + t.amount, 0);

  // Export to Excel (2E)
  const handleExportExcel = () => {
    try {
      const exportData = detailedTxsWithRunningBalance.map(t => ({
        'Date & Time': new Date(t.timestamp).toLocaleString(),
        'Customer': t.customerName,
        'Duty': t.dutyNumber,
        'Type': t.transactionType === 'CREDIT_SALE' ? 'Credit Sale' : 'Collection',
        'Payment Method': t.transactionType === 'COLLECTION' ? (t.paymentMethod || 'CASH') : '-',
        'Reference / Cheque # / UTR': t.paymentReference || t.indentNumber || '-',
        'Bank Name': t.bankName || '-',
        'Cheque / Txn Date': t.paymentDate ? new Date(t.paymentDate).toLocaleDateString() : '-',
        'Product': t.productName || '-',
        'Litres / Qty': t.quantity || '-',
        'Rate (₹)': t.unitPrice ? `₹${t.unitPrice}` : '-',
        'Credit Sale (₹)': t.transactionType === 'CREDIT_SALE' ? t.amount : 0,
        'Collection (₹)': t.transactionType === 'COLLECTION' ? t.amount : 0,
        'Running Balance (₹)': t.runningBalance,
        'Remarks': t.description || '-',
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Credit_Ledger');
      const filename = selectedCustomerObj ? `${selectedCustomerObj.name.replace(/[^a-zA-Z0-9]/g, '_')}_Ledger.xlsx` : 'All_Customers_Credit_Ledger.xlsx';
      XLSX.writeFile(wb, filename);
      flashMessage('Credit Ledger exported to Excel successfully!', 'success');
    } catch (e) {
      flashMessage('Failed to export to Excel', 'error');
    }
  };

  // Aggregated Period Totals (2D)
  const totalPeriodCreditGiven = filteredTransactions.filter(t => t.transactionType === 'CREDIT_SALE').reduce((sum, t) => sum + t.amount, 0);
  const totalPeriodCollections = filteredTransactions.filter(t => t.transactionType === 'COLLECTION').reduce((sum, t) => sum + t.amount, 0);
  const totalOutstandingReceivable = filteredCustomers.reduce((sum: number, c: any) => sum + c.balance, 0);

  // Open Record Credit Collection Modal
  const openCollectModal = (cust = customers[0]) => {
    if (cust) {
      setCollectCustomerId(cust.id);
    } else if (customers.length > 0) {
      setCollectCustomerId(customers[0].id);
    }
    setCollectAmount('');
    setCollectMethod('CASH');
    setCollectRef('');
    setCollectBank('');
    setCollectDate(new Date().toISOString().slice(0, 10));
    setCollectRemarks('');
    setIsCollectModalOpen(true);
  };

  // Submit Collect Credit Payment Form
  const handleCollectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingCollect) return;

    if (!collectCustomerId) {
      flashMessage('Please select a customer account.', 'error');
      return;
    }

    const numAmount = Number(collectAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      flashMessage('Please enter a valid collection amount (₹).', 'error');
      return;
    }

    const selectedCust = customers.find((c: any) => c.id === collectCustomerId);
    if (selectedCust && selectedCust.balance > 0 && numAmount > selectedCust.balance + 0.01) {
      flashMessage(`Collection amount (₹${numAmount.toLocaleString('en-IN')}) cannot exceed customer's outstanding balance (₹${selectedCust.balance.toLocaleString('en-IN')}).`, 'error');
      return;
    }

    const methodUpper = collectMethod.toUpperCase();
    if (methodUpper === 'CHEQUE') {
      if (!collectRef.trim()) {
        flashMessage('Please enter the Cheque Number.', 'error');
        return;
      }
      if (!collectDate) {
        flashMessage('Please select the Cheque Date.', 'error');
        return;
      }
    } else if (['RTGS', 'NEFT', 'UPI', 'BANK_TRANSFER'].includes(methodUpper)) {
      if (!collectRef.trim()) {
        flashMessage(`Please enter the UTR / Reference Number for ${methodUpper} payment.`, 'error');
        return;
      }
    }

    setIsSubmittingCollect(true);
    try {
      const res = await addCreditTransactionAction(
        'NONE',
        collectCustomerId,
        'COLLECTION',
        numAmount,
        undefined,
        `${methodUpper} COLLECTION`,
        undefined,
        undefined,
        collectRemarks ? collectRemarks.trim() : undefined,
        methodUpper,
        collectRef ? collectRef.trim() : undefined,
        collectBank ? collectBank.trim() : undefined,
        collectDate ? collectDate : undefined
      );

      if (res && res.success) {
        flashMessage('Payment collected successfully', 'success');
        setIsCollectModalOpen(false);
        await onRefresh();
      } else {
        throw new Error('Transaction failed');
      }
    } catch (err: any) {
      flashMessage(err.message || 'Failed to record payment collection', 'error');
    } finally {
      setIsSubmittingCollect(false);
    }
  };

  // Open Edit Collection Modal
  const openEditModal = (t: any) => {
    setEditingTx(t);
    setEditAmount(t.amount);
    setEditMethod(t.paymentMethod || 'CASH');
    setEditRef(t.paymentReference || '');
    setEditBank(t.bankName || '');
    setEditDate(t.paymentDate ? new Date(t.paymentDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setEditRemarks(t.description || '');
  };

  // Submit Edit Collection Form
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx || isSubmittingEdit) return;

    const numAmount = Number(editAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      flashMessage('Please enter a valid collection amount.', 'error');
      return;
    }

    const methodUpper = editMethod.toUpperCase();
    if (methodUpper === 'CHEQUE' && !editRef.trim()) {
      flashMessage('Please enter Cheque Number.', 'error');
      return;
    }
    if (['RTGS', 'NEFT', 'UPI', 'BANK_TRANSFER'].includes(methodUpper) && !editRef.trim()) {
      flashMessage(`Please enter UTR / Reference Number for ${methodUpper}.`, 'error');
      return;
    }

    setIsSubmittingEdit(true);
    try {
      const res = await updateCreditTransactionAction(
        editingTx.id,
        numAmount,
        methodUpper,
        editRef ? editRef.trim() : undefined,
        editBank ? editBank.trim() : undefined,
        editDate ? editDate : undefined,
        editRemarks ? editRemarks.trim() : undefined
      );

      if (res && res.success) {
        flashMessage('Collection updated successfully', 'success');
        setEditingTx(null);
        await onRefresh();
      }
    } catch (err: any) {
      flashMessage(err.message || 'Failed to update collection', 'error');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Handle Delete Credit Transaction with Explicit Balance Confirmation
  const handleDeleteTx = async (t: any) => {
    const isCollection = t.transactionType === 'COLLECTION';
    const amountStr = `₹${t.amount.toLocaleString('en-IN')}`;
    const methodStr = t.paymentMethod || 'Collection';

    const confirmMsg = isCollection
      ? `Delete this ${amountStr} ${methodStr} collection?\nThe customer's outstanding balance will increase by ${amountStr}.`
      : `Delete this ${amountStr} credit transaction?`;

    if (!confirm(confirmMsg)) return;

    try {
      const res = await deleteCreditTransactionAction(t.id);
      if (res && res.success) {
        flashMessage(isCollection ? 'Collection deleted. Customer balance updated.' : 'Credit transaction deleted.', 'success');
        await onRefresh();
      }
    } catch (err: any) {
      flashMessage(err.message || 'Failed to delete transaction', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER BANNER - Google Style */}
      <div className="google-hero p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0 shadow-sm">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-extrabold text-[var(--text-primary)] tracking-tight">Credit Ledger &amp; Accounts Receivable</h2>
            <p className="text-xs md:text-sm text-[var(--text-muted)] font-medium mt-0.5">Track customer outstanding balances, credit sales, and payment collections</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => openCollectModal()}
            className="btn-primary py-2.5 text-sm md:text-base font-bold"
          >
            <Plus className="h-4 w-4" />
            + Record Credit Collection
          </button>
          <button
            onClick={handleExportExcel}
            className="btn-secondary py-2.5 text-sm md:text-base font-bold"
          >
            <Download className="h-4 w-4 text-[var(--text-muted)]" />
            Export Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* SUMMARY STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="google-card p-5 shadow-sm">
          <span className="text-xs md:text-sm text-[var(--text-muted)] font-bold uppercase tracking-wider block">Total Outstanding Receivable</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl md:text-3xl font-extrabold text-rose-600 dark:text-rose-400 font-mono">₹{totalOutstandingReceivable.toLocaleString('en-IN')}</span>
            <span className="text-xs md:text-sm text-[var(--text-secondary)] font-semibold">{filteredCustomers.length} Accounts</span>
          </div>
        </div>

        <div className="google-card p-5 shadow-sm">
          <span className="text-xs md:text-sm text-[var(--text-muted)] font-bold uppercase tracking-wider block">Period Credit Given</span>
          <div className="mt-2">
            <span className="text-2xl md:text-3xl font-extrabold text-amber-600 dark:text-amber-400 font-mono">₹{totalPeriodCreditGiven.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className="google-card p-5 shadow-sm">
          <span className="text-xs md:text-sm text-[var(--text-muted)] font-bold uppercase tracking-wider block">Period Collections Received</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl md:text-3xl font-extrabold text-[var(--success-text)] font-mono">₹{totalPeriodCollections.toLocaleString('en-IN')}</span>
            <span className="text-xs md:text-sm text-[var(--text-secondary)] font-semibold">{collectionTxs.length} Txns</span>
          </div>

          {/* Breakdown Pills */}
          {totalPeriodCollections > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--border-color)] flex flex-wrap gap-1.5 text-xs">
              {cashCollections > 0 && <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 rounded-md font-mono font-bold border border-emerald-200 dark:border-emerald-800">Cash: ₹{cashCollections.toLocaleString('en-IN')}</span>}
              {chequeCollections > 0 && <span className="bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-md font-mono font-bold border border-blue-200 dark:border-blue-800">Cheque: ₹{chequeCollections.toLocaleString('en-IN')}</span>}
              {rtgsCollections > 0 && <span className="bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 px-2.5 py-1 rounded-md font-mono font-bold border border-purple-200 dark:border-purple-800">RTGS: ₹{rtgsCollections.toLocaleString('en-IN')}</span>}
              {neftCollections > 0 && <span className="bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 px-2.5 py-1 rounded-md font-mono font-bold border border-cyan-200 dark:border-cyan-800">NEFT: ₹{neftCollections.toLocaleString('en-IN')}</span>}
              {upiCollections > 0 && <span className="bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 px-2.5 py-1 rounded-md font-mono font-bold border border-amber-200 dark:border-amber-800">UPI: ₹{upiCollections.toLocaleString('en-IN')}</span>}
              {bankCollections > 0 && <span className="bg-[var(--bg-surface-secondary)] text-[var(--text-primary)] px-2.5 py-1 rounded-md font-mono font-bold border border-[var(--border-color)]">Bank: ₹{bankCollections.toLocaleString('en-IN')}</span>}
              {otherCollections > 0 && <span className="bg-[var(--bg-surface-secondary)] text-[var(--text-primary)] px-2.5 py-1 rounded-md font-mono font-bold border border-[var(--border-color)]">Other: ₹{otherCollections.toLocaleString('en-IN')}</span>}
            </div>
          )}
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
          <Filter className="h-4 w-4 text-blue-600" />
          Filter Controls &amp; Method Selector
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {/* Customer Dropdown */}
          <div>
            <label className="text-slate-700 font-semibold block mb-1">Customer / Party:</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 font-medium focus:border-blue-600 outline-none"
            >
              <option value="ALL">All Customers ({customers.length})</option>
              {customers.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} (Bal: ₹{c.balance.toLocaleString('en-IN')})</option>
              ))}
            </select>
          </div>

          {/* Period Type Selector */}
          <div>
            <label className="text-slate-700 font-semibold block mb-1">Period Filter:</label>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as any)}
              className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 font-medium focus:border-blue-600 outline-none"
            >
              <option value="ALL">All Time</option>
              <option value="SINGLE_DATE">Single Date</option>
              <option value="DATE_RANGE">Date Range</option>
              <option value="MONTH">Specific Month</option>
              <option value="YEAR">Specific Year</option>
            </select>
          </div>

          {/* Dynamic Period Inputs */}
          {periodType === 'SINGLE_DATE' && (
            <div>
              <label className="text-slate-700 font-semibold block mb-1">Select Date:</label>
              <input
                type="date"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 font-medium focus:border-blue-600 outline-none"
              />
            </div>
          )}

          {periodType === 'DATE_RANGE' && (
            <>
              <div>
                <label className="text-slate-700 font-semibold block mb-1">From Date:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 font-medium focus:border-blue-600 outline-none"
                />
              </div>
              <div>
                <label className="text-slate-700 font-semibold block mb-1">To Date:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 font-medium focus:border-blue-600 outline-none"
                />
              </div>
            </>
          )}

          {periodType === 'MONTH' && (
            <div>
              <label className="text-slate-700 font-semibold block mb-1">Select Month:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 font-medium focus:border-blue-600 outline-none"
              />
            </div>
          )}

          {periodType === 'YEAR' && (
            <div>
              <label className="text-slate-700 font-semibold block mb-1">Select Year:</label>
              <input
                type="number"
                placeholder="2026"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 font-medium focus:border-blue-600 outline-none"
              />
            </div>
          )}

          {/* Transaction Type Filter */}
          <div>
            <label className="text-slate-700 font-semibold block mb-1">Transaction Type:</label>
            <select
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value as any)}
              className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 font-medium focus:border-blue-600 outline-none"
            >
              <option value="ALL">All Transactions</option>
              <option value="CREDIT_SALE">Credit Sales Only</option>
              <option value="COLLECTION">Collections Only</option>
            </select>
          </div>

          {/* Collection Method Filter */}
          <div>
            <label className="text-slate-700 font-semibold block mb-1">Payment Method:</label>
            <select
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value)}
              className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 font-medium focus:border-blue-600 outline-none"
            >
              <option value="ALL">All Methods</option>
              <option value="CASH">Cash Collections</option>
              <option value="CHEQUE">Cheque</option>
              <option value="RTGS">RTGS</option>
              <option value="NEFT">NEFT</option>
              <option value="UPI">UPI / Digital</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          {/* Search Bar */}
          <div className="md:col-span-2">
            <label className="text-slate-700 font-semibold block mb-1">Search Ref / Cheque / Customer:</label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, indent #, Cheque #, UTR..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl pl-9 pr-3 py-2 text-xs focus:border-blue-600 outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* CUSTOMER LEDGER LIST SUMMARY TABLE */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Customer Ledger Accounts Summary</h3>
            <p className="text-xs text-slate-500 font-medium">Total outstanding balances per registered credit customer account</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="p-3.5">Customer Name</th>
                <th className="p-3.5">Phone / Contact</th>
                <th className="p-3.5 text-right">Credit Given (Period)</th>
                <th className="p-3.5 text-right">Collections (Period)</th>
                <th className="p-3.5 text-right">Current Outstanding</th>
                <th className="p-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {customerSummaries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">No credit customer accounts found.</td>
                </tr>
              ) : (
                customerSummaries.map((cs: any) => (
                  <tr key={cs.id} className={`hover:bg-slate-50/70 transition-colors ${selectedCustomerId === cs.id ? 'bg-blue-50/40' : ''}`}>
                    <td className="p-3.5 font-semibold text-slate-900 flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 border border-blue-200 flex items-center justify-center font-bold text-xs shrink-0">
                        {cs.name.substring(0, 2).toUpperCase()}
                      </div>
                      {cs.name}
                    </td>
                    <td className="p-3.5 text-slate-500 font-mono">{cs.phone || '-'}</td>
                    <td className="p-3.5 text-right font-mono font-semibold text-red-600">₹{cs.creditGiven.toLocaleString('en-IN')}</td>
                    <td className="p-3.5 text-right font-mono font-semibold text-emerald-700">₹{cs.collections.toLocaleString('en-IN')}</td>
                    <td className="p-3.5 text-right font-mono font-bold text-sm text-slate-900">
                      ₹{cs.currentBalance.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleViewStatement(cs.id)}
                          className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold text-xs border border-blue-200 dark:border-blue-800 transition-all shadow-sm flex items-center gap-1"
                        >
                          View Statement
                        </button>
                        <button
                          onClick={() => openCollectModal(cs)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs border border-emerald-200 dark:border-emerald-800 transition-all shadow-sm flex items-center gap-1"
                        >
                          + Collect Payment
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAILED CHRONOLOGICAL CUSTOMER STATEMENT */}
      <div ref={statementRef} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden scroll-mt-6">
        <div className="p-5 border-b border-slate-200 flex flex-wrap justify-between items-center bg-slate-50/50 gap-4">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              Detailed Account Statement {selectedCustomerObj ? `for ${selectedCustomerObj.name}` : '(All Customers)'}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Chronological ledger (Oldest transaction at top → Latest at bottom). Last row balance matches Current Outstanding.
            </p>
          </div>

          {selectedCustomerObj && (
            <div className="flex items-center gap-3">
              <div className="text-right bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] text-slate-500 font-semibold uppercase block">Current Outstanding Balance</span>
                <span className="text-base font-bold text-slate-900 font-mono">₹{selectedCustomerObj.balance.toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="p-3.5">Date &amp; Time</th>
                <th className="p-3.5">Customer</th>
                <th className="p-3.5">Method / Ref</th>
                <th className="p-3.5">Bank / Cheque Date</th>
                <th className="p-3.5">Product / Indent</th>
                <th className="p-3.5 text-right">Qty (L)</th>
                <th className="p-3.5 text-right">Credit Sale (₹)</th>
                <th className="p-3.5 text-right">Collection (₹)</th>
                <th className="p-3.5 text-right">Running Balance (₹)</th>
                <th className="p-3.5">Remarks</th>
                <th className="p-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 font-mono">
              {/* Optional Opening Balance Row */}
              {selectedCustomerObj && selectedCustSummary && (selectedCustSummary.openingBalance > 0 || detailedTxsWithRunningBalance.length === 0) && (
                <tr className="bg-slate-50/80 font-bold border-b border-slate-200">
                  <td className="p-3.5 text-slate-500 font-sans italic">Account Opening</td>
                  <td className="p-3.5 text-slate-900 font-sans">{selectedCustomerObj.name}</td>
                  <td className="p-3.5 text-slate-500 font-sans italic" colSpan={6}>Opening Outstanding Balance (Inception)</td>
                  <td className="p-3.5 text-right font-bold text-slate-900">₹{selectedCustSummary.openingBalance.toLocaleString('en-IN')}</td>
                  <td className="p-3.5 text-slate-500 font-sans text-[11px]" colSpan={2}>Opening Ledger Balance</td>
                </tr>
              )}

              {detailedTxsWithRunningBalance.length === 0 && (!selectedCustomerObj || !selectedCustSummary || selectedCustSummary.openingBalance === 0) ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500 font-sans">No transactions recorded for the selected filter parameters.</td>
                </tr>
              ) : (
                detailedTxsWithRunningBalance.map((t, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3.5 text-slate-500 font-mono" suppressHydrationWarning>{new Date(t.timestamp).toLocaleString()}</td>
                    <td className="p-3.5 font-semibold text-slate-900 font-sans">{t.customerName}</td>
                    <td className="p-3.5 font-sans">
                      {t.transactionType === 'COLLECTION' ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/15 dark:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 font-mono shadow-2xs">
                            {t.paymentMethod || 'CASH'}
                          </span>
                          {t.paymentReference && (
                            <div className="text-[10px] text-slate-600 dark:text-slate-400 font-mono font-semibold">Ref: {t.paymentReference}</div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/15 dark:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 shadow-2xs">
                          CREDIT SALE
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-600 text-[11px] font-sans">
                      {t.bankName && <div className="font-semibold text-slate-800">{t.bankName}</div>}
                      {t.paymentDate && <div className="font-mono text-slate-500">{new Date(t.paymentDate).toLocaleDateString()}</div>}
                      {!t.bankName && !t.paymentDate && '-'}
                    </td>
                    <td className="p-3.5 font-mono font-semibold text-slate-800">
                      {t.indentNumber || t.productName || '-'}
                    </td>
                    <td className="p-3.5 text-right font-mono text-slate-600">{t.quantity ? `${t.quantity} L` : '-'}</td>
                    <td className="p-3.5 text-right font-mono font-semibold text-red-600">
                      {t.transactionType === 'CREDIT_SALE' ? `₹${t.amount.toLocaleString('en-IN')}` : '-'}
                    </td>
                    <td className="p-3.5 text-right font-mono font-semibold text-emerald-700">
                      {t.transactionType === 'COLLECTION' ? `₹${t.amount.toLocaleString('en-IN')}` : '-'}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                      ₹{t.runningBalance.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3.5 text-slate-500 font-sans max-w-[140px] truncate">{t.description || '-'}</td>
                    <td className="p-3.5 text-center font-sans">
                      <div className="flex items-center justify-center gap-1.5">
                        {t.transactionType === 'COLLECTION' && (
                          <button
                            onClick={() => openEditModal(t)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-all"
                            title="Edit Collection"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteTx(t)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
                          title="Delete Transaction"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: RECORD CREDIT COLLECTION */}
      {isCollectModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-xl relative">
            <button
              onClick={() => setIsCollectModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 flex items-center justify-center shrink-0">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Record Credit Collection</h3>
                <p className="text-xs text-slate-500 font-medium">Receive payment from credit customer (Decoupled from Duty Cash)</p>
              </div>
            </div>

            <form onSubmit={handleCollectSubmit} className="space-y-4 text-xs">
              {/* Customer Dropdown */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Select Customer Account *</label>
                <select
                  required
                  value={collectCustomerId}
                  onChange={(e) => setCollectCustomerId(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 font-medium focus:border-blue-600 outline-none"
                >
                  <option value="">-- Select Customer / Transport --</option>
                  {customers.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — Outstanding: ₹{c.balance.toLocaleString('en-IN')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Payment Method *</label>
                <select
                  value={collectMethod}
                  onChange={(e) => setCollectMethod(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 font-medium focus:border-blue-600 outline-none"
                >
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="RTGS">RTGS</option>
                  <option value="NEFT">NEFT</option>
                  <option value="UPI">UPI / Digital Transfer</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              {/* Amount Field */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Collection Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  placeholder="0.00"
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 text-slate-900 font-mono font-bold text-base rounded-xl p-2.5 focus:border-blue-600 outline-none"
                />
              </div>

              {/* Dynamic Fields based on Method */}
              {collectMethod === 'CHEQUE' && (
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Cheque Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. CHQ123456"
                      value={collectRef}
                      onChange={(e) => setCollectRef(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 font-mono rounded-xl p-2 focus:border-blue-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Cheque Date *</label>
                    <input
                      type="date"
                      required
                      value={collectDate}
                      onChange={(e) => setCollectDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 focus:border-blue-600 outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">Bank Name</label>
                    <input
                      type="text"
                      placeholder="e.g. State Bank of India"
                      value={collectBank}
                      onChange={(e) => setCollectBank(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 focus:border-blue-600 outline-none"
                    />
                  </div>
                </div>
              )}

              {['RTGS', 'NEFT', 'UPI', 'BANK_TRANSFER'].includes(collectMethod) && (
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      {collectMethod === 'UPI' ? 'Transaction ID / UTR *' : 'UTR / Reference Number *'}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. UTR123456789"
                      value={collectRef}
                      onChange={(e) => setCollectRef(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 font-mono rounded-xl p-2 focus:border-blue-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Transaction Date *</label>
                    <input
                      type="date"
                      required
                      value={collectDate}
                      onChange={(e) => setCollectDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 focus:border-blue-600 outline-none"
                    />
                  </div>
                  {collectMethod !== 'UPI' && (
                    <div className="col-span-2">
                      <label className="block text-slate-700 font-semibold mb-1">Bank Name</label>
                      <input
                        type="text"
                        placeholder="e.g. HDFC Bank"
                        value={collectBank}
                        onChange={(e) => setCollectBank(e.target.value)}
                        className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 focus:border-blue-600 outline-none"
                      />
                    </div>
                  )}
                </div>
              )}

              {collectMethod === 'CASH' && (
                <div className="grid grid-cols-1 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Collection Date</label>
                    <input
                      type="date"
                      value={collectDate}
                      onChange={(e) => setCollectDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 focus:border-blue-600 outline-none"
                    />
                  </div>
                </div>
              )}

              {collectMethod === 'OTHER' && (
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Reference Number</label>
                    <input
                      type="text"
                      placeholder="Optional reference"
                      value={collectRef}
                      onChange={(e) => setCollectRef(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 font-mono rounded-xl p-2 focus:border-blue-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Collection Date</label>
                    <input
                      type="date"
                      value={collectDate}
                      onChange={(e) => setCollectDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 focus:border-blue-600 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Remarks */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Remarks / Note</label>
                <input
                  type="text"
                  placeholder="e.g. Paid against August statement"
                  value={collectRemarks}
                  onChange={(e) => setCollectRemarks(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 focus:border-blue-600 outline-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCollectModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCollect}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold transition-all shadow-sm"
                >
                  {isSubmittingCollect ? 'Processing...' : 'Collect Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT CREDIT COLLECTION */}
      {editingTx && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-xl relative">
            <button
              onClick={() => setEditingTx(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 flex items-center justify-center shrink-0">
                <Edit3 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Collection</h3>
                <p className="text-xs text-slate-500 font-medium">Update payment details for {editingTx.customerName}</p>
              </div>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Payment Method</label>
                <select
                  value={editMethod}
                  onChange={(e) => setEditMethod(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 font-medium focus:border-blue-600 outline-none"
                >
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="RTGS">RTGS</option>
                  <option value="NEFT">NEFT</option>
                  <option value="UPI">UPI / Digital Transfer</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Collection Amount (₹)</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 text-slate-900 font-mono font-bold text-base rounded-xl p-2.5 focus:border-blue-600 outline-none"
                />
              </div>

              {editMethod === 'CHEQUE' && (
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Cheque Number *</label>
                    <input
                      type="text"
                      required
                      value={editRef}
                      onChange={(e) => setEditRef(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 font-mono rounded-xl p-2 focus:border-blue-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Cheque Date *</label>
                    <input
                      type="date"
                      required
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 focus:border-blue-600 outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={editBank}
                      onChange={(e) => setEditBank(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 focus:border-blue-600 outline-none"
                    />
                  </div>
                </div>
              )}

              {['RTGS', 'NEFT', 'UPI', 'BANK_TRANSFER'].includes(editMethod) && (
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      {editMethod === 'UPI' ? 'Transaction ID / UTR *' : 'UTR / Reference Number *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={editRef}
                      onChange={(e) => setEditRef(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 font-mono rounded-xl p-2 focus:border-blue-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Transaction Date *</label>
                    <input
                      type="date"
                      required
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 focus:border-blue-600 outline-none"
                    />
                  </div>
                  {editMethod !== 'UPI' && (
                    <div className="col-span-2">
                      <label className="block text-slate-700 font-semibold mb-1">Bank Name</label>
                      <input
                        type="text"
                        value={editBank}
                        onChange={(e) => setEditBank(e.target.value)}
                        className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2 focus:border-blue-600 outline-none"
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Remarks / Note</label>
                <input
                  type="text"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl p-2.5 focus:border-blue-600 outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold transition-all shadow-sm"
                >
                  {isSubmittingEdit ? 'Saving...' : 'Update Collection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
