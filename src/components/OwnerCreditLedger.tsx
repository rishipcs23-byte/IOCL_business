'use client';

import React, { useState } from 'react';
import {
  FileSpreadsheet, Filter, Search, Calendar, UserCheck, ArrowRight,
  TrendingUp, Download, Plus, DollarSign, Clock, ShieldCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';

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
  // Filters
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('ALL');
  const [periodType, setPeriodType] = useState<'ALL' | 'SINGLE_DATE' | 'DATE_RANGE' | 'MONTH' | 'YEAR'>('ALL');
  const [singleDate, setSingleDate] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [transactionType, setTransactionType] = useState<'ALL' | 'CREDIT_SALE' | 'COLLECTION'>('ALL');
  const [productFilter, setProductFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

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
    if (productFilter !== 'ALL' && (!t.productName || !t.productName.toLowerCase().includes(productFilter.toLowerCase()))) return false;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = t.customerName.toLowerCase().includes(q);
      const matchIndent = t.indentNumber && t.indentNumber.toLowerCase().includes(q);
      const matchProd = t.productName && t.productName.toLowerCase().includes(q);
      if (!matchName && !matchIndent && !matchProd) return false;
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

  // Calculate Customer Summaries (2A)
  const customerSummaries = customers.map((cust: any) => {
    const custLedgerItem = creditLedger.find((cl: any) => cl.id === cust.id);
    const txs = custLedgerItem?.transactions || [];

    // Filter txs for summary if period active
    const filteredCustTxs = txs.filter((t: any) => {
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

    const creditGiven = filteredCustTxs.filter((t: any) => t.transactionType === 'CREDIT_SALE').reduce((sum: number, t: any) => sum + t.amount, 0);
    const collections = filteredCustTxs.filter((t: any) => t.transactionType === 'COLLECTION').reduce((sum: number, t: any) => sum + t.amount, 0);
    const openingBalance = cust.balance - (custLedgerItem?.totalCreditSales || 0) + (custLedgerItem?.totalCollections || 0);

    return {
      id: cust.id,
      name: cust.name,
      phone: cust.phone,
      openingBalance: openingBalance,
      creditGiven: creditGiven,
      collections: collections,
      currentBalance: cust.balance,
    };
  });

  // Calculate Running Balance for Selected Customer (2C)
  const selectedCustomerObj = customers.find((c: any) => c.id === selectedCustomerId);
  let runningBalance = 0;

  const chronologicalTxs = [...filteredTransactions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const detailedTxsWithRunningBalance = chronologicalTxs.map((t) => {
    if (t.transactionType === 'CREDIT_SALE') {
      runningBalance += t.amount;
    } else {
      runningBalance -= t.amount;
    }
    return { ...t, runningBalance };
  });

  // Export to Excel (2E)
  const handleExportExcel = () => {
    try {
      const exportData = detailedTxsWithRunningBalance.map(t => ({
        'Date & Time': new Date(t.timestamp).toLocaleString(),
        'Customer': t.customerName,
        'Duty': t.dutyNumber,
        'Indent / Slip #': t.indentNumber || '-',
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
  const totalOutstandingReceivable = customers.reduce((sum: number, c: any) => sum + c.balance, 0);

  return (
    <div className="space-y-8">
      {/* HEADER BANNER */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30 flex items-center justify-center">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-wider">DEDICATED CREDIT LEDGER & ACCOUNT RECEIVABLE CONTROL</h2>
            <p className="text-xs text-slate-400">Track Customer Outstanding Balances, Indent Slips & Cash Collections</p>
          </div>
        </div>

        <button
          onClick={handleExportExcel}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-600/10 flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export Ledger to Excel (.xlsx)
        </button>
      </div>

      {/* SUMMARY STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">TOTAL OUTSTANDING RECEIVABLE</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-red-400 font-mono">₹{totalOutstandingReceivable.toLocaleString()}</span>
            <span className="text-xs text-slate-400 font-semibold">{customers.length} Accounts</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">PERIOD CREDIT GIVEN</span>
          <div className="mt-2">
            <span className="text-2xl font-black text-amber-400 font-mono">₹{totalPeriodCreditGiven.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">PERIOD COLLECTIONS RECEIVED</span>
          <div className="mt-2">
            <span className="text-2xl font-black text-emerald-400 font-mono">₹{totalPeriodCollections.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* 2B. PERIOD & TRANSACTION FILTER BAR */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <Filter className="h-4 w-4 text-indigo-400" />
          2B. Active Filter Controls & Period Selector
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
          {/* Customer Dropdown */}
          <div>
            <label className="text-slate-400 font-semibold block mb-1">Customer / Party:</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-bold focus:outline-none"
            >
              <option value="ALL">All Customers ({customers.length})</option>
              {customers.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} (₹{c.balance.toLocaleString()})</option>
              ))}
            </select>
          </div>

          {/* Period Type Selector */}
          <div>
            <label className="text-slate-400 font-semibold block mb-1">Period Filter Type:</label>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-bold focus:outline-none"
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
              <label className="text-slate-400 font-semibold block mb-1">Select Date:</label>
              <input
                type="date"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-bold focus:outline-none"
              />
            </div>
          )}

          {periodType === 'DATE_RANGE' && (
            <>
              <div>
                <label className="text-slate-400 font-semibold block mb-1">From Date:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="text-slate-400 font-semibold block mb-1">To Date:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-bold focus:outline-none"
                />
              </div>
            </>
          )}

          {periodType === 'MONTH' && (
            <div>
              <label className="text-slate-400 font-semibold block mb-1">Select Month:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-bold focus:outline-none"
              />
            </div>
          )}

          {periodType === 'YEAR' && (
            <div>
              <label className="text-slate-400 font-semibold block mb-1">Select Year:</label>
              <input
                type="number"
                placeholder="2026"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-bold focus:outline-none"
              />
            </div>
          )}

          {/* Transaction Type Filter */}
          <div>
            <label className="text-slate-400 font-semibold block mb-1">Transaction Type:</label>
            <select
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-bold focus:outline-none"
            >
              <option value="ALL">All Transactions</option>
              <option value="CREDIT_SALE">Credit Sales Only</option>
              <option value="COLLECTION">Cash Collections Only</option>
            </select>
          </div>

          {/* Product Filter */}
          <div>
            <label className="text-slate-400 font-semibold block mb-1">Product:</label>
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-bold focus:outline-none"
            >
              <option value="ALL">All Products</option>
              <option value="MS">MS Petrol</option>
              <option value="HSD">HSD Diesel</option>
              <option value="Oil">Oil / Lubricants</option>
            </select>
          </div>

          {/* Search Bar */}
          <div className="md:col-span-2">
            <label className="text-slate-400 font-semibold block mb-1">Search Customer or Indent #:</label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search by customer name or indent slip..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2A. CUSTOMER LEDGER LIST SUMMARY TABLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div>
            <h3 className="font-extrabold text-white text-base uppercase tracking-wider">2A. Customer Ledger Summary List</h3>
            <p className="text-xs text-slate-400">Total outstanding balances per registered credit customer account</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                <th className="p-4">Customer Name</th>
                <th className="p-4">Phone / Contact</th>
                <th className="p-4 text-right">Credit Given (Period)</th>
                <th className="p-4 text-right">Collections (Period)</th>
                <th className="p-4 text-right">Current Outstanding Balance</th>
                <th className="p-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {customerSummaries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">No credit customer accounts found.</td>
                </tr>
              ) : (
                customerSummaries.map((cs: any) => (
                  <tr key={cs.id} className={`hover:bg-slate-850/40 ${selectedCustomerId === cs.id ? 'bg-indigo-950/20' : ''}`}>
                    <td className="p-4 font-bold text-white flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-black text-xs">
                        {cs.name.substring(0, 2).toUpperCase()}
                      </div>
                      {cs.name}
                    </td>
                    <td className="p-4 text-slate-400 font-mono">{cs.phone || '-'}</td>
                    <td className="p-4 text-right font-mono font-bold text-red-400">₹{cs.creditGiven.toLocaleString()}</td>
                    <td className="p-4 text-right font-mono font-bold text-emerald-400">₹{cs.collections.toLocaleString()}</td>
                    <td className="p-4 text-right font-mono font-black text-base text-amber-400">
                      ₹{cs.currentBalance.toLocaleString()}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => setSelectedCustomerId(cs.id)}
                        className="px-3 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white font-bold text-xs border border-indigo-500/30 transition-all"
                      >
                        View Statement
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2C. DETAILED CHRONOLOGICAL CUSTOMER STATEMENT */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex flex-wrap justify-between items-center bg-slate-900/50 gap-4">
          <div>
            <h3 className="font-extrabold text-white text-base uppercase tracking-wider flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-400" />
              2C. Detailed Chronological Ledger Statement {selectedCustomerObj ? `for ${selectedCustomerObj.name}` : '(All Customers)'}
            </h3>
            <p className="text-xs text-slate-400">Running balance breakdown of individual credit slips and cash collections</p>
          </div>

          {selectedCustomerObj && (
            <div className="text-right bg-slate-950 px-4 py-2 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Current Account Balance</span>
              <span className="text-base font-black text-amber-400 font-mono">₹{selectedCustomerObj.balance.toLocaleString()}</span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                <th className="p-3">Date & Time</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Duty Session</th>
                <th className="p-3">Indent / Slip #</th>
                <th className="p-3">Product</th>
                <th className="p-3 text-right">Litres / Qty</th>
                <th className="p-3 text-right">Rate (₹/L)</th>
                <th className="p-3 text-right">Credit Sale (₹)</th>
                <th className="p-3 text-right">Collection (₹)</th>
                <th className="p-3 text-right">Running Balance (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {detailedTxsWithRunningBalance.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500">No transactions recorded for the selected filter parameters.</td>
                </tr>
              ) : (
                detailedTxsWithRunningBalance.map((t, idx) => (
                  <tr key={idx} className="hover:bg-slate-850/40">
                    <td className="p-3 text-slate-300 font-mono" suppressHydrationWarning>{new Date(t.timestamp).toLocaleString()}</td>
                    <td className="p-3 font-bold text-white">{t.customerName}</td>
                    <td className="p-3 text-indigo-400 font-semibold">{t.dutyNumber}</td>
                    <td className="p-3 font-mono font-bold text-slate-200">{t.indentNumber || '-'}</td>
                    <td className="p-3 font-medium text-slate-300">{t.productName || '-'}</td>
                    <td className="p-3 text-right font-mono text-slate-300">{t.quantity ? `${t.quantity} L` : '-'}</td>
                    <td className="p-3 text-right font-mono text-slate-400">{t.unitPrice ? `₹${t.unitPrice}` : '-'}</td>
                    <td className="p-3 text-right font-mono font-bold text-red-400">
                      {t.transactionType === 'CREDIT_SALE' ? `₹${t.amount.toLocaleString()}` : '-'}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-400">
                      {t.transactionType === 'COLLECTION' ? `₹${t.amount.toLocaleString()}` : '-'}
                    </td>
                    <td className="p-3 text-right font-mono font-black text-amber-400">
                      ₹{t.runningBalance.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
