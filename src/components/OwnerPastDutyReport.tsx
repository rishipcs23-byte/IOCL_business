'use client';

import React, { useState } from 'react';
import {
  History, Calendar, Filter, Users, Fuel, DollarSign,
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Edit, ShieldCheck,
  Building2, Wallet, CreditCard, Download, FileSpreadsheet, HardDrive, Clock
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { calculateDutySettlement, DutySettlementResult } from '@/lib/settlement';
import { assignShortageAction, updateHistoricalDutyAction } from '@/lib/actions';

interface OwnerPastDutyReportProps {
  activeDuty: any;
  historicalDuties: any[];
  staticData: any;
  onRefresh: () => Promise<void>;
  flashMessage: (msg: string, type: 'success' | 'error') => void;
  userRole?: 'OWNER' | 'MANAGER';
}

export default function OwnerPastDutyReport({
  activeDuty,
  historicalDuties,
  staticData,
  onRefresh,
  flashMessage,
  userRole = 'OWNER'
}: OwnerPastDutyReportProps) {
  // Duty Filter State
  const [selectedDutyId, setSelectedDutyId] = useState<string>(
    historicalDuties.length > 0 ? historicalDuties[0].id : (activeDuty ? activeDuty.id : '')
  );

  // Filter Bar Controls (Section 18)
  const [periodType, setPeriodType] = useState<'ALL' | 'SINGLE_DATE' | 'DATE_RANGE' | 'MONTH' | 'YEAR'>('ALL');
  const [singleDate, setSingleDate] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [filterPumpId, setFilterPumpId] = useState<string>('ALL');
  const [filterStaffId, setFilterStaffId] = useState<string>('ALL');

  // Collapsible Sections State (Section 19: Summary first, details second)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    staff: false,
    stock: false,
    meter: false,
    fuelSummary: false,
    testing: false,
    oil: false,
    credit: false,
    expenses: false,
    digital: false,
    reconciliation: false,
    bank: false,
    shortage: false,
  });

  // Shortage Assignment Modal State (Section 14)
  const [showShortageModal, setShowShortageModal] = useState<boolean>(false);
  const [shortageStaffId, setShortageStaffId] = useState<string>('');
  const [shortageAmount, setShortageAmount] = useState<number>(0);
  const [shortageReason, setShortageReason] = useState<string>('Duty Cash Shortage');
  const [isSubmittingShortage, setIsSubmittingShortage] = useState<boolean>(false);

  // Owner Correction Modal State (Section 15)
  const [showCorrectionModal, setShowCorrectionModal] = useState<boolean>(false);
  const [correctionField, setCorrectionField] = useState<'actualCash' | 'bankDeposit' | 'phonePe' | 'gpay' | 'paytm' | 'bharatPe' | 'cardPayments' | 'bankTransfer'>('actualCash');
  const [correctionValue, setCorrectionValue] = useState<number>(0);
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState<boolean>(false);

  const toggleSection = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Combine active and historical duties for selection cleanly without duplicate IDs
  const allDuties = React.useMemo(() => {
    const list: any[] = [];
    const seenIds = new Set<string>();

    if (activeDuty && activeDuty.id) {
      list.push(activeDuty);
      seenIds.add(activeDuty.id);
    }

    if (Array.isArray(historicalDuties)) {
      for (const d of historicalDuties) {
        if (d && d.id && !seenIds.has(d.id)) {
          list.push(d);
          seenIds.add(d.id);
        }
      }
    }

    return list;
  }, [activeDuty, historicalDuties]);

  // Filter duty options by period and criteria
  const filteredDutyOptions = allDuties.filter((d: any) => {
    const dDateStr = new Date(d.startTime).toLocaleDateString('en-CA');
    const dMonthStr = dDateStr.slice(0, 7);
    const dYearStr = dDateStr.slice(0, 4);

    if (periodType === 'SINGLE_DATE' && singleDate && dDateStr !== singleDate) return false;
    if (periodType === 'DATE_RANGE') {
      if (startDate && dDateStr < startDate) return false;
      if (endDate && dDateStr > endDate) return false;
    }
    if (periodType === 'MONTH' && selectedMonth && dMonthStr !== selectedMonth) return false;
    if (periodType === 'YEAR' && selectedYear && dYearStr !== selectedYear) return false;

    if (filterPumpId !== 'ALL') {
      const hasPump = (d.assignments || []).some((a: any) => a.pumpId === filterPumpId || a.pump?.name === filterPumpId);
      if (!hasPump) return false;
    }

    if (filterStaffId !== 'ALL') {
      const hasStaff = (d.assignments || []).some((a: any) => a.staffId === filterStaffId);
      if (!hasStaff) return false;
    }

    return true;
  });

  // Find the selected duty session
  const targetDuty = allDuties.find((d: any) => d.id === selectedDutyId) || filteredDutyOptions[0] || activeDuty;

  // Calculate complete settlement using Centralized Engine (Section 17)
  let settlement: DutySettlementResult | null = null;
  if (targetDuty) {
    try {
      settlement = calculateDutySettlement(targetDuty, staticData?.staff, staticData?.pumps);
    } catch (e) {
      console.error("Settlement calculation error:", e);
    }
  }

  // Handle Shortage Assignment Submission (Section 14)
  const handleAssignShortageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDuty || isSubmittingShortage || !shortageStaffId || shortageAmount <= 0) {
      flashMessage('Please select staff member and valid amount', 'error');
      return;
    }

    setIsSubmittingShortage(true);
    try {
      const res = await assignShortageAction(targetDuty.id, shortageStaffId, shortageAmount, shortageReason);
      if (res.success) {
        flashMessage(`Assigned ₹${shortageAmount} shortage responsibility successfully!`, 'success');
        setShowShortageModal(false);
        await onRefresh();
      }
    } catch (err: any) {
      flashMessage(err.message || 'Failed to assign shortage', 'error');
    } finally {
      setIsSubmittingShortage(false);
    }
  };

  // Handle Owner Authorized Correction Submission (Section 15)
  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDuty || isSubmittingCorrection || !correctionReason) {
      flashMessage('Reason for correction is required for audit trail', 'error');
      return;
    }

    setIsSubmittingCorrection(true);
    try {
      const res = await updateHistoricalDutyAction(targetDuty.id, correctionField, correctionValue, correctionReason);
      if (res.success) {
        flashMessage(`Historical correction saved and audited!`, 'success');
        setShowCorrectionModal(false);
        setCorrectionReason('');
        await onRefresh();
      }
    } catch (err: any) {
      flashMessage(err.message || 'Failed to save correction', 'error');
    } finally {
      setIsSubmittingCorrection(false);
    }
  };

  // Export Duty Settlement Report to Excel
  const handleExportExcel = () => {
    if (!settlement) return;
    try {
      const summaryData = [
        { Metric: 'Duty Number', Value: `#${settlement.dutyNumber}` },
        { Metric: 'Status', Value: settlement.status },
        { Metric: 'Start Time', Value: new Date(settlement.startTime).toLocaleString() },
        { Metric: 'End Time', Value: settlement.endTime ? new Date(settlement.endTime).toLocaleString() : 'N/A' },
        { Metric: 'Manager', Value: settlement.managerName },
        { Metric: 'MS Density @ 15°C (kg/m³)', Value: targetDuty?.msDensity ? `${targetDuty.msDensity}` : 'N/A' },
        { Metric: 'HSD Density @ 15°C (kg/m³)', Value: targetDuty?.hsdDensity ? `${targetDuty.hsdDensity}` : 'N/A' },
        { Metric: 'Total MS Sold (L)', Value: settlement.totalMsSoldLitres },
        { Metric: 'Total MS Sales (₹)', Value: settlement.totalMsSalesAmount },
        { Metric: 'Total HSD Sold (L)', Value: settlement.totalHsdSoldLitres },
        { Metric: 'Total HSD Sales (₹)', Value: settlement.totalHsdSalesAmount },
        { Metric: 'Total Fuel Sales (₹)', Value: settlement.totalFuelSalesAmount },
        { Metric: 'Total Oil Sales (₹)', Value: settlement.totalOilSales },
        { Metric: 'Gross Inflow (₹)', Value: settlement.grossInflow },
        { Metric: 'Total Credit Given (₹)', Value: settlement.totalCreditGiven },
        { Metric: 'Total Credit Collections (₹)', Value: settlement.totalCreditCollections },
        { Metric: 'Total Expenses (₹)', Value: settlement.totalExpenses },
        { Metric: 'Total Digital Payments (₹)', Value: settlement.digitalPayments.totalDigital },
        { Metric: 'Expected Physical Cash (₹)', Value: settlement.expectedCash },
        { Metric: 'Actual Physical Cash (₹)', Value: settlement.actualCash },
        { Metric: 'Cash Difference (₹)', Value: settlement.cashDifference },
        { Metric: 'Settlement Status', Value: settlement.settlementStatus },
        { Metric: 'Bank Deposit (₹)', Value: settlement.bankDeposit },
        { Metric: 'Cash Retained (₹)', Value: settlement.cashRetained },
      ];

      const ws = XLSX.utils.json_to_sheet(summaryData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Duty_${settlement.dutyNumber}_Summary`);
      XLSX.writeFile(wb, `Duty_${settlement.dutyNumber}_Historical_Report.xlsx`);
      flashMessage(`Duty #${settlement.dutyNumber} exported to Excel!`, 'success');
    } catch (e) {
      flashMessage('Failed to export report', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* GLOBAL FILTER & DUTY SELECTOR HEADER (Section 2 & 18) */}
      <div className="google-hero p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0 shadow-sm">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Past Duty Reports</h2>
              <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">Complete, unmodified historical reproduction of 24-hour shift settlements &amp; nozzle registers</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportExcel}
              disabled={!settlement}
              className="btn-primary"
            >
              <Download className="h-4 w-4" />
              Export Duty Report (.xlsx)
            </button>
          </div>
        </div>

        {/* Filter Controls Bar (Section 18) */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {/* Duty Selector Dropdown */}
          <div className="lg:col-span-2">
            <label className="text-slate-700 font-bold block mb-1">Select Completed Duty Session *</label>
            <select
              value={selectedDutyId}
              onChange={(e) => setSelectedDutyId(e.target.value)}
              className="w-full bg-slate-50 border border-blue-200 text-slate-900 rounded-xl p-2.5 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {filteredDutyOptions.length === 0 ? (
                <option value="">No duty sessions match filters</option>
              ) : (
                filteredDutyOptions.map((d: any, idx: number) => (
                  <option key={`${d.id}-${idx}`} value={d.id}>
                    Duty #{d.dutyNumber} ({new Date(d.startTime).toLocaleDateString()}) - {d.status}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Period Filter Type */}
          <div>
            <label className="text-slate-600 font-semibold block mb-1">Period Filter:</label>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
              <label className="text-slate-600 font-semibold block mb-1">Date:</label>
              <input
                type="date"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          )}

          {periodType === 'DATE_RANGE' && (
            <>
              <div>
                <label className="text-slate-600 font-semibold block mb-1">From Date:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="text-slate-600 font-semibold block mb-1">To Date:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </>
          )}

          {periodType === 'MONTH' && (
            <div>
              <label className="text-slate-600 font-semibold block mb-1">Month:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          )}

          {periodType === 'YEAR' && (
            <div>
              <label className="text-slate-600 font-semibold block mb-1">Year:</label>
              <input
                type="number"
                placeholder="2026"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          )}

          {/* Pump Filter */}
          <div>
            <label className="text-slate-600 font-semibold block mb-1">Filter Pump:</label>
            <select
              value={filterPumpId}
              onChange={(e) => setFilterPumpId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">All Pumps</option>
              {(staticData?.pumps || []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Staff Filter */}
          <div>
            <label className="text-slate-600 font-semibold block mb-1">Filter Staff:</label>
            <select
              value={filterStaffId}
              onChange={(e) => setFilterStaffId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">All Staff</option>
              {(staticData?.staff || []).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!settlement ? (
        <div className="p-12 bg-white border border-slate-200 rounded-2xl text-center text-slate-500 space-y-3 shadow-sm">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
          <p className="font-semibold text-sm">No duty session data available for the selected filter parameters.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* SECTION 2: DUTY HEADER BANNER (Section 2) */}
          <div className="google-card p-6 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-color)] pb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--text-primary)]">Duty #{settlement.dutyNumber}</h1>
                  <span className={`px-3 py-1 rounded-full text-xs md:text-sm font-bold uppercase tracking-wider ${settlement.status === 'CLOSED' ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'}`}>
                    {settlement.status}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs md:text-sm font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 uppercase tracking-wider">
                    24-HOUR DUTY PERIOD
                  </span>
                </div>
                <p className="text-xs md:text-sm text-[var(--text-muted)] mt-1.5 font-medium">Manager / Supervisor in Charge: <span className="text-[var(--text-primary)] font-bold">{settlement.managerName}</span></p>
              </div>

              {/* Date & Time Period Header */}
              <div className="bg-[var(--bg-surface-secondary)] px-5 py-3 rounded-2xl border border-[var(--border-color)] flex items-center gap-4 text-xs md:text-sm">
                <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                <div>
                  <span className="text-[var(--text-muted)] block text-[11px] md:text-xs font-bold uppercase">Start Time &amp; End Time</span>
                  <span className="font-mono text-[var(--text-primary)] font-bold">
                    {new Date(settlement.startTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  <span className="text-blue-600 dark:text-blue-400 mx-2 font-bold">&rarr;</span>
                  <span className="font-mono text-[var(--text-primary)] font-bold">
                    {settlement.endTime ? new Date(settlement.endTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'In Progress'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick KPI Summary Bar (Summary First) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs md:text-sm font-mono">
              <div className="bg-[var(--bg-surface-secondary)] p-3.5 rounded-xl border border-[var(--border-color)]">
                <span className="text-[var(--text-muted)] text-[11px] uppercase font-bold block mb-1">Gross Inflow</span>
                <span className="text-lg md:text-xl font-extrabold text-blue-600 dark:text-blue-400">₹{settlement.grossInflow.toLocaleString()}</span>
              </div>
              <div className="bg-[var(--bg-surface-secondary)] p-3.5 rounded-xl border border-[var(--border-color)]">
                <span className="text-[var(--text-muted)] text-[11px] uppercase font-bold block mb-1">Fuel Sales</span>
                <span className="text-lg md:text-xl font-extrabold text-[var(--text-primary)]">₹{settlement.totalFuelSalesAmount.toLocaleString()}</span>
              </div>
              <div className="bg-[var(--bg-surface-secondary)] p-3.5 rounded-xl border border-[var(--border-color)]">
                <span className="text-[var(--text-muted)] text-[11px] uppercase font-bold block mb-1">Digital Payments</span>
                <span className="text-lg md:text-xl font-extrabold text-sky-600 dark:text-sky-400">₹{settlement.digitalPayments.totalDigital.toLocaleString()}</span>
              </div>
              <div className="bg-[var(--bg-surface-secondary)] p-3.5 rounded-xl border border-[var(--border-color)]">
                <span className="text-[var(--text-muted)] text-[11px] uppercase font-bold block mb-1">Expected Cash</span>
                <span className="text-lg md:text-xl font-extrabold text-[var(--success-text)]">₹{settlement.expectedCash.toLocaleString()}</span>
              </div>
              <div className="bg-[var(--bg-surface-secondary)] p-3.5 rounded-xl border border-[var(--border-color)]">
                <span className="text-[var(--text-muted)] text-[11px] uppercase font-bold block mb-1">Actual Cash</span>
                <span className="text-lg md:text-xl font-extrabold text-amber-600 dark:text-amber-400">₹{settlement.actualCash.toLocaleString()}</span>
              </div>
              <div className="bg-[var(--bg-surface-secondary)] p-3.5 rounded-xl border border-[var(--border-color)]">
                <span className="text-[var(--text-muted)] text-[11px] uppercase font-bold block mb-1">Settlement Status</span>
                <span className={`text-lg md:text-xl font-extrabold ${settlement.settlementStatus === 'BALANCED' ? 'text-[var(--success-text)]' : settlement.settlementStatus === 'SHORTAGE' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {settlement.settlementStatus}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 3: STAFF ASSIGNMENT & ATTENDANCE (Section 3) */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => toggleSection('staff')}
              className="w-full p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 hover:bg-slate-100/60 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-base uppercase tracking-wider">3. Staff Pump Duty Assignments & Duty Attendance</h3>
                  <p className="text-xs text-slate-500">Recorded pump operators and attendance status for Duty #{settlement.dutyNumber}</p>
                </div>
              </div>
              {collapsed.staff ? <ChevronDown className="h-5 w-5 text-slate-500" /> : <ChevronUp className="h-5 w-5 text-slate-500" />}
            </button>

            {!collapsed.staff && (
              <div className="p-6 space-y-6">
                {/* Pump Assignment Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {settlement.assignmentsByPump.map((ap, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                      <span className="font-bold text-blue-700 uppercase tracking-wider block text-xs border-b border-slate-200 pb-1.5">{ap.pumpName}</span>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-slate-600 font-semibold">MS Fuel Nozzles:</span>
                        <span className="font-bold text-slate-900 bg-white px-2.5 py-1 rounded border border-slate-200">{ap.msStaff}</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-slate-600 font-semibold">HSD Diesel Nozzles:</span>
                        <span className="font-bold text-slate-900 bg-white px-2.5 py-1 rounded border border-slate-200">{ap.hsdStaff}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Staff Attendance Roster */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="p-3 border-b border-slate-200 font-bold text-slate-700 text-xs uppercase tracking-wider bg-slate-50">Duty Staff Attendance Status</div>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase bg-slate-50/50">
                        <th className="p-3">Staff Name</th>
                        <th className="p-3">Assigned Duty Nozzle</th>
                        <th className="p-3 text-center">Attendance Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {settlement.staffAttendance.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-slate-400">No staff record entries for this duty session.</td>
                        </tr>
                      ) : (
                        settlement.staffAttendance.map((sa) => (
                          <tr key={sa.staffId} className="hover:bg-slate-50">
                            <td className="p-3 font-bold text-slate-900">{sa.staffName}</td>
                            <td className="p-3 text-slate-600 font-mono">{sa.assignedPump || 'No Nozzle Assigned'}</td>
                            <td className="p-3 text-center">
                              {sa.status === 'PRESENT' ? (
                                <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">PRESENT</span>
                              ) : sa.status === 'ABSENT' ? (
                                <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">ABSENT</span>
                              ) : (
                                <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">NOT SCHEDULED</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 4: STOCK / DIP / DENSITY / VARIATION (Section 4) */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => toggleSection('stock')}
              className="w-full p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 hover:bg-slate-100/60 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <Fuel className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-base uppercase tracking-wider">4. Underground Tank Dip Stock & Density Variation</h3>
                  <p className="text-xs text-slate-500">Historical stock dip readings, density checks and stock variance recorded for Duty #{settlement.dutyNumber}</p>
                </div>
              </div>
              {collapsed.stock ? <ChevronDown className="h-5 w-5 text-slate-500" /> : <ChevronUp className="h-5 w-5 text-slate-500" />}
            </button>

            {!collapsed.stock && (
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                        <th className="p-3">Fuel Product</th>
                        <th className="p-3 text-right">Dip (cm)</th>
                        <th className="p-3 text-right">Chart Stock (L)</th>
                        <th className="p-3 text-right">Corrected Stock (L)</th>
                        <th className="p-3 text-right">Final Stock (L)</th>
                        <th className="p-3 text-right">Opening Stock (L)</th>
                        <th className="p-3 text-right">Sales (L)</th>
                        <th className="p-3 text-right">Expected Closing (L)</th>
                        <th className="p-3 text-right">Density @ 15°C</th>
                        <th className="p-3 text-right">Stock Variation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {['MS', 'HSD'].map((ft) => {
                        const dipData = ft === 'MS' ? settlement?.tankDips.ms : settlement?.tankDips.hsd;
                        const densVal = ft === 'MS'
                          ? (targetDuty?.msDensity || dipData?.density)
                          : (targetDuty?.hsdDensity || dipData?.density);

                        return (
                          <tr key={ft} className="hover:bg-slate-50">
                            <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${ft === 'MS' ? 'bg-amber-500' : 'bg-blue-600'}`} />
                              {ft === 'MS' ? 'MS Petrol' : 'HSD High Speed Diesel'}
                            </td>
                            <td className="p-3 text-right font-mono text-blue-700 font-bold">
                              {dipData?.dipCm !== undefined ? `${dipData.dipCm.toFixed(1)} cm` : '-'}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-600">
                              {dipData?.chartCalculatedLitres !== undefined ? `${dipData.chartCalculatedLitres.toFixed(2)} L` : (dipData ? `${dipData.physicalDip.toFixed(2)} L` : '-')}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-amber-600">
                              {dipData?.isCorrected && dipData?.correctedLitres !== undefined ? (
                                <span title={dipData.correctionReason || 'Manual override'}>
                                  {dipData.correctedLitres.toFixed(2)} L ✏️
                                </span>
                              ) : (
                                <span className="text-slate-400">N/A</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-700">
                              {dipData ? `${(dipData.finalLitres ?? dipData.physicalDip).toFixed(2)} L` : '-'}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-600">{dipData ? `${dipData.openingStock.toFixed(2)} L` : '-'}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900">{dipData ? `${dipData.sales.toFixed(2)} L` : '-'}</td>
                            <td className="p-3 text-right font-mono text-slate-600">{dipData ? `${dipData.expectedClosing.toFixed(2)} L` : '-'}</td>
                            <td className="p-3 text-right font-mono font-bold text-blue-700">
                              {densVal ? `${densVal} kg/m³` : 'N/A'}
                            </td>
                            <td className="p-3 text-right font-mono font-bold">
                              {dipData && dipData.dipCm !== undefined ? (
                                <span className={dipData.variance < -0.01 ? 'text-red-600' : dipData.variance > 0.01 ? 'text-emerald-700' : 'text-slate-600'}>
                                  {dipData.variance > 0.01 ? `+${dipData.variance.toFixed(1)} L SURPLUS` : dipData.variance < -0.01 ? `${dipData.variance.toFixed(1)} L SHORTAGE` : '0.0 L BALANCED'}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic font-normal">Pending</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 5: COMPLETE METER READING REPORT (Section 5) */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => toggleSection('meter')}
              className="w-full p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 hover:bg-slate-100/60 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-base uppercase tracking-wider">5. Complete Fuel Meter Readings (Strict Order: Pump 1 & Pump 2)</h3>
                  <p className="text-xs text-slate-500">Strict Order: Pump 1 (MS-1, HSD-1, MS-2, HSD-2) &rarr; Pump 2 (MS-3, HSD-3, MS-4, HSD-4)</p>
                </div>
              </div>
              {collapsed.meter ? <ChevronDown className="h-5 w-5 text-slate-500" /> : <ChevronUp className="h-5 w-5 text-slate-500" />}
            </button>

            {!collapsed.meter && (
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                        <th className="p-4">Pump Unit</th>
                        <th className="p-4">Nozzle / Gun</th>
                        <th className="p-4">Fuel Type</th>
                        <th className="p-4">Employee Duty Taken</th>
                        <th className="p-4 text-right">Opening Reading</th>
                        <th className="p-4 text-right">Closing Reading</th>
                        <th className="p-4 text-right">Litres Sold</th>
                        <th className="p-4 text-right">Fuel Rate (₹/L)</th>
                        <th className="p-4 text-right">Sales Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {settlement.meterReadingsOrdered.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-400">No meter readings recorded.</td>
                        </tr>
                      ) : (
                        settlement.meterReadingsOrdered.map((mr) => (
                          <tr key={mr.id} className="hover:bg-slate-50">
                            <td className="p-4 font-bold text-slate-700">{mr.pumpName}</td>
                            <td className="p-4 font-mono font-bold text-slate-900">{mr.gunName}</td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${mr.fuelType === 'MS' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                                {mr.fuelType}
                              </span>
                            </td>
                            <td className="p-4 font-semibold text-emerald-700 flex items-center gap-1.5 mt-2 sm:mt-0">
                              <Users className="h-3.5 w-3.5 text-emerald-600" />
                              {mr.assignedStaff || 'Unassigned'}
                            </td>
                            <td className="p-4 text-right font-mono text-slate-500">{mr.previousReading.toFixed(2)}</td>
                            <td className="p-4 text-right font-mono text-slate-800 font-semibold">{mr.currentReading.toFixed(2)}</td>
                            <td className="p-4 text-right font-mono font-bold text-slate-900">{mr.litresSold.toFixed(2)} L</td>
                            <td className="p-4 text-right font-mono text-slate-500">₹{mr.priceUsed.toFixed(2)}</td>
                            <td className="p-4 text-right font-mono font-bold text-blue-700 text-sm">₹{mr.salesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 6: FUEL SUMMARY (Section 6) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
              <Fuel className="h-5 w-5 text-blue-600" />
              6. Fuel Sales Summary
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs font-mono">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-2">
                <span className="text-slate-500 font-sans font-bold block uppercase text-[10px]">TOTAL MS PETROL SOLD</span>
                <span className="text-xl font-bold text-amber-700 block">{settlement.totalMsSoldLitres.toFixed(2)} L</span>
                <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-slate-600 font-sans">MS Revenue:</span>
                  <span className="text-base font-bold text-slate-900 font-mono">₹{settlement.totalMsSalesAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-2">
                <span className="text-slate-500 font-sans font-bold block uppercase text-[10px]">TOTAL HSD DIESEL SOLD</span>
                <span className="text-xl font-bold text-blue-700 block">{settlement.totalHsdSoldLitres.toFixed(2)} L</span>
                <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-slate-600 font-sans">HSD Revenue:</span>
                  <span className="text-base font-bold text-slate-900 font-mono">₹{settlement.totalHsdSalesAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-blue-200 space-y-2">
                <span className="text-slate-500 font-sans font-bold block uppercase text-[10px]">TOTAL FUEL COMBINED</span>
                <span className="text-xl font-bold text-emerald-700 block">{settlement.totalFuelSoldLitres.toFixed(2)} L</span>
                <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-slate-600 font-sans">Total Fuel Revenue:</span>
                  <span className="text-lg font-bold text-emerald-700 font-mono">₹{settlement.totalFuelSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {settlement.sampleBoxSales && settlement.sampleBoxSales.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Paid Sample Box / Load Sales (Included in Revenue)</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                    Total: ₹{settlement.totalSampleBoxSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900 text-slate-500 border-b border-slate-200 dark:border-slate-800 font-sans uppercase">
                        <th className="p-2">Fuel Type</th>
                        <th className="p-2">Quantity (L)</th>
                        <th className="p-2">Rate (₹/L)</th>
                        <th className="p-2">Total Sale Amount</th>
                        <th className="p-2">Notes / Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {settlement.sampleBoxSales.map((s, i) => (
                        <tr key={s.id || i}>
                          <td className="p-2 font-bold text-slate-900 dark:text-white">{s.fuelType}</td>
                          <td className="p-2">{s.quantity.toFixed(2)} L</td>
                          <td className="p-2">₹{s.unitPrice.toFixed(2)}</td>
                          <td className="p-2 font-bold text-emerald-600 dark:text-emerald-400">₹{s.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="p-2 text-slate-500 font-sans">{s.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 7: TANK SAMPLE / TESTING (Section 7) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              7. Tank Sample / Testing Litres & Deductions
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs font-mono">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                <div>
                  <span className="text-slate-500 font-sans font-medium block">MS Testing</span>
                  <span className="font-bold text-slate-900 text-sm">{settlement.msTestingLitres} Litres</span>
                </div>
                <span className="font-bold text-amber-700">₹{settlement.msTestingAmount.toFixed(2)}</span>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                <div>
                  <span className="text-slate-500 font-sans font-medium block">HSD Testing</span>
                  <span className="font-bold text-slate-900 text-sm">{settlement.hsdTestingLitres} Litres</span>
                </div>
                <span className="font-bold text-blue-700">₹{settlement.hsdTestingAmount.toFixed(2)}</span>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                <div>
                  <span className="text-slate-500 font-sans font-bold block uppercase text-[10px]">TOTAL TESTING DEDUCTION</span>
                  <span className="font-bold text-emerald-700 text-base">₹{settlement.totalTestingAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 8: OIL / LUBRICANT SALES (Section 8) */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => toggleSection('oil')}
              className="w-full p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 hover:bg-slate-100/60 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <HardDrive className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-base uppercase tracking-wider">8. Oil & Lubricant Sales (Duty Session Records)</h3>
                  <p className="text-xs text-slate-500">Total Oil Sales: ₹{settlement.totalOilSales.toLocaleString()}</p>
                </div>
              </div>
              {collapsed.oil ? <ChevronDown className="h-5 w-5 text-slate-500" /> : <ChevronUp className="h-5 w-5 text-slate-500" />}
            </button>

            {!collapsed.oil && (
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                        <th className="p-3">Product Name</th>
                        <th className="p-3 text-right">Quantity Sold</th>
                        <th className="p-3 text-right">Selling Price (₹)</th>
                        <th className="p-3 text-right">Total Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {settlement.oilSales.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-slate-400">No oil sales recorded for this duty session.</td>
                        </tr>
                      ) : (
                        settlement.oilSales.map((os) => (
                          <tr key={os.id} className="hover:bg-slate-50">
                            <td className="p-3 font-bold text-slate-900">{os.productName}</td>
                            <td className="p-3 text-right font-mono text-slate-600">{os.quantity}</td>
                            <td className="p-3 text-right font-mono text-slate-500">₹{os.unitPrice.toFixed(2)}</td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-700">₹{os.totalAmount.toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 9: CREDIT GIVEN / COLLECTIONS (Section 9) */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => toggleSection('credit')}
              className="w-full p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 hover:bg-slate-100/60 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-base uppercase tracking-wider">9. Credit Given & Cash Collections for Duty #{settlement.dutyNumber}</h3>
                  <p className="text-xs text-slate-500">Total Credit Given: ₹{settlement.totalCreditGiven.toLocaleString()} | Total Collections: ₹{settlement.totalCreditCollections.toLocaleString()}</p>
                </div>
              </div>
              {collapsed.credit ? <ChevronDown className="h-5 w-5 text-slate-500" /> : <ChevronUp className="h-5 w-5 text-slate-500" />}
            </button>

            {!collapsed.credit && (
              <div className="p-6 space-y-6">
                {/* Credit Given Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider">Credit Sales / Slips Issued</h4>
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase">
                          <th className="p-3">Customer Name</th>
                          <th className="p-3">Indent / Slip #</th>
                          <th className="p-3">Product</th>
                          <th className="p-3 text-right">Quantity</th>
                          <th className="p-3 text-right">Rate</th>
                          <th className="p-3 text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {settlement.creditGiven.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-4 text-center text-slate-400">No credit sales recorded in this duty.</td>
                          </tr>
                        ) : (
                          settlement.creditGiven.map((cg) => (
                            <tr key={cg.id} className="hover:bg-slate-50">
                              <td className="p-3 font-bold text-slate-900">{cg.customerName}</td>
                              <td className="p-3 font-mono text-slate-600">{cg.indentNumber || '-'}</td>
                              <td className="p-3 text-slate-600">{cg.productName || '-'}</td>
                              <td className="p-3 text-right font-mono text-slate-600">{cg.quantity ? `${cg.quantity} L` : '-'}</td>
                              <td className="p-3 text-right font-mono text-slate-500">{cg.unitPrice ? `₹${cg.unitPrice}` : '-'}</td>
                              <td className="p-3 text-right font-mono font-bold text-red-600">₹{cg.amount.toLocaleString()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Credit Collections Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Credit Collections Received</h4>
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase">
                          <th className="p-3">Customer Name</th>
                          <th className="p-3">Description / Receipt</th>
                          <th className="p-3 text-right">Amount Received (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {settlement.creditCollections.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="p-4 text-center text-slate-400">No credit collections received in this duty.</td>
                          </tr>
                        ) : (
                          settlement.creditCollections.map((cc) => (
                            <tr key={cc.id} className="hover:bg-slate-50">
                              <td className="p-3 font-bold text-slate-900">{cc.customerName}</td>
                              <td className="p-3 text-slate-600">{cc.description || '-'}</td>
                              <td className="p-3 text-right font-mono font-bold text-emerald-700">₹{cc.amount.toLocaleString()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 10: EXPENSES (Section 10) */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => toggleSection('expenses')}
              className="w-full p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 hover:bg-slate-100/60 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <Wallet className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-base uppercase tracking-wider">10. Duty Expense Breakdown</h3>
                  <p className="text-xs text-slate-500">Total: ₹{settlement.totalExpenses.toLocaleString()} (Cash: ₹{settlement.cashExpenses.toLocaleString()} | Digital: ₹{settlement.digitalExpenses.toLocaleString()})</p>
                </div>
              </div>
              {collapsed.expenses ? <ChevronDown className="h-5 w-5 text-slate-500" /> : <ChevronUp className="h-5 w-5 text-slate-500" />}
            </button>

            {!collapsed.expenses && (
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                        <th className="p-3">Category</th>
                        <th className="p-3">Description</th>
                        <th className="p-3 text-right">Amount (₹)</th>
                        <th className="p-3">Payment Method</th>
                        <th className="p-3">Entered By</th>
                        <th className="p-3">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {settlement.expenses.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-400">No expenses recorded in this duty session.</td>
                        </tr>
                      ) : (
                        settlement.expenses.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50">
                            <td className="p-3 font-bold text-slate-900">{e.categoryName}</td>
                            <td className="p-3 text-slate-600">{e.description}</td>
                            <td className="p-3 text-right font-mono font-bold text-red-600">₹{e.amount.toFixed(2)}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold uppercase text-[9px] border border-slate-200">{e.paymentMethod}</span>
                            </td>
                            <td className="p-3 text-slate-500">{e.enteredBy}</td>
                            <td className="p-3 text-slate-500" suppressHydrationWarning>{new Date(e.timestamp).toLocaleTimeString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 11: DIGITAL PAYMENTS BREAKDOWN (Section 11) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
              <CreditCard className="h-5 w-5 text-blue-600" />
              11. Digital Payments Breakdown (Persisted Records)
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 text-xs font-mono">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-slate-500 block text-[10px] font-sans">PhonePe</span>
                <span className="font-bold text-sky-700 block mt-1">₹{settlement.digitalPayments.phonePe.toLocaleString()}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-slate-500 block text-[10px] font-sans">GPay</span>
                <span className="font-bold text-sky-700 block mt-1">₹{settlement.digitalPayments.gpay.toLocaleString()}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-slate-500 block text-[10px] font-sans">Paytm</span>
                <span className="font-bold text-sky-700 block mt-1">₹{settlement.digitalPayments.paytm.toLocaleString()}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-slate-500 block text-[10px] font-sans">BharatPe</span>
                <span className="font-bold text-sky-700 block mt-1">₹{settlement.digitalPayments.bharatPe.toLocaleString()}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-slate-500 block text-[10px] font-sans">Cards</span>
                <span className="font-bold text-sky-700 block mt-1">₹{settlement.digitalPayments.cardPayments.toLocaleString()}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-slate-500 block text-[10px] font-sans">Bank Transfer</span>
                <span className="font-bold text-sky-700 block mt-1">₹{settlement.digitalPayments.bankTransfer.toLocaleString()}</span>
              </div>
              <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 text-center">
                <span className="text-blue-700 block text-[10px] font-sans uppercase font-bold">TOTAL DIGITAL</span>
                <span className="font-extrabold text-blue-800 block mt-1">₹{settlement.digitalPayments.totalDigital.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* SECTION 12: FINAL ACCOUNTING SETTLEMENT (Section 12) */}
          <div className="bg-white border border-blue-200 p-6 rounded-2xl shadow-sm space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-600" />
                  12. Final 24-Hour Duty Settlement & Physical Cash Reconciliation
                </h3>
                <p className="text-xs text-slate-500 font-medium">Authoritative Financial Formula Reproduction for Duty #{settlement.dutyNumber}</p>
              </div>

              {userRole === 'OWNER' && (
                <button
                  onClick={() => setShowCorrectionModal(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs border border-amber-200 transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Edit className="h-4 w-4" />
                  Owner Authorized Correction
                </button>
              )}
            </div>

            {/* 4-Step Sequential Calculation Flow */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm">
              {/* STEP 1: TOTAL CASH REVENUE GENERATED */}
              <div className="bg-[var(--bg-surface-secondary)] border border-[var(--border-color)] rounded-2xl p-5 space-y-3.5 shadow-sm">
                <h4 className="font-extrabold text-[var(--success-text)] uppercase tracking-wider border-b border-[var(--border-color)] pb-2 flex items-center justify-between text-xs md:text-sm">
                  <span>STEP 1: TOTAL CASH REVENUE GENERATED</span>
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 rounded-full font-mono font-bold">REVENUE</span>
                </h4>
                <div className="space-y-2.5 font-mono text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] font-sans">Fuel Sales (Meter + Sample/Load):</span>
                    <span className="text-[var(--text-primary)] font-bold">₹{settlement.totalFuelSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] font-sans">Oil &amp; Lubricants Sales:</span>
                    <span className="text-[var(--text-primary)] font-bold">+ ₹{settlement.totalOilSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] font-sans">Credit Ledger Collections:</span>
                    <span className="text-[var(--text-primary)] font-bold">+ ₹{settlement.totalCreditCollections.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="pt-3 border-t border-[var(--border-color)] flex justify-between items-center text-sm md:text-base">
                    <span className="font-sans font-extrabold text-[var(--text-primary)]">TOTAL CASH REVENUE GENERATED:</span>
                    <span className="font-extrabold text-[var(--success-text)] font-mono text-base md:text-xl">₹{settlement.grossInflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* STEP 2: TOTAL DEDUCTIONS */}
              <div className="bg-[var(--bg-surface-secondary)] border border-[var(--border-color)] rounded-2xl p-5 space-y-3.5 shadow-sm">
                <h4 className="font-extrabold text-rose-600 dark:text-rose-400 uppercase tracking-wider border-b border-[var(--border-color)] pb-2 flex items-center justify-between text-xs md:text-sm">
                  <span>STEP 2: TOTAL DEDUCTIONS</span>
                  <span className="text-[10px] bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 px-2.5 py-0.5 rounded-full font-mono font-bold">DEDUCTIONS</span>
                </h4>
                <div className="space-y-2.5 font-mono text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] font-sans">Digital Payments (Non-Cash):</span>
                    <span className="text-rose-600 dark:text-rose-400 font-bold">- ₹{(settlement.digitalPayments?.totalDigital || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] font-sans">Credit Slips Given:</span>
                    <span className="text-rose-600 dark:text-rose-400 font-bold">- ₹{(settlement.totalCreditGiven || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] font-sans">Testing / Sample Litres:</span>
                    <span className="text-rose-600 dark:text-rose-400 font-bold">- ₹{(settlement.totalTestingAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] font-sans">Cash Expenses:</span>
                    <span className="text-rose-600 dark:text-rose-400 font-bold">- ₹{(settlement.cashExpenses || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="pt-3 border-t border-[var(--border-color)] flex justify-between items-center text-sm md:text-base">
                    <span className="font-sans font-extrabold text-[var(--text-primary)]">TOTAL DEDUCTIONS:</span>
                    <span className="font-extrabold text-rose-600 dark:text-rose-400 font-mono text-base md:text-xl">
                      ₹{(settlement.totalDeductions ?? ((settlement.digitalPayments?.totalDigital || 0) + (settlement.totalCreditGiven || 0) + (settlement.totalTestingAmount || 0) + (settlement.cashExpenses || 0))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* STEP 3: EXPECTED PHYSICAL CASH RESULT BANNER */}
            <div className="bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
              <div className="space-y-1 text-left">
                <span className="text-xs md:text-sm font-extrabold text-blue-700 dark:text-blue-300 uppercase tracking-wider block">STEP 3: EXPECTED PHYSICAL CASH</span>
                <p className="text-xs text-[var(--text-muted)] font-mono font-medium">
                  Total Cash Revenue (₹{settlement.grossInflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) &minus; Total Deductions (₹{(settlement.totalDeductions ?? ((settlement.digitalPayments?.totalDigital || 0) + (settlement.totalCreditGiven || 0) + (settlement.totalTestingAmount || 0) + (settlement.cashExpenses || 0))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs md:text-sm text-[var(--text-secondary)] font-bold block uppercase tracking-wider">EXPECTED PHYSICAL CASH</span>
                <span className="text-2xl md:text-3xl font-extrabold font-mono text-blue-600 dark:text-blue-400">
                  ₹{settlement.expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* STEP 4: PHYSICAL CASH RECONCILIATION COMPARISON */}
            <div className="bg-[var(--bg-surface-secondary)] border border-[var(--border-color)] p-5 rounded-2xl space-y-4 shadow-sm">
              <span className="text-xs md:text-sm font-extrabold text-[var(--text-primary)] uppercase tracking-wider block border-b border-[var(--border-color)] pb-2">
                STEP 4: PHYSICAL CASH RECONCILIATION
              </span>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs md:text-sm font-mono w-full md:w-auto">
                  <div>
                    <span className="text-[var(--text-muted)] text-xs font-sans font-bold block uppercase">EXPECTED CASH</span>
                    <span className="text-base md:text-xl font-extrabold text-blue-600 dark:text-blue-400 font-mono">
                      ₹{settlement.expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] text-xs font-sans font-bold block uppercase">ACTUAL / BANK DEPOSITED CASH</span>
                    <span className="text-base md:text-xl font-extrabold text-[var(--success-text)] font-mono">
                      ₹{settlement.bankDeposit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] text-xs font-sans font-bold block uppercase">DIFFERENCE</span>
                    <span className={`text-base md:text-xl font-extrabold font-mono ${settlement.cashDifference < -0.01 ? 'text-rose-600 dark:text-rose-400' : settlement.cashDifference > 0.01 ? 'text-[var(--success-text)]' : 'text-[var(--text-primary)]'}`}>
                      {settlement.cashDifference < -0.01
                        ? `₹${Math.abs(settlement.cashDifference).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SHORTAGE`
                        : settlement.cashDifference > 0.01
                        ? `₹${settlement.cashDifference.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SURPLUS`
                        : '₹0.00 MATCHED'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`px-4 py-2.5 rounded-xl text-xs md:text-sm font-extrabold uppercase tracking-wider border shadow-sm ${settlement.settlementStatus === 'BALANCED' ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' : settlement.settlementStatus === 'SHORTAGE' ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700' : 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'}`}>
                    STATUS: {settlement.settlementStatus === 'BALANCED' ? 'MATCHED' : settlement.settlementStatus}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 13: BANK DEPOSIT */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-3">
              <Building2 className="h-5 w-5 text-blue-600" />
              13. Bank Deposit Reconciliation
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-sans font-bold uppercase">EXPECTED CASH TO DEPOSIT</span>
                <span className="text-base font-bold text-slate-700 mt-1 block">₹{settlement.expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-blue-200">
                <span className="text-slate-500 block text-[10px] font-sans font-bold uppercase">BANK DEPOSITED CASH</span>
                <span className="text-base font-bold text-emerald-700 mt-1 block">₹{settlement.bankDeposit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-sans font-bold uppercase">DIFFERENCE STATUS</span>
                <span className={`text-base font-bold mt-1 block ${settlement.cashDifference < -0.01 ? 'text-red-700' : settlement.cashDifference > 0.01 ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {settlement.cashDifference < -0.01
                    ? `₹${Math.abs(settlement.cashDifference).toLocaleString(undefined, { minimumFractionDigits: 2 })} SHORTAGE`
                    : settlement.cashDifference > 0.01
                    ? `₹${settlement.cashDifference.toLocaleString(undefined, { minimumFractionDigits: 2 })} SURPLUS`
                    : '₹0 BALANCED'}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 14: SHORTAGE / SURPLUS RESPONSIBILITY */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  14. Shortage / Surplus Responsibility Record
                </h3>
                <p className="text-xs text-slate-500">Duty shift staff roster and explicit Owner shortage assignments</p>
              </div>

              {settlement.settlementStatus === 'SHORTAGE' && userRole === 'OWNER' && (
                <button
                  onClick={() => {
                    setShortageAmount(Math.abs(settlement!.cashDifference));
                    setShowShortageModal(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5"
                >
                  <Users className="h-4 w-4" />
                  Assign Shortage Responsibility
                </button>
              )}
            </div>

            {/* If Shortage exists, show Duty Staff Banner */}
            {settlement.settlementStatus === 'SHORTAGE' && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-red-700 text-[10px] font-sans font-bold block uppercase">DUTY NUMBER</span>
                  <span className="font-mono text-slate-900 font-bold text-sm">Duty #{settlement.dutyNumber}</span>
                </div>
                <div>
                  <span className="text-red-700 text-[10px] font-sans font-bold block uppercase">UNASSIGNED SHORTAGE AMOUNT</span>
                  <span className="font-mono text-red-700 font-bold text-sm">₹{Math.abs(settlement.cashDifference).toLocaleString(undefined, { minimumFractionDigits: 2 })} SHORTAGE</span>
                </div>
                <div>
                  <span className="text-red-700 text-[10px] font-sans font-bold block uppercase">DUTY SHIFT STAFF ON DUTY</span>
                  <span className="text-slate-800 font-semibold block mt-0.5">
                    {settlement.staffAttendance.filter(s => s.status === 'PRESENT').map(s => s.staffName).join(', ') || 'No staff mapped'}
                  </span>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                    <th className="p-3">Responsible Staff</th>
                    <th className="p-3 text-right">Responsibility Amount (₹)</th>
                    <th className="p-3">Reason / Remarks</th>
                    <th className="p-3">Assigned By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {settlement.shortageAssignments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-400">
                        {settlement.settlementStatus === 'BALANCED'
                          ? 'Duty session cash is perfectly balanced.'
                          : 'No explicit staff shortage assignments recorded for this duty session yet.'}
                      </td>
                    </tr>
                  ) : (
                    settlement.shortageAssignments.map((sa) => (
                      <tr key={sa.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900">{sa.staffName}</td>
                        <td className="p-3 text-right font-mono font-bold text-red-600">₹{sa.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 text-slate-600">{sa.reason}</td>
                        <td className="p-3 text-blue-700 font-semibold">{sa.assignedBy}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SHORTAGE ASSIGNMENT MODAL (Section 14) */}
      {showShortageModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="font-bold text-slate-900 text-base border-b border-slate-200 pb-3 flex items-center gap-2">
              <Users className="h-5 w-5 text-red-600" />
              Assign Duty Shortage Responsibility
            </h3>

            <form onSubmit={handleAssignShortageSubmit} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-700 font-bold block mb-1">Select Responsible Staff Member *</label>
                <select
                  required
                  value={shortageStaffId}
                  onChange={(e) => setShortageStaffId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Select Staff</option>
                  {(staticData?.staff || []).map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-700 font-bold block mb-1">Shortage Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={shortageAmount || ''}
                  onChange={(e) => setShortageAmount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 font-bold focus:outline-none font-mono text-red-600 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="text-slate-700 font-bold block mb-1">Reason / Notes</label>
                <input
                  type="text"
                  value={shortageReason}
                  onChange={(e) => setShortageReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setShowShortageModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingShortage}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isSubmittingShortage ? 'Assigning...' : 'Confirm Shortage Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OWNER AUTHORIZED CORRECTION MODAL (Section 15) */}
      {showCorrectionModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="font-bold text-slate-900 text-base border-b border-slate-200 pb-3 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
              Owner Authorized Correction
            </h3>

            <form onSubmit={handleCorrectionSubmit} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-700 font-bold block mb-1">Field to Correct *</label>
                <select
                  value={correctionField}
                  onChange={(e) => setCorrectionField(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="actualCash">Actual Physical Cash Count</option>
                  <option value="bankDeposit">Bank Deposit Amount</option>
                  <option value="phonePe">PhonePe Digital Amount</option>
                  <option value="gpay">GPay Digital Amount</option>
                  <option value="paytm">Paytm Digital Amount</option>
                  <option value="bharatPe">BharatPe Digital Amount</option>
                  <option value="cardPayments">Cards Payment Amount</option>
                  <option value="bankTransfer">Bank Transfer Amount</option>
                </select>
              </div>

              <div>
                <label className="text-slate-700 font-bold block mb-1">New Correct Value (₹) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={correctionValue || ''}
                  onChange={(e) => setCorrectionValue(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 font-bold focus:outline-none font-mono focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="text-slate-700 font-bold block mb-1">Audit Reason for Correction *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why this historical correction is being made..."
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCorrectionModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCorrection}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isSubmittingCorrection ? 'Saving...' : 'Save Authorized Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
