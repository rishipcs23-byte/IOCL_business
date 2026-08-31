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
    <div className="space-y-8">
      {/* GLOBAL FILTER & DUTY SELECTOR HEADER (Section 2 & 18) */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30 flex items-center justify-center">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-wider">HISTORICAL PAST DUTY SETTLEMENT REPORT</h2>
              <p className="text-xs text-slate-400">Complete, Unmodified Read-Only Reproduction of 24-Hour End Duty Settlement</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportExcel}
              disabled={!settlement}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs transition-all shadow-md flex items-center gap-2"
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
            <label className="text-slate-400 font-bold block mb-1">Select Completed Duty Session *</label>
            <select
              value={selectedDutyId}
              onChange={(e) => setSelectedDutyId(e.target.value)}
              className="w-full bg-slate-950 border border-indigo-500/40 text-white rounded-lg p-2.5 font-bold focus:outline-none focus:border-indigo-500"
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
            <label className="text-slate-400 font-semibold block mb-1">Period Filter:</label>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-semibold focus:outline-none"
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
              <label className="text-slate-400 font-semibold block mb-1">Date:</label>
              <input
                type="date"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-semibold focus:outline-none"
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
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-semibold focus:outline-none"
                />
              </div>
              <div>
                <label className="text-slate-400 font-semibold block mb-1">To Date:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-semibold focus:outline-none"
                />
              </div>
            </>
          )}

          {periodType === 'MONTH' && (
            <div>
              <label className="text-slate-400 font-semibold block mb-1">Month:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-semibold focus:outline-none"
              />
            </div>
          )}

          {periodType === 'YEAR' && (
            <div>
              <label className="text-slate-400 font-semibold block mb-1">Year:</label>
              <input
                type="number"
                placeholder="2026"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-semibold focus:outline-none"
              />
            </div>
          )}

          {/* Pump Filter */}
          <div>
            <label className="text-slate-400 font-semibold block mb-1">Filter Pump:</label>
            <select
              value={filterPumpId}
              onChange={(e) => setFilterPumpId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-semibold focus:outline-none"
            >
              <option value="ALL">All Pumps</option>
              {(staticData?.pumps || []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Staff Filter */}
          <div>
            <label className="text-slate-400 font-semibold block mb-1">Filter Staff:</label>
            <select
              value={filterStaffId}
              onChange={(e) => setFilterStaffId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg p-2 font-semibold focus:outline-none"
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
        <div className="p-12 bg-slate-900 border border-slate-800 rounded-2xl text-center text-slate-400 space-y-3">
          <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto" />
          <p className="font-bold text-sm">No duty session data available for the selected filter parameters.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* SECTION 2: DUTY HEADER BANNER (Section 2) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-black text-white">Duty #{settlement.dutyNumber}</h1>
                  <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-widest ${settlement.status === 'CLOSED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'bg-amber-500/10 text-amber-400 border border-amber-500/25'}`}>
                    {settlement.status}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 uppercase tracking-widest">
                    24-HOUR DUTY PERIOD
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Manager / Supervisor in Charge: <span className="text-white font-bold">{settlement.managerName}</span></p>
              </div>

              {/* Date & Time Period Header */}
              <div className="bg-slate-950 px-5 py-3 rounded-xl border border-slate-800 flex items-center gap-4 text-xs">
                <Clock className="h-5 w-5 text-indigo-400 shrink-0" />
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">Start Time & End Time</span>
                  <span className="font-mono text-white font-bold">
                    {new Date(settlement.startTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  <span className="text-indigo-400 mx-2 font-bold">&rarr;</span>
                  <span className="font-mono text-white font-bold">
                    {settlement.endTime ? new Date(settlement.endTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'In Progress'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick KPI Summary Bar (Summary First) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs font-mono">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Gross Inflow</span>
                <span className="text-base font-black text-indigo-400">₹{settlement.grossInflow.toLocaleString()}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Fuel Sales</span>
                <span className="text-base font-black text-white">₹{settlement.totalFuelSalesAmount.toLocaleString()}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Digital Payments</span>
                <span className="text-base font-black text-sky-400">₹{settlement.digitalPayments.totalDigital.toLocaleString()}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Expected Cash</span>
                <span className="text-base font-black text-emerald-400">₹{settlement.expectedCash.toLocaleString()}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Actual Cash</span>
                <span className="text-base font-black text-amber-400">₹{settlement.actualCash.toLocaleString()}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Settlement Status</span>
                <span className={`text-base font-black ${settlement.settlementStatus === 'BALANCED' ? 'text-emerald-400' : settlement.settlementStatus === 'SHORTAGE' ? 'text-red-400' : 'text-amber-400'}`}>
                  {settlement.settlementStatus}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 3: STAFF ASSIGNMENT & ATTENDANCE (Section 3) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <button
              onClick={() => toggleSection('staff')}
              className="w-full p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/60 hover:bg-slate-850/50 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-indigo-400" />
                <div>
                  <h3 className="font-extrabold text-white text-base uppercase tracking-wider">3. Staff Pump Duty Assignments & Duty Attendance</h3>
                  <p className="text-xs text-slate-400">Recorded pump operators and attendance status for Duty #{settlement.dutyNumber}</p>
                </div>
              </div>
              {collapsed.staff ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronUp className="h-5 w-5 text-slate-400" />}
            </button>

            {!collapsed.staff && (
              <div className="p-6 space-y-6">
                {/* Pump Assignment Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {settlement.assignmentsByPump.map((ap, idx) => (
                    <div key={idx} className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2">
                      <span className="font-extrabold text-indigo-400 uppercase tracking-wider block text-xs border-b border-slate-800 pb-1.5">{ap.pumpName}</span>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-slate-400 font-semibold">MS Fuel Nozzles:</span>
                        <span className="font-bold text-white bg-slate-900 px-2.5 py-1 rounded border border-slate-800">{ap.msStaff}</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-slate-400 font-semibold">HSD Diesel Nozzles:</span>
                        <span className="font-bold text-white bg-slate-900 px-2.5 py-1 rounded border border-slate-800">{ap.hsdStaff}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Staff Attendance Roster */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="p-3 border-b border-slate-800 font-bold text-slate-300 text-xs uppercase tracking-wider">Duty Staff Attendance Status</div>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 font-semibold uppercase">
                        <th className="p-3">Staff Name</th>
                        <th className="p-3">Assigned Duty Nozzle</th>
                        <th className="p-3 text-center">Attendance Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {settlement.staffAttendance.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-slate-500">No staff record entries for this duty session.</td>
                        </tr>
                      ) : (
                        settlement.staffAttendance.map((sa) => (
                          <tr key={sa.staffId} className="hover:bg-slate-900/40">
                            <td className="p-3 font-bold text-white">{sa.staffName}</td>
                            <td className="p-3 text-slate-300 font-mono">{sa.assignedPump || 'No Nozzle Assigned'}</td>
                            <td className="p-3 text-center">
                              {sa.status === 'PRESENT' ? (
                                <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">PRESENT</span>
                              ) : sa.status === 'ABSENT' ? (
                                <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/25">ABSENT</span>
                              ) : (
                                <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">NOT SCHEDULED</span>
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <button
              onClick={() => toggleSection('stock')}
              className="w-full p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/60 hover:bg-slate-850/50 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <Fuel className="h-5 w-5 text-indigo-400" />
                <div>
                  <h3 className="font-extrabold text-white text-base uppercase tracking-wider">4. Underground Tank Dip Stock & Density Variation</h3>
                  <p className="text-xs text-slate-400">Historical stock dip readings, density checks and stock variance recorded for Duty #{settlement.dutyNumber}</p>
                </div>
              </div>
              {collapsed.stock ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronUp className="h-5 w-5 text-slate-400" />}
            </button>

            {!collapsed.stock && (
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
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
                    <tbody className="divide-y divide-slate-800">
                      {['MS', 'HSD'].map((ft) => {
                        const dipData = ft === 'MS' ? settlement?.tankDips.ms : settlement?.tankDips.hsd;
                        const densVal = ft === 'MS'
                          ? (targetDuty?.msDensity || dipData?.density)
                          : (targetDuty?.hsdDensity || dipData?.density);

                        return (
                          <tr key={ft} className="hover:bg-slate-850/40">
                            <td className="p-3 font-bold text-white flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${ft === 'MS' ? 'bg-amber-400' : 'bg-indigo-400'}`} />
                              {ft === 'MS' ? 'MS Petrol' : 'HSD High Speed Diesel'}
                            </td>
                            <td className="p-3 text-right font-mono text-indigo-300 font-bold">
                              {dipData?.dipCm !== undefined ? `${dipData.dipCm.toFixed(1)} cm` : '-'}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-300">
                              {dipData?.chartCalculatedLitres !== undefined ? `${dipData.chartCalculatedLitres.toFixed(2)} L` : (dipData ? `${dipData.physicalDip.toFixed(2)} L` : '-')}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-amber-400">
                              {dipData?.isCorrected && dipData?.correctedLitres !== undefined ? (
                                <span title={dipData.correctionReason || 'Manual override'}>
                                  {dipData.correctedLitres.toFixed(2)} L ✏️
                                </span>
                              ) : (
                                <span className="text-slate-600">N/A</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-mono font-black text-emerald-400">
                              {dipData ? `${(dipData.finalLitres ?? dipData.physicalDip).toFixed(2)} L` : '-'}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-300">{dipData ? `${dipData.openingStock.toFixed(2)} L` : '-'}</td>
                            <td className="p-3 text-right font-mono font-bold text-white">{dipData ? `${dipData.sales.toFixed(2)} L` : '-'}</td>
                            <td className="p-3 text-right font-mono text-slate-300">{dipData ? `${dipData.expectedClosing.toFixed(2)} L` : '-'}</td>
                            <td className="p-3 text-right font-mono font-bold text-blue-400">
                              {densVal ? `${densVal} kg/m³` : 'N/A'}
                            </td>
                            <td className="p-3 text-right font-mono font-bold">
                              {dipData && dipData.dipCm !== undefined ? (
                                <span className={dipData.variance < -0.01 ? 'text-red-400' : dipData.variance > 0.01 ? 'text-emerald-400' : 'text-slate-300'}>
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <button
              onClick={() => toggleSection('meter')}
              className="w-full p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/60 hover:bg-slate-850/50 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-indigo-400" />
                <div>
                  <h3 className="font-extrabold text-white text-base uppercase tracking-wider">5. Complete Fuel Meter Readings (Strict Order: Pump 1 & Pump 2)</h3>
                  <p className="text-xs text-slate-400">Strict Order: Pump 1 (MS-1, HSD-1, MS-2, HSD-2) &rarr; Pump 2 (MS-3, HSD-3, MS-4, HSD-4)</p>
                </div>
              </div>
              {collapsed.meter ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronUp className="h-5 w-5 text-slate-400" />}
            </button>

            {!collapsed.meter && (
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
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
                    <tbody className="divide-y divide-slate-800">
                      {settlement.meterReadingsOrdered.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-500">No meter readings recorded.</td>
                        </tr>
                      ) : (
                        settlement.meterReadingsOrdered.map((mr) => (
                          <tr key={mr.id} className="hover:bg-slate-850/40">
                            <td className="p-4 font-bold text-slate-300">{mr.pumpName}</td>
                            <td className="p-4 font-mono font-bold text-white">{mr.gunName}</td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${mr.fuelType === 'MS' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/25' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/25'}`}>
                                {mr.fuelType}
                              </span>
                            </td>
                            <td className="p-4 font-semibold text-emerald-300 flex items-center gap-1.5 mt-2 sm:mt-0">
                              <Users className="h-3.5 w-3.5 text-emerald-400" />
                              {mr.assignedStaff || 'Unassigned'}
                            </td>
                            <td className="p-4 text-right font-mono text-slate-400">{mr.previousReading.toFixed(2)}</td>
                            <td className="p-4 text-right font-mono text-slate-200 font-semibold">{mr.currentReading.toFixed(2)}</td>
                            <td className="p-4 text-right font-mono font-bold text-white">{mr.litresSold.toFixed(2)} L</td>
                            <td className="p-4 text-right font-mono text-slate-400">₹{mr.priceUsed.toFixed(2)}</td>
                            <td className="p-4 text-right font-mono font-black text-indigo-400 text-sm">₹{mr.salesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-base font-extrabold text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-3">
              <Fuel className="h-5 w-5 text-indigo-400" />
              6. Fuel Sales Summary
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs font-mono">
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-slate-400 font-sans font-bold block uppercase text-[10px]">TOTAL MS PETROL SOLD</span>
                <span className="text-xl font-black text-amber-400 block">{settlement.totalMsSoldLitres.toFixed(2)} L</span>
                <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400 font-sans">MS Revenue:</span>
                  <span className="text-base font-bold text-white font-mono">₹{settlement.totalMsSalesAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-slate-400 font-sans font-bold block uppercase text-[10px]">TOTAL HSD DIESEL SOLD</span>
                <span className="text-xl font-black text-indigo-400 block">{settlement.totalHsdSoldLitres.toFixed(2)} L</span>
                <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400 font-sans">HSD Revenue:</span>
                  <span className="text-base font-bold text-white font-mono">₹{settlement.totalHsdSalesAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-slate-950 p-5 rounded-2xl border border-indigo-500/30 space-y-2">
                <span className="text-slate-400 font-sans font-bold block uppercase text-[10px]">TOTAL FUEL COMBINED</span>
                <span className="text-xl font-black text-emerald-400 block">{settlement.totalFuelSoldLitres.toFixed(2)} L</span>
                <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400 font-sans">Total Fuel Revenue:</span>
                  <span className="text-lg font-black text-emerald-400 font-mono">₹{settlement.totalFuelSalesAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 7: TANK SAMPLE / TESTING (Section 7) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-base font-extrabold text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-3">
              <ShieldCheck className="h-5 w-5 text-indigo-400" />
              7. Tank Sample / Testing Litres & Deductions
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs font-mono">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-slate-400 font-sans font-medium block">MS Testing</span>
                  <span className="font-bold text-white text-sm">{settlement.msTestingLitres} Litres</span>
                </div>
                <span className="font-bold text-amber-400">₹{settlement.msTestingAmount.toFixed(2)}</span>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-slate-400 font-sans font-medium block">HSD Testing</span>
                  <span className="font-bold text-white text-sm">{settlement.hsdTestingLitres} Litres</span>
                </div>
                <span className="font-bold text-indigo-400">₹{settlement.hsdTestingAmount.toFixed(2)}</span>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-slate-400 font-sans font-bold block uppercase text-[10px]">TOTAL TESTING DEDUCTION</span>
                  <span className="font-black text-emerald-400 text-base">₹{settlement.totalTestingAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 8: OIL / LUBRICANT SALES (Section 8) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <button
              onClick={() => toggleSection('oil')}
              className="w-full p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/60 hover:bg-slate-850/50 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <HardDrive className="h-5 w-5 text-indigo-400" />
                <div>
                  <h3 className="font-extrabold text-white text-base uppercase tracking-wider">8. Oil & Lubricant Sales (Duty Session Records)</h3>
                  <p className="text-xs text-slate-400">Total Oil Sales: ₹{settlement.totalOilSales.toLocaleString()}</p>
                </div>
              </div>
              {collapsed.oil ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronUp className="h-5 w-5 text-slate-400" />}
            </button>

            {!collapsed.oil && (
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                        <th className="p-3">Product Name</th>
                        <th className="p-3 text-right">Quantity Sold</th>
                        <th className="p-3 text-right">Selling Price (₹)</th>
                        <th className="p-3 text-right">Total Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {settlement.oilSales.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-slate-500">No oil sales recorded for this duty session.</td>
                        </tr>
                      ) : (
                        settlement.oilSales.map((os) => (
                          <tr key={os.id} className="hover:bg-slate-850/40">
                            <td className="p-3 font-bold text-white">{os.productName}</td>
                            <td className="p-3 text-right font-mono text-slate-300">{os.quantity}</td>
                            <td className="p-3 text-right font-mono text-slate-400">₹{os.unitPrice.toFixed(2)}</td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-400">₹{os.totalAmount.toLocaleString()}</td>
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <button
              onClick={() => toggleSection('credit')}
              className="w-full p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/60 hover:bg-slate-850/50 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-indigo-400" />
                <div>
                  <h3 className="font-extrabold text-white text-base uppercase tracking-wider">9. Credit Given & Cash Collections for Duty #{settlement.dutyNumber}</h3>
                  <p className="text-xs text-slate-400">Total Credit Given: ₹{settlement.totalCreditGiven.toLocaleString()} | Total Collections: ₹{settlement.totalCreditCollections.toLocaleString()}</p>
                </div>
              </div>
              {collapsed.credit ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronUp className="h-5 w-5 text-slate-400" />}
            </button>

            {!collapsed.credit && (
              <div className="p-6 space-y-6">
                {/* Credit Given Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">Credit Sales / Slips Issued</h4>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase">
                          <th className="p-3">Customer Name</th>
                          <th className="p-3">Indent / Slip #</th>
                          <th className="p-3">Product</th>
                          <th className="p-3 text-right">Quantity</th>
                          <th className="p-3 text-right">Rate</th>
                          <th className="p-3 text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {settlement.creditGiven.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-4 text-center text-slate-500">No credit sales recorded in this duty.</td>
                          </tr>
                        ) : (
                          settlement.creditGiven.map((cg) => (
                            <tr key={cg.id} className="hover:bg-slate-900/40">
                              <td className="p-3 font-bold text-white">{cg.customerName}</td>
                              <td className="p-3 font-mono text-slate-300">{cg.indentNumber || '-'}</td>
                              <td className="p-3 text-slate-300">{cg.productName || '-'}</td>
                              <td className="p-3 text-right font-mono text-slate-300">{cg.quantity ? `${cg.quantity} L` : '-'}</td>
                              <td className="p-3 text-right font-mono text-slate-400">{cg.unitPrice ? `₹${cg.unitPrice}` : '-'}</td>
                              <td className="p-3 text-right font-mono font-bold text-red-400">₹{cg.amount.toLocaleString()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Credit Collections Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Credit Collections Received</h4>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase">
                          <th className="p-3">Customer Name</th>
                          <th className="p-3">Description / Receipt</th>
                          <th className="p-3 text-right">Amount Received (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {settlement.creditCollections.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="p-4 text-center text-slate-500">No credit collections received in this duty.</td>
                          </tr>
                        ) : (
                          settlement.creditCollections.map((cc) => (
                            <tr key={cc.id} className="hover:bg-slate-900/40">
                              <td className="p-3 font-bold text-white">{cc.customerName}</td>
                              <td className="p-3 text-slate-300">{cc.description || '-'}</td>
                              <td className="p-3 text-right font-mono font-bold text-emerald-400">₹{cc.amount.toLocaleString()}</td>
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <button
              onClick={() => toggleSection('expenses')}
              className="w-full p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/60 hover:bg-slate-850/50 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                <Wallet className="h-5 w-5 text-indigo-400" />
                <div>
                  <h3 className="font-extrabold text-white text-base uppercase tracking-wider">10. Duty Expense Breakdown</h3>
                  <p className="text-xs text-slate-400">Total: ₹{settlement.totalExpenses.toLocaleString()} (Cash: ₹{settlement.cashExpenses.toLocaleString()} | Digital: ₹{settlement.digitalExpenses.toLocaleString()})</p>
                </div>
              </div>
              {collapsed.expenses ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronUp className="h-5 w-5 text-slate-400" />}
            </button>

            {!collapsed.expenses && (
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                        <th className="p-3">Category</th>
                        <th className="p-3">Description</th>
                        <th className="p-3 text-right">Amount (₹)</th>
                        <th className="p-3">Payment Method</th>
                        <th className="p-3">Entered By</th>
                        <th className="p-3">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {settlement.expenses.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-500">No expenses recorded in this duty session.</td>
                        </tr>
                      ) : (
                        settlement.expenses.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-850/40">
                            <td className="p-3 font-bold text-white">{e.categoryName}</td>
                            <td className="p-3 text-slate-300">{e.description}</td>
                            <td className="p-3 text-right font-mono font-bold text-red-400">₹{e.amount.toFixed(2)}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold uppercase text-[9px]">{e.paymentMethod}</span>
                            </td>
                            <td className="p-3 text-slate-400">{e.enteredBy}</td>
                            <td className="p-3 text-slate-400" suppressHydrationWarning>{new Date(e.timestamp).toLocaleTimeString()}</td>
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-base font-extrabold text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-3">
              <CreditCard className="h-5 w-5 text-indigo-400" />
              11. Digital Payments Breakdown (Persisted Records)
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 text-xs font-mono">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-slate-400 block text-[10px] font-sans">PhonePe</span>
                <span className="font-bold text-sky-400 block mt-1">₹{settlement.digitalPayments.phonePe.toLocaleString()}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-slate-400 block text-[10px] font-sans">GPay</span>
                <span className="font-bold text-sky-400 block mt-1">₹{settlement.digitalPayments.gpay.toLocaleString()}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-slate-400 block text-[10px] font-sans">Paytm</span>
                <span className="font-bold text-sky-400 block mt-1">₹{settlement.digitalPayments.paytm.toLocaleString()}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-slate-400 block text-[10px] font-sans">BharatPe</span>
                <span className="font-bold text-sky-400 block mt-1">₹{settlement.digitalPayments.bharatPe.toLocaleString()}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-slate-400 block text-[10px] font-sans">Cards</span>
                <span className="font-bold text-sky-400 block mt-1">₹{settlement.digitalPayments.cardPayments.toLocaleString()}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-slate-400 block text-[10px] font-sans">Bank Transfer</span>
                <span className="font-bold text-sky-400 block mt-1">₹{settlement.digitalPayments.bankTransfer.toLocaleString()}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-indigo-500/30 text-center">
                <span className="text-slate-400 block text-[10px] font-sans uppercase font-bold">TOTAL DIGITAL</span>
                <span className="font-black text-sky-300 block mt-1">₹{settlement.digitalPayments.totalDigital.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* SECTION 12: FINAL ACCOUNTING SETTLEMENT (Section 12) */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 p-6 rounded-2xl shadow-2xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-indigo-400" />
                  12. Final 24-Hour Duty Settlement & Physical Cash Reconciliation
                </h3>
                <p className="text-xs text-slate-400">Authoritative Financial Formula Reproduction for Duty #{settlement.dutyNumber}</p>
              </div>

              {userRole === 'OWNER' && (
                <button
                  onClick={() => setShowCorrectionModal(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-bold text-xs border border-amber-500/30 transition-all flex items-center gap-1.5"
                >
                  <Edit className="h-4 w-4" />
                  Owner Authorized Correction
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
              {/* Formula Step 1: Gross Cash Inflow */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
                <h4 className="font-extrabold text-emerald-400 uppercase tracking-wider border-b border-slate-800 pb-2">Step 1: Gross Cash Inflow</h4>
                <div className="space-y-2 font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Fuel Meter Sales (MS + HSD):</span>
                    <span className="text-white font-bold">₹{settlement.totalFuelSalesAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Oil & Lubricants Sales:</span>
                    <span className="text-white font-bold">+ ₹{settlement.totalOilSales.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Credit Ledger Collections:</span>
                    <span className="text-white font-bold">+ ₹{settlement.totalCreditCollections.toLocaleString()}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm">
                    <span className="font-sans font-extrabold text-white">GROSS INFLOW TOTAL:</span>
                    <span className="font-black text-emerald-400 font-mono text-base">₹{settlement.grossInflow.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Formula Step 2: Deductions & Expected Cash */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
                <h4 className="font-extrabold text-red-400 uppercase tracking-wider border-b border-slate-800 pb-2">Step 2: Less Deductions</h4>
                <div className="space-y-2 font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Digital Payments (Non-Cash):</span>
                    <span className="text-red-400 font-bold">- ₹{settlement.digitalPayments.totalDigital.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Credit Slips Given:</span>
                    <span className="text-red-400 font-bold">- ₹{settlement.totalCreditGiven.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Testing / Sample Litres:</span>
                    <span className="text-red-400 font-bold">- ₹{settlement.totalTestingAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cash Expenses:</span>
                    <span className="text-red-400 font-bold">- ₹{settlement.cashExpenses.toLocaleString()}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm">
                    <span className="font-sans font-extrabold text-white">EXPECTED PHYSICAL CASH:</span>
                    <span className="font-black text-indigo-300 font-mono text-base">₹{settlement.expectedCash.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Reconciliation Comparison Box */}
            <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl flex flex-wrap items-center justify-between gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs font-mono w-full md:w-auto">
                <div>
                  <span className="text-slate-400 text-[10px] font-sans font-bold block uppercase">EXPECTED CASH TO DEPOSIT</span>
                  <span className="text-lg font-black text-indigo-400 font-mono">₹{settlement.expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-sans font-bold block uppercase">BANK DEPOSITED CASH</span>
                  <span className="text-lg font-black text-emerald-400 font-mono">₹{settlement.bankDeposit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-sans font-bold block uppercase">DIFFERENCE</span>
                  <span className={`text-lg font-black font-mono ${settlement.cashDifference < -0.01 ? 'text-red-400' : settlement.cashDifference > 0.01 ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {settlement.cashDifference < -0.01
                      ? `₹${Math.abs(settlement.cashDifference).toLocaleString(undefined, { minimumFractionDigits: 2 })} SHORTAGE`
                      : settlement.cashDifference > 0.01
                      ? `₹${settlement.cashDifference.toLocaleString(undefined, { minimumFractionDigits: 2 })} SURPLUS`
                      : '₹0 BALANCED'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border ${settlement.settlementStatus === 'BALANCED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : settlement.settlementStatus === 'SHORTAGE' ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
                  STATUS: {settlement.settlementStatus}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 13: BANK DEPOSIT */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-base font-extrabold text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-3">
              <Building2 className="h-5 w-5 text-indigo-400" />
              13. Bank Deposit Reconciliation
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase">EXPECTED CASH TO DEPOSIT</span>
                <span className="text-base font-bold text-slate-300 mt-1 block">₹{settlement.expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-indigo-500/30">
                <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase">BANK DEPOSITED CASH</span>
                <span className="text-base font-black text-emerald-400 mt-1 block">₹{settlement.bankDeposit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase">DIFFERENCE STATUS</span>
                <span className={`text-base font-black mt-1 block ${settlement.cashDifference < -0.01 ? 'text-red-400' : settlement.cashDifference > 0.01 ? 'text-emerald-400' : 'text-slate-300'}`}>
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  14. Shortage / Surplus Responsibility Record
                </h3>
                <p className="text-xs text-slate-400">Duty shift staff roster and explicit Owner shortage assignments</p>
              </div>

              {settlement.settlementStatus === 'SHORTAGE' && userRole === 'OWNER' && (
                <button
                  onClick={() => {
                    setShortageAmount(Math.abs(settlement!.cashDifference));
                    setShowShortageModal(true);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-all shadow-md flex items-center gap-1.5"
                >
                  <Users className="h-4 w-4" />
                  Assign Shortage Responsibility
                </button>
              )}
            </div>

            {/* If Shortage exists, show Duty Staff Banner */}
            {settlement.settlementStatus === 'SHORTAGE' && (
              <div className="bg-slate-950 border border-red-500/30 p-4 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] font-sans font-bold block uppercase">DUTY NUMBER</span>
                  <span className="font-mono text-white font-bold text-sm">Duty #{settlement.dutyNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-sans font-bold block uppercase">UNASSIGNED SHORTAGE AMOUNT</span>
                  <span className="font-mono text-red-400 font-extrabold text-sm">₹{Math.abs(settlement.cashDifference).toLocaleString(undefined, { minimumFractionDigits: 2 })} SHORTAGE</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] font-sans font-bold block uppercase">DUTY SHIFT STAFF ON DUTY</span>
                  <span className="text-slate-200 font-semibold block mt-0.5">
                    {settlement.staffAttendance.filter(s => s.status === 'PRESENT').map(s => s.staffName).join(', ') || 'No staff mapped'}
                  </span>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="p-3">Responsible Staff</th>
                    <th className="p-3 text-right">Responsibility Amount (₹)</th>
                    <th className="p-3">Reason / Remarks</th>
                    <th className="p-3">Assigned By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {settlement.shortageAssignments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-500">
                        {settlement.settlementStatus === 'BALANCED'
                          ? 'Duty session cash is perfectly balanced.'
                          : 'No explicit staff shortage assignments recorded for this duty session yet.'}
                      </td>
                    </tr>
                  ) : (
                    settlement.shortageAssignments.map((sa) => (
                      <tr key={sa.id} className="hover:bg-slate-850/40">
                        <td className="p-3 font-bold text-white">{sa.staffName}</td>
                        <td className="p-3 text-right font-mono font-bold text-red-400">₹{sa.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 text-slate-300">{sa.reason}</td>
                        <td className="p-3 text-indigo-400 font-semibold">{sa.assignedBy}</td>
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-fade-in">
            <h3 className="font-extrabold text-white text-base border-b border-slate-800 pb-3 flex items-center gap-2">
              <Users className="h-5 w-5 text-red-400" />
              Assign Duty Shortage Responsibility
            </h3>

            <form onSubmit={handleAssignShortageSubmit} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">Select Responsible Staff Member *</label>
                <select
                  required
                  value={shortageStaffId}
                  onChange={(e) => setShortageStaffId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:outline-none"
                >
                  <option value="">Select Staff</option>
                  {(staticData?.staff || []).map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Shortage Amount (₹) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={shortageAmount || ''}
                  onChange={(e) => setShortageAmount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:outline-none font-mono text-red-400"
                />
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Reason / Notes</label>
                <input
                  type="text"
                  value={shortageReason}
                  onChange={(e) => setShortageReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowShortageModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-bold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingShortage}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-50"
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-fade-in">
            <h3 className="font-extrabold text-white text-base border-b border-slate-800 pb-3 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-400" />
              Owner Authorized Correction
            </h3>

            <form onSubmit={handleCorrectionSubmit} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">Field to Correct *</label>
                <select
                  value={correctionField}
                  onChange={(e) => setCorrectionField(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:outline-none"
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
                <label className="text-slate-400 font-bold block mb-1">New Correct Value (₹) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={correctionValue || ''}
                  onChange={(e) => setCorrectionValue(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 font-bold focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Audit Reason for Correction *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why this historical correction is being made..."
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 text-xs focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCorrectionModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-bold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCorrection}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-50"
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
