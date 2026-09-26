'use client';

import React, { useState } from 'react';
import {
  History, Calendar, Filter, Users, Fuel, DollarSign,
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Edit, ShieldCheck,
  Building2, Wallet, CreditCard, Download, FileSpreadsheet, HardDrive, Clock, Trash2, Layers
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { calculateDutySettlement, DutySettlementResult } from '@/lib/settlement';
import { assignShortageAction, updateHistoricalDutyAction, correctTankDipAction, deleteDutyAction } from '@/lib/actions';


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

  // Section View Switcher Tab State
  const [activeReportTab, setActiveReportTab] = useState<'COMBINED' | 'ANALYTICS' | 'SHIFT_DETAILS'>('COMBINED');
  // Period Duties Selector Modal State
  const [selectedPeriodDutiesModal, setSelectedPeriodDutiesModal] = useState<{
    label: string;
    duties: any[];
    msLitres?: number;
    hsdLitres?: number;
    totalLitres?: number;
    msSales?: number;
    hsdSales?: number;
    totalSales?: number;
  } | null>(null);

  // Handle View Details button click on breakdown table row
  const handleViewPeriodDetails = (item: any, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!item.duties || item.duties.length === 0) {
      flashMessage('No duty shift records found for this period.', 'error');
      return;
    }

    if (item.duties.length === 1) {
      handleSelectDutyAndScroll(item.duties[0].id);
    } else {
      setSelectedPeriodDutiesModal(item);
    }
  };

  const handleSelectDutyAndScroll = (dutyId: string) => {
    setSelectedDutyId(dutyId);
    setSelectedPeriodDutiesModal(null);
    
    if (activeReportTab === 'ANALYTICS') {
      setActiveReportTab('COMBINED');
    }

    const matchedDuty = allDuties.find((d: any) => d.id === dutyId);
    const dutyLabel = matchedDuty ? `Duty #${matchedDuty.dutyNumber}` : 'selected duty';
    flashMessage(`Loaded shift settlement details for ${dutyLabel}!`, 'success');

    setTimeout(() => {
      const el = document.getElementById('duty-detail-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 800, behavior: 'smooth' });
      }
    }, 150);
  };

  // Filter Bar Controls (Section 18)
  const [filterFuelType, setFilterFuelType] = useState<'ALL' | 'MS' | 'HSD'>('ALL');
  const [periodType, setPeriodType] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'LAST_WEEK' | 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR' | 'LAST_YEAR' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'SINGLE_DATE' | 'DATE_RANGE' | 'MONTH' | 'YEAR'>('ALL');
  const [groupBy, setGroupBy] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>('DAILY');
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

  // Post-Close Tank Dip Correction Modal State (Owner Only)
  const [showDipCorrectionModal, setShowDipCorrectionModal] = useState<boolean>(false);
  const [dipFuelType, setDipFuelType] = useState<'MS' | 'HSD'>('MS');
  const [dipChartStock, setDipChartStock] = useState<number>(0);
  const [dipCurrentVerified, setDipCurrentVerified] = useState<number>(0);
  const [dipCorrectedInput, setDipCorrectedInput] = useState<string>('');
  const [dipReasonInput, setDipReasonInput] = useState<string>('');
  const [isSubmittingDipCorrection, setIsSubmittingDipCorrection] = useState<boolean>(false);

  // Delete Duty Modal State (Owner Only)
  const [showDeleteDutyModal, setShowDeleteDutyModal] = useState<boolean>(false);
  const [dutyToDelete, setDutyToDelete] = useState<any>(null);
  const [deleteReasonInput, setDeleteReasonInput] = useState<string>('');
  const [isDeletingDuty, setIsDeletingDuty] = useState<boolean>(false);

  const handleOpenDipCorrection = (fuelType: 'MS' | 'HSD', chartStock: number, currentVerified: number) => {
    setDipFuelType(fuelType);
    setDipChartStock(chartStock);
    setDipCurrentVerified(currentVerified);
    setDipCorrectedInput(currentVerified.toString());
    setDipReasonInput('');
    setShowDipCorrectionModal(true);
  };

  const handleSubmitDipCorrection = async () => {
    const val = parseFloat(dipCorrectedInput);
    if (isNaN(val) || val < 0) {
      flashMessage('Please enter a valid non-negative physical stock quantity in litres', 'error');
      return;
    }
    if (!dipReasonInput.trim()) {
      flashMessage('Correction reason is mandatory for audit trail', 'error');
      return;
    }

    setIsSubmittingDipCorrection(true);
    try {
      // Find the target duty ID
      const targetDutyId = selectedDutyId || (historicalDuties.length > 0 ? historicalDuties[0].id : (activeDuty ? activeDuty.id : ''));
      if (!targetDutyId) {
        throw new Error('No duty session selected');
      }
      await correctTankDipAction(targetDutyId, dipFuelType, val, dipReasonInput.trim());
      flashMessage(`Successfully corrected ${dipFuelType} physical stock to ${val} L. Audit log saved.`, 'success');
      setShowDipCorrectionModal(false);
      await onRefresh();
    } catch (err: any) {
      flashMessage(err?.message || 'Failed to correct tank dip stock', 'error');
    } finally {
      setIsSubmittingDipCorrection(false);
    }
  };

  const handleOpenDeleteModal = (duty: any) => {
    if (!duty) return;
    if (duty.status === 'OPEN') {
      flashMessage('ACTIVE DUTY CANNOT BE DELETED. Please complete duty close before deletion.', 'error');
      return;
    }
    setDutyToDelete(duty);
    setDeleteReasonInput('');
    setShowDeleteDutyModal(true);
  };

  const handleConfirmDeleteDuty = async () => {
    if (!dutyToDelete) return;
    if (!deleteReasonInput.trim()) {
      flashMessage('Mandatory deletion reason is required for audit trail.', 'error');
      return;
    }
    setIsDeletingDuty(true);
    try {
      const res = await deleteDutyAction(dutyToDelete.id, deleteReasonInput.trim());
      flashMessage(res.message, 'success');
      setShowDeleteDutyModal(false);
      await onRefresh();
    } catch (err: any) {
      flashMessage(err?.message || 'Failed to delete duty', 'error');
    } finally {
      setIsDeletingDuty(false);
    }
  };

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

  const handlePeriodTypeChange = (val: string) => {
    setPeriodType(val as any);
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA');

    if (val === 'TODAY') {
      setStartDate(todayStr);
      setEndDate(todayStr);
      setGroupBy('DAILY');
    } else if (val === 'YESTERDAY') {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      const yestStr = yest.toLocaleDateString('en-CA');
      setStartDate(yestStr);
      setEndDate(yestStr);
      setGroupBy('DAILY');
    } else if (val === 'LAST_7_DAYS') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      setStartDate(d.toLocaleDateString('en-CA'));
      setEndDate(todayStr);
      setGroupBy('DAILY');
    } else if (val === 'LAST_30_DAYS') {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      setStartDate(d.toLocaleDateString('en-CA'));
      setEndDate(todayStr);
      setGroupBy('DAILY');
    } else if (val === 'THIS_WEEK') {
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      setStartDate(monday.toLocaleDateString('en-CA'));
      setEndDate(todayStr);
      setGroupBy('DAILY');
    } else if (val === 'LAST_WEEK') {
      const dayOfWeek = now.getDay();
      const lastMon = new Date(now);
      lastMon.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 7);
      const lastSun = new Date(lastMon);
      lastSun.setDate(lastMon.getDate() + 6);
      setStartDate(lastMon.toLocaleDateString('en-CA'));
      setEndDate(lastSun.toLocaleDateString('en-CA'));
      setGroupBy('DAILY');
    } else if (val === 'THIS_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA');
      setStartDate(firstDay);
      setEndDate(todayStr);
      setGroupBy('DAILY');
    } else if (val === 'LAST_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-CA');
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).toLocaleDateString('en-CA');
      setStartDate(firstDay);
      setEndDate(lastDay);
      setGroupBy('DAILY');
    } else if (val === 'THIS_YEAR') {
      setStartDate(`${now.getFullYear()}-01-01`);
      setEndDate(todayStr);
      setGroupBy('MONTHLY');
    } else if (val === 'LAST_YEAR') {
      const prevYear = now.getFullYear() - 1;
      setStartDate(`${prevYear}-01-01`);
      setEndDate(`${prevYear}-12-31`);
      setGroupBy('MONTHLY');
    } else if (val === 'ALL') {
      setGroupBy('YEARLY');
    }
  };

  // Filter duty options by period and criteria
  const filteredDutyOptions = allDuties.filter((d: any) => {
    const dDateStr = new Date(d.startTime).toLocaleDateString('en-CA');
    const dMonthStr = dDateStr.slice(0, 7);
    const dYearStr = dDateStr.slice(0, 4);

    if (periodType === 'SINGLE_DATE' && singleDate && dDateStr !== singleDate) return false;
    if (['TODAY', 'YESTERDAY', 'THIS_WEEK', 'LAST_WEEK', 'THIS_MONTH', 'LAST_MONTH', 'THIS_YEAR', 'LAST_YEAR', 'LAST_7_DAYS', 'LAST_30_DAYS', 'DATE_RANGE'].includes(periodType)) {
      if (startDate && dDateStr < startDate) return false;
      if (endDate && dDateStr > endDate) return false;
    }
    if (periodType === 'MONTH' && selectedMonth && dMonthStr !== selectedMonth) return false;
    if (periodType === 'YEAR' && selectedYear && dYearStr !== selectedYear) return false;

    if (filterFuelType !== 'ALL') {
      const hasFuelType = (d.meterReadings || []).some((mr: any) => {
        const ft = mr.gun?.fuelType || (mr.gunId && String(mr.gunId).toUpperCase().includes('HSD') ? 'HSD' : 'MS');
        return ft === filterFuelType;
      });
      if (!hasFuelType && d.meterReadings && d.meterReadings.length > 0) return false;
    }

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

  // Multi-duty aggregated historical statistics
  const analyticsSummary = React.useMemo(() => {
    let totalMsLitres = 0;
    let totalHsdLitres = 0;
    let totalMsSales = 0;
    let totalHsdSales = 0;
    const completedDutiesCount = filteredDutyOptions.length;

    const groupedMap: Record<string, {
      periodKey: string;
      label: string;
      dutiesCount: number;
      msLitres: number;
      hsdLitres: number;
      totalLitres: number;
      msSales: number;
      hsdSales: number;
      totalSales: number;
      duties: any[];
    }> = {};

    filteredDutyOptions.forEach((duty: any) => {
      const dDate = new Date(duty.startTime);
      const dDateStr = dDate.toLocaleDateString('en-CA');
      const dYear = dDate.getFullYear();
      const dMonth = `${dYear}-${String(dDate.getMonth() + 1).padStart(2, '0')}`;

      const firstJan = new Date(dYear, 0, 1);
      const weekNum = Math.ceil((((dDate.getTime() - firstJan.getTime()) / 86400000) + firstJan.getDay() + 1) / 7);
      const dWeek = `${dYear}-W${String(weekNum).padStart(2, '0')}`;

      let key = dDateStr;
      let label = dDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

      if (groupBy === 'MONTHLY') {
        key = dMonth;
        label = dDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      } else if (groupBy === 'YEARLY') {
        key = `${dYear}`;
        label = `${dYear}`;
      } else if (groupBy === 'WEEKLY') {
        key = dWeek;
        label = `Week ${weekNum}, ${dYear}`;
      }

      if (!groupedMap[key]) {
        groupedMap[key] = {
          periodKey: key,
          label,
          dutiesCount: 0,
          msLitres: 0,
          hsdLitres: 0,
          totalLitres: 0,
          msSales: 0,
          hsdSales: 0,
          totalSales: 0,
          duties: []
        };
      }

      groupedMap[key].dutiesCount += 1;
      groupedMap[key].duties.push(duty);

      (duty.meterReadings || []).forEach((mr: any) => {
        const ft = mr.gun?.fuelType || (mr.gunId && String(mr.gunId).toUpperCase().includes('HSD') ? 'HSD' : 'MS');
        const pumpMatch = filterPumpId === 'ALL' || mr.pumpId === filterPumpId || mr.pumpName === filterPumpId || mr.gun?.pumpId === filterPumpId;
        const staffMatch = filterStaffId === 'ALL' || mr.staffId === filterStaffId || duty.staffAttendance?.some((sa: any) => sa.staffId === filterStaffId);

        if (!pumpMatch || !staffMatch) return;

        let litres = mr.litresSold || (mr.currentReading - mr.previousReading) || 0;
        let price = mr.priceUsed || (ft === 'HSD' ? 100.08 : 112.15);
        let amount = mr.salesAmount || (litres * price);

        if (mr.intervals && mr.intervals.length > 0) {
          litres = mr.intervals.reduce((acc: number, inv: any) => acc + (inv.endReading - inv.startReading), 0);
          amount = mr.intervals.reduce((acc: number, inv: any) => acc + ((inv.endReading - inv.startReading) * inv.priceUsed), 0);
        }

        if (ft === 'MS' && (filterFuelType === 'ALL' || filterFuelType === 'MS')) {
          totalMsLitres += litres;
          totalMsSales += amount;
          groupedMap[key].msLitres += litres;
          groupedMap[key].msSales += amount;
        } else if (ft === 'HSD' && (filterFuelType === 'ALL' || filterFuelType === 'HSD')) {
          totalHsdLitres += litres;
          totalHsdSales += amount;
          groupedMap[key].hsdLitres += litres;
          groupedMap[key].hsdSales += amount;
        }

        groupedMap[key].totalLitres = groupedMap[key].msLitres + groupedMap[key].hsdLitres;
        groupedMap[key].totalSales = groupedMap[key].msSales + groupedMap[key].hsdSales;
      });
    });

    const groupedList = Object.values(groupedMap).sort((a, b) => a.periodKey.localeCompare(b.periodKey));

    return {
      totalMsLitres,
      totalHsdLitres,
      totalFuelLitres: totalMsLitres + totalHsdLitres,
      totalMsSales,
      totalHsdSales,
      totalFuelSales: totalMsSales + totalHsdSales,
      completedDutiesCount,
      groupedList
    };
  }, [filteredDutyOptions, filterFuelType, filterPumpId, filterStaffId, groupBy]);

  // Auto-update selectedDutyId when active filters change so the report updates instantly
  React.useEffect(() => {
    if (filteredDutyOptions.length > 0) {
      const isCurrentInFiltered = filteredDutyOptions.some((d: any) => d.id === selectedDutyId);
      if (!isCurrentInFiltered) {
        setSelectedDutyId(filteredDutyOptions[0].id);
      }
    }
  }, [filteredDutyOptions, selectedDutyId]);

  // Find the selected duty session matching active filters
  const targetDuty = (selectedDutyId && filteredDutyOptions.some((d: any) => d.id === selectedDutyId))
    ? allDuties.find((d: any) => d.id === selectedDutyId)
    : (filteredDutyOptions[0] || null);

  // Calculate complete settlement using Centralized Engine (Section 17)
  let settlement: DutySettlementResult | null = null;
  if (targetDuty) {
    try {
      settlement = calculateDutySettlement(targetDuty, staticData?.staff, staticData?.pumps);
    } catch (e) {
      console.error("Settlement calculation error:", e);
    }
  }

  // Filtered settlement views for individual past duty detailed section based on active filterFuelType, filterPumpId, and filterStaffId
  const filteredMeterReadings = React.useMemo(() => {
    if (!settlement?.meterReadingsOrdered) return [];
    return settlement.meterReadingsOrdered.filter((mr: any) => {
      const matchesFuel = filterFuelType === 'ALL' || mr.fuelType === filterFuelType;
      const matchesPump = filterPumpId === 'ALL' || mr.pumpId === filterPumpId || mr.pumpName === filterPumpId || mr.gun?.pumpId === filterPumpId;
      const matchesStaff = filterStaffId === 'ALL' || mr.staffId === filterStaffId || mr.assignedStaffId === filterStaffId || (staticData?.staff?.find((s: any) => s.id === filterStaffId)?.name === mr.assignedStaff);
      return matchesFuel && matchesPump && matchesStaff;
    });
  }, [settlement, filterFuelType, filterPumpId, filterStaffId, staticData?.staff]);

  const activeFuelSalesAmount = React.useMemo(() => {
    if (!settlement) return 0;
    if (filterFuelType === 'MS') return settlement.totalMsSalesAmount;
    if (filterFuelType === 'HSD') return settlement.totalHsdSalesAmount;
    return settlement.totalFuelSalesAmount;
  }, [settlement, filterFuelType]);

  const activeFuelVolumeLitres = React.useMemo(() => {
    if (!settlement) return 0;
    if (filterFuelType === 'MS') return settlement.totalMsSoldLitres;
    if (filterFuelType === 'HSD') return settlement.totalHsdSoldLitres;
    return settlement.totalFuelSoldLitres;
  }, [settlement, filterFuelType]);

  const filteredSampleBoxSales = React.useMemo(() => {
    if (!settlement?.sampleBoxSales) return [];
    return settlement.sampleBoxSales.filter((s: any) => filterFuelType === 'ALL' || s.fuelType === filterFuelType);
  }, [settlement, filterFuelType]);

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

  // Export Duty Settlement & Analytics Report to Excel
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Analytics Summary
      const summaryData = [
        { Parameter: 'Date Range Preset', Value: periodType },
        { Parameter: 'Start Date', Value: startDate || 'N/A' },
        { Parameter: 'End Date', Value: endDate || 'N/A' },
        { Parameter: 'Fuel Type Filter', Value: filterFuelType },
        { Parameter: 'Pump Filter', Value: filterPumpId },
        { Parameter: 'Staff Filter', Value: filterStaffId },
        { Parameter: 'Grouping Mode', Value: groupBy },
        { Parameter: 'Matching Completed Duties', Value: analyticsSummary.completedDutiesCount },
        { Parameter: 'Total MS Litres Sold (L)', Value: analyticsSummary.totalMsLitres },
        { Parameter: 'Total HSD Litres Sold (L)', Value: analyticsSummary.totalHsdLitres },
        { Parameter: 'Total Fuel Volume (L)', Value: analyticsSummary.totalFuelLitres },
        { Parameter: 'Total MS Revenue (₹)', Value: analyticsSummary.totalMsSales },
        { Parameter: 'Total HSD Revenue (₹)', Value: analyticsSummary.totalHsdSales },
        { Parameter: 'Total Fuel Revenue (₹)', Value: analyticsSummary.totalFuelSales },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Analytics_Summary');

      // Sheet 2: Grouped Breakdown Register
      const breakdownData = analyticsSummary.groupedList.map(item => ({
        Period: item.label,
        'Duties Count': item.dutiesCount,
        'MS Litres (L)': item.msLitres,
        'HSD Litres (L)': item.hsdLitres,
        'Total Litres (L)': item.totalLitres,
        'MS Sales (₹)': item.msSales,
        'HSD Sales (₹)': item.hsdSales,
        'Total Fuel Revenue (₹)': item.totalSales,
      }));
      const wsBreakdown = XLSX.utils.json_to_sheet(breakdownData);
      XLSX.utils.book_append_sheet(wb, wsBreakdown, 'Period_Breakdown');

      // Sheet 3: Selected Duty Detail (if available)
      if (settlement) {
        const dutyDetailData = [
          { Metric: 'Duty Number', Value: `#${settlement.dutyNumber}` },
          { Metric: 'Status', Value: settlement.status },
          { Metric: 'Start Time', Value: new Date(settlement.startTime).toLocaleString() },
          { Metric: 'End Time', Value: settlement.endTime ? new Date(settlement.endTime).toLocaleString() : 'N/A' },
          { Metric: 'Manager', Value: settlement.managerName },
          { Metric: 'Total MS Sold (L)', Value: settlement.totalMsSoldLitres },
          { Metric: 'Total MS Sales (₹)', Value: settlement.totalMsSalesAmount },
          { Metric: 'Total HSD Sold (L)', Value: settlement.totalHsdSoldLitres },
          { Metric: 'Total HSD Sales (₹)', Value: settlement.totalHsdSalesAmount },
          { Metric: 'Total Fuel Sales (₹)', Value: settlement.totalFuelSalesAmount },
          { Metric: 'Gross Inflow (₹)', Value: settlement.grossInflow },
          { Metric: 'Expected Physical Cash (₹)', Value: settlement.expectedCash },
          { Metric: 'Actual Physical Cash (₹)', Value: settlement.actualCash },
          { Metric: 'Settlement Status', Value: settlement.settlementStatus },
        ];
        const wsDuty = XLSX.utils.json_to_sheet(dutyDetailData);
        XLSX.utils.book_append_sheet(wb, wsDuty, `Duty_${settlement.dutyNumber}_Details`);
      }

      XLSX.writeFile(wb, `Fuel_Sales_Analytics_Report_${periodType}_${filterFuelType}.xlsx`);
      flashMessage(`Filtered report exported to Excel!`, 'success');
    } catch (e) {
      flashMessage('Failed to export report', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* GLOBAL FILTER & DUTY SELECTOR HEADER (Section 2 & 18) */}
      <div className="google-hero p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0 shadow-sm">
              <History className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Past Duty Reports</h2>
              <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">Complete, unmodified historical reproduction of 24-hour shift settlements &amp; nozzle registers</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              disabled={!settlement}
              className="btn-primary text-xs py-1.5 px-3 h-9"
            >
              <Download className="h-3.5 w-3.5" />
              Export Report (.xlsx)
            </button>
            {userRole === 'OWNER' && targetDuty && (
              <button
                type="button"
                onClick={() => handleOpenDeleteModal(targetDuty)}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 shrink-0 h-9"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Duty
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls Bar (Section 18) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5 text-xs bg-slate-900 p-4 sm:p-5 rounded-2xl border-2 border-indigo-500/40 shadow-xl">
          {/* Duty Selector Dropdown */}
          <div className="md:col-span-2 lg:col-span-2">
            <label className="text-indigo-300 font-extrabold block mb-1.5 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-indigo-400" />
              Select Completed Duty Session *
            </label>
            <select
              value={selectedDutyId}
              onChange={(e) => setSelectedDutyId(e.target.value)}
              className="w-full bg-slate-950 border-2 border-indigo-500/60 hover:border-indigo-400 text-white font-extrabold rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-md h-10 transition-all cursor-pointer"
            >
              {filteredDutyOptions.length === 0 ? (
                <option value="" style={{ backgroundColor: '#0f172a', color: '#94a3b8' }}>No duty sessions match active filters</option>
              ) : (
                filteredDutyOptions.map((d: any, idx: number) => (
                  <option key={`${d.id}-${idx}`} value={d.id} style={{ backgroundColor: '#0f172a', color: '#ffffff' }} className="font-bold py-1.5">
                    Duty #{d.dutyNumber} ({new Date(d.startTime).toLocaleDateString('en-IN')}) - {d.status}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Fuel Filter */}
          <div>
            <label className="text-amber-300 font-extrabold block mb-1.5 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Fuel className="h-3.5 w-3.5 text-amber-400" />
              Filter Fuel Type:
            </label>
            <select
              value={filterFuelType}
              onChange={(e) => setFilterFuelType(e.target.value as any)}
              className="w-full bg-slate-950 border-2 border-amber-500/60 hover:border-amber-400 text-white font-extrabold rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/50 shadow-md h-10 transition-all cursor-pointer"
            >
              <option value="ALL" style={{ backgroundColor: '#0f172a', color: '#ffffff' }} className="font-bold py-1.5">All Fuels (MS + HSD)</option>
              <option value="MS" style={{ backgroundColor: '#0f172a', color: '#fbbf24' }} className="font-bold py-1.5">MS (Petrol Only)</option>
              <option value="HSD" style={{ backgroundColor: '#0f172a', color: '#60a5fa' }} className="font-bold py-1.5">HSD (Diesel Only)</option>
            </select>
          </div>

          {/* Period Filter Presets */}
          <div>
            <label className="text-emerald-300 font-extrabold block mb-1.5 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-emerald-400" />
              Date Range Preset:
            </label>
            <select
              value={periodType}
              onChange={(e) => handlePeriodTypeChange(e.target.value)}
              className="w-full bg-slate-950 border-2 border-emerald-500/60 hover:border-emerald-400 text-white font-extrabold rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-md h-10 transition-all cursor-pointer"
            >
              <option value="ALL" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>All Time</option>
              <option value="TODAY" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Today</option>
              <option value="YESTERDAY" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Yesterday</option>
              <option value="THIS_WEEK" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>This Week</option>
              <option value="LAST_WEEK" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Last Week</option>
              <option value="THIS_MONTH" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>This Month</option>
              <option value="LAST_MONTH" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Last Month</option>
              <option value="THIS_YEAR" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>This Year</option>
              <option value="LAST_YEAR" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Last Year</option>
              <option value="DATE_RANGE" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Custom Date Range</option>
              <option value="SINGLE_DATE" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Single Date</option>
              <option value="MONTH" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Specific Month</option>
              <option value="YEAR" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Specific Year</option>
            </select>
          </div>

          {/* Pump Filter */}
          <div>
            <label className="text-sky-300 font-extrabold block mb-1.5 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-sky-400" />
              Filter Pump:
            </label>
            <select
              value={filterPumpId}
              onChange={(e) => setFilterPumpId(e.target.value)}
              className="w-full bg-slate-950 border-2 border-sky-500/60 hover:border-sky-400 text-white font-extrabold rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/50 shadow-md h-10 transition-all cursor-pointer"
            >
              <option value="ALL" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>All Pumps</option>
              {(staticData?.pumps || []).map((p: any) => (
                <option key={p.id} value={p.id} style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Staff Filter */}
          <div>
            <label className="text-purple-300 font-extrabold block mb-1.5 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-purple-400" />
              Filter Staff:
            </label>
            <select
              value={filterStaffId}
              onChange={(e) => setFilterStaffId(e.target.value)}
              className="w-full bg-slate-950 border-2 border-purple-500/60 hover:border-purple-400 text-white font-extrabold rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/50 shadow-md h-10 transition-all cursor-pointer"
            >
              <option value="ALL" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>All Staff</option>
              {(staticData?.staff || []).map((s: any) => (
                <option key={s.id} value={s.id} style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Group By Selector */}
          <div>
            <label className="text-teal-300 font-extrabold block mb-1.5 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-teal-400" />
              Group By Aggregation:
            </label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              className="w-full bg-slate-950 border-2 border-teal-500/60 hover:border-teal-400 text-white font-extrabold rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/50 shadow-md h-10 transition-all cursor-pointer"
            >
              <option value="DAILY" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Daily Breakdown</option>
              <option value="WEEKLY" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Weekly Aggregation</option>
              <option value="MONTHLY" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Monthly Summary</option>
              <option value="YEARLY" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>Yearly Totals</option>
            </select>
          </div>

          {/* Dynamic Date Inputs for Custom Date Ranges */}
          {(['DATE_RANGE', 'TODAY', 'YESTERDAY', 'THIS_WEEK', 'LAST_WEEK', 'THIS_MONTH', 'LAST_MONTH', 'THIS_YEAR', 'LAST_YEAR', 'LAST_7_DAYS', 'LAST_30_DAYS'].includes(periodType)) && (
            <>
              <div>
                <label className="text-emerald-300 font-extrabold block mb-1.5 text-[11px] uppercase tracking-wider">From Date:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-950 border-2 border-emerald-500/60 hover:border-emerald-400 text-white font-extrabold rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-md h-10 transition-all"
                />
              </div>
              <div>
                <label className="text-emerald-300 font-extrabold block mb-1.5 text-[11px] uppercase tracking-wider">To Date:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-950 border-2 border-emerald-500/60 hover:border-emerald-400 text-white font-extrabold rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-md h-10 transition-all"
                />
              </div>
            </>
          )}

          {periodType === 'SINGLE_DATE' && (
            <div>
              <label className="text-emerald-300 font-extrabold block mb-1.5 text-[11px] uppercase tracking-wider">Select Date:</label>
              <input
                type="date"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                className="w-full bg-slate-950 border-2 border-emerald-500/60 hover:border-emerald-400 text-white font-extrabold rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-md h-10 transition-all"
              />
            </div>
          )}

          {periodType === 'MONTH' && (
            <div>
              <label className="text-emerald-300 font-extrabold block mb-1.5 text-[11px] uppercase tracking-wider">Select Month:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full bg-slate-950 border-2 border-emerald-500/60 hover:border-emerald-400 text-white font-extrabold rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-md h-10 transition-all"
              />
            </div>
          )}

          {periodType === 'YEAR' && (
            <div>
              <label className="text-emerald-300 font-extrabold block mb-1.5 text-[11px] uppercase tracking-wider">Select Year:</label>
              <input
                type="number"
                placeholder="2026"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full bg-slate-950 border-2 border-emerald-500/60 hover:border-emerald-400 text-white font-extrabold rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-md h-10 transition-all"
              />
            </div>
          )}
        </div>
      </div>

      {/* SECTION SWITCHER TAB NAVIGATION BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-2.5 rounded-2xl shadow-md">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveReportTab('COMBINED')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${activeReportTab === 'COMBINED' ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-400/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <Layers className="h-4 w-4 text-indigo-300" />
            Combined View (All Sections)
          </button>
          <button
            type="button"
            onClick={() => setActiveReportTab('ANALYTICS')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${activeReportTab === 'ANALYTICS' ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-400/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <History className="h-4 w-4 text-emerald-400" />
            Section 1: Fuel Analytics & Charts
          </button>
          <button
            type="button"
            onClick={() => setActiveReportTab('SHIFT_DETAILS')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${activeReportTab === 'SHIFT_DETAILS' ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-400/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <FileSpreadsheet className="h-4 w-4 text-blue-400" />
            Section 2: Shift Settlement Details
          </button>
        </div>

        <div className="text-[11px] font-mono font-extrabold text-slate-400 px-3">
          Showing: <span className="text-white">{activeReportTab === 'COMBINED' ? 'Combined Full View' : activeReportTab === 'ANALYTICS' ? 'Analytics & Charts Only' : 'Duty Shift Settlement Only'}</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: HISTORICAL FUEL ANALYTICS & VISUALIZER CHARTS                   */}
      {/* ========================================================================= */}
      {(activeReportTab === 'COMBINED' || activeReportTab === 'ANALYTICS') && (
        <div className="bg-slate-950 border-2 border-indigo-500/40 rounded-3xl p-5 md:p-6 space-y-6 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base md:text-lg font-black text-white uppercase tracking-wider flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
                SECTION 1: HISTORICAL FUEL ANALYTICS & VISUALIZER CHARTS
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Multi-duty sales trends, product mix, and period breakdown calculated directly from database meter readings</p>
            </div>
            <div className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-500/20 font-mono">
              {analyticsSummary.groupedList.length} Aggregated Period Row(s)
            </div>
          </div>

          {/* ACTIVE FILTER SUMMARY BANNER */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                <span className="text-[10px] text-slate-500 font-bold uppercase">REPORT PERIOD:</span>
                <span className="font-bold text-white">{startDate || 'All Time'} → {endDate || 'Present'}</span>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                <span className="text-[10px] text-slate-500 font-bold uppercase">FUEL:</span>
                <span className={`font-bold ${filterFuelType === 'MS' ? 'text-amber-400' : filterFuelType === 'HSD' ? 'text-blue-400' : 'text-indigo-400'}`}>
                  {filterFuelType === 'MS' ? 'MS (Petrol)' : filterFuelType === 'HSD' ? 'HSD (Diesel)' : 'All Fuels'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                <span className="text-[10px] text-slate-500 font-bold uppercase">PUMP:</span>
                <span className="font-bold text-sky-400">{filterPumpId}</span>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                <span className="text-[10px] text-slate-500 font-bold uppercase">STAFF:</span>
                <span className="font-bold text-purple-400">{filterStaffId}</span>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                <span className="text-[10px] text-slate-500 font-bold uppercase">GROUPING:</span>
                <span className="font-bold text-teal-400">{groupBy}</span>
              </div>
            </div>

            <div className="text-xs font-extrabold text-emerald-400 bg-emerald-500/10 px-3.5 py-1.5 rounded-xl border border-emerald-500/20">
              {analyticsSummary.completedDutiesCount} Completed Duty Shift(s)
            </div>
          </div>

          {/* MULTI-DUTY EXECUTIVE STATISTICS SUMMARY CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(filterFuelType === 'ALL' || filterFuelType === 'MS') && (
              <div className="bg-slate-900 p-4 rounded-2xl border border-amber-500/30 shadow-md">
                <div className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider mb-1">MS Litres Sold</div>
                <div className="text-xl font-black text-white font-mono">{analyticsSummary.totalMsLitres.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</div>
                <div className="text-xs font-semibold text-slate-400 mt-1 font-mono">Revenue: ₹{analyticsSummary.totalMsSales.toLocaleString('en-IN')}</div>
              </div>
            )}

            {(filterFuelType === 'ALL' || filterFuelType === 'HSD') && (
              <div className="bg-slate-900 p-4 rounded-2xl border border-blue-500/30 shadow-md">
                <div className="text-[10px] font-extrabold text-blue-400 uppercase tracking-wider mb-1">HSD Litres Sold</div>
                <div className="text-xl font-black text-white font-mono">{analyticsSummary.totalHsdLitres.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</div>
                <div className="text-xs font-semibold text-slate-400 mt-1 font-mono">Revenue: ₹{analyticsSummary.totalHsdSales.toLocaleString('en-IN')}</div>
              </div>
            )}

            {filterFuelType === 'ALL' && (
              <div className="bg-slate-900 p-4 rounded-2xl border border-indigo-500/30 shadow-md">
                <div className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-wider mb-1">Total Fuel Volume</div>
                <div className="text-xl font-black text-indigo-300 font-mono">{analyticsSummary.totalFuelLitres.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</div>
                <div className="text-xs font-bold text-emerald-400 mt-1 font-mono">Net Sales: ₹{analyticsSummary.totalFuelSales.toLocaleString('en-IN')}</div>
              </div>
            )}

            {(filterFuelType === 'ALL' || filterFuelType === 'MS') && (
              <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-md">
                <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">MS Sales Value</div>
                <div className="text-xl font-black text-amber-400 font-mono">₹{analyticsSummary.totalMsSales.toLocaleString('en-IN')}</div>
              </div>
            )}

            {(filterFuelType === 'ALL' || filterFuelType === 'HSD') && (
              <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-md">
                <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">HSD Sales Value</div>
                <div className="text-xl font-black text-blue-400 font-mono">₹{analyticsSummary.totalHsdSales.toLocaleString('en-IN')}</div>
              </div>
            )}

            <div className="bg-slate-900 p-4 rounded-2xl border border-emerald-500/30 shadow-md">
              <div className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider mb-1">Total Fuel Sales</div>
              <div className="text-xl font-black text-emerald-300 font-mono">₹{analyticsSummary.totalFuelSales.toLocaleString('en-IN')}</div>
              <div className="text-xs font-semibold text-slate-400 mt-1 font-mono">{analyticsSummary.completedDutiesCount} Duty Shift(s)</div>
            </div>
          </div>

          {/* CHARTS LAYER */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* CHART 1: FUEL SALES VOLUME TREND */}
            <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3 ${filterFuelType === 'ALL' ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    Fuel Sales Volume Trend (Litres Sold)
                  </h3>
                  <p className="text-[11px] text-slate-400">Volume dispensed across {analyticsSummary.groupedList.length} period(s) grouped by {groupBy.toLowerCase()}</p>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-bold">
                  {(filterFuelType === 'ALL' || filterFuelType === 'MS') && (
                    <span className="flex items-center gap-1.5 text-amber-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span> MS Petrol
                    </span>
                  )}
                  {(filterFuelType === 'ALL' || filterFuelType === 'HSD') && (
                    <span className="flex items-center gap-1.5 text-blue-400">
                      <span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span> HSD Diesel
                    </span>
                  )}
                </div>
              </div>

              <div className="relative h-56 w-full pt-4">
                <div className="h-44 w-full flex items-end justify-between gap-2 px-2 border-b border-slate-800">
                  {analyticsSummary.groupedList.map((item, idx) => {
                    const maxVal = Math.max(...analyticsSummary.groupedList.map(d => filterFuelType === 'MS' ? d.msLitres : filterFuelType === 'HSD' ? d.hsdLitres : Math.max(d.totalLitres, d.msLitres, d.hsdLitres)), 100);
                    const msHeight = Math.max(4, Math.round((item.msLitres / maxVal) * 100));
                    const hsdHeight = Math.max(4, Math.round((item.hsdLitres / maxVal) * 100));

                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                        <div className="absolute -top-14 opacity-0 group-hover:opacity-100 transition-all bg-slate-950 border border-slate-700 text-white text-[10px] p-2 rounded-lg shadow-xl z-20 pointer-events-none whitespace-nowrap font-mono">
                          <div className="font-bold text-indigo-300">{item.label}</div>
                          {filterFuelType !== 'HSD' && <div className="text-amber-400">MS: {item.msLitres.toLocaleString()} L</div>}
                          {filterFuelType !== 'MS' && <div className="text-blue-400">HSD: {item.hsdLitres.toLocaleString()} L</div>}
                          <div className="text-emerald-400 font-bold border-t border-slate-800 mt-0.5 pt-0.5">Total: {item.totalLitres.toLocaleString()} L</div>
                        </div>

                        <div className="w-full max-w-[36px] flex items-end justify-center gap-1 h-full">
                          {(filterFuelType === 'ALL' || filterFuelType === 'MS') && (
                            <div
                              style={{ height: `${msHeight}%` }}
                              className="w-full bg-gradient-to-t from-amber-600 to-amber-400 rounded-t transition-all hover:brightness-125"
                            />
                          )}
                          {(filterFuelType === 'ALL' || filterFuelType === 'HSD') && (
                            <div
                              style={{ height: `${hsdHeight}%` }}
                              className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t transition-all hover:brightness-125"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between items-center px-2 pt-2 text-[10px] font-mono text-slate-400">
                  {analyticsSummary.groupedList.map((item, idx) => (
                    <div key={idx} className="flex-1 text-center truncate px-0.5" title={item.label}>
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* CHART 2: MS VS HSD SALES MIX DONUT CHART */}
            {filterFuelType === 'ALL' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3 flex flex-col justify-between">
                <div className="border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                    MS vs HSD Sales Mix
                  </h3>
                  <p className="text-[11px] text-slate-400">Volume proportion across selected period</p>
                </div>

                {(() => {
                  const total = analyticsSummary.totalFuelLitres;
                  const msPct = total > 0 ? Math.round((analyticsSummary.totalMsLitres / total) * 100) : 0;
                  const hsdPct = 100 - msPct;
                  const circumference = 2 * Math.PI * 36;
                  const msStroke = (msPct / 100) * circumference;

                  return (
                    <div className="flex flex-col items-center justify-center gap-4 py-2 my-auto">
                      <div className="relative h-32 w-32 flex items-center justify-center shrink-0">
                        <svg className="h-full w-full transform -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="36" stroke="#3b82f6" strokeWidth="14" fill="transparent" />
                          <circle
                            cx="50"
                            cy="50"
                            r="36"
                            stroke="#f59e0b"
                            strokeWidth="14"
                            fill="transparent"
                            strokeDasharray={`${msStroke} ${circumference}`}
                            className="transition-all duration-700"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <span className="text-base font-black text-white font-mono">{msPct}% / {hsdPct}%</span>
                          <span className="text-[8px] font-bold text-slate-400 uppercase">MS / HSD</span>
                        </div>
                      </div>

                      <div className="space-y-2 font-mono text-xs w-full">
                        <div className="bg-slate-950 p-2 rounded-xl border border-amber-500/30 flex justify-between items-center">
                          <div>
                            <span className="text-[9px] text-amber-400 font-bold block">MS PETROL</span>
                            <span className="text-xs font-extrabold text-white">{analyticsSummary.totalMsLitres.toLocaleString()} L</span>
                          </div>
                          <span className="text-xs font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">{msPct}%</span>
                        </div>

                        <div className="bg-slate-950 p-2 rounded-xl border border-blue-500/30 flex justify-between items-center">
                          <div>
                            <span className="text-[9px] text-blue-400 font-bold block">HSD DIESEL</span>
                            <span className="text-xs font-extrabold text-white">{analyticsSummary.totalHsdLitres.toLocaleString()} L</span>
                          </div>
                          <span className="text-xs font-black text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">{hsdPct}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* HISTORICAL BREAKDOWN REGISTER TABLE */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  Historical Period Sales Breakdown Register
                </h3>
                <p className="text-[11px] text-slate-400">Aggregated statistics calculated directly from permanent meter readings</p>
              </div>
              <div className="text-xs font-bold text-slate-400 font-mono">
                {analyticsSummary.groupedList.length} Period Row(s)
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-900 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800">
                    <th className="p-3">Period / Date</th>
                    <th className="p-3 text-center">Duties Count</th>
                    {(filterFuelType === 'ALL' || filterFuelType === 'MS') && <th className="p-3 text-right">MS Litres Sold</th>}
                    {(filterFuelType === 'ALL' || filterFuelType === 'HSD') && <th className="p-3 text-right">HSD Litres Sold</th>}
                    <th className="p-3 text-right">Total Litres Sold</th>
                    <th className="p-3 text-right">Sales Revenue (₹)</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-[11px]">
                  {analyticsSummary.groupedList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-500 italic font-sans">
                        No historical duty records match the active filter parameters.
                      </td>
                    </tr>
                  ) : (
                    analyticsSummary.groupedList.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/50 transition-all">
                        <td className="p-3 font-bold text-white">{item.label}</td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            {item.dutiesCount} Duty Shift(s)
                          </span>
                        </td>
                        {(filterFuelType === 'ALL' || filterFuelType === 'MS') && (
                          <td className="p-3 text-right font-bold text-amber-400">{item.msLitres.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</td>
                        )}
                        {(filterFuelType === 'ALL' || filterFuelType === 'HSD') && (
                          <td className="p-3 text-right font-bold text-blue-400">{item.hsdLitres.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</td>
                        )}
                        <td className="p-3 text-right font-black text-white">{item.totalLitres.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</td>
                        <td className="p-3 text-right font-black text-emerald-400">₹{item.totalSales.toLocaleString('en-IN')}</td>
                        <td className="p-3 text-center">
                          {item.duties.length > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => handleViewPeriodDetails(item, e)}
                              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-extrabold text-[11px] transition-all shadow-md cursor-pointer inline-flex items-center gap-1.5"
                            >
                              View Details &rarr;
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-500 italic">No Shifts</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: INDIVIDUAL DUTY SESSION SETTLEMENT & SHIFT DETAILS             */}
      {/* ========================================================================= */}
      {(activeReportTab === 'COMBINED' || activeReportTab === 'SHIFT_DETAILS') && (
        <div id="duty-detail-section" className="bg-slate-950 border-2 border-blue-500/40 rounded-3xl p-5 md:p-6 space-y-6 shadow-2xl scroll-mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base md:text-lg font-black text-white uppercase tracking-wider flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full bg-blue-400 animate-pulse" />
                SECTION 2: INDIVIDUAL DUTY SHIFT SETTLEMENT & NOZZLE REGISTER
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Detailed financial reconciliation, meter readings, tank dips, credit, and staff register for Duty #{settlement?.dutyNumber || ''}</p>
            </div>
            {settlement && (
              <div className="text-xs font-bold text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded-xl border border-blue-500/20 font-mono">
                Duty #{settlement.dutyNumber} ({settlement.status})
              </div>
            )}
          </div>

      {!settlement ? (
        <div className="p-12 bg-slate-900 border border-slate-800 rounded-2xl text-center text-slate-400 space-y-3 shadow-sm">
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
                <span className="text-[var(--text-muted)] text-[11px] uppercase font-bold block mb-1">
                  {filterFuelType === 'MS' ? 'MS Petrol Sales' : filterFuelType === 'HSD' ? 'HSD Diesel Sales' : 'Fuel Sales'}
                </span>
                <span className="text-lg md:text-xl font-extrabold text-[var(--text-primary)]">₹{activeFuelSalesAmount.toLocaleString()}</span>
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
                      {(filterFuelType === 'ALL' || filterFuelType === 'MS') && (
                        <div className={`flex justify-between items-center py-1 ${filterFuelType === 'MS' ? 'bg-amber-50/90 p-2 rounded-lg border border-amber-300' : ''}`}>
                          <span className="text-slate-700 font-bold">MS Fuel Nozzles:</span>
                          <span className="font-bold text-amber-900 bg-white px-2.5 py-1 rounded border border-amber-200">{ap.msStaff}</span>
                        </div>
                      )}
                      {(filterFuelType === 'ALL' || filterFuelType === 'HSD') && (
                        <div className={`flex justify-between items-center py-1 ${filterFuelType === 'HSD' ? 'bg-blue-50/90 p-2 rounded-lg border border-blue-300' : ''}`}>
                          <span className="text-slate-700 font-bold">HSD Diesel Nozzles:</span>
                          <span className="font-bold text-blue-900 bg-white px-2.5 py-1 rounded border border-blue-200">{ap.hsdStaff}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Staff Attendance Roster */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-3 border-b border-slate-800 font-bold text-slate-300 text-xs uppercase tracking-wider bg-slate-950/80">Duty Staff Attendance Status</div>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase bg-slate-950/50">
                        <th className="p-3">Staff Name</th>
                        <th className="p-3">Assigned Duty Nozzle</th>
                        <th className="p-3 text-center">Attendance Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {settlement.staffAttendance.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-slate-500 italic font-sans">No staff record entries for this duty session.</td>
                        </tr>
                      ) : (
                        settlement.staffAttendance.map((sa) => (
                          <tr key={sa.staffId} className="hover:bg-slate-800/60 transition-colors">
                            <td className="p-3 font-bold text-white">{sa.staffName}</td>
                            <td className="p-3 font-mono">
                              {sa.assignedPump ? (
                                <span className="text-sky-400 font-semibold">{sa.assignedPump}</span>
                              ) : (
                                <span className="text-slate-400 font-medium italic">No Nozzle Assigned</span>
                              )}
                            </td>
                            <td className="p-3 text-center font-sans">
                              {sa.status === 'PRESENT' ? (
                                <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">PRESENT</span>
                              ) : sa.status === 'ABSENT' ? (
                                <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">ABSENT</span>
                              ) : (
                                <span className="px-2.5 py-1 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 font-mono">NOT SCHEDULED</span>
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
                        <th className="p-3 text-right bg-emerald-50/70 text-emerald-900 font-bold" title="Verified Physical Stock from dip calibration chart">Verified Physical Stock (L)</th>
                        <th className="p-3 text-right">Opening Stock (L)</th>
                        <th className="p-3 text-right">Sales (L)</th>
                        <th className="p-3 text-right bg-blue-50/70 text-blue-900 font-bold" title="Theoretical Book Stock (Opening + Receipts - Sales)">Book Stock / Expected Closing (L)</th>
                        <th className="p-3 text-right">Density @ 15°C</th>
                        <th className="p-3 text-right">Stock Variation</th>
                        {userRole === 'OWNER' && <th className="p-3 text-right">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {['MS', 'HSD'].filter(ft => filterFuelType === 'ALL' || ft === filterFuelType).map((ft) => {
                        const dipData = ft === 'MS' ? settlement?.tankDips.ms : settlement?.tankDips.hsd;
                        const densVal = ft === 'MS'
                          ? (targetDuty?.msDensity || dipData?.density)
                          : (targetDuty?.hsdDensity || dipData?.density);

                        return (
                          <tr key={ft} className="hover:bg-slate-800/60 transition-colors">
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
                            <td className="p-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/40">
                              {dipData ? `${(dipData.finalLitres ?? dipData.physicalDip).toFixed(2)} L` : '-'}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-600">{dipData ? `${dipData.openingStock.toFixed(2)} L` : '-'}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-900">{dipData ? `${dipData.sales.toFixed(2)} L` : '-'}</td>
                            <td className="p-3 text-right font-mono text-blue-700 bg-blue-50/40">{dipData ? `${dipData.expectedClosing.toFixed(2)} L` : '-'}</td>
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
                            {userRole === 'OWNER' && (
                              <td className="p-3 text-right">
                                <button
                                  onClick={() => handleOpenDipCorrection(
                                    ft as 'MS' | 'HSD',
                                    dipData?.chartCalculatedLitres ?? dipData?.physicalDip ?? 0,
                                    dipData?.finalLitres ?? dipData?.physicalDip ?? 0
                                  )}
                                  className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1"
                                  title="Correct verified physical stock (Owner only)"
                                >
                                  <Edit className="h-3 w-3" />
                                  Correct Dip
                                </button>
                              </td>
                            )}
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
                  <h3 className="font-bold text-slate-900 text-base uppercase tracking-wider">
                    5. Complete Fuel Meter Readings {filterFuelType !== 'ALL' ? `(Filtered: ${filterFuelType} Only)` : '(Strict Order: Pump 1 & Pump 2)'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Showing {filteredMeterReadings.length} nozzle reading(s) {filterFuelType !== 'ALL' ? `for ${filterFuelType} Petrol/Diesel` : ''}
                  </p>
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
                      {filteredMeterReadings.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-400 font-sans">
                            No meter readings recorded matching active filters ({filterFuelType === 'ALL' ? 'All Fuels' : filterFuelType}).
                          </td>
                        </tr>
                      ) : (
                        filteredMeterReadings.map((mr: any) => (
                          <tr key={mr.id} className="hover:bg-slate-800/60 transition-colors">
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
              6. Fuel Sales Summary {filterFuelType !== 'ALL' ? `(${filterFuelType} Filter Active)` : ''}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs font-mono">
              {(filterFuelType === 'ALL' || filterFuelType === 'MS') && (
                <div className={`p-5 rounded-2xl border space-y-2 ${filterFuelType === 'MS' ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-slate-500 font-sans font-bold block uppercase text-[10px]">TOTAL MS PETROL SOLD</span>
                  <span className="text-xl font-bold text-amber-700 block">{settlement.totalMsSoldLitres.toFixed(2)} L</span>
                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                    <span className="text-slate-600 font-sans">MS Revenue:</span>
                    <span className="text-base font-bold text-slate-900 font-mono">₹{settlement.totalMsSalesAmount.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {(filterFuelType === 'ALL' || filterFuelType === 'HSD') && (
                <div className={`p-5 rounded-2xl border space-y-2 ${filterFuelType === 'HSD' ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-400' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-slate-500 font-sans font-bold block uppercase text-[10px]">TOTAL HSD DIESEL SOLD</span>
                  <span className="text-xl font-bold text-blue-700 block">{settlement.totalHsdSoldLitres.toFixed(2)} L</span>
                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                    <span className="text-slate-600 font-sans">HSD Revenue:</span>
                    <span className="text-base font-bold text-slate-900 font-mono">₹{settlement.totalHsdSalesAmount.toLocaleString()}</span>
                  </div>
                </div>
              )}

              <div className="bg-slate-50 p-5 rounded-2xl border border-blue-200 space-y-2">
                <span className="text-slate-500 font-sans font-bold block uppercase text-[10px]">
                  {filterFuelType === 'MS' ? 'ACTIVE MS FUEL TOTAL' : filterFuelType === 'HSD' ? 'ACTIVE HSD FUEL TOTAL' : 'TOTAL FUEL COMBINED'}
                </span>
                <span className="text-xl font-bold text-emerald-700 block">{activeFuelVolumeLitres.toFixed(2)} L</span>
                <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-slate-600 font-sans">Active Revenue:</span>
                  <span className="text-lg font-bold text-emerald-700 font-mono">₹{activeFuelSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {filteredSampleBoxSales && filteredSampleBoxSales.length > 0 && (
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
                      {filteredSampleBoxSales.map((s: any, i: number) => (
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
                          <tr key={os.id} className="hover:bg-slate-800/60 transition-colors">
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
                            <tr key={cg.id} className="hover:bg-slate-800/60 transition-colors">
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
                            <tr key={cc.id} className="hover:bg-slate-800/60 transition-colors">
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
                          <tr key={e.id} className="hover:bg-slate-800/60 transition-colors">
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

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-xs font-mono">
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
                <span className="text-slate-500 block text-[10px] font-sans">Pine Labs</span>
                <span className="font-bold text-sky-700 block mt-1">₹{settlement.digitalPayments.cardPayments.toLocaleString()}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-slate-500 block text-[10px] font-sans">Bank Transfer</span>
                <span className="font-bold text-sky-700 block mt-1">₹{settlement.digitalPayments.bankTransfer.toLocaleString()}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-slate-500 block text-[10px] font-sans">UPI QR</span>
                <span className="font-bold text-sky-700 block mt-1">₹{settlement.digitalPayments.upiQr.toLocaleString()}</span>
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
                      <tr key={sa.id} className="hover:bg-slate-800/60 transition-colors">
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
                  <option value="cardPayments">Pine Labs Payment Amount</option>
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

      {/* TANK DIP PHYSICAL STOCK CORRECTION MODAL (Q4: Owner Only, Audit Preserved) */}
      {showDipCorrectionModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="border-b border-slate-200 pb-3 flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-xl text-amber-700">
                <Fuel className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Correct Physical Stock ({dipFuelType})</h3>
                <p className="text-xs text-slate-500">Owner Authorized Physical Stock / Dip Correction</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-xs text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Original Chart-Derived Stock:</span>
                <span className="font-bold font-mono text-slate-800">{dipChartStock.toFixed(2)} L</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Verified Stock:</span>
                <span className="font-bold font-mono text-emerald-700">{dipCurrentVerified.toFixed(2)} L</span>
              </div>
              <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 mt-1">
                ℹ️ Original chart-derived value will never be overwritten. An immutable audit trail will record your identity, timestamp, and correction reason.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-slate-700 font-bold block mb-1">Corrected Physical Stock (Litres) *</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  min="0"
                  value={dipCorrectedInput}
                  onChange={(e) => setDipCorrectedInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 font-bold text-base font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div>
                <label className="text-slate-700 font-bold block mb-1">Correction Reason (Mandatory Audit Trail) *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Calibration verification, dip rod re-measurement, chart adjustment..."
                  value={dipReasonInput}
                  onChange={(e) => setDipReasonInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setShowDipCorrectionModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitDipCorrection}
                  disabled={isSubmittingDipCorrection}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isSubmittingDipCorrection ? 'Saving...' : 'Save Dip Correction'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* DESTRUCTIVE DELETE DUTY CONFIRMATION MODAL (OWNER ONLY) */}
      {showDeleteDutyModal && dutyToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-900/50 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl text-slate-100">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400 font-extrabold text-base">
                <AlertTriangle className="h-5 w-5" />
                <span>DELETE DUTY #{dutyToDelete.dutyNumber}?</span>
              </div>
              <button onClick={() => setShowDeleteDutyModal(false)} className="text-slate-400 hover:text-white font-bold">✕</button>
            </div>

            <div className="bg-rose-950/40 border border-rose-500/30 p-4 rounded-xl space-y-2 text-xs text-rose-200">
              <p className="font-extrabold">⚠️ DESTRUCTIVE OPERATION WARNING</p>
              <p>This will permanently remove <strong>Duty #{dutyToDelete.dutyNumber}</strong> ({new Date(dutyToDelete.startTime).toLocaleDateString()}) and its associated meter readings, assignments, expenses, and oil sales.</p>
              <p className="text-[11px] text-rose-300/80">This action cannot be undone. Central stock and customer balances will be recalculated automatically.</p>
            </div>

            <div className="space-y-1 text-xs">
              <label className="text-slate-300 font-bold block">Mandatory Deletion Reason *</label>
              <input
                type="text"
                required
                placeholder="e.g. Test duty created accidentally"
                value={deleteReasonInput}
                onChange={(e) => setDeleteReasonInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-sans text-xs focus:border-rose-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 block">This reason will be stored permanently in the System Audit Log.</span>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setShowDeleteDutyModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteDuty}
                disabled={isDeletingDuty || !deleteReasonInput.trim()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                {isDeletingDuty ? 'Deleting...' : 'Confirm Delete Duty'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PERIOD DUTIES SELECTOR MODAL & HISTORICAL RECONCILER */}
      {selectedPeriodDutiesModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border-2 border-indigo-500/50 rounded-3xl p-5 sm:p-6 max-w-3xl w-full space-y-5 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95 duration-200 my-auto">
            <div className="flex justify-between items-start border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                    Historical Register Details
                  </span>
                  <span className="text-xs text-slate-400 font-mono font-semibold">
                    {selectedPeriodDutiesModal.duties.length} Duty Shift(s)
                  </span>
                </div>
                <h3 className="font-extrabold text-white text-lg sm:text-xl flex items-center gap-2 mt-1">
                  <History className="h-5 w-5 text-indigo-400 shrink-0" />
                  Period: <span className="text-indigo-400">{selectedPeriodDutiesModal.label}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">Aggregated statistics reconciled strictly from database meter readings matching active report parameters.</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPeriodDutiesModal(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* PERIOD SUMMARY RECONCILIATION KPI CARD */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-inner">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Period Sales Summary Reconciliation ({selectedPeriodDutiesModal.label})</span>
                <span className="text-indigo-400 font-mono">Fuel: {filterFuelType} | Pump: {filterPumpId} | Staff: {filterStaffId}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                {(filterFuelType === 'ALL' || filterFuelType === 'MS') && (
                  <div className="bg-slate-900 p-3 rounded-xl border border-amber-500/30">
                    <span className="text-[10px] text-amber-400 font-bold block uppercase">MS Petrol Sold</span>
                    <span className="text-base font-black text-white">{(selectedPeriodDutiesModal.msLitres || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</span>
                    <span className="text-[11px] text-amber-400/90 block font-semibold">₹{(selectedPeriodDutiesModal.msSales || 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {(filterFuelType === 'ALL' || filterFuelType === 'HSD') && (
                  <div className="bg-slate-900 p-3 rounded-xl border border-blue-500/30">
                    <span className="text-[10px] text-blue-400 font-bold block uppercase">HSD Diesel Sold</span>
                    <span className="text-base font-black text-white">{(selectedPeriodDutiesModal.hsdLitres || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</span>
                    <span className="text-[11px] text-blue-400/90 block font-semibold">₹{(selectedPeriodDutiesModal.hsdSales || 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="bg-slate-900 p-3 rounded-xl border border-indigo-500/30">
                  <span className="text-[10px] text-indigo-400 font-bold block uppercase">Total Litres Dispensed</span>
                  <span className="text-base font-black text-indigo-300">{(selectedPeriodDutiesModal.totalLitres || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</span>
                  <span className="text-[11px] text-indigo-400 block font-semibold">{selectedPeriodDutiesModal.duties.length} Shift(s)</span>
                </div>
                <div className="bg-slate-900 p-3 rounded-xl border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-400 font-bold block uppercase">Total Sales Revenue</span>
                  <span className="text-base font-black text-emerald-300">₹{(selectedPeriodDutiesModal.totalSales || 0).toLocaleString('en-IN')}</span>
                  <span className="text-[11px] text-emerald-400 block font-semibold">Reconciled 100%</span>
                </div>
              </div>
            </div>

            {/* COMPLETED DUTY SHIFTS IN THIS PERIOD */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs font-bold text-slate-300">
                <span className="uppercase tracking-wider">Duty Shifts Recorded in {selectedPeriodDutiesModal.label}</span>
                <span className="text-slate-500">Select a shift to inspect nozzle meter readings &amp; settlement</span>
              </div>

              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {selectedPeriodDutiesModal.duties.map((d: any, idx: number) => {
                  let formattedStart = 'N/A';
                  let formattedEnd = 'In Progress';
                  if (d?.startTime) {
                    try {
                      formattedStart = new Date(d.startTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
                    } catch (err) {
                      formattedStart = String(d.startTime);
                    }
                  }
                  if (d?.endTime) {
                    try {
                      formattedEnd = new Date(d.endTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
                    } catch (err) {
                      formattedEnd = String(d.endTime);
                    }
                  }
                  const managerName = d?.managerName || d?.manager?.name || 'Supervisor';

                  // Calculate per-duty filtered litres & sales
                  let dutyMsLitres = 0;
                  let dutyHsdLitres = 0;
                  let dutyMsSales = 0;
                  let dutyHsdSales = 0;

                  (d.meterReadings || []).forEach((mr: any) => {
                    const ft = mr.gun?.fuelType || (mr.gunId && String(mr.gunId).toUpperCase().includes('HSD') ? 'HSD' : 'MS');
                    const pumpMatch = filterPumpId === 'ALL' || mr.pumpId === filterPumpId || mr.pumpName === filterPumpId || mr.gun?.pumpId === filterPumpId;
                    const staffMatch = filterStaffId === 'ALL' || mr.staffId === filterStaffId || d.staffAttendance?.some((sa: any) => sa.staffId === filterStaffId);

                    if (!pumpMatch || !staffMatch) return;

                    let litres = mr.litresSold || (mr.currentReading - mr.previousReading) || 0;
                    let price = mr.priceUsed || (ft === 'HSD' ? 100.08 : 112.15);
                    let amount = mr.salesAmount || (litres * price);

                    if (mr.intervals && mr.intervals.length > 0) {
                      litres = mr.intervals.reduce((acc: number, inv: any) => acc + (inv.endReading - inv.startReading), 0);
                      amount = mr.intervals.reduce((acc: number, inv: any) => acc + ((inv.endReading - inv.startReading) * inv.priceUsed), 0);
                    }

                    if (ft === 'MS' && (filterFuelType === 'ALL' || filterFuelType === 'MS')) {
                      dutyMsLitres += litres;
                      dutyMsSales += amount;
                    } else if (ft === 'HSD' && (filterFuelType === 'ALL' || filterFuelType === 'HSD')) {
                      dutyHsdLitres += litres;
                      dutyHsdSales += amount;
                    }
                  });

                  const dutyTotalLitres = dutyMsLitres + dutyHsdLitres;
                  const dutyTotalSales = dutyMsSales + dutyHsdSales;

                  return (
                    <div
                      key={d?.id || idx}
                      className="bg-slate-950 border border-slate-800 hover:border-indigo-500/60 p-4 rounded-2xl space-y-3 transition-all shadow-md"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="font-black text-white text-base">Duty #{d?.dutyNumber || (idx + 1)}</span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${d?.status === 'CLOSED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                            {d?.status || 'CLOSED'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          Manager: <strong className="text-slate-200">{managerName}</strong>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
                        <div className="text-slate-400">
                          <span className="text-[10px] text-slate-500 font-bold uppercase block">Time Horizon</span>
                          <span className="text-slate-200 font-semibold">{formattedStart} → {formattedEnd}</span>
                        </div>
                        <div className="text-slate-400">
                          <span className="text-[10px] text-slate-500 font-bold uppercase block">Filtered Litres Dispensed</span>
                          <span className="text-indigo-300 font-bold">{dutyTotalLitres.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</span>
                          {(dutyMsLitres > 0 || dutyHsdLitres > 0) && (
                            <span className="text-[10px] text-slate-500 block">
                              {dutyMsLitres > 0 ? `MS: ${dutyMsLitres.toFixed(1)}L` : ''} {dutyHsdLitres > 0 ? `HSD: ${dutyHsdLitres.toFixed(1)}L` : ''}
                            </span>
                          )}
                        </div>
                        <div className="text-slate-400 sm:text-right">
                          <span className="text-[10px] text-slate-500 font-bold uppercase block">Duty Net Revenue</span>
                          <span className="text-emerald-400 font-extrabold text-sm">₹{dutyTotalSales.toLocaleString('en-IN')}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800/60 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSelectDutyAndScroll(d.id)}
                          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          Inspect Full Duty Settlement &amp; Nozzle Register &rarr;
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedPeriodDutiesModal(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all cursor-pointer"
              >
                Close Period Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

