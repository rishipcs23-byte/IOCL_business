'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Fuel, LayoutDashboard, History, FileSpreadsheet, DollarSign, Settings,
  Activity, Users, ShieldAlert, LogOut, ArrowRight, UserCheck, UserX, CheckCircle2,
  AlertTriangle, Plus, Trash2, Calendar, FileText, ChevronRight, HelpCircle,
  Database, Info, TrendingUp, ArrowUpRight, ArrowDownRight, Wallet, HardDrive, BarChart3, CreditCard,
  Edit, Eye, Layers, Building2, Check, ChevronDown, Filter, Lock, Unlock, ShieldCheck, FlaskConical, Menu, X, Mail,
  RefreshCw, Wrench, Printer
} from 'lucide-react';
import {
  logoutAction, getActiveDutySession, startNewDutySession, saveMeterReadingsAction,
  addOilSaleAction, deleteOilSaleAction, addExpenseAction, deleteExpenseAction,
  addCreditTransactionAction, deleteCreditTransactionAction, recordTankDipAction,
  closeDutySessionAction, updateFuelPriceAction, addStaffAction, toggleStaffStatusAction,
  deleteStaffAction, addCustomerAction, toggleCustomerStatusAction, deleteCustomerAction,
  addOilProductAction, updateOilPriceAction, toggleOilProductStatusAction, deleteOilProductAction,
  getStaticData, getCreditLedgerReport, updateMeterReadingAction,
  getHistoricalDuties, getExpenseReport, getOilSalesReport, getOilPurchasesReport, recordTankSampleAction,
  recordOilPurchaseAction, assignShortageAction, recordSampleBoxSaleAction, deleteSampleBoxSaleAction,
  sendTestEmailAction, getEmailLogsAction,
  getEmailRecipientsAction, addEmailRecipientAction, updateEmailRecipientAction, toggleEmailRecipientStatusAction, deleteEmailRecipientAction,
  deleteDutyAction, resetSystemAction, updateBusinessSettingsAction, getBusinessSettingsAction,
  addPumpAction, togglePumpAction, deletePumpAction, addGunAction, toggleGunAction, deleteGunAction,
  recordStaffHandoverAction, markStaffAbsentAction, assignMidDutyStaffAction, getStaffMonthlyAttendanceReportAction, updateStaffAttendanceAction
} from '@/lib/actions';
import * as XLSX from 'xlsx';
import OwnerPastDutyReport from './OwnerPastDutyReport';
import OwnerCreditLedger from './OwnerCreditLedger';
import OilInventoryManager from './OilInventoryManager';
import FuelInventoryManagement from './FuelInventoryManagement';
import { getChartCalculatedStock } from '@/lib/dipChart20KL';
import { calculateStockMetrics } from '@/lib/stockCalculations';
import ToastNotification, { ToastMessage } from './ui/ToastNotification';
import ContextHelpTooltip from './ui/ContextHelpTooltip';
import FirstTimeWalkthroughModal from './ui/FirstTimeWalkthroughModal';
import UniversalFilterBar, { FilterState } from './ui/UniversalFilterBar';
import EmptyStateCard from './ui/EmptyStateCard';
import CalculationExplanationDrawer from './ui/CalculationExplanationDrawer';
import StaffPerformanceReport from './StaffPerformanceReport';
import { ThemeToggle } from './ui/ThemeToggle';

const GUN_SORT_ORDER = ['MS-1', 'MS-2', 'HSD-1', 'HSD-2', 'MS-3', 'MS-4', 'HSD-3', 'HSD-4'];

function getSortedReadings(meterReadings: any[]) {
  if (!meterReadings) return [];
  return [...meterReadings].sort((a, b) => {
    const idxA = GUN_SORT_ORDER.indexOf(a.gun?.name);
    const idxB = GUN_SORT_ORDER.indexOf(b.gun?.name);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    return (a.gun?.name || '').localeCompare(b.gun?.name || '');
  });
}

interface DashboardContainerProps {
  session: { id: string; username: string; role: 'OWNER' | 'MANAGER' };
  staticData: any;
  initialActiveDuty: any;
  stats: any;
  initialHistoricalDuties: any[];
  initialStaffPerformance: any[];
  initialCreditLedger: any[];
  initialExpenses: any[];
  initialOilSales: any[];
  initialOilPurchases?: any[];
  initialStockHistory: any[];
  initialAuditLogs: any[];
}

export default function DashboardContainer({
  session,
  staticData: initialStaticData,
  initialActiveDuty,
  stats,
  initialHistoricalDuties,
  initialStaffPerformance,
  initialCreditLedger,
  initialExpenses,
  initialOilSales,
  initialOilPurchases,
  initialStockHistory,
  initialAuditLogs
}: DashboardContainerProps) {
  const router = useRouter();

  // Navigation State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'current-duty' | 'past-duty' | 'credit-ledger' | 'oil-purchases' | 'oil-sales' | 'oil-inventory' | 'reports' | 'pricing' | 'settings' | 'audit' | 'history'>(
    session.role === 'MANAGER' ? 'current-duty' : 'dashboard'
  );

  // Active states
  const [staticData, setStaticData] = useState<any>(initialStaticData);
  const [activeDuty, setActiveDuty] = useState<any>(initialActiveDuty);
  const [historicalDuties, setHistoricalDuties] = useState<any[]>(initialHistoricalDuties);
  const [staffPerformance, setStaffPerformance] = useState<any[]>(initialStaffPerformance);
  const [creditLedger, setCreditLedger] = useState<any[]>(initialCreditLedger);
  const [expenses, setExpenses] = useState<any[]>(initialExpenses);
  const [oilSales, setOilSales] = useState<any[]>(initialOilSales);
  const [oilPurchases, setOilPurchases] = useState<any[]>(initialOilPurchases || []);
  const [stockHistory, setStockHistory] = useState<any[]>(initialStockHistory);
  const [auditLogs, setAuditLogs] = useState<any[]>(initialAuditLogs);

  // Loading & Message States
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // UI & Tour States
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [tourOpen, setTourOpen] = useState(false);

  const flashToast = (type: 'success' | 'error' | 'info', message: string, title?: string) => {
    const id = Date.now().toString() + Math.random().toString().slice(2, 6);
    const newToast: ToastMessage = { id, type, message, title };
    setToasts((prev) => [...prev, newToast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };


  // --- Change Duty Wizard State ---
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 'review' | 'firstDuty'>(1); // 1: Close active duty, review: Final report review, 2: Start new duty, firstDuty: First duty setup
  const [initialFirstReadings, setInitialFirstReadings] = useState<Record<string, number>>({});
  const [justClosedDutyNumber, setJustClosedDutyNumber] = useState<number | null>(null);

  // Closing form state
  const [closingReadings, setClosingReadings] = useState<Record<string, number>>({});
  const [openingReadings, setOpeningReadings] = useState<Record<string, number>>({});
  const [isClosingUnlocked, setIsClosingUnlocked] = useState<boolean>(false);
  const [actualCash, setActualCash] = useState<number>(0);
  const [digitalPaymentsState, setDigitalPaymentsState] = useState({
    gpay1: 0, gpay2: 0,
    pineLabs1: 0, pineLabs2: 0,
    phonePe1: 0, phonePe2: 0,
    paytm1: 0, paytm2: 0,
    bharatPe1: 0, bharatPe2: 0,
    alp1: 0, alp2: 0,
    ufill1: 0, ufill2: 0,
    bank1: 0, bank2: 0,
    upiQr1: 0, upiQr2: 0,
  });
  const [showDigitalSettlement2, setShowDigitalSettlement2] = useState<Record<string, boolean>>({});

  // Bank deposit state
  const [bankDeposit, setBankDeposit] = useState<number>(0);

  // Testing/Sample deduction state (both Owner and Manager can enter)
  const [msTestingLitres, setMsTestingLitres] = useState<number>(0);
  const [hsdTestingLitres, setHsdTestingLitres] = useState<number>(0);

  // Starting new duty form state
  const [newDutyStartTime, setNewDutyStartTime] = useState<string>('');
  const [assignments, setAssignments] = useState<Record<string, string>>({
    'MS-1': '',
    'MS-2': '',
    'HSD-1': '',
    'HSD-2': '',
    'MS-3': '',
    'MS-4': '',
    'HSD-3': '',
    'HSD-4': '',
  });

  // Current readings form state (when saving ongoing readings without closing)
  const [ongoingReadings, setOngoingReadings] = useState<Record<string, number>>({});

  // Operational form state
  const [oilProdId, setOilProdId] = useState('');
  const [oilQty, setOilQty] = useState<number>(0);

  const [expCategory, setExpCategory] = useState('');
  const [expAmount, setExpAmount] = useState<number>(0);
  const [expDesc, setExpDesc] = useState('');
  const [expMethod, setExpMethod] = useState('Cash');
  const [expRemarks, setExpRemarks] = useState('');

  const [creditCustId, setCreditCustId] = useState('');
  const [creditType, setCreditType] = useState<'CREDIT_SALE' | 'COLLECTION'>('CREDIT_SALE');
  const [indentNumber, setIndentNumber] = useState('');
  const [creditProduct, setCreditProduct] = useState<string>('MS');
  const [creditLitres, setCreditLitres] = useState<number>(0);
  const [creditUnitPrice, setCreditUnitPrice] = useState<number>(0);
  const [creditAmount, setCreditAmount] = useState<number>(0);
  const [creditDesc, setCreditDesc] = useState('');
  const [creditPaymentMethod, setCreditPaymentMethod] = useState<string>('CASH');
  const [creditPaymentReference, setCreditPaymentReference] = useState('');
  const [creditBankName, setCreditBankName] = useState('');
  const [creditPaymentDate, setCreditPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [selectedLedgerCustomer, setSelectedLedgerCustomer] = useState<string>('ALL');
  const [isSubmittingCredit, setIsSubmittingCredit] = useState(false);

  const [dipFuelType, setDipFuelType] = useState<'MS' | 'HSD'>('MS');
  const [dipPhysical, setDipPhysical] = useState<number>(0);

  // Owner controls form state
  const [priceFuelType, setPriceFuelType] = useState<'MS' | 'HSD'>('MS');
  const [newFuelPrice, setNewFuelPrice] = useState<number>(0);
  const [priceEffectiveFrom, setPriceEffectiveFrom] = useState('');
  const [checkpointInputs, setCheckpointInputs] = useState<Record<string, number>>({});

  const [newStaffName, setNewStaffName] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddr, setNewCustAddr] = useState('');

  const [newOilName, setNewOilName] = useState('');
  const [newOilPrice, setNewOilPrice] = useState<number>(0);

  // Reports view states
  const [reportsTab, setReportsTab] = useState<'sales' | 'staff' | 'credit' | 'expenses' | 'oil' | 'stock' | 'cash'>('sales');

  // Aggregated Fuel Meter Sales Report State
  const [fuelReportPreset, setFuelReportPreset] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'LAST_WEEK' | 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR' | 'LAST_YEAR' | 'CUSTOM' | 'WEEK' | 'MONTH' | 'YEAR'>('ALL');
  const [fuelReportDate, setFuelReportDate] = useState<string>('');
  const [fuelReportStartDate, setFuelReportStartDate] = useState<string>('');
  const [fuelReportEndDate, setFuelReportEndDate] = useState<string>('');
  const [fuelReportMonth, setFuelReportMonth] = useState<string>('');
  const [fuelReportYear, setFuelReportYear] = useState<string>('');
  const [fuelReportPump, setFuelReportPump] = useState<string>('ALL');
  const [fuelReportStaff, setFuelReportStaff] = useState<string>('ALL');
  const [fuelReportFuelType, setFuelReportFuelType] = useState<string>('ALL');
  const [fuelReportGroupBy, setFuelReportGroupBy] = useState<'DATE' | 'MONTH' | 'YEAR'>('DATE');
  const [showDetailedMeterAudit, setShowDetailedMeterAudit] = useState<boolean>(false);
  const [selectedDrillDownKey, setSelectedDrillDownKey] = useState<string | null>(null);
  const [selectedDrillDownType, setSelectedDrillDownType] = useState<'PUMP' | 'STAFF' | 'PERIOD' | null>(null);
  const [selectedDayDrillDownDate, setSelectedDayDrillDownDate] = useState<string | null>(null);
  const [showDayDrillDownModal, setShowDayDrillDownModal] = useState<boolean>(false);

  const handleQuickFilter = (preset: 'ALL' | 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'LAST_WEEK' | 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR' | 'LAST_YEAR' | 'CUSTOM') => {
    setFuelReportPreset(preset);
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA');

    setFuelReportDate('');
    setFuelReportStartDate('');
    setFuelReportEndDate('');
    setFuelReportMonth('');
    setFuelReportYear('');

    if (preset === 'TODAY') {
      setFuelReportDate(todayStr);
    } else if (preset === 'YESTERDAY') {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      setFuelReportDate(yesterday.toLocaleDateString('en-CA'));
    } else if (preset === 'THIS_WEEK') {
      const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek - 1));
      setFuelReportStartDate(monday.toLocaleDateString('en-CA'));
      setFuelReportEndDate(todayStr);
    } else if (preset === 'LAST_WEEK') {
      const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
      const lastWeekMon = new Date(now);
      lastWeekMon.setDate(now.getDate() - (dayOfWeek - 1) - 7);
      const lastWeekSun = new Date(lastWeekMon);
      lastWeekSun.setDate(lastWeekMon.getDate() + 6);
      setFuelReportStartDate(lastWeekMon.toLocaleDateString('en-CA'));
      setFuelReportEndDate(lastWeekSun.toLocaleDateString('en-CA'));
    } else if (preset === 'THIS_MONTH') {
      setFuelReportMonth(todayStr.slice(0, 7));
    } else if (preset === 'LAST_MONTH') {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const yr = lastMonthDate.getFullYear();
      const mo = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
      setFuelReportMonth(`${yr}-${mo}`);
    } else if (preset === 'THIS_YEAR') {
      setFuelReportYear(todayStr.slice(0, 4));
    } else if (preset === 'LAST_YEAR') {
      setFuelReportYear(String(now.getFullYear() - 1));
    }
  };

  const handleResetFuelFilters = () => {
    setFuelReportPreset('ALL');
    setFuelReportDate('');
    setFuelReportStartDate('');
    setFuelReportEndDate('');
    setFuelReportMonth('');
    setFuelReportYear('');
    setFuelReportPump('ALL');
    setFuelReportStaff('ALL');
    setFuelReportFuelType('ALL');
    setSelectedDrillDownKey(null);
    setSelectedDrillDownType(null);
  };

  // 24-Hour Duty Staff Attendance & Performance Register State
  const [staffReportDate, setStaffReportDate] = useState<string>('');
  const [staffReportStartDate, setStaffReportStartDate] = useState<string>('');
  const [staffReportEndDate, setStaffReportEndDate] = useState<string>('');
  const [staffReportMonth, setStaffReportMonth] = useState<string>('');
  const [staffReportYear, setStaffReportYear] = useState<string>('');
  const [staffReportStaff, setStaffReportStaff] = useState<string>('ALL');
  const [staffReportPump, setStaffReportPump] = useState<string>('ALL');
  const [staffReportStatusFilter, setStaffReportStatusFilter] = useState<'ALL' | 'PRESENT' | 'ABSENT' | 'NOT_SCHEDULED'>('ALL');
  const mainContentRef = useRef<HTMLDivElement>(null);
  const [staffSearchQuery, setStaffSearchQuery] = useState<string>('');
  const [staffReportViewMode, setStaffReportViewMode] = useState<'FLAT' | 'GROUPED'>('FLAT');
  const [staffReportPage, setStaffReportPage] = useState<number>(1);
  const [staffReportPageSize, setStaffReportPageSize] = useState<number>(20);
  const [expandedDuties, setExpandedDuties] = useState<Record<string, boolean>>({});
  const [selectedAttendanceDetailRow, setSelectedAttendanceDetailRow] = useState<any | null>(null);
  const [showStaffPerformanceOverview, setShowStaffPerformanceOverview] = useState<boolean>(false);
  const [rosterFilter, setRosterFilter] = useState<'ACTIVE' | 'INACTIVE' | 'ALL'>('ACTIVE');
  const [attRosterStatusFilter, setAttRosterStatusFilter] = useState<'ACTIVE' | 'INACTIVE' | 'ALL'>('ACTIVE');

  // Auto-scroll content area to top whenever active main tab or sub-tab changes
  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTop = 0;
    }
  }, [activeTab, reportsTab]);

  // Manual Attendance Status Overrides & Audit Log (Owner privilege)
  const [attendanceOverrides, setAttendanceOverrides] = useState<Record<string, 'PRESENT' | 'ABSENT' | 'NOT_SCHEDULED'>>({});
  const [attendanceAuditLogs, setAttendanceAuditLogs] = useState<Array<{
    id: string;
    staffName: string;
    dutyNumber: number;
    oldStatus: string;
    newStatus: string;
    changedBy: string;
    timestamp: string;
    reason: string;
  }>>([]);

  // Attendance Status Correction Modal State
  const [statusCorrectionModal, setStatusCorrectionModal] = useState<{
    open: boolean;
    dutyId: string;
    dutyNumber: number;
    staffId: string;
    staffName: string;
    currentStatus: 'PRESENT' | 'ABSENT' | 'NOT_SCHEDULED';
    newStatus: 'PRESENT' | 'ABSENT' | 'NOT_SCHEDULED';
    reason: string;
  } | null>(null);

  // Individual Staff Duty History Drawer / Modal State
  const [staffHistoryModal, setStaffHistoryModal] = useState<{
    open: boolean;
    staffId: string;
    staffName: string;
  } | null>(null);

  const handleResetStaffFilters = () => {
    setStaffReportDate('');
    setStaffReportStartDate('');
    setStaffReportEndDate('');
    setStaffReportMonth('');
    setStaffReportYear('');
    setStaffReportStaff('ALL');
    setStaffReportPump('ALL');
    setStaffReportStatusFilter('ALL');
    setStaffSearchQuery('');
    setStaffReportPage(1);
  };

  // Owner Verification Filter & Reading Correction Modal state
  const [selectedDutyId, setSelectedDutyId] = useState<string>('CURRENT');
  const [filterStaffId, setFilterStaffId] = useState<string>('ALL');
  const [filterPumpId, setFilterPumpId] = useState<string>('ALL');
  const [filterDate, setFilterDate] = useState<string>('');
  const [showOilDetails, setShowOilDetails] = useState<boolean>(false);
  const [showCreditDetails, setShowCreditDetails] = useState<boolean>(false);
  const [showExpenseDetails, setShowExpenseDetails] = useState<boolean>(false);
  const [showDigitalDetails, setShowDigitalDetails] = useState<boolean>(false);
  const [editingReading, setEditingReading] = useState<any>(null);
  const [newReadingVal, setNewReadingVal] = useState<number>(0);
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [isSubmittingReadingEdit, setIsSubmittingReadingEdit] = useState<boolean>(false);
  const [expandedPumpId, setExpandedPumpId] = useState<string | null>(null);

  // Multi-Recipient Email System State
  const [emailRecipients, setEmailRecipients] = useState<any[]>([]);
  const [showRecipientModal, setShowRecipientModal] = useState<boolean>(false);
  const [editingRecipient, setEditingRecipient] = useState<any | null>(null);
  const [recNameInput, setRecNameInput] = useState<string>('');
  const [recEmailInput, setRecEmailInput] = useState<string>('');
  const [recDutyReportsInput, setRecDutyReportsInput] = useState<boolean>(true);
  const [recLowStockInput, setRecLowStockInput] = useState<boolean>(true);
  const [isSavingRecipient, setIsSavingRecipient] = useState<boolean>(false);
  const [testTargetEmail, setTestTargetEmail] = useState<string>('');

  // Email test & log state
  const [isSendingTestEmail, setIsSendingTestEmail] = useState<boolean>(false);
  const [testEmailStatus, setTestEmailStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [isLoadingEmailLogs, setIsLoadingEmailLogs] = useState<boolean>(false);

  // Maintenance & System Reset State
  const [showClearReadingsModal, setShowClearReadingsModal] = useState<boolean>(false);
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [resetTextInput, setResetTextInput] = useState<string>('');
  const [resetPasswordInput, setResetPasswordInput] = useState<string>('');
  const [isResettingSystem, setIsResettingSystem] = useState<boolean>(false);

  // Business Branding & Identity Settings State (Owner Only)
  const [bizNameInput, setBizNameInput] = useState<string>(initialStaticData?.businessSettings?.BUSINESS_NAME || 'IOCL Petrol Bunk & Retail Outlet');
  const [bizAddressInput, setBizAddressInput] = useState<string>(initialStaticData?.businessSettings?.BUSINESS_ADDRESS || 'Main Highway Station, Retail Outlet');
  const [bizContactInput, setBizContactInput] = useState<string>(initialStaticData?.businessSettings?.BUSINESS_CONTACT || '+91 9876543210');
  const [reportHeaderInput, setReportHeaderInput] = useState<string>(initialStaticData?.businessSettings?.REPORT_HEADER || 'IOCL Authorized Dealer Accounting Ledger');
  const [msLowThresholdInput, setMsLowThresholdInput] = useState<number>(Number(initialStaticData?.businessSettings?.MS_LOW_THRESHOLD || 6000));
  const [hsdLowThresholdInput, setHsdLowThresholdInput] = useState<number>(Number(initialStaticData?.businessSettings?.HSD_LOW_THRESHOLD || 6000));
  const [isSavingBizSettings, setIsSavingBizSettings] = useState<boolean>(false);

  // Dynamic Pump & Nozzle (Gun) Configuration State
  const [newPumpName, setNewPumpName] = useState<string>('');
  const [newGunPumpId, setNewGunPumpId] = useState<string>('');
  const [newGunName, setNewGunName] = useState<string>('');
  const [newGunFuelType, setNewGunFuelType] = useState<'MS' | 'HSD'>('MS');

  // Staff Handover & Attendance State
  const [showHandoverModal, setShowHandoverModal] = useState<boolean>(false);
  const [handoverTarget, setHandoverTarget] = useState<{
    dutySessionId: string;
    gunId?: string;
    gunName?: string;
    pumpId: string;
    pumpName?: string;
    outgoingStaffId: string;
    outgoingStaffName: string;
    currentReading?: number;
  } | null>(null);
  const [incomingStaffInput, setIncomingStaffInput] = useState<string>('');
  const [handoverTimeInput, setHandoverTimeInput] = useState<string>('');
  const [handoverMeterInput, setHandoverMeterInput] = useState<number>(0);
  const [handoverStatusInput, setHandoverStatusInput] = useState<'EMERGENCY' | 'PARTIAL_DUTY' | 'EARLY_EXIT'>('EMERGENCY');
  const [handoverReasonInput, setHandoverReasonInput] = useState<string>('Emergency');
  const [handoverRemarksInput, setHandoverRemarksInput] = useState<string>('');
  const [isSubmittingHandover, setIsSubmittingHandover] = useState<boolean>(false);

  // Mark Absent State
  const [showAbsentModal, setShowAbsentModal] = useState<boolean>(false);
  const [absentTarget, setAbsentTarget] = useState<{
    dutySessionId: string;
    gunId?: string;
    gunName?: string;
    pumpId: string;
    staffId: string;
    staffName: string;
  } | null>(null);
  const [absentReplacementInput, setAbsentReplacementInput] = useState<string>('');
  const [absentReasonInput, setAbsentReasonInput] = useState<string>('Did not report');
  const [isSubmittingAbsent, setIsSubmittingAbsent] = useState<boolean>(false);

  // Monthly Worked Days Attendance State
  const [attFilterMonth, setAttFilterMonth] = useState<number>(new Date().getMonth() + 1);
  const [attFilterYear, setAttFilterYear] = useState<number>(new Date().getFullYear());
  const [attFilterStaffId, setAttFilterStaffId] = useState<string>('');
  const [attFilterStatus, setAttFilterStatus] = useState<string>('');
  const [attFilterPreset, setAttFilterPreset] = useState<'THIS_MONTH' | 'LAST_MONTH' | 'WEEKLY' | 'CUSTOM'>('THIS_MONTH');
  const [attCustomStartDate, setAttCustomStartDate] = useState<string>('');
  const [attCustomEndDate, setAttCustomEndDate] = useState<string>('');
  const [monthlyAttData, setMonthlyAttData] = useState<any>(null);
  const [isLoadingMonthlyAtt, setIsLoadingMonthlyAtt] = useState<boolean>(false);
  const [detailModalStaff, setDetailModalStaff] = useState<any | null>(null);
  const [showAttDetailModal, setShowAttDetailModal] = useState<boolean>(false);

  // Edit Attendance Modal State
  const [showEditAttModal, setShowEditAttModal] = useState<boolean>(false);
  const [editingAttRecord, setEditingAttRecord] = useState<any | null>(null);
  const [editAttId, setEditAttId] = useState<string>('');
  const [editAttStaffId, setEditAttStaffId] = useState<string>('');
  const [editAttDutySessionId, setEditAttDutySessionId] = useState<string>('');
  const [editAttStaffName, setEditAttStaffName] = useState<string>('');
  const [editAttDutyNumber, setEditAttDutyNumber] = useState<number | string>('');
  const [editAttDate, setEditAttDate] = useState<string>('');
  const [editAttStatusInput, setEditAttStatusInput] = useState<string>('PRESENT');
  const [editAttDaysInput, setEditAttDaysInput] = useState<number | string>(1.0);
  const [editAttRemarksInput, setEditAttRemarksInput] = useState<string>('');
  const [isSubmittingEditAtt, setIsSubmittingEditAtt] = useState<boolean>(false);

  const handleAttPresetChange = (preset: 'THIS_MONTH' | 'LAST_MONTH' | 'WEEKLY' | 'CUSTOM') => {
    setAttFilterPreset(preset);
    const now = new Date();
    if (preset === 'THIS_MONTH') {
      setAttFilterMonth(now.getMonth() + 1);
      setAttFilterYear(now.getFullYear());
      setAttCustomStartDate('');
      setAttCustomEndDate('');
    } else if (preset === 'LAST_MONTH') {
      const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
      const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      setAttFilterMonth(prevMonth);
      setAttFilterYear(prevYear);
      setAttCustomStartDate('');
      setAttCustomEndDate('');
    } else if (preset === 'WEEKLY') {
      const todayStr = now.toISOString().slice(0, 10);
      const weekAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const weekAgoStr = weekAgo.toISOString().slice(0, 10);
      setAttCustomStartDate(weekAgoStr);
      setAttCustomEndDate(todayStr);
    } else if (preset === 'CUSTOM') {
      if (!attCustomStartDate) {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const todayStr = now.toISOString().slice(0, 10);
        setAttCustomStartDate(firstDay);
        setAttCustomEndDate(todayStr);
      }
    }
  };

  const loadMonthlyAttendance = async (
    overrideStart?: string,
    overrideEnd?: string
  ) => {
    setIsLoadingMonthlyAtt(true);
    try {
      const useStart = overrideStart !== undefined ? overrideStart : (attFilterPreset === 'CUSTOM' || attFilterPreset === 'WEEKLY' ? attCustomStartDate : undefined);
      const useEnd = overrideEnd !== undefined ? overrideEnd : (attFilterPreset === 'CUSTOM' || attFilterPreset === 'WEEKLY' ? attCustomEndDate : undefined);

      const data = await getStaffMonthlyAttendanceReportAction(
        attFilterMonth,
        attFilterYear,
        attFilterStaffId || undefined,
        undefined,
        attFilterStatus || undefined,
        attRosterStatusFilter !== 'ACTIVE',
        useStart || undefined,
        useEnd || undefined
      );
      setMonthlyAttData(data);
      return data;
    } catch (err) {
      console.error('Failed to load monthly attendance report:', err);
      return null;
    } finally {
      setIsLoadingMonthlyAtt(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'reports' && reportsTab === 'staff') {
      loadMonthlyAttendance();
    }
  }, [activeTab, reportsTab, attFilterMonth, attFilterYear, attFilterStaffId, attFilterStatus, attRosterStatusFilter, attFilterPreset, attCustomStartDate, attCustomEndDate]);

  const handleOpenEditAtt = (record: any) => {
    setEditingAttRecord(record);
    setEditAttId(record.id);
    setEditAttStaffId(record.staffId || detailModalStaff?.staffId || '');
    setEditAttDutySessionId(record.dutySessionId || '');
    setEditAttStaffName(record.staffName || detailModalStaff?.staffName || 'Staff');
    setEditAttDutyNumber(record.dutyNumber || 'N/A');
    setEditAttDate(record.date || '');
    setEditAttStatusInput(record.status || 'PRESENT');
    setEditAttDaysInput(record.workedDays !== undefined ? record.workedDays : (record.status === 'ABSENT' ? 0 : 1.0));
    setEditAttRemarksInput(record.remarks || '');
    setShowEditAttModal(true);
  };

  const handleSubmitEditAtt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAttId && !editAttDutySessionId) return;
    setIsSubmittingEditAtt(true);
    try {
      const res = await updateStaffAttendanceAction(
        editAttId,
        editAttStatusInput,
        Number(editAttDaysInput),
        editAttRemarksInput,
        editAttStaffId || detailModalStaff?.staffId,
        editAttDutySessionId
      );
      flashMessage('✓ Attendance updated successfully.', 'success');
      setShowEditAttModal(false);
      const freshData = await loadMonthlyAttendance();
      if (freshData && freshData.summary && detailModalStaff) {
        const updatedStaff = freshData.summary.find((s: any) => s.staffId === detailModalStaff.staffId);
        if (updatedStaff) {
          setDetailModalStaff(updatedStaff);
        }
      }
    } catch (err: any) {
      flashMessage(err?.message || 'Failed to update attendance', 'error');
    } finally {
      setIsSubmittingEditAtt(false);
    }
  };

  const handleOpenHandover = (item: {
    dutySessionId: string;
    gunId?: string;
    gunName?: string;
    pumpId: string;
    pumpName?: string;
    outgoingStaffId: string;
    outgoingStaffName: string;
    currentReading?: number;
  }) => {
    setHandoverTarget(item);
    setIncomingStaffInput('');
    const nowStr = new Date().toISOString().slice(0, 16);
    setHandoverTimeInput(nowStr);
    setHandoverMeterInput(item.currentReading || 0);
    setHandoverStatusInput('EMERGENCY');
    setHandoverReasonInput('Emergency');
    setHandoverRemarksInput('');
    setShowHandoverModal(true);
  };

  const handleSubmitHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handoverTarget) return;
    setIsSubmittingHandover(true);
    try {
      const res = await recordStaffHandoverAction({
        dutySessionId: handoverTarget.dutySessionId,
        gunId: handoverTarget.gunId,
        pumpId: handoverTarget.pumpId,
        outgoingStaffId: handoverTarget.outgoingStaffId,
        incomingStaffId: incomingStaffInput || null,
        handoverTimeStr: handoverTimeInput,
        handoverMeterReading: Number(handoverMeterInput),
        status: handoverStatusInput,
        reason: handoverReasonInput,
        remarks: handoverRemarksInput,
      });
      flashMessage(res.message, 'success');
      setShowHandoverModal(false);
      await refreshActiveDuty();
    } catch (err: any) {
      flashMessage(err?.message || 'Failed to record handover', 'error');
    } finally {
      setIsSubmittingHandover(false);
    }
  };

  const handleOpenAbsent = (item: {
    dutySessionId: string;
    gunId?: string;
    gunName?: string;
    pumpId: string;
    staffId: string;
    staffName: string;
  }) => {
    setAbsentTarget(item);
    setAbsentReplacementInput('');
    setAbsentReasonInput('Did not report');
    setShowAbsentModal(true);
  };

  const handleSubmitAbsent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!absentTarget) return;
    setIsSubmittingAbsent(true);
    try {
      const res = await markStaffAbsentAction({
        dutySessionId: absentTarget.dutySessionId,
        gunId: absentTarget.gunId,
        pumpId: absentTarget.pumpId,
        staffId: absentTarget.staffId,
        replacementStaffId: absentReplacementInput || null,
        reason: absentReasonInput,
      });
      flashMessage(res.message, 'success');
      setShowAbsentModal(false);
      await refreshActiveDuty();
    } catch (err: any) {
      flashMessage(err?.message || 'Failed to mark staff absent', 'error');
    } finally {
      setIsSubmittingAbsent(false);
    }
  };

  const handleSaveBusinessSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBizSettings(true);
    try {
      const res = await updateBusinessSettingsAction({
        businessName: bizNameInput,
        businessAddress: bizAddressInput,
        businessContact: bizContactInput,
        reportHeader: reportHeaderInput,
        msLowThreshold: msLowThresholdInput,
        hsdLowThreshold: hsdLowThresholdInput,
      });
      flashMessage(res.message, 'success');
      await refreshActiveDuty();
    } catch (err: any) {
      flashMessage(err?.message || 'Failed to update business settings', 'error');
    } finally {
      setIsSavingBizSettings(false);
    }
  };

  const handleAddPump = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPumpName.trim()) return;
    setActionLoading(true);
    try {
      const res = await addPumpAction(newPumpName.trim());
      if (res.success) {
        flashMessage(`Pump "${newPumpName}" created successfully.`, 'success');
        setNewPumpName('');
        await refreshActiveDuty();
      }
    } catch (err: any) {
      flashMessage(err?.message || 'Failed to add pump', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddGun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGunPumpId || !newGunName.trim()) return;
    setActionLoading(true);
    try {
      const res = await addGunAction(newGunPumpId, newGunName.trim(), newGunFuelType);
      if (res.success) {
        flashMessage(`Nozzle "${newGunName}" (${newGunFuelType}) added successfully.`, 'success');
        setNewGunName('');
        await refreshActiveDuty();
      }
    } catch (err: any) {
      flashMessage(err?.message || 'Failed to add nozzle', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTogglePump = async (pumpId: string, active: boolean) => {
    setActionLoading(true);
    try {
      await togglePumpAction(pumpId, active);
      flashMessage('Pump status updated.', 'success');
      await refreshActiveDuty();
    } catch (err: any) {
      flashMessage(err?.message || 'Failed to update pump', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleGun = async (gunId: string, active: boolean) => {
    setActionLoading(true);
    try {
      await toggleGunAction(gunId, active);
      flashMessage('Nozzle status updated.', 'success');
      await refreshActiveDuty();
    } catch (err: any) {
      flashMessage(err?.message || 'Failed to update nozzle', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteGun = async (gunId: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete nozzle "${name}"? This action cannot be undone.`)) return;
    setActionLoading(true);
    try {
      await deleteGunAction(gunId);
      flashMessage(`Nozzle "${name}" has been permanently deleted.`, 'success');
      await refreshActiveDuty();
    } catch (err: any) {
      flashMessage(err?.message || 'Failed to delete nozzle', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePump = async (pumpId: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete pump unit "${name}" and all its nozzles? This action cannot be undone.`)) return;
    setActionLoading(true);
    try {
      await deletePumpAction(pumpId);
      flashMessage(`Pump unit "${name}" has been permanently deleted.`, 'success');
      await refreshActiveDuty();
    } catch (err: any) {
      flashMessage(err?.message || 'Failed to delete pump unit', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmClearCurrentInputs = () => {
    setOngoingReadings({});
    setClosingReadings({});
    setShowClearReadingsModal(false);
    flashMessage('Current uncommitted pump reading inputs cleared. Historical records were not changed.', 'success');
  };

  const handleOpenResetModal = () => {
    setShowResetModal(true);
    setResetTextInput('');
    setResetPasswordInput('');
  };

  const handleConfirmSystemReset = async () => {
    if (resetTextInput.trim() !== 'RESET SYSTEM') {
      flashMessage('Confirmation text must match exactly "RESET SYSTEM"', 'error');
      return;
    }
    setIsResettingSystem(true);
    try {
      const res = await resetSystemAction(resetTextInput.trim(), resetPasswordInput);
      flashMessage(res.message, 'success');
      setShowResetModal(false);
      await refreshActiveDuty();
    } catch (err: any) {
      flashMessage(err?.message || 'Failed to reset system', 'error');
    } finally {
      setIsResettingSystem(false);
    }
  };

  const handleFetchEmailLogs = async () => {
    setIsLoadingEmailLogs(true);
    try {
      const logs = await getEmailLogsAction();
      setEmailLogs(logs || []);
    } catch (err) {
      console.error('Failed to load email logs:', err);
    } finally {
      setIsLoadingEmailLogs(false);
    }
  };

  const loadEmailRecipients = async () => {
    try {
      const list = await getEmailRecipientsAction();
      setEmailRecipients(list || []);
    } catch (err) {
      console.error('Failed to load email recipients:', err);
    }
  };

  // Automatically load saved email recipients and logs from database on component mount
  useEffect(() => {
    loadEmailRecipients();
    handleFetchEmailLogs();
  }, []);

  const handleOpenAddRecipient = () => {
    setEditingRecipient(null);
    setRecNameInput('');
    setRecEmailInput('');
    setRecDutyReportsInput(true);
    setRecLowStockInput(true);
    setShowRecipientModal(true);
  };

  const handleOpenEditRecipient = (rec: any) => {
    setEditingRecipient(rec);
    setRecNameInput(rec.name || '');
    setRecEmailInput(rec.email || '');
    setRecDutyReportsInput(rec.dutyReportsEnabled ?? true);
    setRecLowStockInput(rec.lowFuelAlertsEnabled ?? true);
    setShowRecipientModal(true);
  };

  const handleSaveEmailRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recNameInput.trim()) {
      flashMessage('Please enter recipient name', 'error');
      return;
    }
    if (!recEmailInput.trim()) {
      flashMessage('Please enter recipient email address', 'error');
      return;
    }
    setIsSavingRecipient(true);
    try {
      if (editingRecipient) {
        await updateEmailRecipientAction(editingRecipient.id, {
          name: recNameInput.trim(),
          email: recEmailInput.trim(),
          dutyReportsEnabled: recDutyReportsInput,
          lowFuelAlertsEnabled: recLowStockInput,
        });
        flashMessage('Email recipient updated successfully', 'success');
      } else {
        await addEmailRecipientAction({
          name: recNameInput.trim(),
          email: recEmailInput.trim(),
          dutyReportsEnabled: recDutyReportsInput,
          lowFuelAlertsEnabled: recLowStockInput,
        });
        flashMessage('Email recipient added successfully', 'success');
      }
      setShowRecipientModal(false);
      await loadEmailRecipients();
    } catch (err: any) {
      flashMessage(err?.message || 'Failed to save email recipient', 'error');
    } finally {
      setIsSavingRecipient(false);
    }
  };

  const handleToggleRecipientStatus = async (id: string, currentActive: boolean) => {
    try {
      await toggleEmailRecipientStatusAction(id, !currentActive);
      flashMessage(`Recipient ${!currentActive ? 'enabled' : 'disabled'} successfully`, 'success');
      await loadEmailRecipients();
    } catch (err: any) {
      flashMessage(err?.message || 'Failed to update recipient status', 'error');
    }
  };

  const handleDeleteRecipient = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete recipient "${name}"?\nHistorical email delivery logs for past deliveries will be preserved.`)) {
      return;
    }
    try {
      await deleteEmailRecipientAction(id);
      flashMessage('Email recipient deleted successfully', 'success');
      await loadEmailRecipients();
    } catch (err: any) {
      flashMessage(err?.message || 'Failed to delete recipient', 'error');
    }
  };

  const handleSendTestEmailToTarget = async () => {
    setIsSendingTestEmail(true);
    setTestEmailStatus(null);
    try {
      const res = await sendTestEmailAction(testTargetEmail || undefined);
      setTestEmailStatus(res);
      if (res.success) {
        flashMessage(res.message, 'success');
      } else {
        flashMessage(res.message, 'error');
      }
      handleFetchEmailLogs();
    } catch (err: any) {
      const msg = `✕ Email could not be sent: ${err?.message || 'Unknown error'}`;
      setTestEmailStatus({ success: false, message: msg });
      flashMessage(msg, 'error');
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  const handleDateFilterChange = (dateVal: string) => {
    setFilterDate(dateVal);
    if (!dateVal) return;
    const availableDuties = [
      ...(activeDuty ? [activeDuty] : []),
      ...initialHistoricalDuties
    ];
    const matched = availableDuties.find((d: any) => {
      const dDateIso = new Date(d.startTime).toISOString().slice(0, 10);
      const dDateLocal = new Date(d.startTime).toLocaleDateString('en-CA');
      return dDateIso === dateVal || dDateLocal === dateVal;
    });
    if (matched) {
      setSelectedDutyId(matched.id === activeDuty?.id ? 'CURRENT' : matched.id);
    }
  };

  const handleDutyFilterChange = (dutyId: string) => {
    setSelectedDutyId(dutyId);
    const target = dutyId === 'CURRENT' ? activeDuty : initialHistoricalDuties.find((d: any) => d.id === dutyId);
    if (target) {
      const dDateLocal = new Date(target.startTime).toLocaleDateString('en-CA');
      setFilterDate(dDateLocal);
    } else {
      setFilterDate('');
    }
  };

  const handleUpdateReading = async () => {
    if (!editingReading) return;
    if (isNaN(newReadingVal) || newReadingVal < editingReading.previousReading) {
      flashMessage(`Closing reading cannot be less than opening reading (${editingReading.previousReading}).`, 'error');
      return;
    }
    setIsSubmittingReadingEdit(true);
    try {
      const res = await updateMeterReadingAction(editingReading.id, newReadingVal, correctionReason);
      if (res.success) {
        flashMessage('Meter reading corrected and security audit logged!', 'success');
        setEditingReading(null);
        await refreshActiveDuty();
      }
    } catch (err: any) {
      flashMessage(err.message || 'Failed to correct meter reading', 'error');
    } finally {
      setIsSubmittingReadingEdit(false);
    }
  };

  const [currentClock, setCurrentClock] = useState<string>('');
  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
    setCurrentClock(new Date().toLocaleString());
    const timer = setInterval(() => {
      setCurrentClock(new Date().toLocaleString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Set initial times & sync URL query params
  useEffect(() => {
    const formatLocalTime = (d: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setNewDutyStartTime(formatLocalTime(new Date()));
    setPriceEffectiveFrom(formatLocalTime(new Date()));

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab && ['dashboard', 'current-duty', 'history', 'reports', 'pricing', 'settings', 'audit'].includes(tab)) {
        setActiveTab(tab as any);
      }

      const sub = params.get('sub');
      if (sub && ['sales', 'staff', 'credit', 'expenses', 'oil', 'stock', 'cash'].includes(sub)) {
        setReportsTab(sub as any);
      }

      const openWizard = params.get('openWizard');
      if (openWizard === 'true') {
        setWizardOpen(true);
        setWizardStep(initialActiveDuty ? 1 : 2);
      }
    }
  }, [initialActiveDuty]);

  // Keep state synced with server props when server revalidates
  useEffect(() => {
    setActiveDuty(initialActiveDuty);
  }, [initialActiveDuty]);

  useEffect(() => {
    setHistoricalDuties(initialHistoricalDuties);
  }, [initialHistoricalDuties]);

  useEffect(() => {
    setCreditLedger(initialCreditLedger);
  }, [initialCreditLedger]);

  useEffect(() => {
    setExpenses(initialExpenses);
  }, [initialExpenses]);

  useEffect(() => {
    setOilSales(initialOilSales);
  }, [initialOilSales]);

  useEffect(() => {
    setStaticData(initialStaticData);
  }, [initialStaticData]);

  // Helper to completely reset current duty input form values
  const resetDutyFormState = () => {
    setIsClosingUnlocked(false);
    setClosingReadings({});
    setOpeningReadings({});
    setOngoingReadings({});
    setActualCash(0);
    setDigitalPaymentsState({ pineLabs1: 0, pineLabs2: 0, gpay1: 0, gpay2: 0, phonePe1: 0, phonePe2: 0, paytm1: 0, paytm2: 0, bharatPe1: 0, bharatPe2: 0, alp1: 0, alp2: 0, ufill1: 0, ufill2: 0, bank1: 0, bank2: 0, upiQr1: 0, upiQr2: 0 });
    setShowDigitalSettlement2({});
    setMsTestingLitres(0);
    setHsdTestingLitres(0);
    setOilProdId('');
    setOilQty(0);
    setExpCategory('');
    setExpAmount(0);
    setExpDesc('');
    setExpRemarks('');
    setIndentNumber('');
    setCreditLitres(0);
    setCreditUnitPrice(0);
    setCreditAmount(0);
    setCreditDesc('');
    setCreditCustId('');
    setCreditType('CREDIT_SALE');
    setCreditPaymentMethod('CASH');
    setCreditPaymentReference('');
    setCreditBankName('');
    setCreditPaymentDate(new Date().toISOString().slice(0, 10));
    setSampleBoxFuelType('MS');
    setSampleBoxQty('');
    setSampleBoxUnitPrice('');
    setSampleBoxNotes('');
    setBankDeposit(0);
    setShortageStaffId('');
    setShortageReason('');
    setMsDensityInput('');
    setHsdDensityInput('');
    setMsDipCmInput('');
    setMsIsEditingStock(false);
    setMsCorrectedStockInput('');
    setMsCorrectionReasonInput('');
    setHsdDipCmInput('');
    setHsdIsEditingStock(false);
    setHsdCorrectedStockInput('');
    setHsdCorrectionReasonInput('');
    setAssignments({
      'MS-1': '',
      'MS-2': '',
      'HSD-1': '',
      'HSD-2': '',
      'MS-3': '',
      'MS-4': '',
      'HSD-3': '',
      'HSD-4': '',
    });
  };

  // Update readings state cleanly when activeDuty session initializes or changes ID
  useEffect(() => {
    setIsClosingUnlocked(false);
    if (activeDuty) {
      const readingsMap: Record<string, number> = {};
      for (const mr of activeDuty.meterReadings || []) {
        readingsMap[mr.gunId] = mr.currentReading || 0;
      }
      setClosingReadings(readingsMap);
      setOngoingReadings(readingsMap);
      setOpeningReadings({});

      if (activeDuty.tankSamples && activeDuty.tankSamples.length > 0) {
        const msS = activeDuty.tankSamples.find((ts: any) => ts.fuelType === 'MS');
        const hsdS = activeDuty.tankSamples.find((ts: any) => ts.fuelType === 'HSD');
        setMsTestingLitres(msS ? msS.litres : 0);
        setHsdTestingLitres(hsdS ? hsdS.litres : 0);
      } else {
        setMsTestingLitres(0);
        setHsdTestingLitres(0);
      }
    } else {
      setClosingReadings({});
      setOngoingReadings({});
      setOpeningReadings({});
      setMsTestingLitres(0);
      setHsdTestingLitres(0);
    }
  }, [activeDuty?.id]);

  const flashMessage = (msg: string, type: 'success' | 'error') => {
    flashToast(type, msg, type === 'success' ? 'Success' : 'Error');
    if (type === 'success') {
      setSuccessMessage(msg);
      setTimeout(() => setSuccessMessage(null), 5000);
    } else {
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  // --- ACTIONS HANDLERS ---

  const handleLogout = async () => {
    setActionLoading(true);
    await logoutAction();
    router.push('/login');
    router.refresh();
  };

  // Sort helper for Guns
  const GUN_SORT_ORDER = ['MS-1', 'MS-2', 'HSD-1', 'HSD-2', 'MS-3', 'MS-4', 'HSD-3', 'HSD-4'];
  const getSortedReadings = (readings: any[]) => {
    if (!readings) return [];
    return [...readings].sort((a, b) => {
      const idxA = GUN_SORT_ORDER.indexOf(a.gun?.name);
      const idxB = GUN_SORT_ORDER.indexOf(b.gun?.name);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
  };

  const getAssignedStaffForGun = (dutySession: any, gun: any): string => {
    if (!gun) return 'Unassigned';

    const normalizePump = (val: string | undefined | null): string => {
      if (!val) return '';
      return val.toLowerCase().replace(/[\s\-_]/g, '');
    };

    const gunName = gun.name;
    const gunId = gun.id;
    const gunFuelType = gun.fuelType;
    const gunPumpId = gun.pumpId;
    const gunPumpName = gun.pump?.name;

    // 1. Try matching against dutySession.assignments from DB
    if (dutySession?.assignments && Array.isArray(dutySession.assignments) && dutySession.assignments.length > 0) {
      // Direct gun match
      const gunMatch = dutySession.assignments.find(
        (a: any) =>
          (gunId && a.gunId === gunId) ||
          (gunName && a.gunId === gunName) ||
          (gunName && a.gun?.name === gunName)
      );
      if (gunMatch?.staff?.name) return gunMatch.staff.name;

      // Pump & FuelType match (handles legacy sessions or pump-level assignments)
      const pumpMatch = dutySession.assignments.find((a: any) => {
        if (a.fuelType && gunFuelType && a.fuelType !== gunFuelType) return false;
        const aPumpStr = normalizePump(a.pumpId || a.pump?.name);
        const gPumpIdStr = normalizePump(gunPumpId);
        const gPumpNameStr = normalizePump(gunPumpName);

        return (
          (aPumpStr && gPumpIdStr && aPumpStr === gPumpIdStr) ||
          (aPumpStr && gPumpNameStr && aPumpStr === gPumpNameStr)
        );
      });
      if (pumpMatch?.staff?.name) return pumpMatch.staff.name;
    }

    // 2. Fallback to current UI form assignments state
    if (assignments) {
      const staffVal = assignments[gunName] || (gunId ? assignments[gunId] : undefined);
      if (staffVal && staticData?.staff) {
        const staffObj = staticData.staff.find((s: any) => s.id === staffVal || s.name === staffVal);
        if (staffObj?.name) return staffObj.name;
      }

      // Legacy key fallback in form state (e.g. Pump1_MS)
      const pNum = (gunPumpName || '').includes('2') || gunName?.includes('3') || gunName?.includes('4') ? 'Pump2' : 'Pump1';
      const legacyKey = `${pNum}_${gunFuelType}`;
      const legacyStaffVal = assignments[legacyKey];
      if (legacyStaffVal && staticData?.staff) {
        const staffObj = staticData.staff.find((s: any) => s.id === legacyStaffVal || s.name === legacyStaffVal);
        if (staffObj?.name) return staffObj.name;
      }
    }

    return 'Unassigned';
  };

  const handleSaveOngoingReadings = async () => {
    if (!activeDuty) return;

    if (!isClosingUnlocked) {
      flashMessage('Closing readings are locked. Please unlock the closing stage first to enter and save closing readings.', 'error');
      return;
    }

    // Check validation: Closing Reading cannot be lower than Opening Reading (previous reading)
    for (const mr of activeDuty.meterReadings) {
      const val = ongoingReadings[mr.gunId];
      if (val !== undefined && val !== null && !isNaN(Number(val)) && Number(val) < mr.previousReading) {
        flashMessage(`Closing reading (${Number(val)}) for ${mr.gun.name} cannot be lower than opening reading (${mr.previousReading}).`, 'error');
        return;
      }
    }

    setActionLoading(true);
    setErrorMessage(null);
    try {
      const payload = Object.entries(ongoingReadings).map(([gunId, currentReading]) => ({
        gunId,
        currentReading: Number(currentReading),
      }));

      const res = await saveMeterReadingsAction(activeDuty.id, payload);
      if (res.success) {
        flashMessage('Meter readings saved successfully.', 'success');
        await refreshActiveDuty();
      }
    } catch (err: any) {
      flashMessage(err.message || 'Failed to save readings', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const refreshActiveDuty = async () => {
    try {
      const updated = await getActiveDutySession();
      setActiveDuty(updated);
      const updatedHistorical = await getHistoricalDuties();
      if (updatedHistorical) {
        setHistoricalDuties(updatedHistorical);
      }
      const updatedLedger = await getCreditLedgerReport();
      if (updatedLedger) {
        setCreditLedger(updatedLedger);
      }
      const updatedExpenses = await getExpenseReport();
      if (updatedExpenses) {
        setExpenses(updatedExpenses);
      }
      const updatedOil = await getOilSalesReport();
      if (updatedOil) {
        setOilSales(updatedOil);
      }
      const updatedPurchases = await getOilPurchasesReport();
      if (updatedPurchases) {
        setOilPurchases(updatedPurchases);
      }
      const updatedStatic = await getStaticData();
      if (updatedStatic) {
        setStaticData(updatedStatic);
      }
      router.refresh();
    } catch (e) {
      console.error("Failed to refresh active duty session:", e);
    }
  };

  const handleAddOilSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDuty || !oilProdId || oilQty <= 0) return;
    setActionLoading(true);
    try {
      const res = await addOilSaleAction(activeDuty.id, oilProdId, oilQty);
      if (res.success) {
        flashMessage('Successfully created', 'success');
        setOilQty(0);
        setOilProdId('');
        await refreshActiveDuty();
      }
    } catch (err: any) {
      flashMessage(err.message || 'Failed to add oil sale', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteOilSale = async (id: string) => {
    if (!confirm('Are you sure you want to delete this oil sale?')) return;
    setActionLoading(true);
    try {
      await deleteOilSaleAction(id);
      flashMessage('Successfully deleted', 'success');
      await refreshActiveDuty();
    } catch (err: any) {
      flashMessage(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDuty || !expCategory || expAmount <= 0 || !expDesc) return;
    setActionLoading(true);
    try {
      const res = await addExpenseAction(activeDuty.id, expCategory, expDesc, expAmount, expMethod, expRemarks);
      if (res.success) {
        flashMessage('Successfully created', 'success');
        setExpAmount(0);
        setExpDesc('');
        setExpRemarks('');
        await refreshActiveDuty();
      }
    } catch (err: any) {
      flashMessage(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    setActionLoading(true);
    try {
      await deleteExpenseAction(id);
      flashMessage('Successfully deleted', 'success');
      await refreshActiveDuty();
    } catch (err: any) {
      flashMessage(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (staticData.customers && staticData.customers.length > 0 && !creditCustId) {
      setCreditCustId(staticData.customers[0].id);
    }
  }, [staticData.customers, creditCustId]);

  const handleAddCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingCredit || actionLoading) return;

    console.log("[ADD CREDIT DEBUG] Form Submit Initiated", {
      activeDutyId: activeDuty?.id,
      creditCustId,
      creditType,
      indentNumber,
      creditProduct,
      creditLitres,
      creditUnitPrice,
      creditAmount,
      creditDesc
    });

    if (!activeDuty) {
      const msg = 'No active duty session found. Please start a duty session first.';
      console.warn("[ADD CREDIT VALIDATION FAIL]", msg);
      flashMessage(msg, 'error');
      return;
    }

    let targetCustId = creditCustId;
    if (!targetCustId && staticData.customers && staticData.customers.length > 0) {
      targetCustId = staticData.customers[0].id;
      setCreditCustId(targetCustId);
    }

    if (!targetCustId) {
      const msg = 'Please select a Customer / Transport Company from the dropdown.';
      console.warn("[ADD CREDIT VALIDATION FAIL]", msg);
      flashMessage(msg, 'error');
      return;
    }

    let finalAmount = 0;
    let finalUnitPrice = creditUnitPrice;
    let prodName = creditProduct;

    if (creditType === 'CREDIT_SALE') {
      if (!indentNumber || !indentNumber.trim()) {
        const msg = 'Please enter an Indent / Slip Number for credit sale.';
        console.warn("[ADD CREDIT VALIDATION FAIL]", msg);
        flashMessage(msg, 'error');
        return;
      }

      if (!creditProduct) {
        const msg = 'Please select a Product (MS, HSD, or Oil).';
        console.warn("[ADD CREDIT VALIDATION FAIL]", msg);
        flashMessage(msg, 'error');
        return;
      }

      if (creditProduct === 'MS') {
        finalUnitPrice = creditUnitPrice > 0 ? creditUnitPrice : msPrice;
        prodName = 'MS Petrol';
      } else if (creditProduct === 'HSD') {
        finalUnitPrice = creditUnitPrice > 0 ? creditUnitPrice : hsdPrice;
        prodName = 'HSD Diesel';
      } else {
        finalUnitPrice = creditUnitPrice;
        prodName = creditProduct || 'Custom Product';
      }

      if (creditLitres > 0) {
        if (finalUnitPrice <= 0) {
          const msg = 'Please enter a valid Rate (₹/L).';
          console.warn("[ADD CREDIT VALIDATION FAIL]", msg);
          flashMessage(msg, 'error');
          return;
        }
        finalAmount = Number((creditLitres * finalUnitPrice).toFixed(2));
      } else if (creditAmount > 0) {
        finalAmount = Number(creditAmount.toFixed(2));
      } else {
        const msg = 'Please enter valid Litres / Qty or Credit Amount.';
        console.warn("[ADD CREDIT VALIDATION FAIL]", msg);
        flashMessage(msg, 'error');
        return;
      }
    } else {
      const methodUpper = creditPaymentMethod.toUpperCase();
      prodName = `${methodUpper} COLLECTION`;
      if (creditAmount <= 0) {
        const msg = 'Please enter a valid Collection Amount (₹).';
        console.warn("[ADD CREDIT VALIDATION FAIL]", msg);
        flashMessage(msg, 'error');
        return;
      }

      const targetCustomer = staticData.customers.find((c: any) => c.id === targetCustId);
      if (targetCustomer && targetCustomer.balance > 0 && creditAmount > targetCustomer.balance + 0.01) {
        const msg = `Collection amount (₹${creditAmount.toLocaleString('en-IN')}) cannot exceed customer's outstanding balance (₹${targetCustomer.balance.toLocaleString('en-IN')}).`;
        flashMessage(msg, 'error');
        return;
      }

      if (methodUpper === 'CHEQUE') {
        if (!creditPaymentReference.trim()) {
          flashMessage('Please enter the Cheque Number.', 'error');
          return;
        }
        if (!creditPaymentDate) {
          flashMessage('Please select the Cheque Date.', 'error');
          return;
        }
      } else if (['RTGS', 'NEFT', 'UPI', 'BANK_TRANSFER'].includes(methodUpper)) {
        if (!creditPaymentReference.trim()) {
          flashMessage(`Please enter the UTR / Reference Number for ${methodUpper}.`, 'error');
          return;
        }
      }

      finalAmount = Number(creditAmount.toFixed(2));
    }

    if (finalAmount <= 0) {
      const msg = 'Credit transaction amount must be greater than ₹0.00.';
      console.warn("[ADD CREDIT VALIDATION FAIL]", msg);
      flashMessage(msg, 'error');
      return;
    }

    setIsSubmittingCredit(true);
    setActionLoading(true);

    try {
      const res = await addCreditTransactionAction(
        activeDuty.id,
        targetCustId,
        creditType,
        finalAmount,
        indentNumber ? indentNumber.trim() : undefined,
        prodName,
        creditLitres > 0 ? creditLitres : undefined,
        finalUnitPrice > 0 ? finalUnitPrice : undefined,
        creditDesc ? creditDesc.trim() : undefined,
        creditPaymentMethod,
        creditPaymentReference ? creditPaymentReference.trim() : undefined,
        creditBankName ? creditBankName.trim() : undefined,
        creditPaymentDate ? creditPaymentDate : undefined
      );

      console.log("[ADD CREDIT DEBUG] Server Action Response:", res);

      if (res && res.success) {
        // Reset input fields cleanly
        setIndentNumber('');
        setCreditLitres(0);
        setCreditUnitPrice(0);
        setCreditAmount(0);
        setCreditDesc('');
        setCreditPaymentReference('');
        setCreditBankName('');
        setCreditPaymentDate(new Date().toISOString().slice(0, 10));

        // Refresh active duty and customer ledger state from database
        await refreshActiveDuty();

        flashMessage(creditType === 'COLLECTION' ? 'Payment collected successfully' : 'Successfully created', 'success');
      } else {
        throw new Error('Database transaction did not complete successfully.');
      }
    } catch (err: any) {
      console.error("[ADD CREDIT DEBUG] Server Action Threw Exception:", err);
      flashMessage(err.message || 'Failed to add credit transaction.', 'error');
    } finally {
      setIsSubmittingCredit(false);
      setActionLoading(false);
    }
  };

  const handleDeleteCredit = async (creditParam: any) => {
    // creditParam can be either a string ID or the full credit transaction object
    const ctObj = typeof creditParam === 'object' && creditParam !== null ? creditParam : activeDuty?.creditTransactions?.find((c: any) => c.id === creditParam);
    const creditId = typeof creditParam === 'string' ? creditParam : creditParam?.id;

    if (!creditId) return;

    const isCollection = ctObj?.transactionType === 'COLLECTION';
    const amountVal = Number(ctObj?.amount || 0);
    const amountStr = amountVal > 0 ? ` ₹${amountVal.toLocaleString('en-IN')}` : '';
    const methodStr = ctObj?.paymentMethod || 'Collection';

    const confirmMsg = isCollection
      ? `Delete this${amountStr} ${methodStr} collection?\nThe customer's outstanding balance will increase by${amountStr}.`
      : `Delete this${amountStr} credit transaction?`;

    if (!confirm(confirmMsg)) return;

    setActionLoading(true);
    try {
      const res = await deleteCreditTransactionAction(creditId);
      if (res && res.success) {
        flashMessage(isCollection ? 'Collection deleted. Balance updated.' : 'Successfully deleted', 'success');
        await refreshActiveDuty();
      }
    } catch (err: any) {
      flashMessage(err.message || 'Failed to reverse transaction', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddDip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDuty || dipPhysical <= 0) return;
    setActionLoading(true);
    try {
      // Calculate expected closing stock
      const salesVolume = activeDuty.meterReadings
        .filter((mr: any) => mr.gun.fuelType === dipFuelType)
        .reduce((sum: number, mr: any) => sum + mr.litresSold, 0);

      // Get last stock level
      const lastStockLevel = stockHistory.find(s => s.fuelType === dipFuelType);
      const opening = lastStockLevel ? lastStockLevel.physicalDip : (dipFuelType === 'MS' ? 7504 : 12741);
      const expected = opening - salesVolume;

      const res = await recordTankDipAction(activeDuty.id, dipFuelType, dipPhysical, expected);
      if (res.success) {
        flashMessage(`${dipFuelType} tank dip reading recorded.`, 'success');
        setDipPhysical(0);
        router.refresh();
      }
    } catch (err: any) {
      flashMessage(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // --- CHANGE DUTY WIZARD SUBMISSIONS ---

  // --- ACC HANDWRITTEN BOOK CALCULATIONS ---
  // 1. MS Guns (MS-1, MS-2, MS-3, MS-4)
  const msLitresRaw = activeDuty?.meterReadings
    ?.filter((mr: any) => mr.gun.fuelType === 'MS')
    .reduce((sum: number, mr: any) => {
      const prevVal = (openingReadings[mr.gunId] !== undefined && !isNaN(Number(openingReadings[mr.gunId])))
        ? Number(openingReadings[mr.gunId])
        : mr.previousReading;
      const val = closingReadings[mr.gunId] !== undefined ? closingReadings[mr.gunId] : mr.currentReading;
      return sum + Math.max(0, val - prevVal);
    }, 0) || 0;

  const msPrice = activeDuty?.meterReadings?.find((mr: any) => mr.gun.fuelType === 'MS')?.priceUsed || 112.15;
  const msActualLitres = Math.max(0, msLitresRaw - msTestingLitres);
  const totalMsSalesAmount = msActualLitres * msPrice;
  const msTestingValue = msTestingLitres * msPrice;

  // 2. HSD Guns (HSD-1, HSD-2, HSD-3, HSD-4)
  const hsdLitresRaw = activeDuty?.meterReadings
    ?.filter((mr: any) => mr.gun.fuelType === 'HSD')
    .reduce((sum: number, mr: any) => {
      const prevVal = (openingReadings[mr.gunId] !== undefined && !isNaN(Number(openingReadings[mr.gunId])))
        ? Number(openingReadings[mr.gunId])
        : mr.previousReading;
      const val = closingReadings[mr.gunId] !== undefined ? closingReadings[mr.gunId] : mr.currentReading;
      return sum + Math.max(0, val - prevVal);
    }, 0) || 0;

  const hsdPrice = activeDuty?.meterReadings?.find((mr: any) => mr.gun.fuelType === 'HSD')?.priceUsed || 100.08;
  const hsdActualLitres = Math.max(0, hsdLitresRaw - hsdTestingLitres);
  const totalHsdSalesAmount = hsdActualLitres * hsdPrice;
  const hsdTestingValue = hsdTestingLitres * hsdPrice;
  const totalTestingValue = msTestingValue + hsdTestingValue;

  // 2b. Paid Sample Box / Load Sales (Revenue Generating Fuel Sales)
  const sampleBoxSalesTotal = activeDuty?.sampleBoxSales?.reduce((sum: number, s: any) => sum + Number(s.totalAmount || 0), 0) || 0;
  const sampleBoxLitresTotal = activeDuty?.sampleBoxSales?.reduce((sum: number, s: any) => sum + Number(s.quantity || 0), 0) || 0;

  // 3. Combined Fuel Sales & Revenue
  const grossFuelSalesTotal = (msLitresRaw * msPrice) + (hsdLitresRaw * hsdPrice) + sampleBoxSalesTotal;
  const dynamicFuelLitresTotal = msLitresRaw + hsdLitresRaw + sampleBoxLitresTotal;
  const dynamicFuelSalesTotal = totalMsSalesAmount + totalHsdSalesAmount + sampleBoxSalesTotal;
  const oilSalesTotal = activeDuty?.oilSales?.reduce((sum: number, os: any) => sum + os.totalAmount, 0) || 0;
  const totalRevenue = dynamicFuelSalesTotal + oilSalesTotal;

  const expensesPaidInCash = activeDuty?.expenses
    .filter((ex: any) => ex.paymentMethod === 'Cash')
    .reduce((sum: number, ex: any) => sum + ex.amount, 0) || 0;

  const creditSalesAmount = activeDuty?.creditTransactions
    .filter((ct: any) => ct.transactionType === 'CREDIT_SALE')
    .reduce((sum: number, ct: any) => sum + ct.amount, 0) || 0;

  const creditCollectionsCash = activeDuty?.creditTransactions
    .filter((ct: any) => ct.transactionType === 'COLLECTION')
    .reduce((sum: number, ct: any) => sum + ct.amount, 0) || 0;

  // Expected Cash calculation based on 4-step accounting flow
  const digitalPaymentsSum = Object.values(digitalPaymentsState).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const grossRevenueInflow = dynamicFuelSalesTotal + oilSalesTotal + creditCollectionsCash;
  const totalDeductions = creditSalesAmount + digitalPaymentsSum + expensesPaidInCash;
  const expectedCash = grossRevenueInflow - totalDeductions;
  const cashDiff = actualCash - expectedCash;

  // Helper to scroll into view, focus, and visually pulse highlight invalid form elements
  const highlightAndScrollTo = (elementId: string, message: string) => {
    setErrorMessage(message);
    flashToast('error', message, 'Validation Required');

    setTimeout(() => {
      const el = document.getElementById(elementId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
        el.classList.add('ring-4', 'ring-red-500', 'ring-offset-2', 'ring-offset-slate-950', 'animate-pulse');
        setTimeout(() => {
          el.classList.remove('ring-4', 'ring-red-500', 'ring-offset-2', 'ring-offset-slate-950', 'animate-pulse');
        }, 3500);
      }
    }, 100);
  };

  // Step 1 -> Move to Step 4 Final Review Screen
  const handleProceedToReview = () => {
    if (!activeDuty) return;
    setErrorMessage(null);

    // 1. Validate Meter Closing Readings
    for (const mr of activeDuty.meterReadings) {
      const prevVal = (openingReadings[mr.gunId] !== undefined && !isNaN(Number(openingReadings[mr.gunId])))
        ? Number(openingReadings[mr.gunId])
        : mr.previousReading;
      const currentVal = closingReadings[mr.gunId] !== undefined ? closingReadings[mr.gunId] : mr.currentReading;

      if (closingReadings[mr.gunId] === undefined && mr.currentReading <= 0) {
        highlightAndScrollTo(`closing-reading-${mr.gunId}`, `Closing meter reading for ${mr.gun.name} (${mr.gun.fuelType}) is missing. Please enter current reading.`);
        return;
      }

      const hasIntervals = mr.intervals && mr.intervals.length > 0;
      const applicablePrev = hasIntervals
        ? mr.intervals[mr.intervals.length - 1].startReading
        : prevVal;

      if (currentVal < applicablePrev) {
        highlightAndScrollTo(`closing-reading-${mr.gunId}`, `Closing reading (${currentVal}) for ${mr.gun.name} cannot be lower than the previous reading (${applicablePrev}).`);
        return;
      }
    }

    // 2. Validate MS Density
    const msDensStr = msDensityInput.trim();
    if (msDensStr === '') {
      highlightAndScrollTo('ms-density-input-top', 'MS / Petrol Density is required! Please enter density @ 15°C (710.0 - 780.0 kg/m³).');
      return;
    }
    const msDens = Number(msDensStr);
    if (isNaN(msDens) || msDens < 710 || msDens > 780) {
      highlightAndScrollTo('ms-density-input-top', `MS Density (${msDensStr} kg/m³) is out of standard range (710.0 - 780.0 kg/m³ at 15°C).`);
      return;
    }

    // 3. Validate HSD Density
    const hsdDensStr = hsdDensityInput.trim();
    if (hsdDensStr === '') {
      highlightAndScrollTo('hsd-density-input-top', 'HSD / Diesel Density is required! Please enter density @ 15°C (810.0 - 870.0 kg/m³).');
      return;
    }
    const hsdDens = Number(hsdDensStr);
    if (isNaN(hsdDens) || hsdDens < 810 || hsdDens > 870) {
      highlightAndScrollTo('hsd-density-input-top', `HSD Density (${hsdDensStr} kg/m³) is out of standard range (810.0 - 870.0 kg/m³ at 15°C).`);
      return;
    }

    // 4. Validate MS Tank Physical Dip
    const msDipStr = msDipCmInput.trim();
    if (msDipStr === '') {
      highlightAndScrollTo('ms-dip-cm-input', 'MS Tank Physical Dip measurement is required! Please enter dip reading in cm (0.0 to 211.0 cm).');
      return;
    }
    if (msMetrics.dipCm === null || isNaN(msMetrics.dipCm) || msMetrics.dipCm < 0 || msMetrics.dipCm > 211) {
      highlightAndScrollTo('ms-dip-cm-input', `MS Tank Dip reading (${msDipStr} cm) is invalid. Must be between 0.0 and 211.0 cm.`);
      return;
    }

    // 5. Validate HSD Tank Physical Dip
    const hsdDipStr = hsdDipCmInput.trim();
    if (hsdDipStr === '') {
      highlightAndScrollTo('hsd-dip-cm-input', 'HSD Tank Physical Dip measurement is required! Please enter dip reading in cm (0.0 to 211.0 cm).');
      return;
    }
    if (hsdMetrics.dipCm === null || isNaN(hsdMetrics.dipCm) || hsdMetrics.dipCm < 0 || hsdMetrics.dipCm > 211) {
      highlightAndScrollTo('hsd-dip-cm-input', `HSD Tank Dip reading (${hsdDipStr} cm) is invalid. Must be between 0.0 and 211.0 cm.`);
      return;
    }

    // 6. Validate Manual Stock Override Reason (if enabled)
    if (msIsEditingStock && (msMetrics.correctedStock === null || isNaN(msMetrics.correctedStock) || !msCorrectionReasonInput.trim())) {
      highlightAndScrollTo('ms-dip-cm-input', 'Please enter both corrected stock volume and reason for MS stock correction.');
      return;
    }
    if (hsdIsEditingStock && (hsdMetrics.correctedStock === null || isNaN(hsdMetrics.correctedStock) || !hsdCorrectionReasonInput.trim())) {
      highlightAndScrollTo('hsd-dip-cm-input', 'Please enter both corrected stock volume and reason for HSD stock correction.');
      return;
    }

    // 7. Validate Bank Deposited Cash
    if (bankDeposit === undefined || bankDeposit === null || isNaN(Number(bankDeposit))) {
      highlightAndScrollTo('bank-deposit-input', 'Bank Deposited Cash is required. Please enter the cash deposited to bank.');
      return;
    }

    // 8. Shortage Attribution (if > ₹10)
    const shortageAmount = expectedCash - (bankDeposit || 0);
    if (shortageAmount > 10 && !shortageStaffId) {
      highlightAndScrollTo('shortage-staff-select', `Cash shortage of ₹${shortageAmount.toFixed(2)} detected. Please select the staff member responsible.`);
      return;
    }

    setWizardStep('review');
  };

  const [shortageStaffId, setShortageStaffId] = useState<string>('');
  const [shortageReason, setShortageReason] = useState<string>('Duty Cash Shortage');
  const [msDensityInput, setMsDensityInput] = useState<string>('');
  const [hsdDensityInput, setHsdDensityInput] = useState<string>('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);

  // Tank Dip state variables
  const [msDipCmInput, setMsDipCmInput] = useState<string>('');
  const [msIsEditingStock, setMsIsEditingStock] = useState<boolean>(false);
  const [msCorrectedStockInput, setMsCorrectedStockInput] = useState<string>('');
  const [msCorrectionReasonInput, setMsCorrectionReasonInput] = useState<string>('');

  const [hsdDipCmInput, setHsdDipCmInput] = useState<string>('');
  const [hsdIsEditingStock, setHsdIsEditingStock] = useState<boolean>(false);
  const [hsdCorrectedStockInput, setHsdCorrectedStockInput] = useState<string>('');
  const [hsdCorrectionReasonInput, setHsdCorrectionReasonInput] = useState<string>('');

  // Sample Box / Load Sale state variables
  const [sampleBoxFuelType, setSampleBoxFuelType] = useState<'MS' | 'HSD'>('MS');
  const [sampleBoxQty, setSampleBoxQty] = useState<string>('');
  const [sampleBoxUnitPrice, setSampleBoxUnitPrice] = useState<string>('');
  const [sampleBoxNotes, setSampleBoxNotes] = useState<string>('');
  const [sampleBoxLoading, setSampleBoxLoading] = useState<boolean>(false);

  const handleRecordSampleBoxSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDuty?.id) return;
    const qty = Number(sampleBoxQty);
    if (isNaN(qty) || qty <= 0) {
      flashToast('error', 'Please enter a valid quantity greater than 0 litres.', 'Invalid Quantity');
      return;
    }
    const price = sampleBoxUnitPrice !== '' ? Number(sampleBoxUnitPrice) : undefined;
    setSampleBoxLoading(true);
    try {
      const res = await recordSampleBoxSaleAction(activeDuty.id, sampleBoxFuelType, qty, price, sampleBoxNotes);
      if (res.success) {
        flashToast('success', `Recorded ${sampleBoxFuelType} Sample Box Sale: ${qty} L (₹${res.sale.totalAmount})`, 'Sale Recorded');
        setSampleBoxQty('');
        setSampleBoxNotes('');
        setSampleBoxUnitPrice('');
        router.refresh();
      }
    } catch (err: any) {
      flashToast('error', err.message || 'Failed to record sample box sale', 'Error');
    } finally {
      setSampleBoxLoading(false);
    }
  };

  const handleDeleteSampleBoxSale = async (id: string) => {
    if (!confirm('Are you sure you want to delete this sample box sale?')) return;
    try {
      const res = await deleteSampleBoxSaleAction(id);
      if (res.success) {
        flashToast('success', 'Sample box sale deleted successfully.', 'Deleted');
        router.refresh();
      }
    } catch (err: any) {
      flashToast('error', err.message || 'Failed to delete sample box sale', 'Error');
    }
  };

  // Find Opening Tank Stock from central inventory state (previous finalized stock)
  const getOpeningStockFromHistory = (fType: 'MS' | 'HSD') => {
    if (staticData?.inventoryState?.[fType]?.openingStock && staticData.inventoryState[fType].openingStock > 0) {
      return staticData.inventoryState[fType].openingStock;
    }
    const previousClosedDuty = historicalDuties?.find((d: any) => d.status === 'CLOSED');
    const prevDip = previousClosedDuty?.tankDips?.find((t: any) => t.fuelType === fType);
    if (prevDip?.finalLitres !== null && prevDip?.finalLitres !== undefined && Number(prevDip.finalLitres) > 0) {
      return Number(prevDip.finalLitres);
    }
    if (prevDip?.physicalDip !== null && prevDip?.physicalDip !== undefined && Number(prevDip.physicalDip) > 0) {
      return Number(prevDip.physicalDip);
    }
    if (prevDip?.openingStock !== null && prevDip?.openingStock !== undefined && Number(prevDip.openingStock) > 0) {
      return Number(prevDip.openingStock);
    }

    return fType === 'MS' ? 12000 : 15000;
  };

  const msOpeningTankStock = getOpeningStockFromHistory('MS');
  const hsdOpeningTankStock = getOpeningStockFromHistory('HSD');

  // Meter dispensing litres for current active duty
  const msActiveDispensedLitres = activeDuty ? activeDuty.meterReadings
    .filter((mr: any) => mr.gun?.fuelType === 'MS')
    .reduce((sum: number, mr: any) => {
      const prevVal = (openingReadings[mr.gunId] !== undefined && !isNaN(Number(openingReadings[mr.gunId])))
        ? Number(openingReadings[mr.gunId])
        : mr.previousReading;
      const currentVal = closingReadings[mr.gunId] !== undefined ? closingReadings[mr.gunId] : mr.currentReading;
      return sum + Math.max(0, currentVal - prevVal);
    }, 0) : 0;

  const hsdActiveDispensedLitres = activeDuty ? activeDuty.meterReadings
    .filter((mr: any) => mr.gun?.fuelType === 'HSD')
    .reduce((sum: number, mr: any) => {
      const prevVal = (openingReadings[mr.gunId] !== undefined && !isNaN(Number(openingReadings[mr.gunId])))
        ? Number(openingReadings[mr.gunId])
        : mr.previousReading;
      const currentVal = closingReadings[mr.gunId] !== undefined ? closingReadings[mr.gunId] : mr.currentReading;
      return sum + Math.max(0, currentVal - prevVal);
    }, 0) : 0;

  // Active receipts during current duty session
  const msActiveReceipts = activeDuty ? (activeDuty.fuelStockMovements || [])
    .filter((m: any) => m.fuelType === 'MS' && m.movementType === 'RECEIPT')
    .reduce((sum: number, m: any) => sum + (m.quantityLitres || 0), 0) : (staticData?.inventoryState?.MS?.activeReceipts || 0);

  const hsdActiveReceipts = activeDuty ? (activeDuty.fuelStockMovements || [])
    .filter((m: any) => m.fuelType === 'HSD' && m.movementType === 'RECEIPT')
    .reduce((sum: number, m: any) => sum + (m.quantityLitres || 0), 0) : (staticData?.inventoryState?.HSD?.activeReceipts || 0);

  // Derived stock metrics using centralized stockCalculations module
  const msMetrics = calculateStockMetrics({
    fuelType: 'MS',
    openingStock: msOpeningTankStock,
    receipts: msActiveReceipts,
    physicalDispensing: msActiveDispensedLitres,
    dipCm: msDipCmInput,
    isCorrected: msIsEditingStock,
    correctedLitres: msCorrectedStockInput,
  });

  const hsdMetrics = calculateStockMetrics({
    fuelType: 'HSD',
    openingStock: hsdOpeningTankStock,
    receipts: hsdActiveReceipts,
    physicalDispensing: hsdActiveDispensedLitres,
    dipCm: hsdDipCmInput,
    isCorrected: hsdIsEditingStock,
    correctedLitres: hsdCorrectedStockInput,
  });

  // Latest verified physical stock for website HIGH ALERT notification banner (≤ 6,000 L threshold)
  const lastClosedDutyForAlert = historicalDuties?.find((d: any) => d.status === 'CLOSED');
  const msLastDipAlert = lastClosedDutyForAlert?.tankDips?.find((t: any) => t.fuelType === 'MS');
  const hsdLastDipAlert = lastClosedDutyForAlert?.tankDips?.find((t: any) => t.fuelType === 'HSD');

  const verifiedMsPhysical = msMetrics.dipCm !== null && msMetrics.dipCm !== undefined && msMetrics.finalVerifiedStock !== null && msMetrics.finalVerifiedStock !== undefined
    ? msMetrics.finalVerifiedStock
    : (msLastDipAlert ? (msLastDipAlert.finalLitres ?? msLastDipAlert.physicalDip) : null);

  const verifiedHsdPhysical = hsdMetrics.dipCm !== null && hsdMetrics.dipCm !== undefined && hsdMetrics.finalVerifiedStock !== null && hsdMetrics.finalVerifiedStock !== undefined
    ? hsdMetrics.finalVerifiedStock
    : (hsdLastDipAlert ? (hsdLastDipAlert.finalLitres ?? hsdLastDipAlert.physicalDip) : null);

  const isMsStockCritical = verifiedMsPhysical !== null && verifiedMsPhysical !== undefined && verifiedMsPhysical <= 6000;
  const isHsdStockCritical = verifiedHsdPhysical !== null && verifiedHsdPhysical !== undefined && verifiedHsdPhysical <= 6000;
  const isAnyStockCritical = isMsStockCritical || isHsdStockCritical;

  // Step 4 Final Review Screen -> Perform Atomic Database Closing
  const handleConfirmCloseDuty = async () => {
    if (!activeDuty) return;

    // Density validation before closing
    const msDens = msDensityInput !== '' ? Number(msDensityInput) : NaN;
    const hsdDens = hsdDensityInput !== '' ? Number(hsdDensityInput) : NaN;

    if (isNaN(msDens) || msDens < 710 || msDens > 780) {
      flashMessage('MS density must be between 710 and 780 kg/m³ at 15°C.', 'error');
      return;
    }
    if (isNaN(hsdDens) || hsdDens < 810 || hsdDens > 870) {
      flashMessage('HSD density must be between 810 and 870 kg/m³ at 15°C.', 'error');
      return;
    }

    const shortageAmt = Number((expectedCash - Number(bankDeposit || 0)).toFixed(2));
    if (shortageAmt > 10 && !shortageStaffId) {
      flashMessage(`Cash shortage is ₹${shortageAmt.toFixed(2)} (exceeds ₹10 threshold). Please select the staff member responsible for the shortage before closing.`, 'error');
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    try {
      const readingsPayload = activeDuty.meterReadings.map((mr: any) => ({
        gunId: mr.gunId,
        currentReading: closingReadings[mr.gunId] !== undefined ? Number(closingReadings[mr.gunId]) : mr.currentReading,
        previousReading: openingReadings[mr.gunId] !== undefined ? Number(openingReadings[mr.gunId]) : mr.previousReading,
      }));

      const testingPayload = {
        msTestingLitres: Number(msTestingLitres || 0),
        hsdTestingLitres: Number(hsdTestingLitres || 0),
      };

      const shortagePayload = (shortageAmt > 10 && shortageStaffId) ? {
        staffId: shortageStaffId,
        amount: shortageAmt,
        reason: shortageReason || `Duty Cash Shortage (-₹${shortageAmt})`,
      } : undefined;

      const densityPayload = {
        msDensity: msDens,
        hsdDensity: hsdDens,
      };

      const tankDipPayload = {
        ms: {
          dipCm: msMetrics.dipCm ?? 0,
          chartCalculatedLitres: msMetrics.chartCalculatedStock ?? 0,
          correctedLitres: msMetrics.correctedStock,
          finalLitres: msMetrics.finalVerifiedStock ?? 0,
          isCorrected: msMetrics.isCorrected,
          correctionReason: msCorrectionReasonInput || undefined,
        },
        hsd: {
          dipCm: hsdMetrics.dipCm ?? 0,
          chartCalculatedLitres: hsdMetrics.chartCalculatedStock ?? 0,
          correctedLitres: hsdMetrics.correctedStock,
          finalLitres: hsdMetrics.finalVerifiedStock ?? 0,
          isCorrected: hsdMetrics.isCorrected,
          correctionReason: hsdCorrectionReasonInput || undefined,
        },
      };

      const digitalSettlementsPayload = [
        ...(digitalPaymentsState.pineLabs1 ? [{ provider: 'Pine Labs', amount: digitalPaymentsState.pineLabs1, referenceId: 'Settlement 1' }] : []),
        ...(digitalPaymentsState.pineLabs2 ? [{ provider: 'Pine Labs', amount: digitalPaymentsState.pineLabs2, referenceId: 'Settlement 2' }] : []),
        ...(digitalPaymentsState.gpay1 ? [{ provider: 'GPay', amount: digitalPaymentsState.gpay1, referenceId: 'Settlement 1' }] : []),
        ...(digitalPaymentsState.gpay2 ? [{ provider: 'GPay', amount: digitalPaymentsState.gpay2, referenceId: 'Settlement 2' }] : []),
        ...(digitalPaymentsState.phonePe1 ? [{ provider: 'PhonePe', amount: digitalPaymentsState.phonePe1, referenceId: 'Settlement 1' }] : []),
        ...(digitalPaymentsState.phonePe2 ? [{ provider: 'PhonePe', amount: digitalPaymentsState.phonePe2, referenceId: 'Settlement 2' }] : []),
        ...(digitalPaymentsState.paytm1 ? [{ provider: 'Paytm', amount: digitalPaymentsState.paytm1, referenceId: 'Settlement 1' }] : []),
        ...(digitalPaymentsState.paytm2 ? [{ provider: 'Paytm', amount: digitalPaymentsState.paytm2, referenceId: 'Settlement 2' }] : []),
        ...(digitalPaymentsState.bharatPe1 ? [{ provider: 'BharatPe', amount: digitalPaymentsState.bharatPe1, referenceId: 'Settlement 1' }] : []),
        ...(digitalPaymentsState.bharatPe2 ? [{ provider: 'BharatPe', amount: digitalPaymentsState.bharatPe2, referenceId: 'Settlement 2' }] : []),
        ...(digitalPaymentsState.alp1 ? [{ provider: 'ALP', amount: digitalPaymentsState.alp1, referenceId: 'Settlement 1' }] : []),
        ...(digitalPaymentsState.alp2 ? [{ provider: 'ALP', amount: digitalPaymentsState.alp2, referenceId: 'Settlement 2' }] : []),
        ...(digitalPaymentsState.ufill1 ? [{ provider: 'UFill', amount: digitalPaymentsState.ufill1, referenceId: 'Settlement 1' }] : []),
        ...(digitalPaymentsState.ufill2 ? [{ provider: 'UFill', amount: digitalPaymentsState.ufill2, referenceId: 'Settlement 2' }] : []),
        ...(digitalPaymentsState.bank1 ? [{ provider: 'Bank', amount: digitalPaymentsState.bank1, referenceId: 'Settlement 1' }] : []),
        ...(digitalPaymentsState.bank2 ? [{ provider: 'Bank', amount: digitalPaymentsState.bank2, referenceId: 'Settlement 2' }] : []),
        ...(digitalPaymentsState.upiQr1 ? [{ provider: 'UPI QR', amount: digitalPaymentsState.upiQr1, referenceId: 'Settlement 1' }] : []),
        ...(digitalPaymentsState.upiQr2 ? [{ provider: 'UPI QR', amount: digitalPaymentsState.upiQr2, referenceId: 'Settlement 2' }] : []),
      ];

      const res = await closeDutySessionAction(
        activeDuty.id,
        Number(bankDeposit || 0),
        digitalPaymentsSum,
        0,
        expectedCash,
        digitalSettlementsPayload,
        {
          bankDeposit: Number(bankDeposit || 0),
          cashRetained: 0,
        },
        readingsPayload,
        testingPayload,
        shortagePayload,
        densityPayload,
        tankDipPayload
      );

      if (res.success) {
        const closedNo = activeDuty.dutyNumber;
        setJustClosedDutyNumber(closedNo);
        // Reset density and dip state so next duty gets fresh blank inputs
        setMsDensityInput('');
        setHsdDensityInput('');
        setMsDipCmInput('');
        setMsIsEditingStock(false);
        setMsCorrectedStockInput('');
        setMsCorrectionReasonInput('');
        setHsdDipCmInput('');
        setHsdIsEditingStock(false);
        setHsdCorrectedStockInput('');
        setHsdCorrectionReasonInput('');
        setWizardStep(2); // Immediately transition to Assign Next Duty
        flashMessage(`Duty #${closedNo} successfully closed. Now select staff for the next duty shift.`, 'success');
        await refreshActiveDuty();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to close duty session. Nothing was changed.');
    } finally {
      setActionLoading(false);
    }
  };

  // Helper to resolve active guns list reliably from staticData
  const getResolvedActiveGuns = () => {
    let activeGuns = staticData?.guns || [];
    if (!activeGuns || activeGuns.length === 0) {
      activeGuns = (staticData?.pumps || []).flatMap((p: any) =>
        (p.guns || []).map((g: any) => ({ ...g, pumpId: p.id, pump: p }))
      );
    }
    return activeGuns;
  };

  // Handler for First-Ever Duty Start
  const handleStartFirstDutyStep = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const activeGuns = getResolvedActiveGuns();
      const requiredGunOrder = ['MS-1', 'MS-2', 'HSD-1', 'HSD-2', 'MS-3', 'MS-4', 'HSD-3', 'HSD-4'];
      const pumpAssignments: { pumpId: string, fuelType: string, gunId?: string, staffId: string }[] = [];

      for (const gunName of requiredGunOrder) {
        const gun = activeGuns.find((g: any) => g.name === gunName);
        const assignedStaffId = assignments[gunName] || (gun ? assignments[gun.id] : undefined);
        if (!assignedStaffId) {
          throw new Error(`Please assign staff for ${gunName}.`);
        }
        if (!gun) {
          throw new Error(`Gun ${gunName} not found in database configuration.`);
        }
        pumpAssignments.push({
          pumpId: gun.pumpId,
          fuelType: gun.fuelType,
          gunId: gun.id,
          staffId: assignedStaffId,
        });
      }

      if (pumpAssignments.length !== 8) {
        throw new Error('All 8 gun staff assignments are required to start a duty session.');
      }

      // Ensure initial baseline readings exist for active guns
      const readingsPayload: Record<string, number> = {};

      for (const gunName of requiredGunOrder) {
        const gun = activeGuns.find((g: any) => g.name === gunName);
        const gunKey = gun ? gun.id : gunName;
        const val = initialFirstReadings[gunKey] !== undefined ? initialFirstReadings[gunKey] : initialFirstReadings[gunName];
        if (val === undefined || val === null || isNaN(Number(val)) || Number(val) < 0) {
          throw new Error(`Please enter a valid initial meter reading for ${gunName}`);
        }
        readingsPayload[gunName] = Number(val);
        if (gun) readingsPayload[gun.id] = Number(val);
      }

      const res = await startNewDutySession(newDutyStartTime || new Date().toISOString(), pumpAssignments, readingsPayload);
      if (res.success) {
        flashMessage(`First Duty session started successfully with baseline meter readings.`, 'success');
        resetDutyFormState();
        setWizardOpen(false);
        setWizardStep(1);
        await refreshActiveDuty();
        router.refresh();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to start first duty session');
    } finally {
      setActionLoading(false);
    }
  };

  // Handler for Normal Next Duty Start
  const handleStartNewDutyStep = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const activeGuns = getResolvedActiveGuns();
      const requiredGunOrder = ['MS-1', 'MS-2', 'HSD-1', 'HSD-2', 'MS-3', 'MS-4', 'HSD-3', 'HSD-4'];
      const pumpAssignments: { pumpId: string, fuelType: string, gunId?: string, staffId: string }[] = [];

      for (const gunName of requiredGunOrder) {
        const gun = activeGuns.find((g: any) => g.name === gunName);
        const assignedStaffId = assignments[gunName] || (gun ? assignments[gun.id] : undefined);
        if (!assignedStaffId) {
          throw new Error(`Please assign staff for ${gunName}.`);
        }
        if (!gun) {
          throw new Error(`Gun ${gunName} not found in database configuration.`);
        }
        pumpAssignments.push({
          pumpId: gun.pumpId,
          fuelType: gun.fuelType,
          gunId: gun.id,
          staffId: assignedStaffId,
        });
      }

      if (pumpAssignments.length !== 8) {
        throw new Error('All 8 gun staff assignments are required to start a duty session.');
      }

      const res = await startNewDutySession(newDutyStartTime || new Date().toISOString(), pumpAssignments);
      if (res.success) {
        flashMessage(`New Duty session started successfully.`, 'success');

        // Reset working inputs for the new duty session
        resetDutyFormState();
        setJustClosedDutyNumber(null);
        setWizardOpen(false);
        setWizardStep(1);

        await refreshActiveDuty();
        router.refresh();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to start next duty session');
    } finally {
      setActionLoading(false);
    }
  };

  // --- OWNER SETTINGS SUBMISSIONS ---

  const handleUpdateFuelPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newFuelPrice <= 0 || !priceEffectiveFrom) return;
    setActionLoading(true);
    try {
      await updateFuelPriceAction(priceFuelType, newFuelPrice, priceEffectiveFrom, checkpointInputs);
      flashMessage(`Updated ${priceFuelType} price to ₹${newFuelPrice} with checkpoint log`, 'success');
      setNewFuelPrice(0);
      setCheckpointInputs({});

      // Instantly sync active duty and static data state with updated database values
      const freshDuty = await getActiveDutySession();
      if (freshDuty) setActiveDuty(freshDuty);
      const freshStatic = await getStaticData();
      if (freshStatic) setStaticData(freshStatic);

      router.refresh();
    } catch (err: any) {
      flashMessage(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName) return;
    setActionLoading(true);
    try {
      await addStaffAction(newStaffName);
      flashMessage(`Staff member "${newStaffName}" added successfully.`, 'success');
      setNewStaffName('');
      router.refresh();
    } catch (err: any) {
      flashMessage(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleStaff = async (id: string, active: boolean, staffName?: string) => {
    const actionLabel = active ? 'Enable' : 'Disable (Temporary)';
    if (!confirm(`${actionLabel} staff member "${staffName || 'Staff'}"?\n\n${active ? `"${staffName || 'Staff'}" will become active again for duty assignments.` : `"${staffName || 'Staff'}" will be hidden from active duty assignment dropdowns, but all historical duty and attendance records will remain saved.`}`)) return;
    setActionLoading(true);
    try {
      await toggleStaffStatusAction(id, active);
      flashMessage(`Staff member "${staffName || 'Staff'}" ${active ? 'enabled' : 'disabled'} successfully.`, 'success');
      router.refresh();
      const freshStatic = await getStaticData();
      setStaticData(freshStatic);
    } catch (err: any) {
      flashMessage(err.message || 'Failed to update staff status', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteStaff = async (id: string, staffName?: string) => {
    if (!confirm(`PERMANENTLY DELETE staff member "${staffName || 'Staff'}"?\n\n⚠️ WARNING: This will delete "${staffName || 'Staff'}" entirely from the database. This action CANNOT be undone.`)) return;
    setActionLoading(true);
    try {
      const res = await deleteStaffAction(id);
      if (res.success) {
        flashMessage(res.message || `Staff member "${staffName || 'Staff'}" permanently deleted.`, 'success');
        router.refresh();
        const freshStatic = await getStaticData();
        setStaticData(freshStatic);
      }
    } catch (err: any) {
      flashMessage(err.message || 'Failed to delete staff member', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName) return;
    setActionLoading(true);
    try {
      await addCustomerAction(newCustomerName, newCustPhone, newCustAddr);
      flashMessage(`Customer "${newCustomerName}" registered successfully.`, 'success');
      setNewCustomerName('');
      setNewCustPhone('');
      setNewCustAddr('');
      router.refresh();
    } catch (err: any) {
      flashMessage(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleCustomer = async (id: string, active: boolean) => {
    setActionLoading(true);
    try {
      await toggleCustomerStatusAction(id, active);
      flashMessage(`Customer account ${active ? 'enabled' : 'disabled'} successfully.`, 'success');
      router.refresh();
    } catch (err: any) {
      flashMessage(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!confirm('Are you sure you want to delete or deactivate this customer account?')) return;
    setActionLoading(true);
    try {
      const res = await deleteCustomerAction(id);
      if (res.success) {
        flashMessage(res.message || 'Customer account status updated.', 'success');
        router.refresh();
      }
    } catch (err: any) {
      flashMessage(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddOilProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOilName || newOilPrice <= 0) return;
    setActionLoading(true);
    try {
      await addOilProductAction(newOilName, newOilPrice);
      flashMessage(`Oil product "${newOilName}" added at ₹${newOilPrice}`, 'success');
      setNewOilName('');
      setNewOilPrice(0);
      router.refresh();
    } catch (err: any) {
      flashMessage(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateOilPrice = async (id: string, price: number) => {
    setActionLoading(true);
    try {
      await updateOilPriceAction(id, price);
      flashMessage(`Oil price updated.`, 'success');
      router.refresh();
    } catch (err: any) {
      flashMessage(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleOilProduct = async (id: string, active: boolean) => {
    setActionLoading(true);
    try {
      await toggleOilProductStatusAction(id, active);
      flashMessage(`Lubricant product ${active ? 'enabled' : 'disabled'} successfully.`, 'success');
      router.refresh();
    } catch (err: any) {
      flashMessage(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteOilProduct = async (id: string) => {
    if (!confirm('Are you sure you want to delete or deactivate this lubricant product?')) return;
    setActionLoading(true);
    try {
      const res = await deleteOilProductAction(id);
      if (res.success) {
        flashMessage(res.message || 'Lubricant product updated.', 'success');
        router.refresh();
      }
    } catch (err: any) {
      flashMessage(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // --- EXPORT TO EXCEL ---

  const handleExportExcel = (tableId: string, sheetName: string) => {
    try {
      const table = document.getElementById(tableId);
      if (!table) return;
      const wb = XLSX.utils.table_to_book(table, { sheet: sheetName });
      XLSX.writeFile(wb, `PetrolBunk_${sheetName}_${new Date().toISOString().split('T')[0]}.xlsx`);
      flashMessage('Excel report exported successfully.', 'success');
    } catch (err) {
      flashMessage('Excel export failed.', 'error');
    }
  };

  const handlePrintFuelReport = (
    filteredReadingRows: any[],
    summary: { totalMsLitres: number; totalMsRevenue: number; totalHsdLitres: number; totalHsdRevenue: number; totalFuelLitres: number; totalFuelRevenue: number },
    sortedPeriods: any[]
  ) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      flashMessage('Please allow popups to print report.', 'error');
      return;
    }

    const rangeText = fuelReportDate ? `Single Date: ${fuelReportDate}` :
      fuelReportStartDate && fuelReportEndDate ? `Range: ${fuelReportStartDate} to ${fuelReportEndDate}` :
      fuelReportMonth ? `Month: ${fuelReportMonth}` :
      fuelReportYear ? `Year: ${fuelReportYear}` : `Preset: ${fuelReportPreset}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>IOCL Fuel Sales & Meter Verification Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12px; color: #1e293b; padding: 24px; line-height: 1.4; }
            .header { border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
            .title { font-size: 18px; font-weight: 800; color: #0f172a; text-transform: uppercase; margin: 0; }
            .subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
            .badge { display: inline-block; padding: 4px 8px; font-size: 10px; font-weight: bold; background: #e0f2fe; color: #0369a1; border-radius: 4px; }
            .section-title { font-size: 13px; font-weight: 800; text-transform: uppercase; margin: 20px 0 10px; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
            .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
            .kpi-card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; background: #f8fafc; }
            .kpi-label { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; }
            .kpi-val { font-size: 18px; font-weight: 800; font-family: monospace; color: #0f172a; margin-top: 4px; }
            .kpi-sub { font-size: 11px; font-weight: bold; color: #2563eb; margin-top: 2px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
            th { background: #f1f5f9; font-weight: bold; text-transform: uppercase; font-size: 10px; color: #475569; }
            .text-right { text-align: right; }
            .font-mono { font-family: monospace; }
            .font-bold { font-weight: bold; }
            .footer { margin-top: 40px; border-top: 1px dashed #cbd5e1; padding-top: 16px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">IOCL PETROL PUMP — FUEL SALES & METER REPORT</h1>
              <div class="subtitle">Official Station Sales, Meter Verification, Stock & Revenue Audit Register</div>
            </div>
            <div class="badge">${rangeText}</div>
          </div>

          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-label">MS (Petrol) Volume</div>
              <div class="kpi-val">${summary.totalMsLitres.toFixed(2)} L</div>
              <div class="kpi-sub">₹${summary.totalMsRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">HSD (Diesel) Volume</div>
              <div class="kpi-val">${summary.totalHsdLitres.toFixed(2)} L</div>
              <div class="kpi-sub" style="color: #059669;">₹${summary.totalHsdRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Total Fuel Volume</div>
              <div class="kpi-val">${summary.totalFuelLitres.toFixed(2)} L</div>
              <div class="kpi-sub" style="color: #d97706;">Combined Sales</div>
            </div>
            <div class="kpi-card" style="background: #eff6ff; border-color: #93c5fd;">
              <div class="kpi-label" style="color: #1e40af;">Total Fuel Revenue</div>
              <div class="kpi-val" style="color: #1e3a8a;">₹${summary.totalFuelRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              <div class="kpi-sub" style="color: #1d4ed8;">Net Sales Value</div>
            </div>
          </div>

          <div class="section-title">1. Daily Aggregated Sales Summary</div>
          <table>
            <thead>
              <tr>
                <th>Date / Period</th>
                <th class="text-right">MS Litres (L)</th>
                <th class="text-right">HSD Litres (L)</th>
                <th class="text-right">Total Fuel (L)</th>
                <th class="text-right">Total Sales (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${sortedPeriods.map(p => `
                <tr>
                  <td class="font-bold">${p.periodKey}</td>
                  <td class="text-right font-mono">${p.msLitres.toFixed(2)} L</td>
                  <td class="text-right font-mono">${p.hsdLitres.toFixed(2)} L</td>
                  <td class="text-right font-mono font-bold">${p.totalLitres.toFixed(2)} L</td>
                  <td class="text-right font-mono font-bold">₹${p.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="section-title">2. Granular Nozzle Meter Readings Audit Log</div>
          <table>
            <thead>
              <tr>
                <th>Duty Session</th>
                <th>Nozzle</th>
                <th>Fuel</th>
                <th>Staff</th>
                <th class="text-right">Opening</th>
                <th class="text-right">Closing</th>
                <th class="text-right">Litres</th>
                <th class="text-right">Rate</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${filteredReadingRows.map(r => {
                const mr = r.reading;
                const litres = mr.litresSold || Math.max(0, mr.currentReading - mr.previousReading);
                const amount = mr.salesAmount || (litres * mr.priceUsed);
                return `
                  <tr>
                    <td>Duty #${r.duty.dutyNumber}</td>
                    <td class="font-bold">${mr.gun?.name || 'Nozzle'}</td>
                    <td>${r.fuelType}</td>
                    <td>${r.assignedStaff?.name || 'Unassigned'}</td>
                    <td class="text-right font-mono">${(mr.previousReading || 0).toFixed(2)}</td>
                    <td class="text-right font-mono">${(mr.currentReading || 0).toFixed(2)}</td>
                    <td class="text-right font-mono font-bold">${litres.toFixed(2)} L</td>
                    <td class="text-right font-mono">₹${(mr.priceUsed || 0).toFixed(2)}</td>
                    <td class="text-right font-mono font-bold">₹${amount.toFixed(2)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div class="footer">
            <div>Verified by: Account Manager Signature _______________________</div>
            <div>Station Owner Signature: _______________________</div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  const getNavItemClass = (isSelected: boolean) =>
    `w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${isSelected
      ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-semibold border border-blue-100 dark:border-blue-900 shadow-sm'
      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
    }`;

  return (
    <div className="flex h-screen bg-[var(--bg-page)] text-[var(--text-primary)] overflow-hidden font-sans transition-colors duration-200">

      {/* DESKTOP SIDEBAR NAVIGATION */}
      <aside className="hidden lg:flex w-64 bg-[var(--bg-surface)] border-r border-[var(--border-color)] flex-col h-screen max-h-screen shrink-0 sticky top-0 z-30 overflow-hidden transition-colors duration-200">
        {/* Fixed Top Header */}
        <div className="shrink-0">
          {/* Logo Brand */}
          <div className="h-16 border-b border-[var(--border-color)] flex items-center px-6 gap-3 bg-[var(--bg-surface)]">
            <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0">
              <Fuel className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-bold text-sm tracking-tight text-[var(--text-primary)] block truncate">
                {staticData?.businessSettings?.BUSINESS_NAME || 'PETROL BUNK ACCOUNTING'}
              </span>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider truncate">
                {staticData?.businessSettings?.BUSINESS_ADDRESS || 'Control Panel'}
              </p>
            </div>
          </div>

          {/* User profile */}
          <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-surface-secondary)] flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center justify-center font-bold text-sm">
              {session.username.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <span className="text-xs font-bold text-[var(--text-primary)] block">{session.username}</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 uppercase tracking-wider mt-0.5">
                {session.role}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Navigation Menu */}
        <nav
          tabIndex={0}
          aria-label="Sidebar Navigation"
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-3 custom-scrollbar focus:outline-none"
        >
          {/* OVERVIEW */}
          <div>
            <span className="px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Overview</span>
            {session.role === 'OWNER' && (
              <button
                onClick={() => setActiveTab('dashboard')}
                className={getNavItemClass(activeTab === 'dashboard')}
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </button>
            )}
          </div>

          {/* DAILY OPERATIONS */}
          <div>
            <span className="px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Daily Operations</span>
            <button
              onClick={() => setActiveTab('current-duty')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${activeTab === 'current-duty'
                  ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-semibold border border-blue-100 dark:border-blue-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
            >
              <div className="flex items-center gap-3">
                <Activity className="h-4 w-4" />
                Current Duty
              </div>
              {activeDuty ? (
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-red-500" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('past-duty')}
              className={getNavItemClass(activeTab === 'past-duty' || activeTab === 'history')}
            >
              <History className="h-4 w-4" />
              Past Duty Reports
            </button>
          </div>

          {/* LEDGERS */}
          <div>
            <span className="px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Ledgers</span>
            <button
              onClick={() => setActiveTab('credit-ledger')}
              className={getNavItemClass(activeTab === 'credit-ledger')}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Credit Ledger
            </button>
          </div>

          {/* INVENTORY */}
          <div>
            <span className="px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Oil Inventory</span>
            <button
              onClick={() => setActiveTab('oil-purchases')}
              className={getNavItemClass(activeTab === 'oil-purchases')}
            >
              <Building2 className="h-4 w-4" />
              Oil Purchases / Invoices
            </button>
            <button
              onClick={() => setActiveTab('oil-sales')}
              className={getNavItemClass(activeTab === 'oil-sales')}
            >
              <DollarSign className="h-4 w-4" />
              Oil Sales
            </button>
            <button
              onClick={() => setActiveTab('oil-inventory')}
              className={getNavItemClass(activeTab === 'oil-inventory')}
            >
              <HardDrive className="h-4 w-4" />
              Oil Inventory &amp; Valuation
            </button>
          </div>

          {/* REPORTS */}
          <div>
            <span className="px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Reports</span>
            <button
              onClick={() => { setActiveTab('reports'); setReportsTab('sales'); }}
              className={getNavItemClass(activeTab === 'reports' && reportsTab === 'sales')}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Fuel Sales
            </button>
            <button
              onClick={() => { setActiveTab('reports'); setReportsTab('staff'); }}
              className={getNavItemClass(activeTab === 'reports' && reportsTab === 'staff')}
            >
              <Users className="h-3.5 w-3.5" />
              Staff Attendance
            </button>
            <button
              onClick={() => { setActiveTab('reports'); setReportsTab('expenses'); }}
              className={getNavItemClass(activeTab === 'reports' && reportsTab === 'expenses')}
            >
              <Wallet className="h-3.5 w-3.5" />
              Expenses
            </button>
            <button
              onClick={() => { setActiveTab('reports'); setReportsTab('stock'); }}
              className={getNavItemClass(activeTab === 'reports' && reportsTab === 'stock')}
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Stock &amp; Variance
            </button>
            <button
              onClick={() => { setActiveTab('reports'); setReportsTab('cash'); }}
              className={getNavItemClass(activeTab === 'reports' && reportsTab === 'cash')}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Cash Reconciliation
            </button>
          </div>

          {/* MASTER CONFIG */}
          {session.role === 'OWNER' && (
            <div>
              <span className="px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Master Config</span>
              <button
                onClick={() => setActiveTab('pricing')}
                className={getNavItemClass(activeTab === 'pricing')}
              >
                <DollarSign className="h-4 w-4" />
                Fuel Pricing
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={getNavItemClass(activeTab === 'settings')}
              >
                <Settings className="h-4 w-4" />
                System Config
              </button>
            </div>
          )}

          {/* SECURITY */}
          {session.role === 'OWNER' && (
            <div>
              <span className="px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Security</span>
              <button
                onClick={() => setActiveTab('audit')}
                className={getNavItemClass(activeTab === 'audit')}
              >
                <ShieldAlert className="h-4 w-4" />
                Audit Security Logs
              </button>
            </div>
          )}
        </nav>

        {/* Fixed Footer Actions */}
        <div className="shrink-0 p-4 border-t border-[var(--border-color)] bg-[var(--bg-surface)]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-all"
          >
            <LogOut className="h-4 w-4" />
            Logout Account
          </button>
        </div>
      </aside>

      {/* MOBILE SIDEBAR DRAWER OVERLAY */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileSidebarOpen(false)}
          />

          <aside className="relative w-80 max-w-[88vw] bg-[var(--bg-surface)] border-r border-[var(--border-color)] flex flex-col h-full max-h-screen z-10 shadow-2xl overflow-hidden text-[var(--text-primary)]">
            {/* Drawer Header */}
            <div className="h-16 border-b border-[var(--border-color)] flex items-center justify-between px-5 bg-[var(--bg-surface)] shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0">
                  <Fuel className="h-6 w-6" />
                </div>
                <div>
                  <span className="font-bold text-sm tracking-tight text-[var(--text-primary)]">BUNK ACCOUNTING</span>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Control Panel</p>
                </div>
              </div>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white touch-target-44 flex items-center justify-center"
                aria-label="Close Mobile Sidebar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* User profile */}
            <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-surface-secondary)] flex items-center gap-3 shrink-0">
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center justify-center font-bold text-sm shrink-0">
                {session.username.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-[var(--text-primary)] truncate block">{session.username}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 uppercase tracking-wider mt-0.5">
                  {session.role}
                </span>
              </div>
            </div>

            {/* Scrollable Mobile Navigation Menu */}
            <nav
              tabIndex={0}
              aria-label="Mobile Sidebar Navigation"
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-4 custom-scrollbar focus:outline-none"
            >
              {/* OVERVIEW */}
              <div>
                <span className="px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Overview</span>
                {session.role === 'OWNER' && (
                  <button
                    onClick={() => { setActiveTab('dashboard'); setMobileSidebarOpen(false); }}
                    className={getNavItemClass(activeTab === 'dashboard')}
                  >
                    <LayoutDashboard className="h-4 w-4 shrink-0" />
                    Dashboard
                  </button>
                )}
              </div>

              {/* DAILY OPERATIONS */}
              <div className="space-y-1">
                <span className="px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Daily Operations</span>
                <button
                  onClick={() => { setActiveTab('current-duty'); setMobileSidebarOpen(false); }}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-medium transition-all touch-target-44 ${activeTab === 'current-duty'
                      ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-semibold border border-blue-100 dark:border-blue-900 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <Activity className="h-4 w-4 shrink-0" />
                    Current Duty
                  </div>
                  {activeDuty ? (
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  )}
                </button>

                <button
                  onClick={() => { setActiveTab('past-duty'); setMobileSidebarOpen(false); }}
                  className={getNavItemClass(activeTab === 'past-duty' || activeTab === 'history')}
                >
                  <History className="h-4 w-4 shrink-0" />
                  Past Duty Reports
                </button>
              </div>

              {/* LEDGERS */}
              <div className="space-y-1">
                <span className="px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Ledgers</span>
                <button
                  onClick={() => { setActiveTab('credit-ledger'); setMobileSidebarOpen(false); }}
                  className={getNavItemClass(activeTab === 'credit-ledger')}
                >
                  <FileSpreadsheet className="h-4 w-4 shrink-0" />
                  Credit Ledger
                </button>
              </div>

              {/* INVENTORY */}
              <div className="space-y-1">
                <span className="px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Oil Inventory</span>
                <button
                  onClick={() => { setActiveTab('oil-purchases'); setMobileSidebarOpen(false); }}
                  className={getNavItemClass(activeTab === 'oil-purchases')}
                >
                  <Building2 className="h-4 w-4 shrink-0" />
                  Oil Purchases / Invoices
                </button>
                <button
                  onClick={() => { setActiveTab('oil-sales'); setMobileSidebarOpen(false); }}
                  className={getNavItemClass(activeTab === 'oil-sales')}
                >
                  <DollarSign className="h-4 w-4 shrink-0" />
                  Oil Sales
                </button>
                <button
                  onClick={() => { setActiveTab('oil-inventory'); setMobileSidebarOpen(false); }}
                  className={getNavItemClass(activeTab === 'oil-inventory')}
                >
                  <HardDrive className="h-4 w-4 shrink-0" />
                  Oil Inventory &amp; Valuation
                </button>
              </div>

              {/* REPORTS */}
              <div className="space-y-1">
                <span className="px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Reports</span>
                <button
                  onClick={() => { setActiveTab('reports'); setReportsTab('sales'); setMobileSidebarOpen(false); }}
                  className={getNavItemClass(activeTab === 'reports' && reportsTab === 'sales')}
                >
                  <BarChart3 className="h-3.5 w-3.5 shrink-0" />
                  Fuel Sales
                </button>
                <button
                  onClick={() => { setActiveTab('reports'); setReportsTab('staff'); setMobileSidebarOpen(false); }}
                  className={getNavItemClass(activeTab === 'reports' && reportsTab === 'staff')}
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  Staff Attendance &amp; Shortage
                </button>
                <button
                  onClick={() => { setActiveTab('reports'); setReportsTab('expenses'); setMobileSidebarOpen(false); }}
                  className={getNavItemClass(activeTab === 'reports' && reportsTab === 'expenses')}
                >
                  <Wallet className="h-3.5 w-3.5 shrink-0" />
                  Expenses
                </button>
                <button
                  onClick={() => { setActiveTab('reports'); setReportsTab('stock'); setMobileSidebarOpen(false); }}
                  className={getNavItemClass(activeTab === 'reports' && reportsTab === 'stock')}
                >
                  <FlaskConical className="h-3.5 w-3.5 shrink-0" />
                  Stock &amp; Variance
                </button>
                <button
                  onClick={() => { setActiveTab('reports'); setReportsTab('cash'); setMobileSidebarOpen(false); }}
                  className={getNavItemClass(activeTab === 'reports' && reportsTab === 'cash')}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Cash Reconciliation
                </button>
              </div>

              {/* MASTER CONFIG */}
              {session.role === 'OWNER' && (
                <div className="space-y-1">
                  <span className="px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Master Config</span>
                  <button
                    onClick={() => { setActiveTab('pricing'); setMobileSidebarOpen(false); }}
                    className={getNavItemClass(activeTab === 'pricing')}
                  >
                    <DollarSign className="h-4 w-4 shrink-0" />
                    Fuel Pricing
                  </button>

                  <button
                    onClick={() => { setActiveTab('settings'); setMobileSidebarOpen(false); }}
                    className={getNavItemClass(activeTab === 'settings')}
                  >
                    <Settings className="h-4 w-4 shrink-0" />
                    System Config
                  </button>
                </div>
              )}

              {/* SECURITY */}
              {session.role === 'OWNER' && (
                <div className="space-y-1">
                  <span className="px-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Security</span>
                  <button
                    onClick={() => { setActiveTab('audit'); setMobileSidebarOpen(false); }}
                    className={getNavItemClass(activeTab === 'audit')}
                  >
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    Audit Security Logs
                  </button>
                </div>
              )}
            </nav>

            {/* Footer actions */}
            <div className="shrink-0 p-4 border-t border-[var(--border-color)] bg-[var(--bg-surface)]">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-all touch-target-44"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Logout Account
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* MAIN VIEW AREA */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-page)] text-[var(--text-primary)]">

        {/* Top Header */}
        <header className="h-16 border-b border-[var(--border-color)] bg-[var(--bg-surface)] flex items-center justify-between px-3 sm:px-6 lg:px-8 shrink-0 transition-colors duration-200">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            {/* Mobile Sidebar Toggle Button */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 focus:outline-none touch-target-44 flex items-center justify-center shrink-0"
              aria-label="Open Navigation Menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <h1 className="text-base sm:text-lg lg:text-xl font-bold tracking-tight text-[var(--text-primary)] capitalize truncate">{activeTab.replace('-', ' ')}</h1>

            {activeDuty ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Active Session: #{activeDuty.dutyNumber}
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 shrink-0">
                No active duty
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Theme Toggle Component */}
            <ThemeToggle />

            {isMounted ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden md:flex items-center gap-3">
                <span>System Time: <span className="font-mono text-[var(--text-primary)] font-bold">{currentClock}</span></span>
                <button
                  type="button"
                  onClick={() => setTourOpen(true)}
                  className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <HelpCircle className="w-4 h-4" /> System Guide
                </button>
              </div>
            ) : null}

            {/* Change Duty Action */}
            {activeDuty ? (
              <button
                onClick={() => {
                  setWizardOpen(true);
                  setWizardStep(1);
                }}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shadow-sm touch-target-44"
              >
                <span className="hidden sm:inline">Change Duty Session</span>
                <span className="sm:hidden">Close Duty</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </button>
            ) : (
              <button
                onClick={() => {
                  setWizardOpen(true);
                  if (initialHistoricalDuties && initialHistoricalDuties.length > 0) {
                    setWizardStep(2);
                  } else {
                    setWizardStep('firstDuty');
                  }
                }}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/10 touch-target-44"
              >
                <span>Start Duty</span>
                <Plus className="h-3.5 w-3.5 shrink-0" />
              </button>
            )}
          </div>
        </header>

        {/* HIGH ALERT NOTIFICATION BANNER (Website In-App High Alert for Physical Stock ≤ 6,000 L) */}
        {isAnyStockCritical && (
          <div className="bg-gradient-to-r from-red-950 via-rose-900 to-red-950 border-b-2 border-red-500 p-4 shadow-2xl text-white flex items-center justify-between gap-4 animate-pulse shrink-0">
            <div className="flex items-center gap-3.5">
              <div className="h-10 w-10 rounded-xl bg-red-600/40 border border-red-400/50 flex items-center justify-center shrink-0 shadow-lg">
                <AlertTriangle className="h-6 w-6 text-red-300 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-red-600 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-widest shadow-md">
                    🚨 HIGH ALERT
                  </span>
                  <h4 className="font-extrabold text-sm sm:text-base text-red-100 tracking-wide">
                    {isMsStockCritical && isHsdStockCritical
                      ? 'CRITICAL LOW FUEL STOCK — BOTH PETROL (MS) & DIESEL (HSD) ≤ 6,000 L'
                      : isMsStockCritical
                        ? `CRITICAL LOW FUEL STOCK — MOTOR SPIRIT (MS PETROL) AT ${verifiedMsPhysical?.toLocaleString('en-IN')} L (≤ 6,000 L)`
                        : `CRITICAL LOW FUEL STOCK — HIGH SPEED DIESEL (HSD) AT ${verifiedHsdPhysical?.toLocaleString('en-IN')} L (≤ 6,000 L)`}
                  </h4>
                </div>
                <p className="text-xs text-red-200/90 mt-1 font-medium">
                  Verified physical tank dip stock has reached or fallen below the 6,000 L threshold. Server-side email alerts dispatched to Owner &amp; Manager. Please order fuel delivery immediately!
                </p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 shrink-0">
              {isMsStockCritical && (
                <span className="px-3.5 py-1.5 rounded-xl bg-red-900/80 border border-red-500/60 font-mono text-xs font-bold text-red-100 shadow-md">
                  MS: {verifiedMsPhysical?.toLocaleString('en-IN')} L
                </span>
              )}
              {isHsdStockCritical && (
                <span className="px-3.5 py-1.5 rounded-xl bg-red-900/80 border border-red-500/60 font-mono text-xs font-bold text-red-100 shadow-md">
                  HSD: {verifiedHsdPhysical?.toLocaleString('en-IN')} L
                </span>
              )}
            </div>
          </div>
        )}

        {/* Dynamic Alerts */}
        {errorMessage && (
          <div className="bg-red-950/40 border border-red-500/30 text-red-400 px-8 py-3 text-sm flex items-center gap-3 animate-fade-in shrink-0">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 px-8 py-3 text-sm flex items-center gap-3 animate-fade-in shrink-0">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Content Body */}
        <div ref={mainContentRef} className="flex-1 overflow-y-auto p-3.5 sm:p-5 lg:p-6 pb-20 custom-scrollbar">

          {/* NO DUTY INITIALIZED COMPACT PANEL (Shown after Full Reset or fresh install) */}
          {(!historicalDuties || historicalDuties.length === 0) && !activeDuty && (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-5 sm:p-6 max-w-xl mx-auto my-4 shadow-sm text-center space-y-3">
              <div className="h-10 w-10 bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center justify-center mx-auto shadow-sm">
                <Fuel className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] tracking-tight">NO DUTY HAS BEEN INITIALIZED</h2>
                <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
                  Set up your first duty by assigning staff, entering opening meter readings, fuel prices, and opening tank stock.
                </p>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setWizardOpen(true);
                    setWizardStep('firstDuty');
                  }}
                  className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 mx-auto cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  START / INITIALIZE FIRST DUTY
                </button>
              </div>
            </div>
          )}

          {/* TAB 1: OWNER DASHBOARD & VERIFICATION REPORT */}
          {activeTab === 'dashboard' && session.role === 'OWNER' && (
            <div className="space-y-4">
              {/* TOP CONTROLS & GLOBAL FILTER BAR */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] p-4 rounded-xl shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg border border-blue-200 dark:border-blue-800 flex items-center justify-center shrink-0 shadow-sm">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">OWNER OPERATIONS &amp; VERIFICATION DASHBOARD</h2>
                      <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">Authoritative 24-Hour Bunk Ledger &amp; Shift Reconciliation Control</p>
                    </div>
                  </div>
                </div>

                {/* Global Filters Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                  {/* Filter 1: Report Date */}
                  <div className="flex items-center gap-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-xs h-9">
                    <Calendar className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <span className="text-[var(--text-muted)] font-semibold shrink-0">Date:</span>
                    <input
                      type="date"
                      value={filterDate}
                      onChange={(e) => handleDateFilterChange(e.target.value)}
                      className="bg-transparent text-[var(--text-primary)] font-bold focus:outline-none cursor-pointer w-full"
                    />
                  </div>

                  {/* Filter 2: Duty Session */}
                  <div className="flex items-center gap-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-xs h-9">
                    <Filter className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                    <span className="text-[var(--text-muted)] font-semibold shrink-0">Duty Session:</span>
                    <select
                      value={selectedDutyId}
                      onChange={(e) => handleDutyFilterChange(e.target.value)}
                      className="bg-transparent text-[var(--text-primary)] font-bold focus:outline-none cursor-pointer w-full truncate"
                    >
                      <option value="CURRENT">Current Active Duty {activeDuty ? `#${activeDuty.dutyNumber}` : '(Closed)'}</option>
                      {initialHistoricalDuties.map((hd: any) => (
                        <option key={hd.id} value={hd.id}>
                          Duty #{hd.dutyNumber} ({new Date(hd.startTime).toLocaleDateString()}) - {hd.status}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filter 3: Pump */}
                  <div className="flex items-center gap-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-xs h-9">
                    <Fuel className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="text-[var(--text-muted)] font-semibold shrink-0">Pump:</span>
                    <select
                      value={filterPumpId}
                      onChange={(e) => setFilterPumpId(e.target.value)}
                      className="bg-transparent text-[var(--text-primary)] font-bold focus:outline-none cursor-pointer w-full"
                    >
                      <option value="ALL">All Pumps</option>
                      {staticData.pumps.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Filter 4: Staff */}
                  <div className="flex items-center gap-2 bg-[var(--bg-surface-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-xs h-9">
                    <Users className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span className="text-[var(--text-muted)] font-semibold shrink-0">Staff:</span>
                    <select
                      value={filterStaffId}
                      onChange={(e) => setFilterStaffId(e.target.value)}
                      className="bg-transparent text-[var(--text-primary)] font-bold focus:outline-none cursor-pointer w-full"
                    >
                      <option value="ALL">All Staff</option>
                      {staticData.staff.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* DYNAMIC DUTY COMPUTATION & FILTER CONTEXT */}
              {(() => {
                const targetDuty = selectedDutyId === 'CURRENT' ? activeDuty : initialHistoricalDuties.find((d: any) => d.id === selectedDutyId);

                if (!targetDuty && selectedDutyId === 'CURRENT') {
                  return (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center max-w-xl mx-auto space-y-4">
                      <ShieldAlert className="h-10 w-10 text-amber-400 mx-auto" />
                      <h3 className="text-lg font-bold text-white">No Active Duty Session Currently Running</h3>
                      <p className="text-xs text-slate-400">Select a historical duty session or date from the global filter bar above to verify past reports.</p>
                    </div>
                  );
                }

                if (!targetDuty) {
                  return (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center max-w-xl mx-auto text-slate-400 text-xs">
                      Selected duty report not found for the specified filters.
                    </div>
                  );
                }

                // 24-HOUR DUTY TIME WINDOW
                const dutyStart = new Date(targetDuty.startTime);
                const dutyEnd24h = new Date(dutyStart.getTime() + 24 * 60 * 60 * 1000);
                const dutyEndActual = targetDuty.endTime ? new Date(targetDuty.endTime) : dutyEnd24h;

                // 1. STAFF ATTENDANCE & ASSIGNMENTS FILTERING
                let filteredAssignments = targetDuty.assignments || [];
                if (filterPumpId !== 'ALL') {
                  filteredAssignments = filteredAssignments.filter((as: any) => as.pumpId === filterPumpId || as.pump?.id === filterPumpId);
                }
                if (filterStaffId !== 'ALL') {
                  filteredAssignments = filteredAssignments.filter((as: any) => as.staffId === filterStaffId);
                }
                const presentCount = filteredAssignments.length;
                const totalAssignedStaff = (targetDuty.assignments || []).length;
                const absentCount = Math.max(0, totalAssignedStaff - presentCount);

                // 2. FUEL SALES & METER READINGS FILTERING
                let filteredReadings = targetDuty.meterReadings || [];
                if (filterPumpId !== 'ALL') {
                  filteredReadings = filteredReadings.filter((mr: any) => (mr.gun?.pumpId || mr.gun?.pump?.id) === filterPumpId);
                }
                if (filterStaffId !== 'ALL') {
                  const staffAssignments = (targetDuty.assignments || []).filter((as: any) => as.staffId === filterStaffId);
                  if (staffAssignments.length > 0) {
                    filteredReadings = filteredReadings.filter((mr: any) => {
                      const pId = mr.gun?.pumpId || mr.gun?.pump?.id;
                      return staffAssignments.some((as: any) => as.pumpId === pId && as.fuelType === mr.gun?.fuelType);
                    });
                  } else {
                    filteredReadings = [];
                  }
                }

                const msReadings = filteredReadings.filter((mr: any) => mr.gun?.fuelType === 'MS');
                const hsdReadings = filteredReadings.filter((mr: any) => mr.gun?.fuelType === 'HSD');

                const msLitres = msReadings.reduce((sum: number, mr: any) => sum + (mr.litresSold || Math.max(0, mr.currentReading - mr.previousReading)), 0);
                const hsdLitres = hsdReadings.reduce((sum: number, mr: any) => sum + (mr.litresSold || Math.max(0, mr.currentReading - mr.previousReading)), 0);

                const msSales = msReadings.reduce((sum: number, mr: any) => sum + (mr.salesAmount || Math.max(0, mr.currentReading - mr.previousReading) * mr.priceUsed), 0);
                const hsdSales = hsdReadings.reduce((sum: number, mr: any) => sum + (mr.salesAmount || Math.max(0, mr.currentReading - mr.previousReading) * mr.priceUsed), 0);
                const totalFuelSales = msSales + hsdSales;

                // Group readings by Pump
                const pumpGroupMap: Record<string, any> = {};
                const activePumps = filterPumpId === 'ALL' ? staticData.pumps : staticData.pumps.filter((p: any) => p.id === filterPumpId);

                for (const p of activePumps) {
                  pumpGroupMap[p.id] = {
                    pumpName: p.name,
                    msGuns: [],
                    hsdGuns: [],
                    assignments: (targetDuty.assignments || []).filter((as: any) => as.pumpId === p.id && (filterStaffId === 'ALL' || as.staffId === filterStaffId))
                  };
                }

                for (const mr of filteredReadings) {
                  const pId = mr.gun?.pumpId || mr.gun?.pump?.id;
                  if (pId && pumpGroupMap[pId]) {
                    if (mr.gun?.fuelType === 'MS') pumpGroupMap[pId].msGuns.push(mr);
                    else pumpGroupMap[pId].hsdGuns.push(mr);
                  }
                }

                // 3. OIL SALES FILTERING
                let filteredOilSales = targetDuty.oilSales || [];
                if (filterStaffId !== 'ALL') {
                  filteredOilSales = filteredOilSales.filter((o: any) => o.enteredById === filterStaffId);
                }
                if (filterPumpId !== 'ALL') {
                  const staffOnPump = (targetDuty.assignments || []).filter((as: any) => as.pumpId === filterPumpId).map((as: any) => as.staffId);
                  filteredOilSales = filteredOilSales.filter((o: any) => staffOnPump.includes(o.enteredById));
                }
                const totalOilSales = filteredOilSales.reduce((sum: number, o: any) => sum + o.totalAmount, 0);

                // 4. CREDIT TRANSACTIONS FILTERING
                let filteredCreditTrans = targetDuty.creditTransactions || [];
                if (filterStaffId !== 'ALL') {
                  filteredCreditTrans = filteredCreditTrans.filter((ct: any) => ct.enteredById === filterStaffId);
                }
                if (filterPumpId !== 'ALL') {
                  const staffOnPump = (targetDuty.assignments || []).filter((as: any) => as.pumpId === filterPumpId).map((as: any) => as.staffId);
                  filteredCreditTrans = filteredCreditTrans.filter((ct: any) => staffOnPump.includes(ct.enteredById));
                }

                const creditSalesList = filteredCreditTrans.filter((ct: any) => ct.transactionType === 'CREDIT_SALE');
                const creditCollList = filteredCreditTrans.filter((ct: any) => ct.transactionType === 'COLLECTION');

                const creditSalesAmount = creditSalesList.reduce((sum: number, ct: any) => sum + ct.amount, 0);
                const creditCollectionsCash = creditCollList.reduce((sum: number, ct: any) => sum + ct.amount, 0);
                const netOutstandingAdded = creditSalesAmount - creditCollectionsCash;

                // 5. EXPENSES FILTERING
                let filteredExpenses = targetDuty.expenses || [];
                if (filterStaffId !== 'ALL') {
                  filteredExpenses = filteredExpenses.filter((e: any) => e.enteredById === filterStaffId);
                }
                if (filterPumpId !== 'ALL') {
                  const staffOnPump = (targetDuty.assignments || []).filter((as: any) => as.pumpId === filterPumpId).map((as: any) => as.staffId);
                  filteredExpenses = filteredExpenses.filter((e: any) => staffOnPump.includes(e.enteredById));
                }

                const totalExpenses = filteredExpenses.reduce((sum: number, e: any) => sum + e.amount, 0);
                const cashExpenses = filteredExpenses.filter((e: any) => e.paymentMethod === 'Cash').reduce((sum: number, e: any) => sum + e.amount, 0);

                // Expense Category breakdown
                const categoryBreakdown: Record<string, number> = {};
                for (const ex of filteredExpenses) {
                  const catName = ex.category?.name || 'Operating Expenses';
                  categoryBreakdown[catName] = (categoryBreakdown[catName] || 0) + ex.amount;
                }

                // 6. DIGITAL PAYMENTS BREAKDOWN
                const digitalMethods = ['PhonePe', 'GPay', 'Paytm', 'BharatPe', 'Pine Labs', 'ALP', 'UFill', 'Bank'];
                const digitalBreakdown: Record<string, number> = {
                  PhonePe: 0, GPay: 0, Paytm: 0, BharatPe: 0, 'Pine Labs': 0, ALP: 0, UFill: 0, Bank: 0
                };
                for (const ex of filteredExpenses) {
                  if (digitalMethods.includes(ex.paymentMethod)) {
                    digitalBreakdown[ex.paymentMethod] = (digitalBreakdown[ex.paymentMethod] || 0) + ex.amount;
                  }
                }
                const digitalPaymentsSum = Object.values(digitalBreakdown).reduce((sum, val) => sum + val, 0);

                // 7. FINAL CASH RECONCILIATION
                const grossRevenueInflow = totalFuelSales + totalOilSales + creditCollectionsCash;
                const totalDeductions = creditSalesAmount + digitalPaymentsSum + cashExpenses;
                const expectedCash = Math.max(0, grossRevenueInflow - totalDeductions);
                const actualCash = targetDuty.actualCash || expectedCash;
                const cashDiff = targetDuty.status === 'OPEN' ? (actualCash - expectedCash) : (targetDuty.cashDifference || 0);

                return (
                  <div className="space-y-8">
                    {/* SECTION 1: 24-HOUR DUTY & STAFF ATTENDANCE REPORT */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                      <div className="p-6 border-b border-slate-800 flex flex-wrap justify-between items-center bg-slate-900/50 gap-4">
                        <div className="flex items-center gap-3">
                          <Calendar className="h-5 w-5 text-indigo-400" />
                          <div>
                            <h3 className="font-extrabold text-white text-base">24-Hour Duty & Staff Attendance Report</h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Shift Interval: <strong className="text-slate-200" suppressHydrationWarning>{dutyStart.toLocaleDateString()} {dutyStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong> &rarr; <strong className="text-slate-200" suppressHydrationWarning>{dutyEndActual.toLocaleDateString()} {dutyEndActual.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong> (24-Hour Assignment)
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/25">
                            Supervisor: {targetDuty.manager?.username}
                          </span>
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                            Present: {presentCount} | Absent: {absentCount} | Total Assigned: {totalAssignedStaff}
                          </span>
                        </div>
                      </div>

                      <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          {filteredAssignments.length === 0 ? (
                            <div className="col-span-4 text-center py-6 text-slate-500 text-xs italic">
                              No staff assignments linked to this duty for the selected filter.
                            </div>
                          ) : (
                            filteredAssignments.map((as: any, idx: number) => (
                              <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{as.pump?.name || 'Pump'} - {as.fuelType}</span>
                                  <span className="px-2 py-0.5 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
                                    PRESENT
                                  </span>
                                </div>
                                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                  <UserCheck className="h-4 w-4 text-emerald-400" />
                                  {as.staff?.name}
                                </h4>
                                <div className="text-[11px] text-slate-500 space-y-0.5 pt-1 border-t border-slate-900">
                                  <p>Duty Session: #{targetDuty.dutyNumber}</p>
                                  <p suppressHydrationWarning>Window: {dutyStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &rarr; {dutyEndActual.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {/* SECTION 2: EXECUTIVE SUMMARY KPI CARDS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">TOTAL MS SOLD</span>
                        <div className="flex items-baseline justify-between">
                          <h4 className="text-2xl font-black text-indigo-400 font-mono">{msLitres.toFixed(2)} L</h4>
                        </div>
                        <span className="text-xs font-semibold text-slate-350 block">₹{msSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">TOTAL HSD SOLD</span>
                        <div className="flex items-baseline justify-between">
                          <h4 className="text-2xl font-black text-emerald-400 font-mono">{hsdLitres.toFixed(2)} L</h4>
                        </div>
                        <span className="text-xs font-semibold text-slate-350 block">₹{hsdSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">TOTAL FUEL REVENUE</span>
                        <h4 className="text-2xl font-black text-amber-400 font-mono">₹{totalFuelSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h4>
                        <span className="text-[10px] text-slate-500 block">MS + HSD Sales Amount</span>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">TOTAL OIL SALES</span>
                        <h4 className="text-2xl font-black text-sky-400 font-mono">₹{totalOilSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h4>
                        <span className="text-[10px] text-slate-500 block">{filteredOilSales.length} lubricant sales</span>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">GROSS REVENUE INFLOW</span>
                        <h4 className="text-2xl font-black text-white font-mono">₹{grossRevenueInflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h4>
                        <span className="text-[10px] text-slate-500 block">Fuel + Oil + Credit Collections</span>
                      </div>
                    </div>

                    {/* SECTION 3: HIERARCHICAL FUEL SALES REPORT (Duty -> Pump -> Staff -> Fuel Type -> Gun) */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden space-y-6">
                      <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                        <div>
                          <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                            <Fuel className="h-5 w-5 text-indigo-400" />
                            Hierarchical Fuel Sales Report
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">Hierarchy: Duty #{targetDuty.dutyNumber} &rarr; Pump &rarr; Staff &rarr; Fuel Type</p>
                        </div>
                        {session.role === 'OWNER' && (
                          <span className="text-xs text-amber-400 font-bold bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-500/25 flex items-center gap-1.5">
                            <Lock className="h-3.5 w-3.5" /> Owner Meter Correction Enabled
                          </span>
                        )}
                      </div>

                      <div className="px-6 pb-6 space-y-6">
                        {activePumps.map((pump: any) => {
                          const pData = pumpGroupMap[pump.id] || { msGuns: [], hsdGuns: [], assignments: [] };

                          // Calculate totals for Pump
                          const pumpMsLitres = pData.msGuns.reduce((sum: number, mr: any) => sum + (mr.litresSold || Math.max(0, mr.currentReading - mr.previousReading)), 0);
                          const pumpHsdLitres = pData.hsdGuns.reduce((sum: number, mr: any) => sum + (mr.litresSold || Math.max(0, mr.currentReading - mr.previousReading)), 0);
                          const pumpMsSales = pData.msGuns.reduce((sum: number, mr: any) => sum + (mr.salesAmount || Math.max(0, mr.currentReading - mr.previousReading) * mr.priceUsed), 0);
                          const pumpHsdSales = pData.hsdGuns.reduce((sum: number, mr: any) => sum + (mr.salesAmount || Math.max(0, mr.currentReading - mr.previousReading) * mr.priceUsed), 0);

                          const msG1Staff = pData.msGuns[0]?.gun ? getAssignedStaffForGun(activeDuty, pData.msGuns[0].gun) : 'Assigned Staff';
                          const msG2Staff = pData.msGuns[1]?.gun ? getAssignedStaffForGun(activeDuty, pData.msGuns[1].gun) : msG1Staff;
                          const hsdG1Staff = pData.hsdGuns[0]?.gun ? getAssignedStaffForGun(activeDuty, pData.hsdGuns[0].gun) : 'Assigned Staff';
                          const hsdG2Staff = pData.hsdGuns[1]?.gun ? getAssignedStaffForGun(activeDuty, pData.hsdGuns[1].gun) : hsdG1Staff;

                          const isExpanded = expandedPumpId === pump.id;

                          return (
                            <div key={pump.id} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                              {/* Pump Header Summary */}
                              <div className="p-4 bg-slate-900/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <div className="h-9 w-9 bg-indigo-600/20 text-indigo-400 rounded-lg flex items-center justify-center font-bold text-sm">
                                    {pump.name}
                                  </div>
                                  <div>
                                    <h4 className="font-extrabold text-white text-sm uppercase">{pump.name} Sales Summary</h4>
                                    <p className="text-[11px] text-slate-400">Duty Staff: <strong className="text-slate-200">MS: {msG1Staff}{msG2Staff !== msG1Staff ? `, ${msG2Staff}` : ''}</strong> | <strong className="text-slate-200">HSD: {hsdG1Staff}{hsdG2Staff !== hsdG1Staff ? `, ${hsdG2Staff}` : ''}</strong></p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-6">
                                  <div className="text-right">
                                    <span className="text-[10px] text-slate-400 font-bold block uppercase">MS Sales</span>
                                    <span className="font-mono text-xs font-bold text-indigo-400">{pumpMsLitres.toFixed(2)} L (₹{pumpMsSales.toFixed(2)})</span>
                                  </div>

                                  <div className="text-right">
                                    <span className="text-[10px] text-slate-400 font-bold block uppercase">HSD Sales</span>
                                    <span className="font-mono text-xs font-bold text-emerald-400">{pumpHsdLitres.toFixed(2)} L (₹{pumpHsdSales.toFixed(2)})</span>
                                  </div>

                                  <button
                                    onClick={() => setExpandedPumpId(isExpanded ? null : pump.id)}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer"
                                  >
                                    <Eye className="h-3.5 w-3.5 text-indigo-400" />
                                    {isExpanded ? 'Hide Gun Details' : 'View Gun Details'}
                                  </button>
                                </div>
                              </div>

                              {/* Fuel Type Breakdown Table */}
                              <div className="p-4 overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className="text-slate-400 border-b border-slate-800 uppercase font-bold text-[10px]">
                                      <th className="pb-2">Fuel Type</th>
                                      <th className="pb-2">Assigned Staff</th>
                                      <th className="pb-2 text-right">Opening Reading</th>
                                      <th className="pb-2 text-right">Closing Reading</th>
                                      <th className="pb-2 text-right">Litres Sold</th>
                                      <th className="pb-2 text-right">Rate</th>
                                      <th className="pb-2 text-right">Sales Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-900/60">
                                    <tr className="hover:bg-slate-900/30">
                                      <td className="py-2.5 font-bold text-indigo-400 flex items-center gap-1.5">
                                        <Fuel className="h-3.5 w-3.5" /> MS Petrol
                                      </td>
                                      <td className="py-2.5 font-semibold text-slate-300">{msG1Staff}{msG2Staff !== msG1Staff ? `, ${msG2Staff}` : ''}</td>
                                      <td className="py-2.5 text-right font-mono text-slate-400">
                                        {pData.msGuns.length > 0 ? (pData.msGuns.reduce((s: number, g: any) => s + g.previousReading, 0) / pData.msGuns.length).toFixed(2) : '-'}
                                      </td>
                                      <td className="py-2.5 text-right font-mono font-bold text-white">
                                        {pData.msGuns.length > 0 ? (pData.msGuns.reduce((s: number, g: any) => s + g.currentReading, 0) / pData.msGuns.length).toFixed(2) : '-'}
                                      </td>
                                      <td className="py-2.5 text-right font-mono font-bold text-indigo-300">{pumpMsLitres.toFixed(2)} L</td>
                                      <td className="py-2.5 text-right font-mono text-slate-400">₹{staticData.prices.MS.toFixed(2)}</td>
                                      <td className="py-2.5 text-right font-mono font-bold text-white">₹{pumpMsSales.toFixed(2)}</td>
                                    </tr>

                                    <tr className="hover:bg-slate-900/30">
                                      <td className="py-2.5 font-bold text-emerald-400 flex items-center gap-1.5">
                                        <Fuel className="h-3.5 w-3.5" /> HSD Diesel
                                      </td>
                                      <td className="py-2.5 font-semibold text-slate-300">{hsdG1Staff}{hsdG2Staff !== hsdG1Staff ? `, ${hsdG2Staff}` : ''}</td>
                                      <td className="py-2.5 text-right font-mono text-slate-400">
                                        {pData.hsdGuns.length > 0 ? (pData.hsdGuns.reduce((s: number, g: any) => s + g.previousReading, 0) / pData.hsdGuns.length).toFixed(2) : '-'}
                                      </td>
                                      <td className="py-2.5 text-right font-mono font-bold text-white">
                                        {pData.hsdGuns.length > 0 ? (pData.hsdGuns.reduce((s: number, g: any) => s + g.currentReading, 0) / pData.hsdGuns.length).toFixed(2) : '-'}
                                      </td>
                                      <td className="py-2.5 text-right font-mono font-bold text-emerald-300">{pumpHsdLitres.toFixed(2)} L</td>
                                      <td className="py-2.5 text-right font-mono text-slate-400">₹{staticData.prices.HSD.toFixed(2)}</td>
                                      <td className="py-2.5 text-right font-mono font-bold text-white">₹{pumpHsdSales.toFixed(2)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>

                              {/* Expandable Gun-Level Readings with Owner Edit Privileges */}
                              {isExpanded && (
                                <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-3">
                                  <h5 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                    <Layers className="h-3.5 w-3.5 text-indigo-400" /> Individual Gun Meter Verification & Owner Corrections
                                  </h5>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {[...pData.msGuns, ...pData.hsdGuns].map((mr: any, gIdx: number) => (
                                      <div key={gIdx} className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                                        <div>
                                          <span className="font-bold text-white block">{mr.gun?.name} ({mr.gun?.fuelType})</span>
                                          <span className="text-[11px] text-emerald-400 font-semibold block">Duty Staff: {getAssignedStaffForGun(activeDuty, mr.gun)}</span>
                                          <span className="text-[11px] text-slate-400 font-mono">Opening: {mr.previousReading} &rarr; Closing: {mr.currentReading}</span>
                                          <span className="text-[11px] text-indigo-400 font-mono block font-bold mt-0.5">Litres: {mr.litresSold || (mr.currentReading - mr.previousReading)} L | ₹{mr.salesAmount || ((mr.currentReading - mr.previousReading) * mr.priceUsed)}</span>
                                        </div>

                                        {session.role === 'OWNER' && (
                                          <button
                                            onClick={() => {
                                              setEditingReading(mr);
                                              setNewReadingVal(mr.currentReading);
                                              setCorrectionReason('');
                                            }}
                                            className="px-3 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer"
                                          >
                                            <Edit className="h-3 w-3" /> Edit Reading
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* SECTION 3: TANK SAMPLE SALE / SAMPLE CONSUMPTION */}
                      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30 flex items-center justify-center">
                              <FlaskConical className="h-5 w-5" />
                            </div>
                            <div>
                              <h4 className="font-extrabold text-white text-sm uppercase tracking-wider">Tank Sample Sale / Sample Consumption</h4>
                              <p className="text-xs text-slate-400">Enter testing or sample litres used. Amounts calculate automatically using active fuel prices.</p>
                            </div>
                          </div>

                          <div className="bg-slate-950 px-4 py-2 rounded-xl border border-amber-500/30 text-right">
                            <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-wider block">TOTAL TANK SAMPLE SALE</span>
                            <span className="text-base font-black text-amber-300 font-mono">₹{totalTestingValue.toFixed(2)}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                          {/* MS Sample Input */}
                          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-sans font-bold text-indigo-400 uppercase">MS Sample (Litres)</span>
                              <span className="text-slate-400 text-[11px]">Price: ₹{msPrice.toFixed(2)}/L</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={msTestingLitres || ''}
                                onChange={(e) => setMsTestingLitres(Math.max(0, parseFloat(e.target.value) || 0))}
                                placeholder="0.00"
                                className="w-full bg-slate-900 border border-slate-750 rounded-lg px-3 py-2 text-white font-mono font-bold focus:border-amber-500 focus:outline-none"
                              />
                              <span className="text-slate-300 font-bold">L</span>
                            </div>
                            <p className="text-[11px] text-slate-400 font-sans">
                              Calculation: <strong className="text-indigo-300 font-mono">{msTestingLitres} L × ₹{msPrice.toFixed(2)} = ₹{msTestingValue.toFixed(2)}</strong>
                            </p>
                          </div>

                          {/* HSD Sample Input */}
                          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-sans font-bold text-emerald-400 uppercase">HSD Sample (Litres)</span>
                              <span className="text-slate-400 text-[11px]">Price: ₹{hsdPrice.toFixed(2)}/L</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={hsdTestingLitres || ''}
                                onChange={(e) => setHsdTestingLitres(Math.max(0, parseFloat(e.target.value) || 0))}
                                placeholder="0.00"
                                className="w-full bg-slate-900 border border-slate-750 rounded-lg px-3 py-2 text-white font-mono font-bold focus:border-amber-500 focus:outline-none"
                              />
                              <span className="text-slate-300 font-bold">L</span>
                            </div>
                            <p className="text-[11px] text-slate-400 font-sans">
                              Calculation: <strong className="text-emerald-300 font-mono">{hsdTestingLitres} L × ₹{hsdPrice.toFixed(2)} = ₹{hsdTestingValue.toFixed(2)}</strong>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 4: OIL / LUBRICANT SALES REPORT */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                      <div className="p-6 border-b border-slate-800 flex flex-wrap justify-between items-center bg-slate-900/50 gap-4">
                        <div>
                          <h3 className="font-extrabold text-white text-base">Oil / Lubricant Sales Breakdown</h3>
                          <p className="text-xs text-slate-400 mt-0.5">Itemized lubricant sales configured via Master Config.</p>
                        </div>

                        <div className="flex items-center gap-4">
                          <span className="text-sm font-black text-sky-400 font-mono">
                            TOTAL OIL SALES: ₹{totalOilSales.toFixed(2)}
                          </span>
                          <button
                            onClick={() => setShowOilDetails(!showOilDetails)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5 text-sky-400" />
                            {showOilDetails ? 'Hide Entries' : `View ${filteredOilSales.length} Entries`}
                          </button>
                        </div>
                      </div>

                      {showOilDetails && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-950 text-slate-400 uppercase font-bold border-b border-slate-800">
                                <th className="p-3">Product Name</th>
                                <th className="p-3 text-right">Quantity</th>
                                <th className="p-3 text-right">Price per Unit</th>
                                <th className="p-3 text-right">Total Amount</th>
                                <th className="p-3">Logged By</th>
                                <th className="p-3">Date/Time</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                              {filteredOilSales.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="p-4 text-center text-slate-500">No oil sales logged for this filter selection.</td>
                                </tr>
                              ) : (
                                filteredOilSales.map((o: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-slate-950/20">
                                    <td className="p-3 font-bold text-slate-200">{o.productName}</td>
                                    <td className="p-3 text-right font-mono text-slate-350">{o.quantity}</td>
                                    <td className="p-3 text-right font-mono text-slate-350">₹{o.unitPrice.toFixed(2)}</td>
                                    <td className="p-3 text-right font-mono font-bold text-sky-400">₹{o.totalAmount.toFixed(2)}</td>
                                    <td className="p-3 text-slate-400">{o.enteredBy?.username || 'Staff'}</td>
                                    <td className="p-3 text-slate-400" suppressHydrationWarning>{new Date(o.timestamp).toLocaleString()}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* SECTION 5: CREDIT LEDGER REPORT */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden p-6 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                        <div>
                          <h3 className="font-extrabold text-white text-base">Credit & Customer Ledger Verification</h3>
                          <p className="text-xs text-slate-400 mt-0.5">Tracks credit sales (debits) and cash collections (credits) for customer transport accounts.</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                          <div className="bg-amber-950/40 px-3 py-1.5 rounded-lg border border-amber-500/30">
                            <span className="text-amber-400 font-semibold block text-[10px]">Credit Given</span>
                            <span className="font-bold text-amber-300">₹{creditSalesAmount.toFixed(2)}</span>
                          </div>
                          <div className="bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-500/30">
                            <span className="text-emerald-400 font-semibold block text-[10px]">Collections</span>
                            <span className="font-bold text-emerald-300">₹{creditCollectionsCash.toFixed(2)}</span>
                          </div>
                          <div className="bg-indigo-950/40 px-3 py-1.5 rounded-lg border border-indigo-500/30">
                            <span className="text-indigo-400 font-semibold block text-[10px]">Net Outstanding Added</span>
                            <span className="font-bold text-indigo-200">₹{netOutstandingAdded.toFixed(2)}</span>
                          </div>
                          <button
                            onClick={() => setShowCreditDetails(!showCreditDetails)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5 text-amber-400" />
                            {showCreditDetails ? 'Hide Ledger' : `View ${filteredCreditTrans.length} Transactions`}
                          </button>
                        </div>
                      </div>

                      {showCreditDetails && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-950 text-slate-400 uppercase font-bold border-b border-slate-800">
                                <th className="p-3">Customer / Company</th>
                                <th className="p-3">Indent / Slip #</th>
                                <th className="p-3">Product</th>
                                <th className="p-3 text-right">Qty / Litres</th>
                                <th className="p-3 text-right">Rate</th>
                                <th className="p-3 text-right">Credit Sale (+)</th>
                                <th className="p-3 text-right">Collection (-)</th>
                                <th className="p-3">Entered By</th>
                                <th className="p-3">Timestamp</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                              {filteredCreditTrans.length === 0 ? (
                                <tr>
                                  <td colSpan={9} className="p-4 text-center text-slate-500">No credit transactions recorded for this filter selection.</td>
                                </tr>
                              ) : (
                                filteredCreditTrans.map((t: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-slate-950/20">
                                    <td className="p-3 font-bold text-white">{t.customerName || t.customer?.name}</td>
                                    <td className="p-3 font-mono text-indigo-300 font-bold">{t.indentNumber || '-'}</td>
                                    <td className="p-3 text-slate-300">{t.productName || (t.transactionType === 'CREDIT_SALE' ? 'Fuel/Oil' : 'Cash Collection')}</td>
                                    <td className="p-3 text-right font-mono text-slate-300">{t.quantity ? `${t.quantity.toFixed(2)} L` : '-'}</td>
                                    <td className="p-3 text-right font-mono text-slate-400">{t.unitPrice ? `₹${t.unitPrice.toFixed(2)}` : '-'}</td>
                                    <td className="p-3 text-right font-mono font-bold text-amber-400">
                                      {t.transactionType === 'CREDIT_SALE' ? `+₹${t.amount.toFixed(2)}` : '-'}
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold text-emerald-400">
                                      {t.transactionType === 'COLLECTION' ? `-₹${t.amount.toFixed(2)}` : '-'}
                                    </td>
                                    <td className="p-3 text-slate-400 text-[11px]">{t.enteredBy?.username || 'Manager'}</td>
                                    <td className="p-3 text-slate-400" suppressHydrationWarning>{new Date(t.timestamp).toLocaleString()}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* SECTION 6: OPERATING EXPENSES REPORT */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                      <div className="p-6 border-b border-slate-800 flex flex-wrap justify-between items-center bg-slate-900/50 gap-4">
                        <div>
                          <h3 className="font-extrabold text-white text-base">Operating Expenses Report</h3>
                          <p className="text-xs text-slate-400 mt-0.5">Bunk operational payouts logged during the shift.</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-4">
                          <div className="text-right">
                            <span className="text-sm font-black text-red-400 font-mono block">
                              TOTAL EXPENSES: ₹{totalExpenses.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Cash: ₹{cashExpenses.toFixed(2)} | Digital: ₹{(totalExpenses - cashExpenses).toFixed(2)}
                            </span>
                          </div>

                          <button
                            onClick={() => setShowExpenseDetails(!showExpenseDetails)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5 text-red-400" />
                            {showExpenseDetails ? 'Hide Receipts' : `View ${filteredExpenses.length} Receipts`}
                          </button>
                        </div>
                      </div>

                      {/* Category Breakdown Pills */}
                      <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-slate-400 font-bold text-[10px] uppercase">Categories:</span>
                        {Object.keys(categoryBreakdown).length === 0 ? (
                          <span className="text-slate-500 italic text-[11px]">No expense categories logged.</span>
                        ) : (
                          Object.entries(categoryBreakdown).map(([cat, amt], i) => (
                            <span key={i} className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-medium text-[11px]">
                              {cat}: <strong className="text-red-400 font-mono">₹{amt.toFixed(2)}</strong>
                            </span>
                          ))
                        )}
                      </div>

                      {showExpenseDetails && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-950 text-slate-400 uppercase font-bold border-b border-slate-800">
                                <th className="p-3">Category</th>
                                <th className="p-3">Description</th>
                                <th className="p-3 text-right">Amount</th>
                                <th className="p-3">Payment Method</th>
                                <th className="p-3">Logged By</th>
                                <th className="p-3">Timestamp</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                              {filteredExpenses.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="p-4 text-center text-slate-500">No expenses logged for this filter selection.</td>
                                </tr>
                              ) : (
                                filteredExpenses.map((e: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-slate-950/20">
                                    <td className="p-3 font-bold text-slate-200">{e.category?.name || 'General'}</td>
                                    <td className="p-3 text-slate-300">{e.description}</td>
                                    <td className="p-3 text-right font-mono font-bold text-red-400">₹{e.amount.toFixed(2)}</td>
                                    <td className="p-3"><span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold uppercase tracking-wider text-[9px]">{e.paymentMethod}</span></td>
                                    <td className="p-3 text-slate-400">{e.enteredBy?.username || 'Manager'}</td>
                                    <td className="p-3 text-slate-400" suppressHydrationWarning>{new Date(e.timestamp).toLocaleString()}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* SECTION 7: DIGITAL PAYMENTS BREAKDOWN */}
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-sky-500/20 text-sky-400 rounded-xl border border-sky-500/30 flex items-center justify-center">
                            <CreditCard className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="font-extrabold text-white text-sm">Digital Payments Summary (Non-Cash Receipts)</h4>
                            <p className="text-xs text-slate-400">PhonePe, GPay, Paytm, Cards, Bank Transfer collections (excluded from physical cash drawer count).</p>
                          </div>
                        </div>

                        <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 text-right font-mono">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">TOTAL DIGITAL RECEIPTS</span>
                          <span className="font-bold text-sky-300 text-base">₹{digitalPaymentsSum.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Digital Methods Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
                        {Object.entries(digitalBreakdown).map(([method, val]) => (
                          <div key={method} className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                            <span className="text-slate-400 font-sans font-medium block text-[11px]">{method}</span>
                            <span className="font-bold text-sky-300 block mt-1">₹{val.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* SECTION 8: FINAL OWNER CASH RECONCILIATION & BANK DEPOSIT AUDIT */}
                    <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 p-6 rounded-2xl shadow-2xl space-y-6">
                      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 flex items-center justify-center">
                            <Wallet className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                              Final Shift Cash Reconciliation & Bank Deposit Audit
                            </h3>
                            <p className="text-xs text-slate-400">Authoritative calculation of physical cash vs bank deposit readiness.</p>
                          </div>
                        </div>

                        {/* Reconciliation Status Pill */}
                        <div>
                          {cashDiff === 0 ? (
                            <span className="px-4 py-1.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5 shadow-lg">
                              <CheckCircle2 className="h-4 w-4" /> BALANCED (₹0 DIFF)
                            </span>
                          ) : cashDiff < 0 ? (
                            <span className="px-4 py-1.5 rounded-full text-xs font-black bg-red-500/20 text-red-400 border border-red-500/40 flex items-center gap-1.5 shadow-lg">
                              <AlertTriangle className="h-4 w-4" /> CASH SHORTAGE (-₹{Math.abs(cashDiff).toLocaleString(undefined, { minimumFractionDigits: 2 })})
                            </span>
                          ) : (
                            <span className="px-4 py-1.5 rounded-full text-xs font-black bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 flex items-center gap-1.5 shadow-lg">
                              <TrendingUp className="h-4 w-4" /> CASH SURPLUS (+₹{cashDiff.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Audit Formula Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-mono">
                        <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2">
                          <h4 className="font-sans font-bold text-emerald-400 uppercase tracking-wider text-[11px]">Gross Revenue Inflows (+)</h4>
                          <div className="flex justify-between text-slate-300"><span>MS Fuel Sales:</span><span>₹{totalMsSalesAmount.toFixed(2)}</span></div>
                          <div className="flex justify-between text-slate-300"><span>HSD Fuel Sales:</span><span>₹{totalHsdSalesAmount.toFixed(2)}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Oil / Lubricant Sales:</span><span>₹{oilSalesTotal.toFixed(2)}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Credit Collections (Cash):</span><span>+₹{creditCollectionsCash.toFixed(2)}</span></div>
                          <div className="flex justify-between text-white font-bold border-t border-slate-800 pt-2 text-sm"><span>TOTAL GROSS INFLOW:</span><span>₹{grossRevenueInflow.toFixed(2)}</span></div>
                        </div>

                        <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2">
                          <h4 className="font-sans font-bold text-amber-400 uppercase tracking-wider text-[11px]">Deductions & Non-Cash (-)</h4>
                          <div className="flex justify-between text-slate-300"><span>Credit Sales Given:</span><span>-₹{creditSalesAmount.toFixed(2)}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Digital Payments (Non-Cash):</span><span>-₹{digitalPaymentsSum.toFixed(2)}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Operating Expenses (Cash):</span><span>-₹{expensesPaidInCash.toFixed(2)}</span></div>
                          <div className="flex justify-between text-white font-bold border-t border-slate-800 pt-2 text-sm"><span>TOTAL DEDUCTIONS:</span><span>₹{totalDeductions.toFixed(2)}</span></div>
                        </div>
                      </div>

                      {/* Bank Deposit & Cash Summary Bar */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
                        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                          <span className="text-slate-400 font-medium block">Expected Physical Cash</span>
                          <span className="font-mono font-bold text-indigo-300 block mt-1 text-sm">₹{expectedCash.toFixed(2)}</span>
                        </div>
                        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                          <span className="text-slate-400 font-medium block">Actual Cash Drawer Count</span>
                          <span className="font-mono font-bold text-white block mt-1 text-sm">₹{actualCash.toFixed(2)}</span>
                        </div>
                        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                          <span className="text-slate-400 font-medium block">Discrepancy / Variance</span>
                          <span className={`font-mono font-bold block mt-1 text-sm ${cashDiff < 0 ? 'text-red-400' : cashDiff > 0 ? 'text-indigo-400' : 'text-emerald-400'}`}>
                            {cashDiff === 0 ? '₹0.00' : `${cashDiff > 0 ? '+' : ''}₹${cashDiff.toFixed(2)}`}
                          </span>
                        </div>
                        <div className="bg-emerald-950/40 p-3 rounded-xl border border-emerald-500/40 text-center">
                          <span className="text-emerald-400 font-bold uppercase tracking-wider text-[9px] block">EXPECTED BANK DEPOSIT</span>
                          <span className="font-mono font-black text-emerald-300 text-sm block mt-0.5">₹{actualCash.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 2: CURRENT DUTY OPERATION */}
          {activeTab === 'current-duty' && (
            <div className="space-y-8">
              {!activeDuty ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-xl mx-auto space-y-6 shadow-2xl">
                  <div className="h-16 w-16 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto">
                    <ShieldAlert className="h-8 w-8" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-extrabold text-white">No Active Duty Session Found</h2>
                    <p className="text-slate-400 text-sm">
                      Operations cannot be logged when a duty shift is closed. A manager or owner must start a new duty shift to open operational entries.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setWizardOpen(true);
                      if (initialHistoricalDuties && initialHistoricalDuties.length > 0) {
                        setWizardStep(2);
                      } else {
                        setWizardStep('firstDuty');
                      }
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-all"
                  >
                    Start A New Shift Session
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* ACTIVE DUTY STATUS BANNER */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30 flex items-center justify-center font-bold">
                        #{activeDuty.dutyNumber}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-extrabold text-white uppercase tracking-wider">ACTIVE DUTY #{activeDuty.dutyNumber}</h2>
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            LIVE 24-HOUR SESSION
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">
                          Started: {new Date(activeDuty.startTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} {new Date(activeDuty.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} → OPEN
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 text-right">
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">CURRENT DUTY ISOLATION</span>
                      <span className="text-xs font-bold text-indigo-400">Entries for this active 24-hour duty only.</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    {/* Left Column: Gun readings & Live stats */}
                    <div className="lg:col-span-2 space-y-8">

                      {/* Shift Overview & Daily Fuel Sales Summary */}
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                          <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-indigo-400" />
                            Daily Fuel Sales Summary (Live Duty #{activeDuty.dutyNumber})
                          </h3>
                          <span className="text-xs text-indigo-400 font-bold bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/20">
                            Manager: {activeDuty.manager.username}
                          </span>
                        </div>

                        {(() => {
                          const msReadings = activeDuty.meterReadings.filter((mr: any) => mr.gun.fuelType === 'MS');
                          const hsdReadings = activeDuty.meterReadings.filter((mr: any) => mr.gun.fuelType === 'HSD');

                          const msLitres = msReadings.reduce((sum: number, mr: any) => {
                            const val = ongoingReadings[mr.gunId] !== undefined ? ongoingReadings[mr.gunId] : mr.currentReading;
                            return sum + Math.max(0, val - mr.previousReading);
                          }, 0);

                          const hsdLitres = hsdReadings.reduce((sum: number, mr: any) => {
                            const val = ongoingReadings[mr.gunId] !== undefined ? ongoingReadings[mr.gunId] : mr.currentReading;
                            return sum + Math.max(0, val - mr.previousReading);
                          }, 0);

                          const msSales = msReadings.reduce((sum: number, mr: any) => {
                            const val = ongoingReadings[mr.gunId] !== undefined ? ongoingReadings[mr.gunId] : mr.currentReading;
                            return sum + (Math.max(0, val - mr.previousReading) * mr.priceUsed);
                          }, 0);

                          const hsdSales = hsdReadings.reduce((sum: number, mr: any) => {
                            const val = ongoingReadings[mr.gunId] !== undefined ? ongoingReadings[mr.gunId] : mr.currentReading;
                            return sum + (Math.max(0, val - mr.previousReading) * mr.priceUsed);
                          }, 0);

                          const totalLitres = msLitres + hsdLitres;
                          const totalFuelSales = msSales + hsdSales;

                          return (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">MS Sales Volume</span>
                                <span className="text-lg font-black text-indigo-400 font-mono mt-1 block">{msLitres.toFixed(2)} L</span>
                                <span className="text-xs text-slate-400 font-semibold font-mono">₹{msSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">HSD Sales Volume</span>
                                <span className="text-lg font-black text-emerald-400 font-mono mt-1 block">{hsdLitres.toFixed(2)} L</span>
                                <span className="text-xs text-slate-400 font-semibold font-mono">₹{hsdSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Total Fuel Litres</span>
                                <span className="text-lg font-black text-white font-mono mt-1 block">{totalLitres.toFixed(2)} L</span>
                                <span className="text-[10px] text-slate-500">Across all 8 Nozzles</span>
                              </div>
                              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Total Fuel Sales</span>
                                <span className="text-lg font-black text-amber-400 font-mono mt-1 block">₹{totalFuelSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <span className="text-[10px] text-slate-500">Gross revenue</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Active Readings Form - Grouped by Pump 1 and Pump 2 */}
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-extrabold text-white text-lg">Gun Meter Readings (Grouped by Pump)</h3>
                              {!isClosingUnlocked ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                  <Lock className="h-3 w-3" /> Closing Locked
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                  <Unlock className="h-3 w-3" /> Closing Unlocked
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                              Opening readings are saved and read-only. Closing readings remain locked initially and unlock when closing stage is initiated.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {!isClosingUnlocked ? (
                              <button
                                type="button"
                                onClick={() => setIsClosingUnlocked(true)}
                                className="px-3.5 py-2.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                                title="Unlock Closing Meter Reading fields for entry"
                              >
                                <Lock className="h-3.5 w-3.5 text-amber-400" />
                                Unlock Closing Stage
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setIsClosingUnlocked(false)}
                                className="px-3.5 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                                title="Lock Closing Meter Reading fields"
                              >
                                <Unlock className="h-3.5 w-3.5 text-emerald-400" />
                                Lock Closing Stage
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setShowClearReadingsModal(true)}
                              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all border border-slate-700 flex items-center gap-1.5 cursor-pointer"
                              title="Clear uncommitted pump reading inputs"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              Clear Inputs
                            </button>
                            <button
                              onClick={handleSaveOngoingReadings}
                              disabled={actionLoading || !isClosingUnlocked}
                              className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md ${
                                !isClosingUnlocked
                                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                                  : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                              }`}
                            >
                              {actionLoading ? 'Saving...' : 'Save Meter Readings'}
                            </button>
                          </div>
                        </div>

                        {/* PUMP 1 SECTION */}
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                            <span className="h-3 w-3 rounded-full bg-indigo-500" />
                            <h4 className="font-extrabold text-indigo-400 text-sm tracking-wider uppercase">PUMP 1 (MS-1, HSD-1, MS-2, HSD-2)</h4>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {getSortedReadings(activeDuty.meterReadings)
                              .filter((mr: any) => ['MS-1', 'HSD-1', 'MS-2', 'HSD-2'].includes(mr.gun.name))
                              .map((mr: any, idx: number) => {
                                const currentVal = ongoingReadings[mr.gunId] !== undefined ? ongoingReadings[mr.gunId] : mr.currentReading;
                                const litres = Math.max(0, currentVal - mr.previousReading);
                                const sales = litres * mr.priceUsed;

                                return (
                                  <div key={idx} className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-3">
                                    <div className="flex justify-between items-center">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-slate-200">{mr.gun.name}</span>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                          Staff: {getAssignedStaffForGun(activeDuty, mr.gun)}
                                        </span>
                                      </div>
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-indigo-400 border border-indigo-500/10">
                                        {mr.gun.fuelType} (₹{mr.priceUsed.toFixed(2)})
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Opening Reading</label>
                                        <span className="block text-sm font-mono font-bold text-slate-400 mt-1.5 bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-800 select-none" title="Opening Reading is preserved read-only">
                                          {mr.previousReading.toFixed(2)}
                                        </span>
                                      </div>
                                      <div>
                                        <div className="flex items-center justify-between">
                                          <label htmlFor={`reading-${mr.gunId}`} className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Closing Reading</label>
                                          {!isClosingUnlocked && (
                                            <span className="text-[10px] font-bold text-amber-400 flex items-center gap-0.5">
                                              <Lock className="h-2.5 w-2.5" /> Locked
                                            </span>
                                          )}
                                        </div>
                                        <input
                                          id={`reading-${mr.gunId}`}
                                          type="number"
                                          step="0.01"
                                          disabled={!isClosingUnlocked}
                                          value={ongoingReadings[mr.gunId] !== undefined ? ongoingReadings[mr.gunId] : ''}
                                          onChange={(e) => {
                                            setOngoingReadings({
                                              ...ongoingReadings,
                                              [mr.gunId]: Number(e.target.value),
                                            });
                                          }}
                                          className={`block w-full rounded-lg border py-1.5 px-3 mt-1 text-sm font-mono font-semibold focus:outline-none transition-all ${
                                            !isClosingUnlocked
                                              ? 'border-slate-800 bg-slate-950/70 text-slate-500 cursor-not-allowed select-none'
                                              : 'border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-600 focus:border-indigo-500'
                                          }`}
                                          placeholder={!isClosingUnlocked ? 'Locked until Closing' : 'Enter reading'}
                                        />
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center text-xs font-semibold text-slate-400 pt-2 border-t border-slate-900">
                                      <span>Litres Sold: <strong className="font-mono text-white">{litres.toFixed(2)} L</strong></span>
                                      <span>Sales: <strong className="font-mono text-indigo-400">₹{sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>

                        {/* PUMP 2 SECTION */}
                        <div className="space-y-4 pt-4 border-t border-slate-800">
                          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                            <span className="h-3 w-3 rounded-full bg-emerald-500" />
                            <h4 className="font-extrabold text-emerald-400 text-sm tracking-wider uppercase">PUMP 2 (MS-3, HSD-3, MS-4, HSD-4)</h4>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {getSortedReadings(activeDuty.meterReadings)
                              .filter((mr: any) => ['MS-3', 'HSD-3', 'MS-4', 'HSD-4'].includes(mr.gun.name))
                              .map((mr: any, idx: number) => {
                                const currentVal = ongoingReadings[mr.gunId] !== undefined ? ongoingReadings[mr.gunId] : mr.currentReading;
                                const litres = Math.max(0, currentVal - mr.previousReading);
                                const sales = litres * mr.priceUsed;

                                return (
                                  <div key={idx} className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-3">
                                    <div className="flex justify-between items-center">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-slate-200">{mr.gun.name}</span>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                          Staff: {getAssignedStaffForGun(activeDuty, mr.gun)}
                                        </span>
                                      </div>
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-emerald-400 border border-emerald-500/10">
                                        {mr.gun.fuelType} (₹{mr.priceUsed.toFixed(2)})
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Opening Reading</label>
                                        <span className="block text-sm font-mono font-bold text-slate-400 mt-1.5 bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-800 select-none" title="Opening Reading is preserved read-only">
                                          {mr.previousReading.toFixed(2)}
                                        </span>
                                      </div>
                                      <div>
                                        <div className="flex items-center justify-between">
                                          <label htmlFor={`reading-${mr.gunId}`} className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Closing Reading</label>
                                          {!isClosingUnlocked && (
                                            <span className="text-[10px] font-bold text-amber-400 flex items-center gap-0.5">
                                              <Lock className="h-2.5 w-2.5" /> Locked
                                            </span>
                                          )}
                                        </div>
                                        <input
                                          id={`reading-${mr.gunId}`}
                                          type="number"
                                          step="0.01"
                                          disabled={!isClosingUnlocked}
                                          value={ongoingReadings[mr.gunId] !== undefined ? ongoingReadings[mr.gunId] : ''}
                                          onChange={(e) => {
                                            setOngoingReadings({
                                              ...ongoingReadings,
                                              [mr.gunId]: Number(e.target.value),
                                            });
                                          }}
                                          className={`block w-full rounded-lg border py-1.5 px-3 mt-1 text-sm font-mono font-semibold focus:outline-none transition-all ${
                                            !isClosingUnlocked
                                              ? 'border-slate-800 bg-slate-950/70 text-slate-500 cursor-not-allowed select-none'
                                              : 'border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-600 focus:border-indigo-500'
                                          }`}
                                          placeholder={!isClosingUnlocked ? 'Locked until Closing' : 'Enter reading'}
                                        />
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center text-xs font-semibold text-slate-400 pt-2 border-t border-slate-900">
                                      <span>Litres Sold: <strong className="font-mono text-white">{litres.toFixed(2)} L</strong></span>
                                      <span>Sales: <strong className="font-mono text-emerald-400">₹{sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
                          <div className="text-xs text-slate-400 font-medium">
                            {!isClosingUnlocked ? (
                              <span className="text-amber-400 flex items-center gap-1.5 font-bold">
                                <Lock className="h-3.5 w-3.5" /> Closing readings locked initially. Click "Unlock Closing Stage" or "Close Duty" to enter closing readings.
                              </span>
                            ) : (
                              <span className="text-emerald-400 flex items-center gap-1.5 font-bold">
                                <Unlock className="h-3.5 w-3.5" /> Closing stage unlocked. You can now enter and save closing readings for all nozzles.
                              </span>
                            )}
                          </div>
                          <button
                            onClick={handleSaveOngoingReadings}
                            disabled={actionLoading || !isClosingUnlocked}
                            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${
                              !isClosingUnlocked
                                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                            }`}
                          >
                            {actionLoading ? 'Saving...' : 'Save Meter Readings'}
                          </button>
                        </div>
                      </div>

                      {/* Operational Tables: Oil, Expenses, Credit */}
                      <div className="grid grid-cols-1 gap-8">
                        {/* Oil Sales Log */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                            <h4 className="font-bold text-white text-base">Shift Oil Product Sales (2T/4T)</h4>
                            <span className="text-xs text-slate-400">Totallogged: {activeDuty.oilSales.length} items</span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold">
                                  <th className="p-3">Product Name</th>
                                  <th className="p-3 text-right">Quantity</th>
                                  <th className="p-3 text-right">Unit Price</th>
                                  <th className="p-3 text-right">Total Price</th>
                                  <th className="p-3 text-center">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/40">
                                {activeDuty.oilSales.length === 0 ? (
                                  <tr>
                                    <td colSpan={5} className="p-4 text-center text-slate-500">No oil products logged.</td>
                                  </tr>
                                ) : (
                                  activeDuty.oilSales.map((os: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-slate-950/20">
                                      <td className="p-3 font-semibold text-slate-200">{os.productName}</td>
                                      <td className="p-3 text-right font-mono text-slate-350">{os.quantity}</td>
                                      <td className="p-3 text-right font-mono text-slate-350">₹{os.unitPrice.toFixed(2)}</td>
                                      <td className="p-3 text-right font-mono font-bold text-indigo-400">₹{os.totalAmount.toFixed(2)}</td>
                                      <td className="p-3 text-center">
                                        <button onClick={() => handleDeleteOilSale(os.id)} className="text-red-500 hover:text-red-400">
                                          <Trash2 className="h-4 w-4 mx-auto" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Expenses Log */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                            <h4 className="font-bold text-white text-base">Bunk Operating Expenses</h4>
                            <span className="text-xs text-slate-400">Total cash expenses: ₹{expensesPaidInCash.toLocaleString()}</span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold">
                                  <th className="p-3">Category</th>
                                  <th className="p-3">Description</th>
                                  <th className="p-3 text-right">Amount</th>
                                  <th className="p-3">Method</th>
                                  <th className="p-3 text-center">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/40">
                                {activeDuty.expenses.length === 0 ? (
                                  <tr>
                                    <td colSpan={5} className="p-4 text-center text-slate-500">No shift expenses logged.</td>
                                  </tr>
                                ) : (
                                  activeDuty.expenses.map((ex: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-slate-950/20">
                                      <td className="p-3 font-semibold text-slate-200">{ex.category.name}</td>
                                      <td className="p-3 text-slate-350">{ex.description}</td>
                                      <td className="p-3 text-right font-mono font-bold text-red-400">₹{ex.amount.toFixed(2)}</td>
                                      <td className="p-3"><span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold uppercase tracking-wider text-[9px]">{ex.paymentMethod}</span></td>
                                      <td className="p-3 text-center">
                                        <button onClick={() => handleDeleteExpense(ex.id)} className="text-red-500 hover:text-red-400">
                                          <Trash2 className="h-4 w-4 mx-auto" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Credit Ledger Transactions */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                            <h4 className="font-bold text-white text-base">Credit Ledger (Customer Credit Sales & Collections)</h4>
                            <span className="text-xs text-amber-400 font-mono font-bold">Total credit sales: ₹{creditSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>

                          <form onSubmit={handleAddCredit} className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase">1. Customer / Company Name</label>
                                <select required value={creditCustId} onChange={(e) => setCreditCustId(e.target.value)} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white focus:border-indigo-500 focus:outline-none">
                                  <option value="">-- Select Customer / Company --</option>
                                  {staticData.customers.map((c: any) => (<option key={c.id} value={c.id}>{c.name} (Bal: ₹{c.balance.toFixed(2)})</option>))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase">2. Transaction Type</label>
                                <select value={creditType} onChange={(e) => setCreditType(e.target.value as any)} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white font-bold focus:border-indigo-500 focus:outline-none">
                                  <option value="CREDIT_SALE">Credit Given (Fuel / Oil / Product)</option>
                                  <option value="COLLECTION">Record Credit Collection (Payment Received)</option>
                                </select>
                              </div>
                            </div>

                            {creditType === 'CREDIT_SALE' ? (
                              <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end bg-slate-900/60 p-2.5 rounded border border-slate-800">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Indent / Slip No</label>
                                  <input type="text" value={indentNumber} onChange={(e) => setIndentNumber(e.target.value)} className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 mt-1 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none" placeholder="IND-104" />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Product</label>
                                  <select value={creditProduct} onChange={(e) => {
                                    const p = e.target.value;
                                    setCreditProduct(p);
                                    let rate = 0;
                                    if (p === 'MS') rate = msPrice;
                                    else if (p === 'HSD') rate = hsdPrice;
                                    else {
                                      const oil = staticData.products.find((op: any) => op.name === p);
                                      if (oil) rate = oil.price;
                                    }
                                    setCreditUnitPrice(rate);
                                    if (creditLitres > 0 && rate > 0) setCreditAmount(creditLitres * rate);
                                  }} className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 mt-1 text-xs text-white font-bold focus:border-indigo-500 focus:outline-none">
                                    <option value="MS">MS (Petrol) - ₹{msPrice.toFixed(2)}</option>
                                    <option value="HSD">HSD (Diesel) - ₹{hsdPrice.toFixed(2)}</option>
                                    {staticData.products.map((p: any) => (
                                      <option key={p.id} value={p.name}>{p.name} - ₹{p.price.toFixed(2)}</option>
                                    ))}
                                    <option value="OTHER">Custom Amount ₹</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Litres / Qty</label>
                                  <input type="number" step="0.01" min="0.01" value={creditLitres || ''} onChange={(e) => {
                                    const l = Number(e.target.value);
                                    setCreditLitres(l);
                                    const rate = creditUnitPrice || (creditProduct === 'MS' ? msPrice : (creditProduct === 'HSD' ? hsdPrice : 0));
                                    if (rate > 0) setCreditAmount(l * rate);
                                  }} className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 mt-1 text-xs text-white font-mono font-bold focus:border-indigo-500 focus:outline-none" placeholder="0.00" />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Rate (₹/L)</label>
                                  <input type="number" step="0.01" value={creditUnitPrice || (creditProduct === 'MS' ? msPrice : (creditProduct === 'HSD' ? hsdPrice : ''))} onChange={(e) => {
                                    const r = Number(e.target.value);
                                    setCreditUnitPrice(r);
                                    if (creditLitres > 0) setCreditAmount(creditLitres * r);
                                  }} className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 mt-1 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none" placeholder="Rate" />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Amount (₹)</label>
                                  <input type="number" step="0.01" min="1" value={creditAmount || ''} onChange={(e) => setCreditAmount(Number(e.target.value))} className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 mt-1 text-xs text-amber-400 font-mono font-bold focus:border-indigo-500 focus:outline-none" placeholder="0.00" />
                                </div>
                                <div>
                                  <button type="submit" disabled={isSubmittingCredit || actionLoading} className="w-full py-2 rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs uppercase transition-all flex items-center justify-center gap-1 shadow-md">
                                    {isSubmittingCredit ? <span>Saving...</span> : <><Plus className="h-3.5 w-3.5 inline mr-1" />+ ADD CREDIT</>}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Payment Method</label>
                                    <select
                                      value={creditPaymentMethod}
                                      onChange={(e) => setCreditPaymentMethod(e.target.value)}
                                      className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 text-xs text-emerald-400 font-bold focus:border-indigo-500 focus:outline-none"
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
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Collection Amount (₹) *</label>
                                    <input
                                      type="number"
                                      required
                                      min="1"
                                      step="0.01"
                                      value={creditAmount || ''}
                                      onChange={(e) => setCreditAmount(Number(e.target.value))}
                                      className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 text-xs text-emerald-400 font-mono font-bold focus:border-indigo-500 focus:outline-none"
                                      placeholder="0.00"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Remarks / Note</label>
                                    <input
                                      type="text"
                                      value={creditDesc}
                                      onChange={(e) => setCreditDesc(e.target.value)}
                                      className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                                      placeholder="Optional remark"
                                    />
                                  </div>
                                </div>

                                {creditPaymentMethod === 'CHEQUE' && (
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800">
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cheque Number *</label>
                                      <input
                                        type="text"
                                        required
                                        value={creditPaymentReference}
                                        onChange={(e) => setCreditPaymentReference(e.target.value)}
                                        className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                                        placeholder="CHQ-123456"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cheque Date *</label>
                                      <input
                                        type="date"
                                        required
                                        value={creditPaymentDate}
                                        onChange={(e) => setCreditPaymentDate(e.target.value)}
                                        className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Bank Name</label>
                                      <input
                                        type="text"
                                        value={creditBankName}
                                        onChange={(e) => setCreditBankName(e.target.value)}
                                        className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                                        placeholder="e.g. SBI"
                                      />
                                    </div>
                                  </div>
                                )}

                                {['RTGS', 'NEFT', 'UPI', 'BANK_TRANSFER'].includes(creditPaymentMethod) && (
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800">
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                        {creditPaymentMethod === 'UPI' ? 'Transaction ID / UTR *' : 'UTR / Reference Number *'}
                                      </label>
                                      <input
                                        type="text"
                                        required
                                        value={creditPaymentReference}
                                        onChange={(e) => setCreditPaymentReference(e.target.value)}
                                        className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                                        placeholder="UTR123456789"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Transaction Date *</label>
                                      <input
                                        type="date"
                                        required
                                        value={creditPaymentDate}
                                        onChange={(e) => setCreditPaymentDate(e.target.value)}
                                        className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                                      />
                                    </div>
                                    {creditPaymentMethod !== 'UPI' && (
                                      <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Bank Name</label>
                                        <input
                                          type="text"
                                          value={creditBankName}
                                          onChange={(e) => setCreditBankName(e.target.value)}
                                          className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                                          placeholder="e.g. HDFC Bank"
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div className="pt-2 border-t border-slate-800 flex justify-end">
                                  <button
                                    type="submit"
                                    disabled={isSubmittingCredit || actionLoading}
                                    className="px-5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs uppercase transition-all flex items-center gap-1 shadow-md"
                                  >
                                    {isSubmittingCredit ? <span>Saving...</span> : <><Plus className="h-3.5 w-3.5 inline mr-1" />+ COLLECT CREDIT PAYMENT</>}
                                  </button>
                                </div>
                              </div>
                            )}
                          </form>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold text-[10px]">
                                  <th className="p-2.5">Customer</th>
                                  <th className="p-2.5">Type / Method</th>
                                  <th className="p-2.5">Indent / Ref #</th>
                                  <th className="p-2.5">Product / Bank</th>
                                  <th className="p-2.5 text-right">Qty (L)</th>
                                  <th className="p-2.5 text-right">Rate</th>
                                  <th className="p-2.5 text-right">Amount</th>
                                  <th className="p-2.5">Remarks</th>
                                  <th className="p-2.5 text-center">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/40 font-mono text-xs">
                                {activeDuty.creditTransactions.length === 0 ? (
                                  <tr>
                                    <td colSpan={9} className="p-4 text-center text-slate-500 font-sans">No credit logs for this shift.</td>
                                  </tr>
                                ) : (
                                  activeDuty.creditTransactions.map((ct: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-slate-950/20">
                                      <td className="p-2.5 font-sans font-bold text-slate-200">{ct.customer.name}</td>
                                      <td className="p-2.5 font-sans">
                                        {ct.transactionType === 'CREDIT_SALE' ? (
                                          <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">CREDIT SALE</span>
                                        ) : (
                                          <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                                            {ct.paymentMethod || 'COLLECTION'}
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-2.5 text-indigo-300 font-bold">{ct.paymentReference || ct.indentNumber || '-'}</td>
                                      <td className="p-2.5 text-slate-300 font-sans">{ct.bankName || ct.productName || '-'}</td>
                                      <td className="p-2.5 text-right text-slate-200 font-bold">{ct.quantity ? `${ct.quantity.toFixed(2)} L` : '-'}</td>
                                      <td className="p-2.5 text-right text-slate-400">{ct.unitPrice ? `₹${ct.unitPrice.toFixed(2)}` : '-'}</td>
                                      <td className="p-2.5 text-right font-bold text-amber-400">₹{ct.amount.toFixed(2)}</td>
                                      <td className="p-2.5 text-slate-400 font-sans text-[11px]">{ct.description || '-'}</td>
                                      <td className="p-2.5 text-center">
                                        <button onClick={() => handleDeleteCredit(ct)} className="text-red-500 hover:text-red-400 p-1" title="Delete credit transaction">
                                          <Trash2 className="h-3.5 w-3.5 mx-auto" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Adding transactions forms */}
                    <div className="space-y-8">

                      {/* Live shift board */}
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                        <h4 className="font-extrabold text-white text-sm uppercase tracking-wider border-b border-slate-800 pb-2">Shift Info</h4>
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <span className="text-slate-400 block font-semibold">Duty Shift</span>
                            <span className="text-white font-bold text-sm">Duty #{activeDuty.dutyNumber}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-semibold">Manager Duty</span>
                            <span className="text-white font-bold text-sm">{activeDuty.manager.username}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400 block font-semibold">Shift Start Date/Time</span>
                            <span className="text-white font-bold text-sm font-mono" suppressHydrationWarning>{new Date(activeDuty.startTime).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Oil sales entry */}
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                        <h4 className="font-extrabold text-white text-sm uppercase tracking-wider border-b border-slate-800 pb-2">Log Oil Sale</h4>
                        <form onSubmit={handleAddOilSale} className="space-y-4">
                          <div>
                            <label htmlFor="oil-prod" className="block text-xs font-semibold text-slate-300">Select Oil Product</label>
                            <select
                              id="oil-prod"
                              required
                              value={oilProdId}
                              onChange={(e) => setOilProdId(e.target.value)}
                              className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-3 mt-1 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                            >
                              <option value="">-- Choose Product --</option>
                              {staticData.products.map((p: any) => (
                                <option key={p.id} value={p.id}>{p.name} (₹{p.price.toFixed(2)})</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor="oil-qty" className="block text-xs font-semibold text-slate-300">Quantity (Units)</label>
                            <input
                              id="oil-qty"
                              type="number"
                              required
                              min="1"
                              value={oilQty || ''}
                              onChange={(e) => setOilQty(Number(e.target.value))}
                              className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-3 mt-1 text-xs text-slate-100 placeholder-slate-650 focus:border-indigo-500 focus:outline-none"
                              placeholder="Enter quantity"
                            />
                          </div>
                          <button
                            type="submit"
                            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md"
                          >
                            Add Oil Transaction
                          </button>
                        </form>
                      </div>

                      {/* Expense logging entry */}
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                        <h4 className="font-extrabold text-white text-sm uppercase tracking-wider border-b border-slate-800 pb-2">Log Operating Expense</h4>
                        <form onSubmit={handleAddExpense} className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label htmlFor="exp-cat" className="block text-xs font-semibold text-slate-300">Category</label>
                              <select
                                id="exp-cat"
                                required
                                value={expCategory}
                                onChange={(e) => setExpCategory(e.target.value)}
                                className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-3 mt-1 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                              >
                                <option value="">-- Choose --</option>
                                {staticData.categories.map((c: any) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label htmlFor="exp-method" className="block text-xs font-semibold text-slate-300">Payment</label>
                              <select
                                id="exp-method"
                                required
                                value={expMethod}
                                onChange={(e) => setExpMethod(e.target.value)}
                                className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-3 mt-1 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                              >
                                <option value="Cash">Cash</option>
                                <option value="PhonePe">PhonePe</option>
                                <option value="GPay">GPay</option>
                                <option value="Paytm">Paytm</option>
                                <option value="Bank">Bank Transfer</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label htmlFor="exp-amount" className="block text-xs font-semibold text-slate-300">Amount (₹)</label>
                            <input
                              id="exp-amount"
                              type="number"
                              required
                              min="1"
                              value={expAmount || ''}
                              onChange={(e) => setExpAmount(Number(e.target.value))}
                              className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-3 mt-1 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                              placeholder="Enter amount"
                            />
                          </div>
                          <div>
                            <label htmlFor="exp-desc" className="block text-xs font-semibold text-slate-300">Description</label>
                            <input
                              id="exp-desc"
                              type="text"
                              required
                              value={expDesc}
                              onChange={(e) => setExpDesc(e.target.value)}
                              className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-3 mt-1 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                              placeholder="Brief description"
                            />
                          </div>
                          <button
                            type="submit"
                            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md"
                          >
                            Log Expense
                          </button>
                        </form>
                      </div>

                      {/* Stock tank dip entry */}
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                        <h4 className="font-extrabold text-white text-sm uppercase tracking-wider border-b border-slate-800 pb-2">Record Underground Dip</h4>
                        <form onSubmit={handleAddDip} className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label htmlFor="dip-fuel" className="block text-xs font-semibold text-slate-300">Fuel Type</label>
                              <select
                                id="dip-fuel"
                                required
                                value={dipFuelType}
                                onChange={(e) => setDipFuelType(e.target.value as 'MS' | 'HSD')}
                                className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-3 mt-1 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                              >
                                <option value="MS">MS Petrol</option>
                                <option value="HSD">HSD Diesel</option>
                              </select>
                            </div>
                            <div>
                              <label htmlFor="dip-physical" className="block text-xs font-semibold text-slate-300">Physical Dip (Litres)</label>
                              <input
                                id="dip-physical"
                                type="number"
                                required
                                min="1"
                                value={dipPhysical || ''}
                                onChange={(e) => setDipPhysical(Number(e.target.value))}
                                className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-3 mt-1 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                                placeholder="Enter physical L"
                              />
                            </div>
                          </div>

                          {/* Show expected stock if active */}
                          {activeDuty && (
                            <div className="rounded-lg bg-slate-950 p-3 text-[11px] border border-slate-850 flex justify-between font-semibold">
                              <span className="text-slate-400">Current Expected Stock:</span>
                              <span className="font-mono text-white">
                                {(() => {
                                  const salesVolume = activeDuty.meterReadings
                                    .filter((mr: any) => mr.gun.fuelType === dipFuelType)
                                    .reduce((sum: number, mr: any) => sum + mr.litresSold, 0);
                                  const lastStockLevel = stockHistory.find(s => s.fuelType === dipFuelType);
                                  const opening = lastStockLevel ? lastStockLevel.physicalDip : (dipFuelType === 'MS' ? 7504 : 12741);
                                  return (opening - salesVolume).toLocaleString() + ' L';
                                })()}
                              </span>
                            </div>
                          )}

                          <button
                            type="submit"
                            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md"
                          >
                            Log Tank Dip
                          </button>
                        </form>
                      </div>

                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: PAST DUTY REPORTS */}
          {activeTab === 'past-duty' && (
            <OwnerPastDutyReport
              activeDuty={activeDuty}
              historicalDuties={historicalDuties}
              staticData={staticData}
              onRefresh={refreshActiveDuty}
              flashMessage={flashMessage}
            />
          )}

          {/* TAB: CREDIT LEDGER */}
          {activeTab === 'credit-ledger' && (
            <OwnerCreditLedger
              creditLedger={creditLedger}
              staticData={staticData}
              historicalDuties={historicalDuties}
              onRefresh={refreshActiveDuty}
              flashMessage={flashMessage}
            />
          )}

          {/* TAB: OIL PURCHASES */}
          {activeTab === 'oil-purchases' && (
            <OilInventoryManager
              initialSubTab="purchases"
              staticData={staticData}
              oilSales={oilSales}
              oilPurchases={oilPurchases}
              activeDuty={activeDuty}
              onRefresh={refreshActiveDuty}
              flashMessage={flashMessage}
            />
          )}

          {/* TAB: OIL SALES */}
          {activeTab === 'oil-sales' && (
            <OilInventoryManager
              initialSubTab="sales"
              staticData={staticData}
              oilSales={oilSales}
              oilPurchases={oilPurchases}
              activeDuty={activeDuty}
              onRefresh={refreshActiveDuty}
              flashMessage={flashMessage}
            />
          )}

          {/* TAB: OIL INVENTORY */}
          {activeTab === 'oil-inventory' && (
            <OilInventoryManager
              initialSubTab="inventory"
              staticData={staticData}
              oilSales={oilSales}
              oilPurchases={oilPurchases}
              activeDuty={activeDuty}
              onRefresh={refreshActiveDuty}
              flashMessage={flashMessage}
            />
          )}

          {/* TAB 3: ACC HISTORY LOGS */}
          {activeTab === 'history' && (
            <div className="space-y-8">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                  <div>
                    <h3 className="font-extrabold text-white text-lg">ACC Daily Shift Logs</h3>
                    <p className="text-xs text-slate-400 mt-1">Select and view comprehensive operational breakdown for completed duties.</p>
                  </div>
                  <button
                    onClick={() => handleExportExcel('history-table', 'Shift_Logs')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-850 text-indigo-400 hover:text-indigo-300 text-xs font-bold transition-all"
                  >
                    Export to Excel
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table id="history-table" className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold text-xs tracking-wider uppercase">
                        <th className="p-4">Duty ID</th>
                        <th className="p-4">Duty Shift Start</th>
                        <th className="p-4">Duty Shift End</th>
                        <th className="p-4">Shift Manager</th>
                        <th className="p-4 text-right">Fuel Volume Sold (L)</th>
                        <th className="p-4 text-right">Cash Difference</th>
                        <th className="p-4 text-center">Reconciliation Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {historicalDuties.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-500">No shift settlements registered.</td>
                        </tr>
                      ) : (
                        historicalDuties.map((d: any, idx: number) => {
                          const litres = d.meterReadings.reduce((sum: number, mr: any) => sum + mr.litresSold, 0);
                          return (
                            <tr key={idx} className="hover:bg-slate-850/20">
                              <td className="p-4 font-bold text-indigo-400">Duty #{d.dutyNumber}</td>
                              <td className="p-4 text-slate-350" suppressHydrationWarning>{new Date(d.startTime).toLocaleString()}</td>
                              <td className="p-4 text-slate-350" suppressHydrationWarning>{d.endTime ? new Date(d.endTime).toLocaleString() : 'OPEN & RUNNING'}</td>
                              <td className="p-4 font-semibold text-slate-200">{d.manager.username}</td>
                              <td className="p-4 text-right font-mono text-white">{litres.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L</td>
                              <td className={`p-4 text-right font-mono font-bold ${d.cashDifference < 0 ? 'text-red-400' : d.cashDifference > 0 ? 'text-emerald-400' : 'text-slate-400'
                                }`}>
                                {d.status === 'OPEN' ? '-' : d.cashDifference < 0 ? `-₹${Math.abs(d.cashDifference).toLocaleString()}` : d.cashDifference > 0 ? `+₹${d.cashDifference.toLocaleString()}` : '₹0'}
                              </td>
                              <td className="p-4 text-center">
                                {d.status === 'OPEN' ? (
                                  <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25">OPEN</span>
                                ) : d.cashDifference === 0 ? (
                                  <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">BALANCED</span>
                                ) : d.cashDifference < 0 ? (
                                  <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/25">SHORTAGE</span>
                                ) : (
                                  <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/25">SURPLUS</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: REPORTS LEDGER */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              {/* REPORTS LEDGER STATUS BANNER */}
              {reportsTab !== 'staff' && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30 flex items-center justify-center font-bold">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-extrabold text-white uppercase tracking-wider">PERMANENT REPORTS LEDGER</h2>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        Immutable historical audit trail across all 24-hour duty sessions
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 text-right">
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">HISTORICAL DATA ISOLATION</span>
                    <span className="text-xs font-bold text-amber-400">Permanent historical records of all completed duties.</span>
                  </div>
                </div>
              )}

              {/* Report Tabs - Sticky at top */}
              <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-md pt-2 pb-1 border-b border-slate-800 flex gap-2 shrink-0 overflow-x-auto">
                {[
                  { id: 'sales', label: 'Fuel Sales Breakdown' },
                  { id: 'staff', label: 'Staff Performance' },
                  { id: 'credit', label: 'Credit Ledger' },
                  { id: 'expenses', label: 'Operating Expenses' },
                  { id: 'oil', label: 'Oil Sales' },
                  { id: 'stock', label: 'Stock & Variance' },
                  { id: 'cash', label: 'Cash Reconciliation' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setReportsTab(tab.id as any)}
                    className={`py-2 px-4 border-b-2 font-bold text-sm transition-all whitespace-nowrap ${reportsTab === tab.id
                      ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* SALES REPORT SUB-TAB */}
              {reportsTab === 'sales' && (() => {
                // 1. Gather all available duties (historical + active)
                const combinedDuties = [
                  ...historicalDuties,
                  ...(activeDuty && !historicalDuties.some((d: any) => d.id === activeDuty.id) ? [activeDuty] : [])
                ];

                // 2. Flatten and filter meter reading records
                const filteredReadingRows: Array<{
                  duty: any;
                  reading: any;
                  dateStr: string;
                  monthStr: string;
                  yearStr: string;
                  pumpId: string;
                  pumpName: string;
                  fuelType: string;
                  assignedStaff: any;
                }> = [];

                for (const d of combinedDuties) {
                  const dDate = new Date(d.startTime);
                  const dStr = dDate.toLocaleDateString('en-CA'); // YYYY-MM-DD
                  const dMonth = dStr.slice(0, 7);
                  const dYear = dStr.slice(0, 4);

                  // Filter by date / preset
                  if (fuelReportDate && dStr !== fuelReportDate) continue;
                  if (fuelReportStartDate && dStr < fuelReportStartDate) continue;
                  if (fuelReportEndDate && dStr > fuelReportEndDate) continue;
                  if (fuelReportMonth && dMonth !== fuelReportMonth) continue;
                  if (fuelReportYear && dYear !== fuelReportYear) continue;

                  for (const mr of d.meterReadings || []) {
                    const fType = mr.gun?.fuelType || 'MS';
                    const pId = mr.gun?.pumpId || mr.gun?.pump?.id || 'p1';
                    const pName = mr.gun?.pump?.name || (pId === 'p1' ? 'Pump 1' : pId === 'p2' ? 'Pump 2' : 'Pump');

                    // Find assigned staff for this pump & fuel type in duty
                    const assignment = (d.assignments || []).find((as: any) =>
                      (as.pumpId === pId || as.pump?.id === pId) && as.fuelType === fType
                    );
                    const staffObj = assignment?.staff;

                    // Apply Fuel Type filter
                    if (fuelReportFuelType !== 'ALL' && fType !== fuelReportFuelType) continue;

                    // Apply Pump filter
                    if (fuelReportPump !== 'ALL' && pId !== fuelReportPump && pName !== fuelReportPump) continue;

                    // Apply Staff filter
                    if (fuelReportStaff !== 'ALL' && staffObj?.id !== fuelReportStaff && staffObj?.name !== fuelReportStaff) continue;

                    filteredReadingRows.push({
                      duty: d,
                      reading: mr,
                      dateStr: dStr,
                      monthStr: dMonth,
                      yearStr: dYear,
                      pumpId: pId,
                      pumpName: pName,
                      fuelType: fType,
                      assignedStaff: staffObj
                    });
                  }
                }

                // 3. Overall KPI Calculations
                const msRows = filteredReadingRows.filter(r => r.fuelType === 'MS');
                const hsdRows = filteredReadingRows.filter(r => r.fuelType === 'HSD');

                const totalMsLitres = msRows.reduce((s, r) => s + (r.reading.litresSold || Math.max(0, r.reading.currentReading - r.reading.previousReading)), 0);
                const totalMsRevenue = msRows.reduce((s, r) => s + (r.reading.salesAmount || Math.max(0, r.reading.currentReading - r.reading.previousReading) * r.reading.priceUsed), 0);

                const totalHsdLitres = hsdRows.reduce((s, r) => s + (r.reading.litresSold || Math.max(0, r.reading.currentReading - r.reading.previousReading)), 0);
                const totalHsdRevenue = hsdRows.reduce((s, r) => s + (r.reading.salesAmount || Math.max(0, r.reading.currentReading - r.reading.previousReading) * r.reading.priceUsed), 0);

                const totalFuelLitres = totalMsLitres + totalHsdLitres;
                const totalFuelRevenue = totalMsRevenue + totalHsdRevenue;

                // 4. Sales By Pump Calculation
                const salesByPumpMap: Record<string, {
                  pumpId: string;
                  pumpName: string;
                  msLitres: number;
                  msRevenue: number;
                  hsdLitres: number;
                  hsdRevenue: number;
                  totalLitres: number;
                  totalRevenue: number;
                }> = {};

                (staticData.pumps || []).forEach((p: any) => {
                  salesByPumpMap[p.id] = {
                    pumpId: p.id,
                    pumpName: p.name,
                    msLitres: 0,
                    msRevenue: 0,
                    hsdLitres: 0,
                    hsdRevenue: 0,
                    totalLitres: 0,
                    totalRevenue: 0
                  };
                });

                filteredReadingRows.forEach(r => {
                  const pKey = r.pumpId;
                  if (!salesByPumpMap[pKey]) {
                    salesByPumpMap[pKey] = {
                      pumpId: pKey,
                      pumpName: r.pumpName,
                      msLitres: 0,
                      msRevenue: 0,
                      hsdLitres: 0,
                      hsdRevenue: 0,
                      totalLitres: 0,
                      totalRevenue: 0
                    };
                  }
                  const litres = r.reading.litresSold || Math.max(0, r.reading.currentReading - r.reading.previousReading);
                  const revenue = r.reading.salesAmount || (litres * r.reading.priceUsed);

                  if (r.fuelType === 'MS') {
                    salesByPumpMap[pKey].msLitres += litres;
                    salesByPumpMap[pKey].msRevenue += revenue;
                  } else {
                    salesByPumpMap[pKey].hsdLitres += litres;
                    salesByPumpMap[pKey].hsdRevenue += revenue;
                  }
                  salesByPumpMap[pKey].totalLitres += litres;
                  salesByPumpMap[pKey].totalRevenue += revenue;
                });

                // 5. Sales By Staff Calculation
                const salesByStaffMap: Record<string, {
                  staffId: string;
                  staffName: string;
                  pumps: Set<string>;
                  msLitres: number;
                  hsdLitres: number;
                  totalLitres: number;
                  totalRevenue: number;
                }> = {};

                filteredReadingRows.forEach(r => {
                  const sId = r.assignedStaff?.id || 'UNASSIGNED';
                  const sName = r.assignedStaff?.name || 'Unassigned / System';

                  if (!salesByStaffMap[sId]) {
                    salesByStaffMap[sId] = {
                      staffId: sId,
                      staffName: sName,
                      pumps: new Set(),
                      msLitres: 0,
                      hsdLitres: 0,
                      totalLitres: 0,
                      totalRevenue: 0
                    };
                  }
                  salesByStaffMap[sId].pumps.add(r.pumpName);

                  const litres = r.reading.litresSold || Math.max(0, r.reading.currentReading - r.reading.previousReading);
                  const revenue = r.reading.salesAmount || (litres * r.reading.priceUsed);

                  if (r.fuelType === 'MS') {
                    salesByStaffMap[sId].msLitres += litres;
                  } else {
                    salesByStaffMap[sId].hsdLitres += litres;
                  }
                  salesByStaffMap[sId].totalLitres += litres;
                  salesByStaffMap[sId].totalRevenue += revenue;
                });

                // 6. Sales By Period Calculation (Date-wise / Month-wise / Year-wise)
                const salesByPeriodMap: Record<string, {
                  periodKey: string;
                  msLitres: number;
                  msRevenue: number;
                  hsdLitres: number;
                  hsdRevenue: number;
                  totalLitres: number;
                  totalRevenue: number;
                  dutiesCount: number;
                  dutyIds: Set<string>;
                }> = {};

                filteredReadingRows.forEach(r => {
                  const periodKey = fuelReportGroupBy === 'YEAR' ? r.yearStr : fuelReportGroupBy === 'MONTH' ? r.monthStr : r.dateStr;

                  if (!salesByPeriodMap[periodKey]) {
                    salesByPeriodMap[periodKey] = {
                      periodKey,
                      msLitres: 0,
                      msRevenue: 0,
                      hsdLitres: 0,
                      hsdRevenue: 0,
                      totalLitres: 0,
                      totalRevenue: 0,
                      dutiesCount: 0,
                      dutyIds: new Set()
                    };
                  }
                  salesByPeriodMap[periodKey].dutyIds.add(r.duty.id);
                  const litres = r.reading.litresSold || Math.max(0, r.reading.currentReading - r.reading.previousReading);
                  const revenue = r.reading.salesAmount || (litres * r.reading.priceUsed);

                  if (r.fuelType === 'MS') {
                    salesByPeriodMap[periodKey].msLitres += litres;
                    salesByPeriodMap[periodKey].msRevenue += revenue;
                  } else {
                    salesByPeriodMap[periodKey].hsdLitres += litres;
                    salesByPeriodMap[periodKey].hsdRevenue += revenue;
                  }
                  salesByPeriodMap[periodKey].totalLitres += litres;
                  salesByPeriodMap[periodKey].totalRevenue += revenue;
                });

                Object.values(salesByPeriodMap).forEach(p => {
                  p.dutiesCount = p.dutyIds.size;
                });

                const sortedPeriods = Object.values(salesByPeriodMap).sort((a, b) => b.periodKey.localeCompare(a.periodKey));
                const maxPeriodVolume = Math.max(...sortedPeriods.map(p => p.totalLitres), 1);

                // 7. Drill-Down Filtered Rows
                let activeDrillDownRows = filteredReadingRows;
                if (selectedDrillDownKey && selectedDrillDownType) {
                  if (selectedDrillDownType === 'PUMP') {
                    activeDrillDownRows = filteredReadingRows.filter(r => r.pumpId === selectedDrillDownKey || r.pumpName === selectedDrillDownKey);
                  } else if (selectedDrillDownType === 'STAFF') {
                    activeDrillDownRows = filteredReadingRows.filter(r => (r.assignedStaff?.id || 'UNASSIGNED') === selectedDrillDownKey);
                  } else if (selectedDrillDownType === 'PERIOD') {
                    activeDrillDownRows = filteredReadingRows.filter(r => {
                      const pKey = fuelReportGroupBy === 'YEAR' ? r.yearStr : fuelReportGroupBy === 'MONTH' ? r.monthStr : r.dateStr;
                      return pKey === selectedDrillDownKey;
                    });
                  }
                }

                return (
                  <div className="space-y-8">
                    {/* REPORT HEADER & EXPORT BAR */}
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30 flex items-center justify-center">
                          <BarChart3 className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-white text-base uppercase tracking-wider">Fuel Sales & Meter Verification Report</h4>
                          <p className="text-xs text-slate-400">Meter Readings → Fuel Sales Reconciliation → Daily & Monthly Granular Drill-Down</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleExportExcel('sales-report-table', 'Fuel_Sales_Report')}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                          Export Excel
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintFuelReport(
                            filteredReadingRows,
                            { totalMsLitres, totalMsRevenue, totalHsdLitres, totalHsdRevenue, totalFuelLitres, totalFuelRevenue },
                            sortedPeriods
                          )}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all shadow-md cursor-pointer border border-slate-700"
                        >
                          <Printer className="h-4 w-4 text-indigo-400" />
                          Print / Export PDF
                        </button>
                      </div>
                    </div>

                    {/* FILTER BAR SECTION */}
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                        <div className="flex items-center gap-2">
                          <Filter className="h-4 w-4 text-indigo-400" />
                          <span className="text-xs font-bold text-white uppercase tracking-wider">Date Range & Filter Controls</span>
                        </div>

                        {/* Quick Filter Preset Pills */}
                        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                          {[
                            { id: 'TODAY', label: 'Today' },
                            { id: 'YESTERDAY', label: 'Yesterday' },
                            { id: 'THIS_WEEK', label: 'This Week' },
                            { id: 'LAST_WEEK', label: 'Last Week' },
                            { id: 'THIS_MONTH', label: 'This Month' },
                            { id: 'LAST_MONTH', label: 'Last Month' },
                            { id: 'THIS_YEAR', label: 'This Year' },
                            { id: 'LAST_YEAR', label: 'Last Year' },
                            { id: 'ALL', label: 'All Time' },
                          ].map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleQuickFilter(p.id as any)}
                              className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${fuelReportPreset === p.id
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                                }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Filter Controls Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 text-xs">
                        {/* Single Date */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Single Date</label>
                          <input
                            type="date"
                            value={fuelReportDate}
                            onChange={(e) => {
                              setFuelReportDate(e.target.value);
                              setFuelReportPreset('CUSTOM');
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                          />
                        </div>

                        {/* Start Date */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Start Date</label>
                          <input
                            type="date"
                            value={fuelReportStartDate}
                            onChange={(e) => {
                              setFuelReportStartDate(e.target.value);
                              setFuelReportPreset('CUSTOM');
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                          />
                        </div>

                        {/* End Date */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">End Date</label>
                          <input
                            type="date"
                            value={fuelReportEndDate}
                            onChange={(e) => {
                              setFuelReportEndDate(e.target.value);
                              setFuelReportPreset('CUSTOM');
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                          />
                        </div>

                        {/* Month Filter */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Month</label>
                          <input
                            type="month"
                            value={fuelReportMonth}
                            onChange={(e) => {
                              setFuelReportMonth(e.target.value);
                              setFuelReportPreset('CUSTOM');
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-indigo-500 focus:outline-none"
                          />
                        </div>

                        {/* Pump Filter */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pump</label>
                          <select
                            value={fuelReportPump}
                            onChange={(e) => setFuelReportPump(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="ALL">All Pumps</option>
                            {(staticData.pumps || []).map((p: any) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Staff Filter */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Staff</label>
                          <select
                            value={fuelReportStaff}
                            onChange={(e) => setFuelReportStaff(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="ALL">All Staff</option>
                            {(staticData.staff || []).map((s: any) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Fuel Type Filter */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Fuel Type</label>
                          <select
                            value={fuelReportFuelType}
                            onChange={(e) => setFuelReportFuelType(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="ALL">All Types (MS & HSD)</option>
                            <option value="MS">Petrol (MS)</option>
                            <option value="HSD">Diesel (HSD)</option>
                          </select>
                        </div>
                      </div>

                      {/* Reset Filters Bar */}
                      <div className="flex justify-between items-center pt-2">
                        <div className="text-[11px] text-slate-400 font-mono">
                          Active matching meter entries: <span className="font-bold text-indigo-400">{filteredReadingRows.length} entries</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleResetFuelFilters}
                          className="text-[11px] font-bold text-slate-400 hover:text-white transition-all underline underline-offset-4 cursor-pointer"
                        >
                          Clear All Filters
                        </button>
                      </div>
                    </div>

                    {/* EMPTY STATE IF NO MATCHES */}
                    {filteredReadingRows.length === 0 ? (
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
                        <div className="h-12 w-12 bg-slate-800 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                          <Fuel className="h-6 w-6" />
                        </div>
                        <h4 className="text-lg font-bold text-white">No Meter Readings Match Your Filter Criteria</h4>
                        <p className="text-xs text-slate-400 max-w-md mx-auto">
                          Adjust your date, pump, staff, or fuel type selection above to display aggregated sales metrics.
                        </p>
                        <button
                          type="button"
                          onClick={handleResetFuelFilters}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          Reset Filters
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* 1. AGGREGATE EXECUTIVE KPI CARDS */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          {/* MS Litres & Revenue */}
                          <div className="bg-slate-900 border border-indigo-500/30 p-5 rounded-2xl shadow-xl space-y-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-indigo-300 uppercase tracking-wider">MS (Petrol) Sold</span>
                              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-black">MS</span>
                            </div>
                            <div className="font-mono text-2xl font-black text-white">{totalMsLitres.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">L</span></div>
                            <div className="text-xs text-indigo-400 font-mono font-bold">₹{totalMsRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Revenue</div>
                          </div>

                          {/* HSD Litres & Revenue */}
                          <div className="bg-slate-900 border border-emerald-500/30 p-5 rounded-2xl shadow-xl space-y-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-emerald-300 uppercase tracking-wider">HSD (Diesel) Sold</span>
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black">HSD</span>
                            </div>
                            <div className="font-mono text-2xl font-black text-white">{totalHsdLitres.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">L</span></div>
                            <div className="text-xs text-emerald-400 font-mono font-bold">₹{totalHsdRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Revenue</div>
                          </div>

                          {/* Total Fuel Volume */}
                          <div className="bg-slate-900 border border-amber-500/30 p-5 rounded-2xl shadow-xl space-y-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-amber-300 uppercase tracking-wider">Total Fuel Volume</span>
                              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black">MS + HSD</span>
                            </div>
                            <div className="font-mono text-2xl font-black text-amber-300">{totalFuelLitres.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">L</span></div>
                            <div className="text-xs text-slate-400">Combined Volume Sold</div>
                          </div>

                          {/* Total Fuel Revenue */}
                          <div className="bg-gradient-to-br from-indigo-950/80 via-slate-900 to-slate-900 border border-indigo-500/40 p-5 rounded-2xl shadow-2xl space-y-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-indigo-300 uppercase tracking-wider">Total Fuel Revenue</span>
                              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-black text-[10px]">NET SALES</span>
                            </div>
                            <div className="font-mono text-2xl font-black text-white">₹{totalFuelRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <div className="text-xs text-indigo-300/80 font-medium">Aggregated Sales Value</div>
                          </div>
                        </div>

                        {/* 2. DAILY SALES VOLUME TREND BAR CHART */}
                        {sortedPeriods.length > 0 && (
                          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
                            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                              <div className="flex items-center gap-2">
                                <BarChart3 className="h-5 w-5 text-indigo-400" />
                                <div>
                                  <h4 className="font-extrabold text-white text-sm uppercase tracking-wider">Daily Fuel Sales Trend</h4>
                                  <p className="text-xs text-slate-400">Daily MS vs HSD volume visual trend across selected period</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 text-xs font-bold font-mono">
                                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-indigo-500 inline-block"></span> MS (Petrol)</span>
                                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-emerald-500 inline-block"></span> HSD (Diesel)</span>
                              </div>
                            </div>

                            <div className="space-y-3 pt-2">
                              {sortedPeriods.slice(0, 14).map((p) => {
                                const msPct = Math.min(100, Math.max(0, (p.msLitres / maxPeriodVolume) * 100));
                                const hsdPct = Math.min(100, Math.max(0, (p.hsdLitres / maxPeriodVolume) * 100));

                                return (
                                  <div
                                    key={p.periodKey}
                                    onClick={() => {
                                      setSelectedDayDrillDownDate(p.periodKey);
                                      setShowDayDrillDownModal(true);
                                    }}
                                    className="group bg-slate-950 hover:bg-slate-900 p-3 rounded-xl border border-slate-850 hover:border-indigo-500/50 transition-all cursor-pointer space-y-2"
                                  >
                                    <div className="flex justify-between items-center text-xs">
                                      <div className="flex items-center gap-2 font-bold">
                                        <span className="text-indigo-400 font-sans">{p.periodKey}</span>
                                        <span className="text-[10px] text-slate-500 font-mono font-normal">({p.dutiesCount} Duty{p.dutiesCount > 1 ? 'ies' : ''})</span>
                                      </div>
                                      <div className="font-mono text-xs text-slate-300 font-bold group-hover:text-indigo-300 transition-colors">
                                        Total: <strong className="text-white">{p.totalLitres.toFixed(2)} L</strong> | <span className="text-indigo-400">₹{p.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                      </div>
                                    </div>

                                    {/* Visual Bar Stack */}
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2 text-[10px] font-mono">
                                        <span className="w-8 text-indigo-400 font-bold shrink-0">MS</span>
                                        <div className="flex-1 bg-slate-900 h-3 rounded-full overflow-hidden">
                                          <div className="bg-gradient-to-r from-indigo-600 to-indigo-400 h-full rounded-full transition-all duration-500" style={{ width: `${msPct}%` }}></div>
                                        </div>
                                        <span className="w-20 text-right font-bold text-white shrink-0">{p.msLitres.toFixed(2)} L</span>
                                      </div>

                                      <div className="flex items-center gap-2 text-[10px] font-mono">
                                        <span className="w-8 text-emerald-400 font-bold shrink-0">HSD</span>
                                        <div className="flex-1 bg-slate-900 h-3 rounded-full overflow-hidden">
                                          <div className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full rounded-full transition-all duration-500" style={{ width: `${hsdPct}%` }}></div>
                                        </div>
                                        <span className="w-20 text-right font-bold text-white shrink-0">{p.hsdLitres.toFixed(2)} L</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* 3. DAILY BREAKDOWN REGISTER TABLE */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden space-y-0">
                          <div className="p-6 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-5 w-5 text-indigo-400" />
                              <div>
                                <h4 className="font-extrabold text-white text-sm uppercase tracking-wider">Daily Fuel Sales & Meter Register</h4>
                                <p className="text-xs text-slate-400">Click any date to drill down into exact nozzle readings, checkpoint values & duty reports</p>
                              </div>
                            </div>

                            {/* Grouping Selector */}
                            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                              {[
                                { id: 'DATE', label: 'Date-wise' },
                                { id: 'MONTH', label: 'Month-wise' },
                                { id: 'YEAR', label: 'Year-wise' },
                              ].map((g) => (
                                <button
                                  key={g.id}
                                  type="button"
                                  onClick={() => setFuelReportGroupBy(g.id as any)}
                                  className={`px-3 py-1 font-bold rounded-lg transition-all cursor-pointer ${fuelReportGroupBy === g.id
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                  {g.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold text-[10px]">
                                  <th className="p-3">{fuelReportGroupBy === 'YEAR' ? 'Year' : fuelReportGroupBy === 'MONTH' ? 'Month' : 'Date'}</th>
                                  <th className="p-3 text-right">MS Litres</th>
                                  <th className="p-3 text-right">HSD Litres</th>
                                  <th className="p-3 text-right">Total Litres</th>
                                  <th className="p-3 text-right">MS Revenue</th>
                                  <th className="p-3 text-right">HSD Revenue</th>
                                  <th className="p-3 text-right">Total Sales</th>
                                  <th className="p-3 text-center">Duties</th>
                                  <th className="p-3 text-center">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/40 font-mono">
                                {sortedPeriods.map((period) => (
                                  <tr
                                    key={period.periodKey}
                                    className="hover:bg-slate-950/60 transition-all cursor-pointer"
                                    onClick={() => {
                                      setSelectedDayDrillDownDate(period.periodKey);
                                      setShowDayDrillDownModal(true);
                                    }}
                                  >
                                    <td className="p-3 font-bold font-sans text-indigo-400 flex items-center gap-1.5">
                                      <Calendar className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                                      {period.periodKey}
                                    </td>
                                    <td className="p-3 text-right text-slate-200">{period.msLitres.toFixed(2)} L</td>
                                    <td className="p-3 text-right text-slate-200">{period.hsdLitres.toFixed(2)} L</td>
                                    <td className="p-3 text-right text-white font-black">{period.totalLitres.toFixed(2)} L</td>
                                    <td className="p-3 text-right text-indigo-300">₹{period.msRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className="p-3 text-right text-emerald-300">₹{period.hsdRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className="p-3 text-right text-indigo-400 font-black">₹{period.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className="p-3 text-center font-sans">
                                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold text-[10px]">
                                        {period.dutiesCount}
                                      </span>
                                    </td>
                                    <td className="p-3 text-center">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedDayDrillDownDate(period.periodKey);
                                          setShowDayDrillDownModal(true);
                                        }}
                                        className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-sans text-[11px] font-bold transition-all shadow flex items-center gap-1 mx-auto cursor-pointer"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        View Day Details
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* 4. SALES BY PUMP SECTION */}
                        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-5 w-5 text-indigo-400" />
                              <h4 className="font-extrabold text-white text-sm uppercase tracking-wider">Sales By Pump Breakdown</h4>
                            </div>
                            <span className="text-xs text-slate-400">Volume and revenue by island pump</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {Object.values(salesByPumpMap).map((pump) => (
                              <div
                                key={pump.pumpId}
                                className={`bg-slate-950 p-5 rounded-2xl border transition-all ${selectedDrillDownKey === pump.pumpId && selectedDrillDownType === 'PUMP'
                                  ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                                  : 'border-slate-800 hover:border-slate-700'
                                  }`}
                              >
                                <div className="flex justify-between items-center pb-3 border-b border-slate-800/80">
                                  <div className="flex items-center gap-2">
                                    <span className="h-3 w-3 rounded-full bg-indigo-500"></span>
                                    <span className="font-extrabold text-white text-base">{pump.pumpName}</span>
                                  </div>
                                  <span className="font-mono font-black text-indigo-400 text-base">₹{pump.totalRevenue.toFixed(2)}</span>
                                </div>

                                <div className="grid grid-cols-2 gap-3 py-4 text-xs font-mono">
                                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/60">
                                    <span className="text-slate-400 block text-[10px] uppercase font-sans font-bold">MS (Petrol)</span>
                                    <span className="text-white font-bold block mt-1">{pump.msLitres.toFixed(2)} L</span>
                                    <span className="text-indigo-400 block text-[11px]">₹{pump.msRevenue.toFixed(2)}</span>
                                  </div>

                                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/60">
                                    <span className="text-slate-400 block text-[10px] uppercase font-sans font-bold">HSD (Diesel)</span>
                                    <span className="text-white font-bold block mt-1">{pump.hsdLitres.toFixed(2)} L</span>
                                    <span className="text-emerald-400 block text-[11px]">₹{pump.hsdRevenue.toFixed(2)}</span>
                                  </div>
                                </div>

                                <div className="flex justify-between items-center pt-2 text-xs border-t border-slate-800/50">
                                  <span className="text-slate-400">Total Pump Volume: <strong className="text-white font-mono">{pump.totalLitres.toFixed(2)} L</strong></span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedDrillDownKey(pump.pumpId);
                                      setSelectedDrillDownType('PUMP');
                                      setShowDetailedMeterAudit(true);
                                    }}
                                    className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-all cursor-pointer"
                                  >
                                    View Pump Meter Readings <ChevronRight className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 5. SALES BY STAFF SECTION */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <Users className="h-5 w-5 text-indigo-400" />
                              <div>
                                <h4 className="font-extrabold text-white text-sm uppercase tracking-wider">Sales By Staff</h4>
                                <p className="text-xs text-slate-400">Fuel volume and revenue handled by each staff member on duty</p>
                              </div>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold">
                                  <th className="p-3">Staff Name</th>
                                  <th className="p-3">Assigned Pump(s)</th>
                                  <th className="p-3 text-right">MS Litres</th>
                                  <th className="p-3 text-right">HSD Litres</th>
                                  <th className="p-3 text-right">Total Litres</th>
                                  <th className="p-3 text-right">Total Revenue</th>
                                  <th className="p-3 text-center">Drill Down</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/40 font-mono">
                                {Object.values(salesByStaffMap).length === 0 ? (
                                  <tr>
                                    <td colSpan={7} className="p-4 text-center text-slate-500 font-sans">No staff sales recorded for current filters.</td>
                                  </tr>
                                ) : (
                                  Object.values(salesByStaffMap).map((staff) => (
                                    <tr
                                      key={staff.staffId}
                                      className={`hover:bg-slate-950/40 transition-all ${selectedDrillDownKey === staff.staffId && selectedDrillDownType === 'STAFF' ? 'bg-indigo-950/20' : ''}`}
                                    >
                                      <td className="p-3 font-bold font-sans text-white flex items-center gap-2">
                                        <div className="h-7 w-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-indigo-400 font-extrabold">
                                          {staff.staffName.slice(0, 2).toUpperCase()}
                                        </div>
                                        {staff.staffName}
                                      </td>
                                      <td className="p-3 font-sans text-slate-300">
                                        {Array.from(staff.pumps).join(', ') || 'Pump 1 & 2'}
                                      </td>
                                      <td className="p-3 text-right text-indigo-300 font-bold">{staff.msLitres.toFixed(2)} L</td>
                                      <td className="p-3 text-right text-emerald-300 font-bold">{staff.hsdLitres.toFixed(2)} L</td>
                                      <td className="p-3 text-right text-white font-black">{staff.totalLitres.toFixed(2)} L</td>
                                      <td className="p-3 text-right text-indigo-400 font-black">₹{staff.totalRevenue.toFixed(2)}</td>
                                      <td className="p-3 text-center">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedDrillDownKey(staff.staffId);
                                            setSelectedDrillDownType('STAFF');
                                            setShowDetailedMeterAudit(true);
                                          }}
                                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white font-sans text-[11px] font-bold transition-all cursor-pointer"
                                        >
                                          View Readings
                                        </button>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* 6. EXPANDABLE DRILL-DOWN DETAILED METER AUDIT TABLE */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden space-y-4 p-6">
                          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                            <div>
                              <h4 className="font-extrabold text-white text-sm uppercase tracking-wider flex items-center gap-2">
                                <FileText className="h-4 w-4 text-indigo-400" />
                                Detailed Nozzle Meter Audit Log (Drill-Down Verification)
                              </h4>
                              <p className="text-xs text-slate-400 mt-0.5">Granular nozzle meter readings, opening/closing values, rates, and computed sales.</p>
                            </div>

                            <div className="flex items-center gap-3">
                              {selectedDrillDownKey && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedDrillDownKey(null);
                                    setSelectedDrillDownType(null);
                                  }}
                                  className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-300 hover:text-white text-xs font-bold transition-all cursor-pointer"
                                >
                                  Clear Filter: {selectedDrillDownKey}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setShowDetailedMeterAudit(!showDetailedMeterAudit)}
                                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-white font-bold text-xs transition-all flex items-center gap-2 cursor-pointer"
                              >
                                {showDetailedMeterAudit ? 'Hide Meter Details' : 'View Meter Details'}
                                <ChevronDown className={`h-4 w-4 transition-transform ${showDetailedMeterAudit ? 'rotate-180' : ''}`} />
                              </button>
                            </div>
                          </div>

                          {showDetailedMeterAudit && (
                            <div className="overflow-x-auto border border-slate-800 rounded-xl">
                              <table id="sales-report-table" className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold text-[10px]">
                                    <th className="p-3">Duty Session</th>
                                    <th className="p-3">Gun Name</th>
                                    <th className="p-3">Fuel Type</th>
                                    <th className="p-3">Staff Assigned</th>
                                    <th className="p-3 text-right">Opening Reading</th>
                                    <th className="p-3 text-right">Closing Reading</th>
                                    <th className="p-3 text-right">Litres Sold</th>
                                    <th className="p-3 text-right">Rate</th>
                                    <th className="p-3 text-right">Sales Amount</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/40 font-mono">
                                  {activeDrillDownRows.length === 0 ? (
                                    <tr>
                                      <td colSpan={9} className="p-4 text-center text-slate-500 font-sans">No detailed meter records match the drill-down selection.</td>
                                    </tr>
                                  ) : (
                                    activeDrillDownRows.map((r, idx) => {
                                      const mr = r.reading;
                                      const litres = mr.litresSold || Math.max(0, mr.currentReading - mr.previousReading);
                                      const amount = mr.salesAmount || (litres * mr.priceUsed);

                                      return (
                                        <tr key={`${r.duty.id}-${idx}`} className="hover:bg-slate-950/40 transition-all">
                                          <td className="p-3 font-semibold text-indigo-400 font-sans">Duty #{r.duty.dutyNumber}</td>
                                          <td className="p-3 font-bold text-slate-200">{mr.gun?.name || 'Nozzle'}</td>
                                          <td className="p-3"><span className={`px-2 py-0.5 rounded font-black text-[9px] ${r.fuelType === 'MS' ? 'bg-indigo-950 text-indigo-400 border border-indigo-800' : 'bg-emerald-950 text-emerald-400 border border-emerald-800'}`}>{r.fuelType}</span></td>
                                          <td className="p-3 font-sans text-slate-300">{r.assignedStaff?.name || 'Unassigned'}</td>
                                          <td className="p-3 text-right text-slate-400">{(mr.previousReading || 0).toFixed(2)}</td>
                                          <td className="p-3 text-right text-slate-200">{(mr.currentReading || 0).toFixed(2)}</td>
                                          <td className="p-3 text-right font-bold text-white">{litres.toFixed(2)} L</td>
                                          <td className="p-3 text-right text-slate-300">₹{(mr.priceUsed || 0).toFixed(2)}</td>
                                          <td className="p-3 text-right font-black text-indigo-400">₹{amount.toFixed(2)}</td>
                                        </tr>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* STAFF REPORT SUB-TAB */}
              {reportsTab === 'staff' && (() => {
                // 1. Helper function for 24-hour duty period string formatting
                const formatDutyPeriodStr = (startTime: string | Date, endTime?: string | Date | null) => {
                  if (!startTime) return '-';
                  const startObj = new Date(startTime);
                  const startStr = startObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' +
                    startObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

                  if (!endTime) return `${startStr} → OPEN (Active Duty)`;

                  const endObj = new Date(endTime);
                  const endStr = endObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' +
                    endObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

                  return `${startStr} → ${endStr}`;
                };

                // 2. Gather all duties (historical + active)
                const combinedDuties = [
                  ...historicalDuties,
                  ...(activeDuty && !historicalDuties.some((d: any) => d.id === activeDuty.id) ? [activeDuty] : [])
                ];

                // 3. Filter duties according to top filter bar
                const filteredDuties = combinedDuties.filter((d: any) => {
                  const dDate = new Date(d.startTime);
                  const dStr = dDate.toLocaleDateString('en-CA');
                  const dMonth = dStr.slice(0, 7);
                  const dYear = dStr.slice(0, 4);

                  if (staffReportDate && dStr !== staffReportDate) return false;
                  if (staffReportStartDate && dStr < staffReportStartDate) return false;
                  if (staffReportEndDate && dStr > staffReportEndDate) return false;
                  if (staffReportMonth && dMonth !== staffReportMonth) return false;
                  if (staffReportYear && dYear !== staffReportYear) return false;
                  return true;
                }).sort((a: any, b: any) => (b.dutyNumber || 0) - (a.dutyNumber || 0));

                const staffList = staticData.staff || [];

                // 4. Generate 24-Hour Duty Attendance Register Records (1 Duty Session = 1 Record per Staff Member)
                const allAttendanceRows: Array<{
                  dutyId: string;
                  dutyNumber: number;
                  startTime: string | Date;
                  endTime?: string | Date | null;
                  dutyPeriodStr: string;
                  staffId: string;
                  staffName: string;
                  pump: string;
                  msHandled: boolean;
                  hsdHandled: boolean;
                  status: 'PRESENT' | 'ABSENT' | 'NOT_SCHEDULED';
                }> = [];

                filteredDuties.forEach((d: any) => {
                  const dutyPeriodStr = formatDutyPeriodStr(d.startTime, d.endTime);

                  staffList.forEach((s: any) => {
                    const sAssignments = (d.assignments || []).filter((as: any) =>
                      as.staffId === s.id || as.staff?.id === s.id || as.staff?.name === s.name
                    );
                    const hasAssignment = sAssignments.length > 0;

                    const pumpNames = hasAssignment
                      ? Array.from(new Set(sAssignments.map((as: any) => as.pump?.name || (as.pumpId === 'p1' ? 'Pump 1' : 'Pump 2')))).join(', ')
                      : '-';

                    let msHandled = false;
                    let hsdHandled = false;

                    if (hasAssignment) {
                      sAssignments.forEach((as: any) => {
                        const fType = as.fuelType || (as.pumpId === 'p1' ? 'MS' : 'HSD');
                        if (fType === 'MS') msHandled = true;
                        if (fType === 'HSD') hsdHandled = true;
                      });

                      (d.meterReadings || []).forEach((mr: any) => {
                        const pId = mr.gun?.pumpId || mr.gun?.pump?.id || 'p1';
                        const fType = mr.gun?.fuelType || 'MS';
                        const litres = mr.litresSold || Math.max(0, mr.currentReading - mr.previousReading);

                        const isAssignedPump = sAssignments.some((as: any) => (as.pumpId === pId || as.pump?.id === pId));
                        if (isAssignedPump && litres > 0) {
                          if (fType === 'MS') msHandled = true;
                          if (fType === 'HSD') hsdHandled = true;
                        }
                      });

                      if (!msHandled && !hsdHandled) msHandled = true;
                    }

                    // Status Determination: Override -> default PRESENT if assigned -> default NOT_SCHEDULED if unassigned
                    const overrideKey = `${d.id}_${s.id}`;
                    const status: 'PRESENT' | 'ABSENT' | 'NOT_SCHEDULED' =
                      attendanceOverrides[overrideKey] || (hasAssignment ? 'PRESENT' : 'NOT_SCHEDULED');

                    // Filter constraints
                    if (staffReportStaff !== 'ALL' && s.id !== staffReportStaff && s.name !== staffReportStaff) return;
                    if (staffReportPump !== 'ALL' && (!hasAssignment || !pumpNames.includes(staffReportPump))) return;
                    if (staffReportStatusFilter !== 'ALL' && status !== staffReportStatusFilter) return;

                    allAttendanceRows.push({
                      dutyId: d.id,
                      dutyNumber: d.dutyNumber,
                      startTime: d.startTime,
                      endTime: d.endTime,
                      dutyPeriodStr,
                      staffId: s.id,
                      staffName: s.name,
                      pump: pumpNames,
                      msHandled,
                      hsdHandled,
                      status
                    });
                  });
                });

                // 5. Summary Metrics Calculations
                const totalStaffCount = staffList.length;
                const presentDutiesCount = allAttendanceRows.filter(r => r.status === 'PRESENT').length;
                const absentDutiesCount = allAttendanceRows.filter(r => r.status === 'ABSENT').length;
                const notScheduledCount = allAttendanceRows.filter(r => r.status === 'NOT_SCHEDULED').length;

                // 6. Monthly / Date-Range Staff Summary Aggregations
                const activeMonthLabel = staffReportMonth
                  ? new Date(`${staffReportMonth}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  : 'All Time / Selected Period';

                const staffMonthlySummaries = staffList.map((s: any) => {
                  const sRows = allAttendanceRows.filter(r => r.staffId === s.id);
                  const presentCount = sRows.filter(r => r.status === 'PRESENT').length;
                  const absentCount = sRows.filter(r => r.status === 'ABSENT').length;
                  const notSched = sRows.filter(r => r.status === 'NOT_SCHEDULED').length;
                  const msDuties = sRows.filter(r => r.status === 'PRESENT' && r.msHandled).length;
                  const hsdDuties = sRows.filter(r => r.status === 'PRESENT' && r.hsdHandled).length;
                  const totalDutyDays = filteredDuties.length;
                  const attendanceRate = totalDutyDays > 0 ? ((presentCount / totalDutyDays) * 100).toFixed(1) : '0.0';

                  return {
                    staffId: s.id,
                    staffName: s.name,
                    role: s.role || 'PUMP_ATTENDANT',
                    monthLabel: activeMonthLabel,
                    totalDutyDays,
                    presentCount,
                    absentCount,
                    notSched,
                    msDuties,
                    hsdDuties,
                    attendanceRate
                  };
                });

                // 7. Search & Filter Matching
                const filteredRows = allAttendanceRows.filter((r) => {
                  if (staffSearchQuery.trim()) {
                    const q = staffSearchQuery.toLowerCase().trim();
                    const matchDuty = `#${r.dutyNumber}`.includes(q) || r.dutyNumber.toString().includes(q);
                    const matchStaff = r.staffName.toLowerCase().includes(q);
                    const matchPump = r.pump.toLowerCase().includes(q);
                    const matchStatus = r.status.toLowerCase().includes(q);
                    if (!matchDuty && !matchStaff && !matchPump && !matchStatus) return false;
                  }
                  return true;
                });

                // 8. Duty Grouping Logic for Grouped View
                const groupedDutiesMap = new Map<string, {
                  dutyId: string;
                  dutyNumber: number;
                  startTime: string | Date;
                  endTime?: string | Date | null;
                  dutyPeriodStr: string;
                  rows: typeof allAttendanceRows;
                  presentCount: number;
                  absentCount: number;
                  notSchedCount: number;
                }>();

                filteredRows.forEach((r) => {
                  let g = groupedDutiesMap.get(r.dutyId);
                  if (!g) {
                    g = {
                      dutyId: r.dutyId,
                      dutyNumber: r.dutyNumber,
                      startTime: r.startTime,
                      endTime: r.endTime,
                      dutyPeriodStr: r.dutyPeriodStr,
                      rows: [],
                      presentCount: 0,
                      absentCount: 0,
                      notSchedCount: 0,
                    };
                    groupedDutiesMap.set(r.dutyId, g);
                  }
                  g.rows.push(r);
                  if (r.status === 'PRESENT') g.presentCount += 1;
                  if (r.status === 'ABSENT') g.absentCount += 1;
                  if (r.status === 'NOT_SCHEDULED') g.notSchedCount += 1;
                });

                const groupedDutiesList = Array.from(groupedDutiesMap.values()).sort((a, b) => b.dutyNumber - a.dutyNumber);

                // 9. Pagination Calculation
                const totalRecordsCount = filteredRows.length;
                const totalPagesCount = Math.max(1, Math.ceil(totalRecordsCount / staffReportPageSize));
                const currentReportPage = Math.min(staffReportPage, totalPagesCount);
                const startIndex = (currentReportPage - 1) * staffReportPageSize;
                const endIndex = Math.min(startIndex + staffReportPageSize, totalRecordsCount);
                const paginatedFlatRows = filteredRows.slice(startIndex, endIndex);

                // PDF Export Function
                const handleExportPDF = () => {
                  const printWindow = window.open('', '_blank');
                  if (!printWindow) return;

                  const htmlContent = `
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <title>Staff Attendance Register - Printable Report</title>
                        <style>
                          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 20px; color: #0f172a; }
                          h2 { margin-bottom: 2px; color: #1e293b; font-size: 18px; }
                          p { font-size: 11px; color: #64748b; margin-top: 0; margin-bottom: 16px; }
                          .kpis { display: flex; gap: 12px; margin-bottom: 16px; }
                          .kpi { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; font-size: 11px; flex: 1; }
                          .kpi strong { font-size: 15px; display: block; color: #0f172a; margin-top: 2px; }
                          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
                          th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
                          th { background-color: #f1f5f9; font-weight: bold; text-transform: uppercase; font-size: 10px; color: #475569; }
                          .badge-present { background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 9px; }
                          .badge-absent { background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 9px; }
                          .badge-not { background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 9px; }
                          @media print { body { margin: 0; } }
                        </style>
                      </head>
                      <body>
                        <h2>IOCL Fuel Station - Staff Attendance Register Report</h2>
                        <p>Generated: ${new Date().toLocaleString('en-IN')} | Total Filtered Records: ${filteredRows.length} | Duty Sessions: ${groupedDutiesList.length}</p>
                        
                        <div class="kpis">
                          <div class="kpi">Total Staff: <strong>${totalStaffCount}</strong></div>
                          <div class="kpi">Present Duties: <strong>${presentDutiesCount}</strong></div>
                          <div class="kpi">Absent Duties: <strong>${absentDutiesCount}</strong></div>
                          <div class="kpi">Not Scheduled: <strong>${notScheduledCount}</strong></div>
                        </div>

                        <table>
                          <thead>
                            <tr>
                              <th>Duty #</th>
                              <th>Staff Name</th>
                              <th>Pump</th>
                              <th>MS</th>
                              <th>HSD</th>
                              <th>Duty Period</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${filteredRows.map(r => `
                              <tr>
                                <td><strong>#${r.dutyNumber}</strong></td>
                                <td>${r.staffName}</td>
                                <td>${r.pump}</td>
                                <td>${r.msHandled ? '✓' : '-'}</td>
                                <td>${r.hsdHandled ? '✓' : '-'}</td>
                                <td>${r.dutyPeriodStr}</td>
                                <td>
                                  <span class="${r.status === 'PRESENT' ? 'badge-present' : r.status === 'ABSENT' ? 'badge-absent' : 'badge-not'}">
                                    ${r.status}
                                  </span>
                                </td>
                              </tr>
                            `).join('')}
                          </tbody>
                        </table>
                      </body>
                    </html>
                  `;

                  printWindow.document.write(htmlContent);
                  printWindow.document.close();
                  printWindow.focus();
                  setTimeout(() => {
                    printWindow.print();
                  }, 250);
                };

                // Monthly Roster PDF Export Function
                const handleExportMonthlyRosterPDF = () => {
                  const printWindow = window.open('', '_blank');
                  if (!printWindow) return;

                  const htmlContent = `
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <title>Staff Attendance Roster - ${activeMonthLabel}</title>
                        <style>
                          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 24px; color: #0f172a; }
                          .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
                          h2 { margin: 0; font-size: 20px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
                          p { font-size: 12px; color: #64748b; margin: 4px 0 0 0; font-family: monospace; }
                          table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
                          th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; }
                          th { background-color: #f1f5f9; font-weight: bold; text-transform: uppercase; font-size: 11px; color: #475569; letter-spacing: 0.5px; }
                          .text-right { text-align: right; }
                          .text-center { text-align: center; }
                          .footer { margin-top: 48px; display: flex; justify-content: space-between; font-size: 11px; color: #475569; }
                          @media print { body { margin: 0; } }
                        </style>
                      </head>
                      <body>
                        <div class="header">
                          <div>
                            <h2>IOCL Fuel Station - Staff Attendance Register</h2>
                            <p>Period: ${activeMonthLabel}</p>
                          </div>
                          <div style="text-align: right; font-size: 11px; color: #64748b;">
                            Printed On: ${new Date().toLocaleDateString('en-IN')}
                          </div>
                        </div>

                        <table>
                          <thead>
                            <tr>
                              <th class="text-center">S.No</th>
                              <th>Staff Member</th>
                              <th class="text-right">Working Days</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${(monthlyAttData?.summary || []).map((s: any, idx: number) => `
                              <tr>
                                <td class="text-center"><strong>${idx + 1}</strong></td>
                                <td><strong>${s.staffName}</strong></td>
                                <td class="text-right font-mono"><strong>${Number.isInteger(s.workedDays) ? s.workedDays : s.workedDays.toFixed(2).replace(/\.?0+$/, '')}</strong></td>
                              </tr>
                            `).join('')}
                          </tbody>
                        </table>

                        <div class="footer">
                          <div>Verified by Account Manager</div>
                          <div>Station Owner Signature: _______________________</div>
                        </div>
                      </body>
                    </html>
                  `;

                  printWindow.document.write(htmlContent);
                  printWindow.document.close();
                  printWindow.focus();
                  setTimeout(() => {
                    printWindow.print();
                  }, 250);
                };

                return (
                  <div className="space-y-4">
                    {/* ULTRA-SIMPLE STAFF ATTENDANCE & WORKING DAYS REGISTER */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                      <div className="flex flex-wrap justify-between items-center border-b border-slate-800 pb-3 gap-3">
                        <div>
                          <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-indigo-400" />
                            Staff Attendance Register
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Monthly Working Days summary (Assigned = 1.0 day, Absent = 0.0 days, Partial = Editable).
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (!monthlyAttData || !monthlyAttData.summary) return;
                              const sheetData = monthlyAttData.summary.map((s: any) => ({
                                'Staff Member': s.staffName,
                                'Working Days': s.workedDays,
                              }));
                              const ws = XLSX.utils.json_to_sheet(sheetData);
                              const wb = XLSX.utils.book_new();
                              XLSX.utils.book_append_sheet(wb, ws, 'Staff_Attendance');
                              XLSX.writeFile(wb, `Staff_Attendance_${attFilterMonth}_${attFilterYear}.xlsx`);
                            }}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <FileSpreadsheet className="h-4 w-4" />
                            Export Excel
                          </button>
                          <button
                            type="button"
                            onClick={handleExportMonthlyRosterPDF}
                            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <FileText className="h-4 w-4" />
                            Export PDF
                          </button>
                        </div>
                      </div>

                      {/* Filters */}
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-850 text-xs">
                        <div>
                          <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Period Preset</label>
                          <select
                            value={attFilterPreset}
                            onChange={(e) => handleAttPresetChange(e.target.value as any)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-bold text-xs focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="THIS_MONTH">This Month</option>
                            <option value="LAST_MONTH">Last Month</option>
                            <option value="WEEKLY">Last 7 Days (Weekly)</option>
                            <option value="CUSTOM">Custom Date Range</option>
                          </select>
                        </div>
                        {attFilterPreset === 'CUSTOM' || attFilterPreset === 'WEEKLY' ? (
                          <>
                            <div>
                              <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Start Date</label>
                              <input
                                type="date"
                                value={attCustomStartDate}
                                onChange={(e) => setAttCustomStartDate(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-bold text-xs focus:border-indigo-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">End Date</label>
                              <input
                                type="date"
                                value={attCustomEndDate}
                                onChange={(e) => setAttCustomEndDate(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-bold text-xs focus:border-indigo-500 focus:outline-none"
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Month</label>
                              <select
                                value={attFilterMonth}
                                onChange={(e) => setAttFilterMonth(Number(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-bold text-xs focus:border-indigo-500 focus:outline-none"
                              >
                                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
                                  <option key={i} value={i + 1}>{m}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Year</label>
                              <select
                                value={attFilterYear}
                                onChange={(e) => setAttFilterYear(Number(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-bold text-xs focus:border-indigo-500 focus:outline-none"
                              >
                                {[2024, 2025, 2026, 2027].map((y) => (
                                  <option key={y} value={y}>{y}</option>
                                ))}
                              </select>
                            </div>
                          </>
                        )}
                        <div>
                          <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Staff Roster Filter</label>
                          <select
                            value={attRosterStatusFilter}
                            onChange={(e) => setAttRosterStatusFilter(e.target.value as any)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-bold text-xs focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="ACTIVE">Active Staff Only (Default)</option>
                            <option value="INACTIVE">Inactive Staff</option>
                            <option value="ALL">All Staff (Include Historical)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Staff Member</label>
                          <select
                            value={attFilterStaffId}
                            onChange={(e) => setAttFilterStaffId(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-bold text-xs focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="">All Staff Members</option>
                            {((attRosterStatusFilter === 'ALL' || attRosterStatusFilter === 'INACTIVE' ? (staticData.allStaff || staticData.staff) : staticData.staff) || []).map((s: any) => (
                              <option key={s.id} value={s.id}>{s.name} {!s.active ? '(Inactive)' : ''}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Status Filter</label>
                          <select
                            value={attFilterStatus}
                            onChange={(e) => setAttFilterStatus(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-bold text-xs focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="">All Statuses</option>
                            <option value="PRESENT">PRESENT</option>
                            <option value="PARTIAL">PARTIAL</option>
                            <option value="EMERGENCY">EMERGENCY</option>
                            <option value="ABSENT">ABSENT</option>
                          </select>
                        </div>
                      </div>

                      {/* Unified Simple Staff Attendance Table */}
                      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                        <table className="w-full text-left text-xs text-slate-300">
                          <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800 font-mono">
                            <tr>
                              <th className="p-3">Staff Member</th>
                              <th className="p-3 text-right">Working Days</th>
                              <th className="p-3 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-850 font-mono">
                            {isLoadingMonthlyAtt ? (
                              <tr>
                                <td colSpan={3} className="p-4 text-center text-slate-400 text-xs italic font-sans">Loading attendance records...</td>
                              </tr>
                            ) : (!monthlyAttData || !monthlyAttData.summary || monthlyAttData.summary.length === 0) ? (
                              <tr>
                                <td colSpan={3} className="p-4 text-center text-slate-400 text-xs italic font-sans">No attendance records for selected period.</td>
                              </tr>
                            ) : (
                              monthlyAttData.summary
                                .filter((s: any) => !attFilterStaffId || s.staffId === attFilterStaffId)
                                .map((s: any) => {
                                  const displayDays = Number.isInteger(s.workedDays)
                                    ? s.workedDays.toString()
                                    : s.workedDays.toFixed(2).replace(/\.?0+$/, '');
                                  return (
                                    <tr key={s.staffId} className="hover:bg-slate-900/50 transition-colors">
                                      <td className="p-3 font-bold text-white flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 font-extrabold flex items-center justify-center text-xs shrink-0 font-mono">
                                          {s.staffName.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                          <div className="text-white font-bold text-sm font-sans">{s.staffName}</div>
                                          <div className="text-[10px] text-slate-400 font-normal font-mono">PUMP ATTENDANT</div>
                                        </div>
                                      </td>
                                      <td className="p-3 text-right font-mono font-black text-indigo-400 text-base">
                                        {displayDays}
                                      </td>
                                      <td className="p-3 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setDetailModalStaff(s);
                                              setShowAttDetailModal(true);
                                            }}
                                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow flex items-center gap-1.5 cursor-pointer font-sans"
                                            title="View full attendance history, shift details, and worked days breakdown"
                                          >
                                            <Eye className="h-3.5 w-3.5" />
                                            View History
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 3. STICKY COMPACT FILTER & SEARCH BAR */}
                    <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border border-slate-800 p-3.5 rounded-xl shadow-xl space-y-3">
                      {/* TOP CONTROL ROW: SEARCH + VIEW MODE + EXPORT BUTTONS */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                        {/* Instant Search Bar */}
                        <div className="relative flex-1 min-w-[220px]">
                          <input
                            type="text"
                            placeholder="Search staff, duty number (e.g. #120, Anwar)..."
                            value={staffSearchQuery}
                            onChange={(e) => {
                              setStaffSearchQuery(e.target.value);
                              setStaffReportPage(1);
                            }}
                            className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none font-sans"
                          />
                          {staffSearchQuery && (
                            <button
                              type="button"
                              onClick={() => {
                                setStaffSearchQuery('');
                                setStaffReportPage(1);
                              }}
                              className="absolute right-2.5 top-2 text-slate-400 hover:text-white text-xs"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Flat vs Grouped View Mode Toggle */}
                        <div className="flex items-center bg-slate-900 border border-slate-800 p-0.5 rounded-lg">
                          <button
                            type="button"
                            onClick={() => setStaffReportViewMode('FLAT')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${staffReportViewMode === 'FLAT' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                          >
                            Flat List
                          </button>
                          <button
                            type="button"
                            onClick={() => setStaffReportViewMode('GROUPED')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${staffReportViewMode === 'GROUPED' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                          >
                            Group by Duty
                          </button>
                        </div>

                        {/* Export Buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleExportExcel('staff-report-table', 'Staff_24Hour_Attendance_Register')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950 border border-indigo-800 text-indigo-300 hover:text-white text-xs font-bold transition-all"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5 text-indigo-400" />
                            <span>Export Excel</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleExportPDF}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-300 hover:text-white text-xs font-bold transition-all"
                          >
                            <FileText className="h-3.5 w-3.5 text-emerald-400" />
                            <span>Export PDF</span>
                          </button>
                        </div>
                      </div>

                      {/* COMPACT FILTER DROPDOWNS ROW */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2 text-xs">
                        {/* Single Date */}
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Date</label>
                          <input
                            type="date"
                            value={staffReportDate}
                            onChange={(e) => {
                              setStaffReportDate(e.target.value);
                              setStaffReportStartDate('');
                              setStaffReportEndDate('');
                              setStaffReportPage(1);
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-white font-mono text-[11px] focus:border-indigo-500 focus:outline-none"
                          />
                        </div>

                        {/* Start Date */}
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Start Date</label>
                          <input
                            type="date"
                            value={staffReportStartDate}
                            onChange={(e) => {
                              setStaffReportStartDate(e.target.value);
                              setStaffReportDate('');
                              setStaffReportPage(1);
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-white font-mono text-[11px] focus:border-indigo-500 focus:outline-none"
                          />
                        </div>

                        {/* End Date */}
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">End Date</label>
                          <input
                            type="date"
                            value={staffReportEndDate}
                            onChange={(e) => {
                              setStaffReportEndDate(e.target.value);
                              setStaffReportDate('');
                              setStaffReportPage(1);
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-white font-mono text-[11px] focus:border-indigo-500 focus:outline-none"
                          />
                        </div>

                        {/* Month Filter */}
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Month</label>
                          <input
                            type="month"
                            value={staffReportMonth}
                            onChange={(e) => {
                              setStaffReportMonth(e.target.value);
                              setStaffReportPage(1);
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-white font-mono text-[11px] focus:border-indigo-500 focus:outline-none"
                          />
                        </div>

                        {/* Staff */}
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Staff</label>
                          <select
                            value={staffReportStaff}
                            onChange={(e) => {
                              setStaffReportStaff(e.target.value);
                              setStaffReportPage(1);
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-white font-semibold text-[11px] focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="ALL">All Staff</option>
                            {staffList.map((s: any) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Pump */}
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Pump</label>
                          <select
                            value={staffReportPump}
                            onChange={(e) => {
                              setStaffReportPump(e.target.value);
                              setStaffReportPage(1);
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-white font-semibold text-[11px] focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="ALL">All Pumps</option>
                            {(staticData.pumps || []).map((p: any) => (
                              <option key={p.id} value={p.name}>{p.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Status */}
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Status</label>
                          <select
                            value={staffReportStatusFilter}
                            onChange={(e) => {
                              setStaffReportStatusFilter(e.target.value as any);
                              setStaffReportPage(1);
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-white font-semibold text-[11px] focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="ALL">All Statuses</option>
                            <option value="PRESENT">Present</option>
                            <option value="ABSENT">Absent</option>
                            <option value="NOT_SCHEDULED">Not Scheduled</option>
                          </select>
                        </div>
                      </div>

                      {/* COUNTERS & CLEAR FILTERS STATUS LINE */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
                        <div className="flex items-center gap-3 text-slate-400 font-mono">
                          <span>Showing <strong className="text-white">{filteredRows.length}</strong> records</span>
                          <span>•</span>
                          <span><strong className="text-indigo-400">{groupedDutiesList.length}</strong> duty sessions</span>
                        </div>

                        <button
                          type="button"
                          onClick={handleResetStaffFilters}
                          className="text-[11px] font-bold text-indigo-400 hover:text-white transition-all underline underline-offset-2"
                        >
                          Clear Filters
                        </button>
                      </div>
                    </div>

                    {/* 4. MAIN TABLE CONTENT (FLAT VIEW vs GROUPED BY DUTY VIEW) */}
                    {staffReportViewMode === 'FLAT' ? (
                      /* FLAT LIST VIEW */
                      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-md overflow-hidden">
                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto">
                          <table id="staff-report-table" className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold text-[10px]">
                                <th className="p-2.5 font-mono">Duty</th>
                                <th className="p-2.5">Staff Member</th>
                                <th className="p-2.5">Pump</th>
                                <th className="p-2.5">Fuel Handled</th>
                                <th className="p-2.5">Duty Time</th>
                                <th className="p-2.5 text-center">Status</th>
                                <th className="p-2.5 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
                              {paginatedFlatRows.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="p-6 text-center text-slate-500 font-sans">No staff attendance records match your search or filter criteria.</td>
                                </tr>
                              ) : (
                                paginatedFlatRows.map((row, idx) => (
                                  <tr key={`${row.dutyId}-${row.staffId}-${idx}`} className="hover:bg-slate-950/50 transition-all">
                                    <td className="p-2.5 font-bold text-indigo-400">#{row.dutyNumber}</td>
                                    <td className="p-2.5 font-sans font-bold text-white">{row.staffName}</td>
                                    <td className="p-2.5 font-sans text-slate-300">{row.pump}</td>
                                    <td className="p-2.5 font-sans text-slate-300">
                                      {row.msHandled && row.hsdHandled ? 'MS + HSD' : row.msHandled ? 'MS' : row.hsdHandled ? 'HSD' : '-'}
                                    </td>
                                    <td className="p-2.5 text-slate-300 text-[11px]">{row.dutyPeriodStr}</td>
                                    <td className="p-2.5 text-center font-sans">
                                      {row.status === 'PRESENT' && (
                                        <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold text-[10px] uppercase">
                                          PRESENT ✓
                                        </span>
                                      )}
                                      {row.status === 'ABSENT' && (
                                        <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 font-bold text-[10px] uppercase">
                                          ABSENT ✗
                                        </span>
                                      )}
                                      {row.status === 'NOT_SCHEDULED' && (
                                        <span className="px-2 py-0.5 rounded bg-slate-950 text-slate-500 border border-slate-800 font-bold text-[10px] uppercase">
                                          NOT SCHEDULED
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-2.5 text-right font-sans">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedAttendanceDetailRow(row)}
                                        className="px-2.5 py-1 rounded bg-indigo-950 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 hover:text-white text-[11px] font-bold transition-all"
                                      >
                                        View Details
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile Responsive Cards */}
                        <div className="md:hidden divide-y divide-slate-800/80 p-2 space-y-2">
                          {paginatedFlatRows.length === 0 ? (
                            <div className="p-6 text-center text-slate-500 text-xs">No attendance records match filter criteria.</div>
                          ) : (
                            paginatedFlatRows.map((row, idx) => (
                              <div key={`${row.dutyId}-${row.staffId}-mobile-${idx}`} className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-2 text-xs">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-indigo-400">Duty #{row.dutyNumber}</span>
                                    <span className="font-bold text-white">{row.staffName}</span>
                                  </div>
                                  <div>
                                    {row.status === 'PRESENT' && <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold text-[10px]">PRESENT</span>}
                                    {row.status === 'ABSENT' && <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 font-bold text-[10px]">ABSENT</span>}
                                    {row.status === 'NOT_SCHEDULED' && <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-500 border border-slate-800 font-bold text-[10px]">NOT SCHED</span>}
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-[11px] text-slate-400">
                                  <span>Pump: <strong className="text-slate-200">{row.pump}</strong></span>
                                  <span className="font-mono">{row.dutyPeriodStr}</span>
                                </div>

                                <div className="pt-1 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedAttendanceDetailRow(row)}
                                    className="px-3 py-1 bg-indigo-950 text-indigo-300 border border-indigo-800 rounded text-xs font-bold"
                                  >
                                    View Details →
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : (
                      /* GROUPED BY DUTY VIEW */
                      <div className="space-y-3">
                        {groupedDutiesList.length === 0 ? (
                          <div className="bg-slate-900 border border-slate-800 p-8 rounded-xl text-center text-slate-500 text-xs">
                            No duty sessions match the selected filter or search.
                          </div>
                        ) : (
                          groupedDutiesList.map((gDuty) => {
                            const isExpanded = expandedDuties[gDuty.dutyId] !== false; // expanded by default
                            return (
                              <div key={gDuty.dutyId} className="bg-slate-900 border border-slate-800 rounded-xl shadow-md overflow-hidden">
                                {/* Duty Group Header Bar */}
                                <div
                                  onClick={() => setExpandedDuties({ ...expandedDuties, [gDuty.dutyId]: !isExpanded })}
                                  className="px-4 py-3 bg-slate-950/90 hover:bg-slate-950 cursor-pointer flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 transition-colors"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono font-black text-indigo-400 text-sm">DUTY #{gDuty.dutyNumber}</span>
                                    <span className="text-xs text-slate-300 font-mono">{gDuty.dutyPeriodStr}</span>
                                  </div>

                                  <div className="flex items-center gap-3 text-xs">
                                    <span className="text-slate-400 font-bold">{gDuty.rows.length} Staff Assigned</span>
                                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold">
                                      {gDuty.presentCount} Present
                                    </span>
                                    {gDuty.absentCount > 0 && (
                                      <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 text-[10px] font-bold">
                                        {gDuty.absentCount} Absent
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      className="px-2 py-0.5 rounded border border-slate-700 bg-slate-850 text-slate-300 text-[10px] font-bold"
                                    >
                                      {isExpanded ? 'Collapse ▲' : 'View Duty ▼'}
                                    </button>
                                  </div>
                                </div>

                                {/* Expanded Staff Rows */}
                                {isExpanded && (
                                  <div className="p-2 overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs">
                                      <thead>
                                        <tr className="bg-slate-950 text-slate-400 uppercase font-bold text-[10px] border-b border-slate-800">
                                          <th className="p-2">Staff Member</th>
                                          <th className="p-2">Pump</th>
                                          <th className="p-2">Fuel</th>
                                          <th className="p-2 text-center">Status</th>
                                          <th className="p-2 text-right">Action</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
                                        {gDuty.rows.map((row, idx) => (
                                          <tr key={`${row.dutyId}-${row.staffId}-grp-${idx}`} className="hover:bg-slate-950/40">
                                            <td className="p-2 font-sans font-bold text-white">{row.staffName}</td>
                                            <td className="p-2 font-sans text-slate-300">{row.pump}</td>
                                            <td className="p-2 font-sans text-slate-300">{row.msHandled && row.hsdHandled ? 'MS + HSD' : row.msHandled ? 'MS' : row.hsdHandled ? 'HSD' : '-'}</td>
                                            <td className="p-2 text-center font-sans">
                                              {row.status === 'PRESENT' && <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold text-[10px]">PRESENT</span>}
                                              {row.status === 'ABSENT' && <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 font-bold text-[10px]">ABSENT</span>}
                                              {row.status === 'NOT_SCHEDULED' && <span className="px-2 py-0.5 rounded bg-slate-950 text-slate-500 border border-slate-800 font-bold text-[10px]">NOT SCHED</span>}
                                            </td>
                                            <td className="p-2 text-right font-sans">
                                              <button
                                                type="button"
                                                onClick={() => setSelectedAttendanceDetailRow(row)}
                                                className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px] font-bold"
                                              >
                                                View
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* 5. PAGINATION BAR */}
                    {totalRecordsCount > 0 && (
                      <div className="bg-slate-900 border border-slate-800 px-4 py-3 rounded-xl shadow-md flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3 text-slate-400 font-mono">
                          <span>Showing <strong>{startIndex + 1}–{endIndex}</strong> of <strong>{totalRecordsCount}</strong> records</span>
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] font-sans">Page Size:</span>
                            <select
                              value={staffReportPageSize}
                              onChange={(e) => {
                                setStaffReportPageSize(Number(e.target.value));
                                setStaffReportPage(1);
                              }}
                              className="bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-white font-bold font-mono text-[11px] focus:outline-none"
                            >
                              <option value={20}>20</option>
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                            </select>
                          </div>
                        </div>

                        {/* Page Navigation Buttons */}
                        <div className="flex items-center gap-1.5 font-mono">
                          <button
                            type="button"
                            disabled={currentReportPage <= 1}
                            onClick={() => setStaffReportPage(p => Math.max(1, p - 1))}
                            className="px-3 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 disabled:opacity-40 text-xs font-bold hover:bg-slate-850 transition-colors"
                          >
                            ← Prev
                          </button>

                          {Array.from({ length: totalPagesCount }, (_, i) => i + 1)
                            .filter(p => p === 1 || p === totalPagesCount || Math.abs(p - currentReportPage) <= 1)
                            .map((pNum, index, array) => {
                              const showEllipsis = index > 0 && pNum - array[index - 1] > 1;
                              return (
                                <React.Fragment key={pNum}>
                                  {showEllipsis && <span className="px-1 text-slate-600">...</span>}
                                  <button
                                    type="button"
                                    onClick={() => setStaffReportPage(pNum)}
                                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${currentReportPage === pNum ? 'bg-indigo-600 text-white' : 'bg-slate-950 border border-slate-800 text-slate-300 hover:bg-slate-850'}`}
                                  >
                                    {pNum}
                                  </button>
                                </React.Fragment>
                              );
                            })}

                          <button
                            type="button"
                            disabled={currentReportPage >= totalPagesCount}
                            onClick={() => setStaffReportPage(p => Math.min(totalPagesCount, p + 1))}
                            className="px-3 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 disabled:opacity-40 text-xs font-bold hover:bg-slate-850 transition-colors"
                          >
                            Next →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 6. RIGHT-SIDE ATTENDANCE RECORD DETAIL DRAWER / OVERLAY */}
                    {selectedAttendanceDetailRow && (
                      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
                        <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full p-6 overflow-y-auto space-y-5 shadow-2xl flex flex-col justify-between">
                          <div className="space-y-4">
                            {/* Drawer Header */}
                            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                              <div>
                                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">Attendance Inspection</span>
                                <h3 className="text-base font-extrabold text-white">Duty #{selectedAttendanceDetailRow.dutyNumber} Details</h3>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedAttendanceDetailRow(null)}
                                className="h-8 w-8 rounded-full bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm"
                              >
                                ✕
                              </button>
                            </div>

                            {/* Details Summary Card */}
                            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3 text-xs">
                              <div className="flex justify-between items-center pb-2 border-b border-slate-850">
                                <span className="text-slate-400 uppercase font-bold text-[10px]">Staff Member</span>
                                <span className="font-bold text-white text-sm">{selectedAttendanceDetailRow.staffName}</span>
                              </div>

                              <div className="flex justify-between items-center">
                                <span className="text-slate-400">Assigned Pump:</span>
                                <span className="font-bold text-slate-200">{selectedAttendanceDetailRow.pump}</span>
                              </div>

                              <div className="flex justify-between items-center">
                                <span className="text-slate-400">Duty Period:</span>
                                <span className="font-mono text-slate-200 text-[11px]">{selectedAttendanceDetailRow.dutyPeriodStr}</span>
                              </div>

                              <div className="flex justify-between items-center pt-2 border-t border-slate-850">
                                <span className="text-slate-400 font-bold uppercase text-[10px]">Attendance Status:</span>
                                <div>
                                  {selectedAttendanceDetailRow.status === 'PRESENT' && <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold text-[10px]">PRESENT</span>}
                                  {selectedAttendanceDetailRow.status === 'ABSENT' && <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 font-bold text-[10px]">ABSENT</span>}
                                  {selectedAttendanceDetailRow.status === 'NOT_SCHEDULED' && <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-500 border border-slate-800 font-bold text-[10px]">NOT SCHED</span>}
                                </div>
                              </div>
                            </div>

                            {/* Meter Readings for Assigned Guns */}
                            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3 text-xs">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-850 pb-2">Assigned Meter Readings</span>

                              {(() => {
                                const targetDuty = filteredDuties.find(d => d.id === selectedAttendanceDetailRow.dutyId);
                                const staffReadings = (targetDuty?.meterReadings || []).filter((mr: any) =>
                                  mr.assignedStaffId === selectedAttendanceDetailRow.staffId || mr.assignedStaff?.id === selectedAttendanceDetailRow.staffId
                                );

                                if (staffReadings.length === 0) {
                                  return <div className="text-slate-500 italic text-[11px]">No specific meter reading records attached to this staff assignment.</div>;
                                }

                                return staffReadings.map((mr: any) => (
                                  <div key={mr.id} className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 space-y-1 font-mono text-[11px]">
                                    <div className="flex justify-between font-bold text-indigo-400">
                                      <span>{mr.gun?.name} ({mr.gun?.fuelType})</span>
                                      <span>₹{mr.priceUsed?.toFixed(2)}/L</span>
                                    </div>
                                    <div className="flex justify-between text-slate-300">
                                      <span>Opening: {mr.previousReading}</span>
                                      <span>Closing: {mr.currentReading}</span>
                                    </div>
                                    <div className="flex justify-between text-emerald-400 font-bold border-t border-slate-800 pt-1">
                                      <span>Sold: {mr.litresSold} L</span>
                                      <span>Sales: ₹{mr.salesAmount?.toFixed(2)}</span>
                                    </div>
                                  </div>
                                ));
                              })()}
                            </div>

                            {/* Quick Action Button to Correct Status */}
                            <button
                              type="button"
                              onClick={() => {
                                setStatusCorrectionModal({
                                  open: true,
                                  dutyId: selectedAttendanceDetailRow.dutyId,
                                  dutyNumber: selectedAttendanceDetailRow.dutyNumber,
                                  staffId: selectedAttendanceDetailRow.staffId,
                                  staffName: selectedAttendanceDetailRow.staffName,
                                  currentStatus: selectedAttendanceDetailRow.status,
                                  newStatus: selectedAttendanceDetailRow.status,
                                  reason: ''
                                });
                                setSelectedAttendanceDetailRow(null);
                              }}
                              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs transition-all shadow"
                            >
                              Change Attendance Status
                            </button>
                          </div>

                          <div className="pt-4 border-t border-slate-800">
                            <button
                              type="button"
                              onClick={() => setSelectedAttendanceDetailRow(null)}
                              className="w-full py-2 bg-slate-950 hover:bg-slate-850 text-slate-300 rounded-lg border border-slate-800 font-bold text-xs"
                            >
                              Close Details Drawer
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ATTENDANCE AUDIT LOGS (Owner Correction Records) */}
                    {attendanceAuditLogs.length > 0 && (
                      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
                        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                          <ShieldCheck className="h-5 w-5 text-indigo-400" />
                          <div>
                            <h4 className="font-extrabold text-white text-sm uppercase tracking-wider">Attendance Correction Audit Log</h4>
                            <p className="text-xs text-slate-400">Owner & Manager manual status correction log</p>
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold font-mono">
                                <th className="p-3">Staff</th>
                                <th className="p-3">Duty #</th>
                                <th className="p-3">Old Status</th>
                                <th className="p-3">New Status</th>
                                <th className="p-3">Changed By</th>
                                <th className="p-3">Timestamp</th>
                                <th className="p-3">Reason</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40 font-mono text-slate-300">
                              {attendanceAuditLogs.map((log: any) => (
                                <tr key={log.id}>
                                  <td className="p-3 font-sans font-bold text-white">{log.staffName}</td>
                                  <td className="p-3 text-indigo-400">#{log.dutyNumber}</td>
                                  <td className="p-3 text-slate-500">{log.oldStatus}</td>
                                  <td className="p-3 text-emerald-400 font-bold">{log.newStatus}</td>
                                  <td className="p-3 text-slate-400">{log.changedBy}</td>
                                  <td className="p-3 text-slate-500">{log.timestamp}</td>
                                  <td className="p-3 font-sans text-slate-300">{log.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* CREDIT REPORT SUB-TAB */}
              {reportsTab === 'credit' && (
                <OwnerCreditLedger
                  creditLedger={creditLedger}
                  staticData={staticData}
                  historicalDuties={historicalDuties}
                  onRefresh={refreshActiveDuty}
                  flashMessage={flashMessage}
                />
              )}

              {/* EXPENSES REPORT SUB-TAB */}
              {reportsTab === 'expenses' && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                  <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <div>
                      <h4 className="font-extrabold text-white text-base">shift operating expenses ledger</h4>
                      <p className="text-xs text-slate-400 mt-1">Audit log of bunk operating payouts categorized by item and payment method.</p>
                    </div>
                    <button
                      onClick={() => handleExportExcel('expense-report-table', 'Expenses_Report')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-850 text-indigo-400 hover:text-indigo-300 text-xs font-bold transition-all"
                    >
                      Export to Excel
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table id="expense-report-table" className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold">
                          <th className="p-3">Date/Time</th>
                          <th className="p-3">Shift</th>
                          <th className="p-3">Category</th>
                          <th className="p-3">Description</th>
                          <th className="p-3 text-right">Amount</th>
                          <th className="p-3">Payment Method</th>
                          <th className="p-3">Logged By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {expenses.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-4 text-center text-slate-500">No operating expenses logged.</td>
                          </tr>
                        ) : (
                          expenses.map((e: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-950/20">
                              <td className="p-3 text-slate-350" suppressHydrationWarning>{new Date(e.timestamp).toLocaleString()}</td>
                              <td className="p-3 font-semibold text-indigo-400">Duty #{e.dutySession.dutyNumber}</td>
                              <td className="p-3 text-slate-200">{e.category.name}</td>
                              <td className="p-3 text-slate-300">{e.description}</td>
                              <td className="p-3 text-right font-mono font-bold text-red-400">₹{e.amount.toFixed(2)}</td>
                              <td className="p-3"><span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold uppercase tracking-wider text-[9px]">{e.paymentMethod}</span></td>
                              <td className="p-3 text-slate-350">{e.enteredBy.username}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* OIL REPORT SUB-TAB */}
              {reportsTab === 'oil' && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                  <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <div>
                      <h4 className="font-extrabold text-white text-base">Oil Products Sales Report</h4>
                      <p className="text-xs text-slate-400 mt-1">Breakdown of product volume, unit prices, and revenue for 4T/2T lubricants.</p>
                    </div>
                    <button
                      onClick={() => handleExportExcel('oil-report-table', 'Oil_Sales_Report')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-850 text-indigo-400 hover:text-indigo-300 text-xs font-bold transition-all"
                    >
                      Export to Excel
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table id="oil-report-table" className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold">
                          <th className="p-3">Date/Time</th>
                          <th className="p-3">Shift</th>
                          <th className="p-3">Product Name</th>
                          <th className="p-3 text-right">Quantity</th>
                          <th className="p-3 text-right">Unit Price</th>
                          <th className="p-3 text-right">Total Price</th>
                          <th className="p-3">Logged By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {oilSales.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-4 text-center text-slate-500">No oil sales transactions recorded.</td>
                          </tr>
                        ) : (
                          oilSales.map((o: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-950/20">
                              <td className="p-3 text-slate-350" suppressHydrationWarning>{new Date(o.timestamp).toLocaleString()}</td>
                              <td className="p-3 font-semibold text-indigo-400">Duty #{o.dutySession.dutyNumber}</td>
                              <td className="p-3 font-bold text-slate-200">{o.productName}</td>
                              <td className="p-3 text-right font-mono text-slate-350">{o.quantity}</td>
                              <td className="p-3 text-right font-mono text-slate-350">₹{o.unitPrice.toFixed(2)}</td>
                              <td className="p-3 text-right font-mono font-bold text-indigo-400">₹{o.totalAmount.toFixed(2)}</td>
                              <td className="p-3 text-slate-350">{o.enteredBy.username}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* STOCK REPORT SUB-TAB */}
              {reportsTab === 'stock' && (
                <div className="space-y-8">
                  <FuelInventoryManagement userRole={session.role} initialStockMap={staticData?.fuelStock} />

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                      <div>
                        <h4 className="font-extrabold text-white text-base">Underground Fuel Tank Stock & Dip Variance Log</h4>
                        <p className="text-xs text-slate-400 mt-1">Monitors opening levels, sales volumes, physical dip measurements, and variance shortages per duty.</p>
                      </div>
                      <button
                        onClick={() => handleExportExcel('stock-report-table', 'Stock_Variance_Report')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-850 text-indigo-400 hover:text-indigo-300 text-xs font-bold transition-all"
                      >
                        Export to Excel
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table id="stock-report-table" className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold">
                            <th className="p-3">Log Timestamp</th>
                            <th className="p-3">Fuel Type</th>
                            <th className="p-3 text-right">Opening Stock</th>
                            <th className="p-3 text-right">Receipts</th>
                            <th className="p-3 text-right">Sales Sold</th>
                            <th className="p-3 text-right">Expected Stock</th>
                            <th className="p-3 text-right">Physical Dip Stock</th>
                            <th className="p-3 text-right">Variance L</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {stockHistory.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="p-4 text-center text-slate-500">No stock reports recorded yet.</td>
                            </tr>
                          ) : (
                            stockHistory.map((s: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-950/20">
                                <td className="p-3 text-slate-350" suppressHydrationWarning>{new Date(s.timestamp).toLocaleString()}</td>
                                <td className="p-3 font-semibold text-slate-200">{s.fuelType}</td>
                                <td className="p-3 text-right font-mono text-slate-350">{s.openingStock.toFixed(2)} L</td>
                                <td className="p-3 text-right font-mono text-slate-350">{s.receipts.toFixed(2)} L</td>
                                <td className="p-3 text-right font-mono text-slate-350">{s.sales.toFixed(2)} L</td>
                                <td className="p-3 text-right font-mono text-slate-350">{s.expectedClosing.toFixed(2)} L</td>
                                <td className="p-3 text-right font-mono font-bold text-white">{s.physicalDip.toFixed(2)} L</td>
                                <td className={`p-3 text-right font-mono font-bold ${s.variance < 0 ? 'text-red-405' : 'text-slate-200'
                                  }`}>{s.variance < 0 ? `Shortage: ${Math.abs(s.variance).toFixed(2)} L` : `${s.variance.toFixed(2)} L`}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* CASH REPORT SUB-TAB */}
              {reportsTab === 'cash' && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                  <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <div>
                      <h4 className="font-extrabold text-white text-base">Cash Reconciliation Shift Audit</h4>
                      <p className="text-xs text-slate-400 mt-1">Audit trail of shift expected cash calculation compared to physical cash counted.</p>
                    </div>
                    <button
                      onClick={() => handleExportExcel('cash-report-table', 'Cash_Reconciliation_Report')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-850 text-indigo-400 hover:text-indigo-300 text-xs font-bold transition-all"
                    >
                      Export to Excel
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table id="cash-report-table" className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold">
                          <th className="p-3">Shift ID</th>
                          <th className="p-3">Start Date/Time</th>
                          <th className="p-3">End Date/Time</th>
                          <th className="p-3 text-right">Expected Cash Drawer</th>
                          <th className="p-3 text-right">Actual Counted Cash</th>
                          <th className="p-3 text-right">Cash Shortage/Surplus</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {historicalDuties.map((d: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-950/20">
                            <td className="p-3 font-semibold text-indigo-400">Duty #{d.dutyNumber}</td>
                            <td className="p-3 text-slate-350" suppressHydrationWarning>{new Date(d.startTime).toLocaleString()}</td>
                            <td className="p-3 text-slate-350" suppressHydrationWarning>{d.endTime ? new Date(d.endTime).toLocaleString() : 'OPEN'}</td>
                            <td className="p-3 text-right font-mono font-bold text-white">₹{d.expectedCash.toFixed(2)}</td>
                            <td className="p-3 text-right font-mono font-bold text-white">₹{d.actualCash.toFixed(2)}</td>
                            <td className={`p-3 text-right font-mono font-bold ${d.cashDifference < 0 ? 'text-red-400' : d.cashDifference > 0 ? 'text-emerald-400' : 'text-slate-400'
                              }`}>
                              {d.status === 'OPEN' ? '-' : d.cashDifference < 0 ? `-₹${Math.abs(d.cashDifference).toLocaleString()}` : d.cashDifference > 0 ? `+₹${d.cashDifference.toLocaleString()}` : '₹0'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 5: FUEL PRICING (OWNER ONLY) */}
          {activeTab === 'pricing' && session.role === 'OWNER' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              {/* Form to update fuel price */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <h3 className="font-extrabold text-white text-base border-b border-slate-800 pb-2">Modify Fuel Prices</h3>
                <form onSubmit={handleUpdateFuelPrice} className="space-y-4">
                  <div>
                    <label htmlFor="fuel-type" className="block text-xs font-semibold text-slate-300">Fuel Product Type</label>
                    <select
                      id="fuel-type"
                      required
                      value={priceFuelType}
                      onChange={(e) => setPriceFuelType(e.target.value as 'MS' | 'HSD')}
                      className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-3 mt-1 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="MS">MS Petrol</option>
                      <option value="HSD">HSD Diesel</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="fuel-price" className="block text-xs font-semibold text-slate-300">New Selling Price (₹/L)</label>
                    <input
                      id="fuel-price"
                      type="number"
                      step="0.01"
                      required
                      min="0.01"
                      value={newFuelPrice || ''}
                      onChange={(e) => setNewFuelPrice(Number(e.target.value))}
                      className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-3 mt-1 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                      placeholder="e.g. 104.20"
                    />
                  </div>
                  <div>
                    <label htmlFor="effective-from" className="block text-xs font-semibold text-slate-300">Effective Date & Time</label>
                    <input
                      id="effective-from"
                      type="datetime-local"
                      required
                      value={priceEffectiveFrom}
                      onChange={(e) => setPriceEffectiveFrom(e.target.value)}
                      className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-3 mt-1 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none font-mono"
                    />
                  </div>

                  {activeDuty && activeDuty.status === 'OPEN' && (
                    <div className="bg-slate-950 p-3 rounded-xl border border-indigo-500/30 space-y-2">
                      <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-wider block">
                        Active Duty Nozzle Checkpoint Reading (Optional)
                      </span>
                      <p className="text-[10px] text-slate-400">
                        Enter nozzle reading at effective time to lock Period 1 at current rate.
                      </p>
                      <div className="space-y-2 pt-1 font-mono">
                        {activeDuty.meterReadings
                          .filter((mr: any) => mr.gun?.fuelType === priceFuelType)
                          .map((mr: any) => (
                            <div key={mr.gunId} className="flex justify-between items-center text-xs">
                              <span className="text-slate-300 font-sans font-bold">{mr.gun.name}:</span>
                              <input
                                type="number"
                                step="0.01"
                                placeholder={`Current: ${mr.currentReading || mr.previousReading}`}
                                value={checkpointInputs[mr.gunId] !== undefined ? checkpointInputs[mr.gunId] : ''}
                                onChange={(e) => setCheckpointInputs({ ...checkpointInputs, [mr.gunId]: Number(e.target.value) })}
                                className="w-32 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white text-right focus:border-indigo-500 focus:outline-none font-bold text-amber-300"
                              />
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md"
                  >
                    Apply New Price Log
                  </button>
                </form>
              </div>

              {/* Display current pricing metrics */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                  <h3 className="font-extrabold text-white text-base">Active Fuel Prices</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-widest block">MS Petrol Selling Price</span>
                        <h4 className="text-3xl font-black text-white mt-1">₹{staticData.prices.MS.toFixed(2)}</h4>
                      </div>
                      <Fuel className="h-8 w-8 text-indigo-550 opacity-50" />
                    </div>
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-widest block">HSD Diesel Selling Price</span>
                        <h4 className="text-3xl font-black text-white mt-1">₹{staticData.prices.HSD.toFixed(2)}</h4>
                      </div>
                      <Fuel className="h-8 w-8 text-emerald-550 opacity-50" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SYSTEM CONFIGURATION (OWNER & MANAGER) */}
          {activeTab === 'settings' && (
            <div className="space-y-8">
              {/* Lubricant Products Catalog Management (Available for both OWNER and MANAGER) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="font-extrabold text-white text-base">Lubricant Oil Products Catalog & Pricing</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Manage oil packet inventory items, update unit packet prices, and toggle item status.</p>
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold rounded-lg uppercase">
                    Privilege Granted: {session.role}
                  </span>
                </div>

                <form onSubmit={handleAddOilProduct} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-slate-950 p-4 rounded-xl border border-slate-850">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Oil Product Name</label>
                    <input
                      type="text"
                      required
                      value={newOilName}
                      onChange={(e) => setNewOilName(e.target.value)}
                      className="block w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 mt-1 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                      placeholder="e.g. Servo 4T 20W40 (1L)"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Price per Packet (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      value={newOilPrice || ''}
                      onChange={(e) => setNewOilPrice(Number(e.target.value))}
                      className="block w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 mt-1 text-xs text-slate-100 font-mono focus:border-indigo-500 focus:outline-none"
                      placeholder="e.g. 380.00"
                    />
                  </div>
                  <button
                    type="submit"
                    className="py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1"
                  >
                    <Plus className="h-4 w-4" /> Add Lubricant Item
                  </button>
                </form>

                <div className="overflow-x-auto border border-slate-850 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-850 text-slate-450 uppercase font-bold">
                        <th className="p-3">Product Name</th>
                        <th className="p-3 text-right">Price / Packet</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 font-mono">
                      {staticData.products.map((p: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-950/20">
                          <td className="p-3 font-sans font-semibold text-slate-200">{p.name}</td>
                          <td className="p-3 text-right font-bold text-amber-400">₹{p.price.toFixed(2)}</td>
                          <td className="p-3 text-center">
                            {p.active ? (
                              <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">ACTIVE</span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold bg-slate-850 text-slate-500 border border-slate-700">DISABLED</span>
                            )}
                          </td>
                          <td className="p-3 text-center font-sans">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const newPrice = prompt(`Enter new price for ${p.name}:`, p.price.toString());
                                  if (newPrice && !isNaN(Number(newPrice))) {
                                    handleUpdateOilPrice(p.id, Number(newPrice));
                                  }
                                }}
                                className="px-2.5 py-1 rounded text-[10px] font-bold bg-amber-950/50 hover:bg-amber-900/50 text-amber-400 border border-amber-800/40"
                              >
                                Edit Price
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleOilProduct(p.id, !p.active)}
                                className={`px-2.5 py-1 rounded text-[10px] font-bold ${p.active ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-emerald-950/50 hover:bg-emerald-900/50 text-emerald-400'}`}
                              >
                                {p.active ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteOilProduct(p.id)}
                                className="px-2.5 py-1 rounded text-[10px] font-bold bg-red-950/50 hover:bg-red-900/50 text-red-400 border border-red-800/40"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Roster & Customer Management Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Staff Management */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="font-extrabold text-white text-base">Staff Roster Management</h3>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">View:</span>
                      <select
                        value={rosterFilter}
                        onChange={(e) => setRosterFilter(e.target.value as any)}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-white text-xs font-bold focus:border-indigo-500 focus:outline-none cursor-pointer"
                      >
                        <option value="ACTIVE">Active Staff Only (Default)</option>
                        <option value="INACTIVE">Inactive Staff</option>
                        <option value="ALL">All Staff</option>
                      </select>
                    </div>
                  </div>

                  <form onSubmit={handleAddStaff} className="flex gap-4">
                    <input
                      type="text"
                      required
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-950 py-2 px-3 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                      placeholder="Enter new staff member name"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" /> Add Staff
                    </button>
                  </form>

                  <div className="overflow-y-auto max-h-72 border border-slate-850 rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-850 text-slate-450 uppercase font-bold font-mono text-[10px]">
                          <th className="p-3">Name</th>
                          <th className="p-3 text-center">Status</th>
                          <th className="p-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {((staticData.allStaff || staticData.staff || []).filter((s: any) => {
                          if (rosterFilter === 'ACTIVE') return s.active;
                          if (rosterFilter === 'INACTIVE') return !s.active;
                          return true;
                        })).map((s: any, idx: number) => (
                          <tr key={s.id || idx} className="hover:bg-slate-950/20">
                            <td className="p-3 font-semibold text-slate-200">{s.name}</td>
                            <td className="p-3 text-center">
                              {s.active ? (
                                <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">ACTIVE</span>
                              ) : (
                                <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-850 text-slate-500 border border-slate-700">INACTIVE</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                {s.active ? (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleStaff(s.id, false, s.name)}
                                    className="px-2.5 py-1 rounded text-[10px] font-bold bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-500/40 cursor-pointer inline-flex items-center gap-1 transition-all"
                                    title="Temporarily disable staff member from active roster"
                                  >
                                    <UserX className="h-3 w-3" />
                                    Disable
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleStaff(s.id, true, s.name)}
                                    className="px-2.5 py-1 rounded text-[10px] font-bold bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 cursor-pointer inline-flex items-center gap-1 transition-all"
                                    title="Enable staff member for active roster"
                                  >
                                    <UserCheck className="h-3 w-3" />
                                    Enable
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteStaff(s.id, s.name)}
                                  className="px-2.5 py-1 rounded text-[10px] font-bold bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-500/40 cursor-pointer inline-flex items-center gap-1 transition-all"
                                  title="Permanently delete staff member entirely from system database"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Customer Management */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                  <h3 className="font-extrabold text-white text-base border-b border-slate-800 pb-2">Credit Customers Registry</h3>

                  <form onSubmit={handleAddCustomer} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <input
                        type="text"
                        required
                        value={newCustomerName}
                        onChange={(e) => setNewCustomerName(e.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-950 py-2 px-3 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                        placeholder="Customer/Firm Name"
                      />
                      <input
                        type="text"
                        value={newCustPhone}
                        onChange={(e) => setNewCustPhone(e.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-950 py-2 px-3 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                        placeholder="Contact Details"
                      />
                    </div>
                    <input
                      type="text"
                      value={newCustAddr}
                      onChange={(e) => setNewCustAddr(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-3 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
                      placeholder="Address details"
                    />
                    <button
                      type="submit"
                      className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1"
                    >
                      <Plus className="h-4 w-4" /> Add New Customer Account
                    </button>
                  </form>

                  <div className="overflow-y-auto max-h-56 border border-slate-850 rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-850 text-slate-450 uppercase font-bold">
                          <th className="p-3">Customer</th>
                          <th className="p-3 text-right">Balance</th>
                          <th className="p-3 text-center">Status</th>
                          <th className="p-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {staticData.customers.map((c: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-950/20">
                            <td className="p-3 font-semibold text-slate-200">{c.name}</td>
                            <td className="p-3 text-right font-mono font-bold text-slate-300">₹{c.balance.toFixed(2)}</td>
                            <td className="p-3 text-center">
                              {c.active ? (
                                <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">ACTIVE</span>
                              ) : (
                                <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-850 text-slate-500 border border-slate-700">DISABLED</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleToggleCustomer(c.id, !c.active)}
                                  className={`px-2.5 py-1 rounded text-[10px] font-bold ${c.active ? 'bg-amber-950/50 hover:bg-amber-900/50 text-amber-400 border border-amber-500/30' : 'bg-emerald-950/50 hover:bg-emerald-900/50 text-emerald-400 border border-emerald-500/30'
                                    }`}
                                  title={c.active ? 'Disable Customer Account' : 'Enable Customer Account'}
                                >
                                  {c.active ? 'Disable' : 'Enable'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCustomer(c.id)}
                                  className="px-2.5 py-1 rounded text-[10px] font-bold bg-rose-950/50 text-rose-400 border border-rose-500/30 hover:bg-rose-900/50 flex items-center gap-1 cursor-pointer"
                                  title="Delete Customer Account"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Business Branding & Retail Outlet Identity Settings (Owner Only) */}
              {session.role === 'OWNER' && (
                <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex flex-wrap justify-between items-center border-b border-[var(--border-color)] pb-3 gap-3">
                    <div>
                      <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-blue-500" />
                        Bunk Identity &amp; Retail Outlet Branding
                      </h3>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Configure petrol bunk identity, location, contact, report headers, and low-stock threshold triggers.
                      </p>
                    </div>
                    <span className="text-[10px] font-mono px-2.5 py-1 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 font-bold rounded-lg uppercase">
                      Owner Controlled
                    </span>
                  </div>

                  <form onSubmit={handleSaveBusinessSettings} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Business / Bunk Station Name *</label>
                        <input
                          type="text"
                          required
                          value={bizNameInput}
                          onChange={(e) => setBizNameInput(e.target.value)}
                          className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-lg p-2.5 text-xs text-[var(--text-primary)] font-bold focus:border-blue-500 focus:outline-none"
                          placeholder="e.g. Swastik IOCL Fuel Station & Retail Outlet"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Station Address &amp; Location *</label>
                        <input
                          type="text"
                          required
                          value={bizAddressInput}
                          onChange={(e) => setBizAddressInput(e.target.value)}
                          className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-lg p-2.5 text-xs text-[var(--text-primary)] font-bold focus:border-blue-500 focus:outline-none"
                          placeholder="e.g. NH-44 Highway Junction, Hyderabad"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Contact Phone / Details</label>
                        <input
                          type="text"
                          value={bizContactInput}
                          onChange={(e) => setBizContactInput(e.target.value)}
                          className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-lg p-2.5 text-xs text-[var(--text-primary)] font-bold focus:border-blue-500 focus:outline-none"
                          placeholder="e.g. +91 9876543210"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">MS Petrol Low Alert Threshold (L)</label>
                        <input
                          type="number"
                          min="500"
                          step="500"
                          required
                          value={msLowThresholdInput}
                          onChange={(e) => setMsLowThresholdInput(Number(e.target.value))}
                          className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-lg p-2.5 text-xs text-[var(--text-primary)] font-mono font-bold focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">HSD Diesel Low Alert Threshold (L)</label>
                        <input
                          type="number"
                          min="500"
                          step="500"
                          required
                          value={hsdLowThresholdInput}
                          onChange={(e) => setHsdLowThresholdInput(Number(e.target.value))}
                          className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-lg p-2.5 text-xs text-[var(--text-primary)] font-mono font-bold focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Official Report &amp; Invoice Header Text</label>
                      <input
                        type="text"
                        value={reportHeaderInput}
                        onChange={(e) => setReportHeaderInput(e.target.value)}
                        className="w-full bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded-lg p-2.5 text-xs text-[var(--text-primary)] font-bold focus:border-blue-500 focus:outline-none"
                        placeholder="e.g. Swastik Fuel Station Daily Shift Accounting Ledger"
                      />
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={isSavingBizSettings}
                        className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {isSavingBizSettings ? 'Saving Settings...' : 'Save Business Settings'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Dynamic Pumps & Nozzles (Guns) Master Configuration Card (Owner Only) */}
              {session.role === 'OWNER' && (
                <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-5 shadow-sm space-y-5">
                  <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
                    <div>
                      <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
                        <Fuel className="h-5 w-5 text-amber-500" />
                        Pumps &amp; Dispensing Nozzles Configuration
                      </h3>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Add or modify fuel pumps, dispensing guns, and active nozzle assignments dynamically.
                      </p>
                    </div>
                  </div>

                  {/* Add New Pump & Gun Forms */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Add Pump Form */}
                    <form onSubmit={handleAddPump} className="bg-[var(--bg-surface-secondary)] p-3.5 rounded-xl border border-[var(--border-subtle)] space-y-3">
                      <h4 className="font-bold text-xs text-[var(--text-primary)]">Add New Fuel Dispensing Pump</h4>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          value={newPumpName}
                          onChange={(e) => setNewPumpName(e.target.value)}
                          className="flex-1 bg-[var(--input-background)] border border-[var(--border-subtle)] rounded-lg p-2 text-xs text-[var(--text-primary)] font-bold focus:border-blue-500 focus:outline-none"
                          placeholder="e.g. Pump 3 (High-Speed)"
                        />
                        <button
                          type="submit"
                          className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-1 shrink-0"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Pump
                        </button>
                      </div>
                    </form>

                    {/* Add Gun Form */}
                    <form onSubmit={handleAddGun} className="bg-[var(--bg-surface-secondary)] p-3.5 rounded-xl border border-[var(--border-subtle)] space-y-3">
                      <h4 className="font-bold text-xs text-[var(--text-primary)]">Add New Dispensing Nozzle (Gun)</h4>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={newGunPumpId}
                          onChange={(e) => setNewGunPumpId(e.target.value)}
                          required
                          className="bg-[var(--input-background)] border border-[var(--border-subtle)] rounded-lg p-2 text-xs text-[var(--text-primary)] font-bold focus:border-blue-500 focus:outline-none"
                        >
                          <option value="">Select Pump</option>
                          {(staticData.pumps || []).map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          required
                          value={newGunName}
                          onChange={(e) => setNewGunName(e.target.value)}
                          className="bg-[var(--input-background)] border border-[var(--border-subtle)] rounded-lg p-2 text-xs text-[var(--text-primary)] font-bold focus:border-blue-500 focus:outline-none"
                          placeholder="Gun Name (e.g. MS-5)"
                        />
                        <select
                          value={newGunFuelType}
                          onChange={(e) => setNewGunFuelType(e.target.value as any)}
                          className="bg-[var(--input-background)] border border-[var(--border-subtle)] rounded-lg p-2 text-xs text-[var(--text-primary)] font-bold focus:border-blue-500 focus:outline-none"
                        >
                          <option value="MS">MS (Petrol)</option>
                          <option value="HSD">HSD (Diesel)</option>
                        </select>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Nozzle
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Configured Master Pump Units Table */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-[var(--text-primary)]">Master Pump Units</h4>
                    <div className="overflow-x-auto border border-[var(--border-subtle)] rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-[var(--bg-surface-secondary)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase font-bold">
                            <th className="p-3">Pump Unit Name</th>
                            <th className="p-3 text-center">Attached Nozzles</th>
                            <th className="p-3 text-center">Status</th>
                            <th className="p-3 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                          {(staticData.allPumps || staticData.pumps || []).map((p: any, idx: number) => (
                            <tr key={idx} className="hover:bg-[var(--bg-surface-hover)]">
                              <td className="p-3 font-sans font-bold text-[var(--text-primary)]">{p.name}</td>
                              <td className="p-3 text-center font-bold text-indigo-400">{(p.guns || []).length} Nozzles</td>
                              <td className="p-3 text-center font-sans">
                                {p.active ? (
                                  <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">ACTIVE</span>
                                ) : (
                                  <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700">DISABLED</span>
                                )}
                              </td>
                              <td className="p-3 text-center font-sans">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePump(p.id, !p.active)}
                                    className={`px-2.5 py-1 rounded text-[10px] font-bold ${p.active ? 'bg-amber-950/40 text-amber-500 border border-amber-500/30' : 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30'}`}
                                  >
                                    {p.active ? 'Disable' : 'Enable'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePump(p.id, p.name)}
                                    className="px-2.5 py-1 rounded text-[10px] font-bold bg-rose-950/40 text-rose-400 border border-rose-500/30 hover:bg-rose-900/60 flex items-center gap-1 cursor-pointer"
                                    title="Permanently delete this pump unit and its nozzles"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    Delete Pump
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Configured Guns List Table */}
                  <div className="overflow-x-auto border border-[var(--border-subtle)] rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[var(--bg-surface-secondary)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase font-bold">
                          <th className="p-3">Pump Unit</th>
                          <th className="p-3">Gun / Nozzle Name</th>
                          <th className="p-3">Fuel Type</th>
                          <th className="p-3 text-center">Status</th>
                          <th className="p-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                        {(staticData.allGuns || staticData.guns || []).map((g: any, idx: number) => (
                          <tr key={idx} className="hover:bg-[var(--bg-surface-hover)]">
                            <td className="p-3 font-sans font-bold text-[var(--text-primary)]">{g.pump?.name || 'Pump Unit'}</td>
                            <td className="p-3 font-bold text-blue-600 dark:text-blue-400">{g.name}</td>
                            <td className="p-3 font-bold text-[var(--text-secondary)]">{g.fuelType}</td>
                            <td className="p-3 text-center font-sans">
                              {g.active ? (
                                <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">ACTIVE</span>
                              ) : (
                                <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700">DISABLED</span>
                              )}
                            </td>
                            <td className="p-3 text-center font-sans">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleToggleGun(g.id, !g.active)}
                                  className={`px-2.5 py-1 rounded text-[10px] font-bold ${g.active ? 'bg-amber-950/40 text-amber-500 border border-amber-500/30' : 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30'}`}
                                >
                                  {g.active ? 'Disable' : 'Enable'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteGun(g.id, g.name)}
                                  className="px-2.5 py-1 rounded text-[10px] font-bold bg-rose-950/40 text-rose-400 border border-rose-500/30 hover:bg-rose-900/60 flex items-center gap-1 cursor-pointer"
                                  title="Permanently delete this nozzle"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Email Alerts & Reports Configuration Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                <div className="flex flex-wrap justify-between items-center border-b border-slate-800 pb-3 gap-3">
                  <div>
                    <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                      <Settings className="h-5 w-5 text-indigo-400" />
                      Email Alerts &amp; Reports Configuration
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Fully configurable multi-recipient email notification system. Manage recipients for duty closing reports &amp; low fuel stock alerts.
                    </p>
                  </div>
                  {session?.role === 'OWNER' && (
                    <button
                      type="button"
                      onClick={handleOpenAddRecipient}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                      + Add Email Recipient
                    </button>
                  )}
                </div>

                {/* Email Recipients Table */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-slate-300 text-xs flex items-center gap-2">
                      <Mail className="h-4 w-4 text-indigo-400" />
                      Configured Email Recipients ({emailRecipients.length})
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      SMTP Sender: <code className="text-emerald-400 font-mono font-semibold">{initialStaticData?.businessSettings?.SMTP_USER || 'Gmail SMTP'}</code>
                    </span>
                  </div>

                  {emailRecipients.length === 0 ? (
                    <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 text-center text-slate-400 text-xs">
                      No email recipients configured yet. Click <strong>+ Add Email Recipient</strong> above to add recipients.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                          <tr>
                            <th className="p-3">Recipient Name</th>
                            <th className="p-3">Email Address</th>
                            <th className="p-3 text-center">Duty Reports</th>
                            <th className="p-3 text-center">Low Fuel Alert</th>
                            <th className="p-3 text-center">Status</th>
                            {session?.role === 'OWNER' && <th className="p-3 text-right">Actions</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850">
                          {emailRecipients.map((rec) => (
                            <tr key={rec.id} className={`hover:bg-slate-900/50 ${!rec.active ? 'opacity-60 bg-slate-950/40' : ''}`}>
                              <td className="p-3 font-bold text-white flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                                {rec.name}
                              </td>
                              <td className="p-3 font-mono text-indigo-300 text-[11px]">
                                {rec.email}
                              </td>
                              <td className="p-3 text-center font-bold">
                                {rec.dutyReportsEnabled ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-400 text-xs" title="Enabled">
                                    ✅ <span className="hidden sm:inline text-[11px] font-semibold">Yes</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-slate-500 text-xs" title="Disabled">
                                    ❌ <span className="hidden sm:inline text-[11px] font-semibold">No</span>
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center font-bold">
                                {rec.lowFuelAlertsEnabled ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-400 text-xs" title="Enabled">
                                    ✅ <span className="hidden sm:inline text-[11px] font-semibold">Yes</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-slate-500 text-xs" title="Disabled">
                                    ❌ <span className="hidden sm:inline text-[11px] font-semibold">No</span>
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                {rec.active ? (
                                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px] border border-emerald-500/30">
                                    Active
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-bold text-[10px] border border-slate-700">
                                    Disabled
                                  </span>
                                )}
                              </td>
                              {session?.role === 'OWNER' && (
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditRecipient(rec)}
                                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 font-bold text-[11px] transition-all"
                                      title="Edit Recipient"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleRecipientStatus(rec.id, rec.active)}
                                      className={`px-2.5 py-1 rounded font-bold text-[11px] transition-all ${rec.active
                                          ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                                          : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                                        }`}
                                      title={rec.active ? 'Disable Recipient' : 'Enable Recipient'}
                                    >
                                      {rec.active ? 'Disable' : 'Enable'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRecipient(rec.id, rec.name)}
                                      className="px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 font-bold text-[11px] transition-all"
                                      title="Delete Recipient (Preserves Delivery Logs)"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Test Email Dispatcher Section */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3">
                  <h4 className="font-bold text-slate-300 text-xs flex items-center gap-2">
                    <Mail className="h-4 w-4 text-emerald-400" />
                    Test Email Dispatcher
                  </h4>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                        Select Configured Recipient
                      </label>
                      <select
                        value={testTargetEmail}
                        onChange={(e) => setTestTargetEmail(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="">Send to All Active Recipients</option>
                        {emailRecipients.map((r) => (
                          <option key={r.id} value={r.email}>
                            {r.name} ({r.email}) {!r.active ? '[Disabled]' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-[10px] text-slate-400 font-bold uppercase block mb-1">
                        Or Custom Test Email Address
                      </label>
                      <input
                        type="email"
                        placeholder="Or type custom test address..."
                        value={testTargetEmail}
                        onChange={(e) => setTestTargetEmail(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="shrink-0 self-end">
                      <button
                        type="button"
                        onClick={handleSendTestEmailToTarget}
                        disabled={isSendingTestEmail}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        <Mail className="h-4 w-4" />
                        {isSendingTestEmail ? 'Sending Test Email...' : 'Send Test Email'}
                      </button>
                    </div>
                  </div>
                  {testEmailStatus && (
                    <div className={`p-3 rounded-xl text-xs font-bold ${testEmailStatus.success ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'}`}>
                      {testEmailStatus.message}
                    </div>
                  )}
                </div>

                {/* Email Logs Table in System Configuration */}
                <div className="mt-4 border-t border-slate-800/80 pt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-slate-300 text-xs flex items-center gap-2">
                      <Mail className="h-4 w-4 text-indigo-400" />
                      Recent Server Email Delivery Logs
                    </h4>
                    <button
                      type="button"
                      onClick={handleFetchEmailLogs}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
                    >
                      Refresh Delivery History
                    </button>
                  </div>
                  {isLoadingEmailLogs ? (
                    <p className="text-slate-500 text-xs italic">Loading email logs...</p>
                  ) : emailLogs.length === 0 ? (
                    <p className="text-slate-500 text-xs italic">No email delivery logs recorded yet.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-bold">
                          <tr>
                            <th className="p-2.5">Sent At</th>
                            <th className="p-2.5">Email Type</th>
                            <th className="p-2.5">Reference</th>
                            <th className="p-2.5">Recipients</th>
                            <th className="p-2.5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850 font-mono text-[11px]">
                          {emailLogs.slice(0, 10).map((log: any) => (
                            <tr key={log.id} className="hover:bg-slate-900/50">
                              <td className="p-2.5 text-slate-400">{new Date(log.sentAt).toLocaleString('en-IN')}</td>
                              <td className="p-2.5 font-bold text-white">{log.emailType}</td>
                              <td className="p-2.5 text-indigo-300">{log.reference || 'N/A'}</td>
                              <td className="p-2.5 text-slate-300 max-w-[200px] truncate">{log.recipients}</td>
                              <td className="p-2.5">
                                {log.status === 'SENT' ? (
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">✓ SENT</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold text-[10px]" title={log.errorMessage}>✕ FAILED</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* System Configuration -> Advanced Maintenance Operations */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="border-b border-slate-800 pb-3 flex flex-wrap justify-between items-center gap-2">
                  <div>
                    <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                      <Wrench className="h-5 w-5 text-indigo-400" />
                      System Maintenance &amp; Operational Controls
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Clear uncommitted reading inputs, manage completed duties, or perform full system reset.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 1. RESET CURRENT PUMP READINGS (LOW RISK) */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center gap-1.5 text-indigo-400 font-bold text-[11px] uppercase tracking-wider mb-1">
                        <RefreshCw className="h-3.5 w-3.5 text-indigo-400" />
                        <span>Low Risk: Form Input State</span>
                      </div>
                      <h4 className="font-extrabold text-slate-100 text-sm">Clear Current Reading Inputs</h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        Clear current uncommitted pump reading inputs without affecting historical records or closed reports.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowClearReadingsModal(true)}
                      className="w-full px-3 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Reset Pump Readings
                    </button>
                  </div>

                  {/* 2. DELETE DUTY (HIGH RISK - OWNER ONLY) */}
                  {session.role === 'OWNER' && (
                    <div className="bg-slate-950 border border-amber-900/40 rounded-xl p-4 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px] uppercase tracking-wider mb-1">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                          <span>High Risk: Specific Duty</span>
                        </div>
                        <h4 className="font-extrabold text-slate-100 text-sm">Delete Completed Duty</h4>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                          Permanently delete a selected completed duty. Requires mandatory owner authentication and audit reason.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('reports');
                          flashMessage('Select a completed duty from Past Duty Reports to proceed with deletion.', 'success');
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Manage Past Duties
                      </button>
                    </div>
                  )}

                  {/* 3. FULL SYSTEM RESET (CRITICAL RISK - OWNER ONLY) */}
                  {session.role === 'OWNER' && (
                    <div className="bg-slate-950 border border-rose-900/40 rounded-xl p-4 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[11px] uppercase tracking-wider mb-1">
                          <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
                          <span>Critical Risk: System Wipe</span>
                        </div>
                        <h4 className="font-extrabold text-slate-100 text-sm">Full System Reset</h4>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                          Permanently clear all operational duty records, sales, readings, and transaction logs to re-initialize bunk setup.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleOpenResetModal}
                        className="w-full px-3 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Full System Reset
                      </button>
                    </div>
                  )}
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-1 text-[11px] text-slate-400">
                  <p>ℹ️ <strong>Saved Readings Correction:</strong> Saved pump readings cannot be erased silently. Use <strong>Correct Reading</strong> directly on the Active Duty form to record an audited correction.</p>
                  <p>ℹ️ <strong>Data Safety Guarantee:</strong> Resetting current reading inputs will not modify or delete historical duty reports, sales, tank stock, price periods, or credit ledgers.</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: AUDIT LOGS (OWNER ONLY) */}
          {activeTab === 'audit' && session.role === 'OWNER' && (
            <div className="space-y-8">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                  <div>
                    <h3 className="font-extrabold text-white text-lg">System Security Audit Log</h3>
                    <p className="text-xs text-slate-400 mt-1">Monitors database modifications, login events, price changes and operations.</p>
                  </div>
                  <button
                    onClick={() => handleExportExcel('audit-table', 'Security_Audit_Logs')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-850 text-indigo-400 hover:text-indigo-300 text-xs font-bold transition-all"
                  >
                    Export to Excel
                  </button>
                </div>
                <div className="overflow-x-auto max-h-[600px]">
                  <table id="audit-table" className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold text-xs tracking-wider uppercase">
                        <th className="p-4">Timestamp</th>
                        <th className="p-4">User</th>
                        <th className="p-4">Action Event</th>
                        <th className="p-4">Record Model</th>
                        <th className="p-4">Details / Changes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-500">No security audit logs recorded.</td>
                        </tr>
                      ) : (
                        auditLogs.map((log: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-850/20 font-mono">
                            <td className="p-4 text-slate-450" suppressHydrationWarning>{new Date(log.timestamp).toLocaleString()}</td>
                            <td className="p-4 font-bold text-indigo-400">{log.user.username}</td>
                            <td className="p-4 font-bold text-slate-205">{log.action}</td>
                            <td className="p-4 text-slate-350">
                              {log.oldValue && <span className="text-red-400 line-through mr-2">{log.oldValue}</span>}
                              {log.newValue && <span className="text-emerald-400 font-bold">{log.newValue}</span>}
                              {!log.oldValue && !log.newValue && <span className="text-slate-500 italic">No value logs</span>}
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

        </div>
      </main>

      {/* CHANGE DUTY WIZARD MODAL POPUP */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-850 w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl animate-scale-up my-8">

            {/* Modal Header */}
            <div className="bg-slate-950 px-8 py-5 border-b border-slate-850 flex justify-between items-center">
              <div>
                <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest block">Operational Shift Change Wizard</span>
                <h3 className="text-lg font-black text-white">
                  {wizardStep === 'firstDuty' && 'Assign First Duty & Set Opening Baseline Readings'}
                  {wizardStep === 1 && `Step 1: Closing Inputs & Cash Deposit (Duty #${activeDuty?.dutyNumber || ''})`}
                  {wizardStep === 'review' && `Step 2: Verify & Review Settlement Report (Duty #${activeDuty?.dutyNumber || ''})`}
                  {wizardStep === 2 && `Step 3: Assign Staff for Next Duty Shift`}
                </h3>
              </div>
              <button
                onClick={() => setWizardOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-xs font-bold"
              >
                Cancel Wizard
              </button>
            </div>

            {/* Step Visual Progress Indicator */}
            {wizardStep === 'firstDuty' ? (
              <div className="bg-slate-950/60 px-8 py-3 border-b border-slate-900 flex items-center gap-3 text-xs font-bold text-amber-400">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-amber-500 text-slate-950 font-black">1</span>
                <span>Assign First Duty Staff & Initial Baseline Meter Readings</span>
              </div>
            ) : (
              <div className="bg-slate-950/60 px-8 py-3 border-b border-slate-900 flex justify-between items-center text-xs font-bold text-slate-400">
                <div className={`flex items-center gap-2 ${wizardStep === 1 ? 'text-indigo-400 font-extrabold' : ''}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${wizardStep === 1 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>1</span>
                  <span>1. Closing Inputs</span>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-700" />
                <div className={`flex items-center gap-2 ${wizardStep === 'review' ? 'text-indigo-400 font-extrabold' : ''}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${wizardStep === 'review' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>2</span>
                  <span>2. Verify & Review</span>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-700" />
                <div className={`flex items-center gap-2 ${wizardStep === 2 ? 'text-emerald-400 font-extrabold' : ''}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${wizardStep === 2 ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>3</span>
                  <span>3. Assign Next Duty</span>
                </div>
              </div>
            )}

            {/* Modal Body */}
            <div className="p-8 space-y-6">

              {/* FIRST-EVER DUTY SETUP */}
              {wizardStep === 'firstDuty' && (
                <div className="space-y-6">
                  <div className="rounded-xl bg-amber-950/20 border border-amber-500/25 p-4 flex gap-3 text-xs text-amber-400 font-medium">
                    <Info className="h-5 w-5 shrink-0" />
                    <span>
                      No previous completed duty session found. Please enter initial baseline meter readings for all 8 nozzles and assign staff. Initial readings become the opening baseline (zero initial sales).
                    </span>
                  </div>

                  {/* Initial Meter Readings Table */}
                  <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-3">
                    <span className="text-xs font-extrabold text-white uppercase tracking-wider block border-b border-slate-900 pb-2">
                      INITIAL OPENING METER READINGS (ALL 8 GUNS)
                    </span>
                    <div className="grid grid-cols-2 gap-4">
                      {(staticData.guns || []).map((gun: any) => (
                        <div key={gun.id} className="bg-slate-900 p-3 rounded-lg border border-slate-850 flex justify-between items-center">
                          <div>
                            <span className="text-xs font-bold text-white block">{gun.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">Pump: {gun.pump?.name || 'Pump 1'} | Fuel: {gun.fuelType}</span>
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            required
                            min="0"
                            value={initialFirstReadings[gun.id] !== undefined ? initialFirstReadings[gun.id] : ''}
                            onChange={(e) => setInitialFirstReadings({ ...initialFirstReadings, [gun.id]: Number(e.target.value), [gun.name]: Number(e.target.value) })}
                            className="w-32 rounded border border-indigo-500/50 bg-slate-950 py-1.5 px-3 text-xs text-indigo-300 font-bold font-mono text-right focus:outline-none"
                            placeholder="Initial Reading"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Staff Assignments */}
                  <div className="bg-slate-950 border border-slate-850 p-6 rounded-xl space-y-4">
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block border-b border-slate-900 pb-2">
                      INDIVIDUAL GUN STAFF ASSIGNMENTS (8 GUNS)
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Pump 1 Staff */}
                      <div className="space-y-4 bg-slate-900/50 p-4 rounded-xl border border-slate-850">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                          <span className="text-xs font-extrabold text-indigo-400">PUMP 1</span>
                          <span className="text-[10px] font-mono text-slate-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">4 Nozzles</span>
                        </div>
                        <div className="space-y-3">
                          <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block">MS (Petrol)</span>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-200">MS-1</label>
                              <span className="text-[10px] text-slate-400 block mb-1">Assigned Staff:</span>
                              <select required value={assignments['MS-1'] || ''} onChange={(e) => setAssignments({ ...assignments, 'MS-1': e.target.value })} className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-indigo-500">
                                <option value="">-- Select Staff ▼ --</option>
                                {staticData.staff.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-200">MS-2</label>
                              <span className="text-[10px] text-slate-400 block mb-1">Assigned Staff:</span>
                              <select required value={assignments['MS-2'] || ''} onChange={(e) => setAssignments({ ...assignments, 'MS-2': e.target.value })} className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-indigo-500">
                                <option value="">-- Select Staff ▼ --</option>
                                {staticData.staff.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </select>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3 pt-2 border-t border-slate-850">
                          <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">HSD (Diesel)</span>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-200">HSD-1</label>
                              <span className="text-[10px] text-slate-400 block mb-1">Assigned Staff:</span>
                              <select required value={assignments['HSD-1'] || ''} onChange={(e) => setAssignments({ ...assignments, 'HSD-1': e.target.value })} className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-indigo-500">
                                <option value="">-- Select Staff ▼ --</option>
                                {staticData.staff.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-200">HSD-2</label>
                              <span className="text-[10px] text-slate-400 block mb-1">Assigned Staff:</span>
                              <select required value={assignments['HSD-2'] || ''} onChange={(e) => setAssignments({ ...assignments, 'HSD-2': e.target.value })} className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-indigo-500">
                                <option value="">-- Select Staff ▼ --</option>
                                {staticData.staff.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Pump 2 Staff */}
                      <div className="space-y-4 bg-slate-900/50 p-4 rounded-xl border border-slate-850">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                          <span className="text-xs font-extrabold text-emerald-400">PUMP 2</span>
                          <span className="text-[10px] font-mono text-slate-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">4 Nozzles</span>
                        </div>
                        <div className="space-y-3">
                          <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block">MS (Petrol)</span>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-200">MS-3</label>
                              <span className="text-[10px] text-slate-400 block mb-1">Assigned Staff:</span>
                              <select required value={assignments['MS-3'] || ''} onChange={(e) => setAssignments({ ...assignments, 'MS-3': e.target.value })} className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-500">
                                <option value="">-- Select Staff ▼ --</option>
                                {staticData.staff.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-200">MS-4</label>
                              <span className="text-[10px] text-slate-400 block mb-1">Assigned Staff:</span>
                              <select required value={assignments['MS-4'] || ''} onChange={(e) => setAssignments({ ...assignments, 'MS-4': e.target.value })} className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-500">
                                <option value="">-- Select Staff ▼ --</option>
                                {staticData.staff.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </select>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3 pt-2 border-t border-slate-850">
                          <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">HSD (Diesel)</span>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-200">HSD-3</label>
                              <span className="text-[10px] text-slate-400 block mb-1">Assigned Staff:</span>
                              <select required value={assignments['HSD-3'] || ''} onChange={(e) => setAssignments({ ...assignments, 'HSD-3': e.target.value })} className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-500">
                                <option value="">-- Select Staff ▼ --</option>
                                {staticData.staff.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-200">HSD-4</label>
                              <span className="text-[10px] text-slate-400 block mb-1">Assigned Staff:</span>
                              <select required value={assignments['HSD-4'] || ''} onChange={(e) => setAssignments({ ...assignments, 'HSD-4': e.target.value })} className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-500">
                                <option value="">-- Select Staff ▼ --</option>
                                {staticData.staff.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 1: CLOSE ACTIVE DUTY */}
              {wizardStep === 1 && activeDuty && (
                <div className="space-y-6">
                  {/* Informative banner */}
                  <div className="rounded-xl bg-indigo-950/20 border border-indigo-500/25 p-4 flex gap-3 text-xs text-indigo-400 font-medium">
                    <Info className="h-5 w-5 shrink-0" />
                    <span>
                      Please enter density at 15°C, closing meter readings, and physical tank dip (cm) for the active shift. System auto-calculates stock and sales dynamically.
                    </span>
                  </div>

                  {/* 1. DENSITY @ 15°C - TOP OF THE FORM */}
                  <div className="bg-slate-950 border border-blue-500/40 p-5 rounded-xl space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                      <div>
                        <span className="text-xs font-extrabold text-blue-400 uppercase tracking-wider block">DENSITY @ 15°C</span>
                        <span className="text-[10px] text-slate-400">Mandatory fuel quality density checks recorded for Duty #{activeDuty.dutyNumber}. Stored per duty session.</span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                        Mandatory Entry
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* MS Density Input */}
                      <div className="bg-slate-900/80 p-4 rounded-xl border border-amber-500/30 space-y-2">
                        <div className="flex justify-between items-center">
                          <label htmlFor="ms-density-input-top" className="text-xs font-extrabold text-amber-400 uppercase tracking-wider">
                            MS / PETROL DENSITY *
                          </label>
                          <span className="text-[10px] font-mono font-bold text-slate-400">Valid: 710 – 780 kg/m³</span>
                        </div>
                        <div className="relative">
                          <input
                            id="ms-density-input-top"
                            type="number"
                            step="0.1"
                            required
                            value={msDensityInput}
                            onChange={(e) => setMsDensityInput(e.target.value)}
                            className={`w-full rounded-lg border bg-slate-950 py-2.5 px-3 text-sm text-white font-mono font-bold focus:outline-none ${msDensityInput !== '' && (Number(msDensityInput) < 710 || Number(msDensityInput) > 780)
                              ? 'border-red-500 text-red-400 focus:border-red-400'
                              : 'border-slate-700 focus:border-amber-400'
                              }`}
                            placeholder="e.g. 750.0"
                          />
                          <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">kg/m³ @ 15°C</span>
                        </div>
                        {msDensityInput !== '' && (Number(msDensityInput) < 710 || Number(msDensityInput) > 780) && (
                          <p className="text-[11px] font-bold text-red-400">
                            ⚠️ MS density must be between 710 and 780 kg/m³ at 15°C.
                          </p>
                        )}
                      </div>

                      {/* HSD Density Input */}
                      <div className="bg-slate-900/80 p-4 rounded-xl border border-emerald-500/30 space-y-2">
                        <div className="flex justify-between items-center">
                          <label htmlFor="hsd-density-input-top" className="text-xs font-extrabold text-emerald-400 uppercase tracking-wider">
                            HSD / DIESEL DENSITY *
                          </label>
                          <span className="text-[10px] font-mono font-bold text-slate-400">Valid: 810 – 870 kg/m³</span>
                        </div>
                        <div className="relative">
                          <input
                            id="hsd-density-input-top"
                            type="number"
                            step="0.1"
                            required
                            value={hsdDensityInput}
                            onChange={(e) => setHsdDensityInput(e.target.value)}
                            className={`w-full rounded-lg border bg-slate-950 py-2.5 px-3 text-sm text-white font-mono font-bold focus:outline-none ${hsdDensityInput !== '' && (Number(hsdDensityInput) < 810 || Number(hsdDensityInput) > 870)
                              ? 'border-red-500 text-red-400 focus:border-red-400'
                              : 'border-slate-700 focus:border-emerald-400'
                              }`}
                            placeholder="e.g. 842.0"
                          />
                          <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">kg/m³ @ 15°C</span>
                        </div>
                        {hsdDensityInput !== '' && (Number(hsdDensityInput) < 810 || Number(hsdDensityInput) > 870) && (
                          <p className="text-[11px] font-bold text-red-400">
                            ⚠️ HSD density must be between 810 and 870 kg/m³ at 15°C.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* DUTY METER READINGS Table */}
                  <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 space-y-3 overflow-x-auto">
                    <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                      <span className="text-xs font-extrabold text-white uppercase tracking-wider block">
                        DUTY METER READINGS
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">PUMP 1 & PUMP 2 NOZZLES</span>
                    </div>
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-850 text-slate-400 uppercase font-bold text-[10px]">
                          <th className="p-2.5">Gun</th>
                          <th className="p-2.5">Duty Staff</th>
                          <th className="p-2.5 text-right">Closing</th>
                          <th className="p-2.5 text-right">Latest Checkpoint</th>
                          <th className="p-2.5 text-right">Opening</th>
                          <th className="p-2.5 text-right">Total Litres</th>
                          <th className="p-2.5 text-right">Price</th>
                          <th className="p-2.5 text-right">Total Sales</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 font-mono">
                        {getSortedReadings(activeDuty.meterReadings).map((mr: any, idx: number) => {
                          const prevVal = (openingReadings[mr.gunId] !== undefined && !isNaN(Number(openingReadings[mr.gunId])))
                            ? Number(openingReadings[mr.gunId])
                            : mr.previousReading;

                          const currentVal = (closingReadings[mr.gunId] !== undefined && !isNaN(Number(closingReadings[mr.gunId])))
                            ? Number(closingReadings[mr.gunId])
                            : (mr.currentReading > 0 ? mr.currentReading : mr.previousReading);

                          const litres = Math.max(0, currentVal - prevVal);

                          const hasIntervals = mr.intervals && mr.intervals.length > 0;
                          let sales = 0;
                          const intervalDetails: Array<{ periodName: string; start: number; end: number; litres: number; price: number; amount: number }> = [];

                          if (hasIntervals && mr.intervals.length > 1) {
                            sales = mr.intervals.reduce((sum: number, inv: any, iIdx: number) => {
                              const isLast = iIdx === mr.intervals.length - 1;
                              const invEnd = isLast ? currentVal : inv.endReading;
                              const invLitres = Math.max(0, invEnd - inv.startReading);
                              const invAmount = invLitres * inv.priceUsed;
                              intervalDetails.push({
                                periodName: `Price Period ${iIdx + 1}`,
                                start: inv.startReading,
                                end: invEnd,
                                litres: invLitres,
                                price: inv.priceUsed,
                                amount: invAmount,
                              });
                              return sum + invAmount;
                            }, 0);
                          } else {
                            // Check if an intermediate checkpoint reading exists before final closing
                            const checkpointReading = (hasIntervals && mr.intervals.length === 1)
                              ? mr.intervals[0].endReading
                              : (mr.currentReading > mr.previousReading && mr.currentReading < currentVal ? mr.currentReading : null);

                            if (checkpointReading !== null && checkpointReading > prevVal && checkpointReading < currentVal) {
                              const p1Price = (hasIntervals && mr.intervals.length === 1) ? mr.intervals[0].priceUsed : (mr.initialPrice || mr.priceUsed);
                              const p2Price = mr.priceUsed;

                              const litres1 = Math.max(0, checkpointReading - prevVal);
                              const amount1 = litres1 * p1Price;

                              const litres2 = Math.max(0, currentVal - checkpointReading);
                              const amount2 = litres2 * p2Price;

                              sales = amount1 + amount2;
                              intervalDetails.push({
                                periodName: 'Price Period 1 (Pre-Revision)',
                                start: prevVal,
                                end: checkpointReading,
                                litres: litres1,
                                price: p1Price,
                                amount: amount1,
                              });
                              intervalDetails.push({
                                periodName: 'Price Period 2 (Post-Revision)',
                                start: checkpointReading,
                                end: currentVal,
                                litres: litres2,
                                price: p2Price,
                                amount: amount2,
                              });
                            } else {
                              const activePrice = (hasIntervals && mr.intervals.length === 1) ? mr.intervals[0].priceUsed : mr.priceUsed;
                              sales = litres * activePrice;
                              intervalDetails.push({
                                periodName: 'Price Period 1',
                                start: prevVal,
                                end: currentVal,
                                litres: litres,
                                price: activePrice,
                                amount: sales,
                              });
                            }
                          }

                          const latestCheckpointVal = (hasIntervals && mr.intervals.length > 1)
                            ? mr.intervals[mr.intervals.length - 1].startReading
                            : (mr.currentReading > mr.previousReading ? mr.currentReading : null);

                          const assignedStaff = getAssignedStaffForGun(activeDuty, mr.gun);

                          return (
                            <React.Fragment key={idx}>
                              <tr className="hover:bg-slate-900/50">
                                <td className="p-2.5 font-sans font-bold text-slate-200">
                                  {mr.gun.name} <span className="text-[10px] text-slate-500 font-normal">({mr.gun.fuelType})</span>
                                </td>
                                <td className="p-2.5 font-sans font-semibold text-emerald-400 text-xs">{assignedStaff}</td>
                                <td className="p-2.5 text-right">
                                  <input
                                    id={`closing-reading-${mr.gunId}`}
                                    type="number"
                                    step="0.01"
                                    placeholder={mr.currentReading > 0 ? mr.currentReading.toString() : mr.previousReading.toString()}
                                    value={closingReadings[mr.gunId] !== undefined ? closingReadings[mr.gunId] : (mr.currentReading > 0 ? mr.currentReading : '')}
                                    onChange={(e) => {
                                      setClosingReadings({
                                        ...closingReadings,
                                        [mr.gunId]: e.target.value === '' ? '' : Number(e.target.value),
                                      });
                                    }}
                                    className="w-28 rounded border border-indigo-500/50 bg-slate-900 py-1 px-2 text-xs font-mono font-bold text-white text-right focus:border-indigo-400 focus:outline-none"
                                  />
                                </td>
                                <td className="p-2.5 text-right font-mono">
                                  {latestCheckpointVal !== null ? (
                                    <span className="text-amber-300 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 text-xs" title="Persisted Checkpoint Reading">
                                      {latestCheckpointVal.toFixed(2)} 📌
                                    </span>
                                  ) : (
                                    <span className="text-slate-600">-</span>
                                  )}
                                </td>
                                <td className="p-2.5 text-right">
                                  <span className="text-slate-300 font-mono font-bold bg-slate-900/60 px-2.5 py-1 rounded border border-slate-800 text-xs inline-block min-w-[75px] text-right" title="Read-only Opening carried forward automatically from previous duty closing">
                                    {(mr.previousReading || 0).toFixed(2)}
                                  </span>
                                </td>
                                <td className="p-2.5 text-right text-white font-bold">{litres.toFixed(2)} L</td>
                                <td className="p-2.5 text-right text-slate-400">
                                  {intervalDetails.length > 1 ? (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 cursor-help"
                                      title={intervalDetails.map((inv: any, i: number) => `${inv.periodName}: ${inv.start.toFixed(2)} -> ${inv.end.toFixed(2)} @ ₹${inv.price.toFixed(2)}`).join('\n')}
                                    >
                                      Split (₹{intervalDetails[0].price.toFixed(2)} / ₹{intervalDetails[intervalDetails.length - 1].price.toFixed(2)})
                                    </span>
                                  ) : (
                                    <span>₹{mr.priceUsed.toFixed(2)}</span>
                                  )}
                                </td>
                                <td className="p-2.5 text-right font-bold text-indigo-400">
                                  ₹{sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>

                              {/* Multi-Interval Period Breakdown Card */}
                              {intervalDetails.length > 1 && (
                                <tr className="bg-slate-950/80">
                                  <td colSpan={8} className="p-3 pl-8 border-b border-slate-800">
                                    <div className="bg-slate-900/90 rounded-xl p-3 border border-amber-500/20 space-y-2">
                                      <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider block">
                                        ⚡ Multi-Interval Price Change Breakdown for {mr.gun.name}:
                                      </span>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                                        {intervalDetails.map((det, dIdx) => (
                                          <div key={dIdx} className="bg-slate-950 p-2 rounded-lg border border-slate-800 space-y-1">
                                            <div className="flex justify-between items-center text-[10px]">
                                              <span className="font-bold text-indigo-300">{det.periodName}</span>
                                              <span className="text-amber-400 font-mono font-bold">₹{det.price.toFixed(2)}/L</span>
                                            </div>
                                            <div className="text-[11px] font-mono text-slate-300">
                                              {det.start.toFixed(2)} &rarr; {det.end.toFixed(2)} = <strong className="text-white">{det.litres.toFixed(2)} L</strong>
                                            </div>
                                            <div className="text-[10px] text-right font-mono font-extrabold text-emerald-400">
                                              ₹{det.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* 2. TANK DIP / PHYSICAL STOCK SECTION */}
                  <div className="bg-slate-950 border border-indigo-500/40 p-5 rounded-xl space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                      <div>
                        <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider block">TANK DIP / PHYSICAL STOCK</span>
                        <span className="text-[10px] text-slate-400">
                          Enter physical dip measurement (cm). Software automatically calculates stock using verified 20 KL Dip Chart.
                        </span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase">
                        20 KL Dip Chart Integrated
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* MS Tank Dip Input */}
                      <div className="bg-slate-900/80 p-4 rounded-xl border border-amber-500/30 space-y-3">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                          <span className="text-xs font-extrabold text-amber-400 uppercase tracking-wider">MS TANK DIP</span>
                          <span className="text-[10px] font-mono text-slate-400">Capacity: 20,000 L</span>
                        </div>

                        <div className="space-y-1">
                          <label htmlFor="ms-dip-cm-input" className="block text-[10px] font-bold text-slate-300 uppercase">
                            Dip Reading (cm) *
                          </label>
                          <div className="relative">
                            <input
                              id="ms-dip-cm-input"
                              type="number"
                              step="0.1"
                              min="0"
                              max="211"
                              value={msDipCmInput}
                              onChange={(e) => setMsDipCmInput(e.target.value)}
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 px-3 text-sm text-white font-mono font-bold focus:border-amber-400 focus:outline-none"
                              placeholder="e.g. 100.4"
                            />
                            <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">cm</span>
                          </div>
                        </div>

                        {/* Auto Chart Calculated Litres */}
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                          <div className="flex justify-between items-center text-xs font-sans">
                            <span className="text-slate-400 font-semibold">Chart Calculated Stock:</span>
                            <span className="font-mono font-extrabold text-indigo-300 text-sm">
                              {msMetrics.chartStockText}
                            </span>
                          </div>
                        </div>

                        {/* Edit / Correct Stock Button */}
                        <div className="pt-1">
                          {!msIsEditingStock ? (
                            <button
                              type="button"
                              onClick={() => {
                                setMsIsEditingStock(true);
                                setMsCorrectedStockInput(msMetrics.chartCalculatedStock ? String(msMetrics.chartCalculatedStock) : '');
                              }}
                              className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-950/30 px-3 py-1.5 rounded-md border border-amber-500/30 transition-all"
                            >
                              <Edit className="h-3 w-3" /> Edit / Correct Stock
                            </button>
                          ) : (
                            <div className="space-y-2 bg-amber-950/20 p-3 rounded-lg border border-amber-500/40">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] font-extrabold text-amber-400 uppercase">Corrected Stock Entry</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMsIsEditingStock(false);
                                    setMsCorrectedStockInput('');
                                    setMsCorrectionReasonInput('');
                                  }}
                                  className="text-[10px] text-slate-400 hover:text-white underline"
                                >
                                  Cancel Override
                                </button>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-300 uppercase">Verified Corrected Stock (L) *</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={msCorrectedStockInput}
                                  onChange={(e) => setMsCorrectedStockInput(e.target.value)}
                                  className="w-full rounded border border-amber-500/60 bg-slate-950 py-1.5 px-2.5 text-xs text-amber-300 font-mono font-bold focus:outline-none"
                                  placeholder="e.g. 10250.0"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-300 uppercase">Reason for Stock Correction *</label>
                                <input
                                  type="text"
                                  value={msCorrectionReasonInput}
                                  onChange={(e) => setMsCorrectionReasonInput(e.target.value)}
                                  className="w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2.5 text-xs text-white focus:outline-none"
                                  placeholder="e.g. Verified via manual gauge stick"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Stock Summary Box */}
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5 text-xs">
                          <div className="flex justify-between text-slate-400">
                            <span>Opening / Carry-forward:</span>
                            <span className="font-mono font-semibold text-slate-300">{msMetrics.openingStockText}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Receipts (+):</span>
                            <span className="font-mono font-semibold text-emerald-400">+{msMetrics.receipts.toFixed(1)} L</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Meter Dispensed (-):</span>
                            <span className="font-mono font-semibold text-amber-400">-{msActiveDispensedLitres.toFixed(1)} L</span>
                          </div>
                          <div className="flex justify-between text-slate-300 font-bold border-t border-slate-850 pt-1">
                            <span>BOOK / EXPECTED STOCK:</span>
                            <span className="font-mono font-bold text-indigo-300">{msMetrics.expectedClosingText}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Chart Stock:</span>
                            <span className="font-mono font-semibold text-slate-300">{msMetrics.chartStockText}</span>
                          </div>
                          {msIsEditingStock && (
                            <div className="flex justify-between text-amber-400">
                              <span>Corrected Stock:</span>
                              <span className="font-mono font-bold">{msMetrics.correctedStock !== null ? `${msMetrics.correctedStock.toFixed(1)} L` : 'Pending'}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-white font-bold border-t border-slate-850 pt-1">
                            <span>PHYSICAL VERIFIED STOCK:</span>
                            <span className="font-mono font-black text-amber-400">{msMetrics.finalVerifiedStockText}</span>
                          </div>
                          <div className="flex justify-between text-slate-400 border-t border-slate-850 pt-1">
                            <span>VARIATION:</span>
                            <span className={`font-mono font-bold ${msMetrics.stockVariation === null ? 'text-slate-400 font-normal italic' :
                              msMetrics.stockVariation < -0.01 ? 'text-red-400' :
                                msMetrics.stockVariation > 0.01 ? 'text-emerald-400' : 'text-slate-300'
                              }`}>
                              {msMetrics.variationText}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* HSD Tank Dip Input */}
                      <div className="bg-slate-900/80 p-4 rounded-xl border border-emerald-500/30 space-y-3">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                          <span className="text-xs font-extrabold text-emerald-400 uppercase tracking-wider">HSD TANK DIP</span>
                          <span className="text-[10px] font-mono text-slate-400">Capacity: 20,000 L</span>
                        </div>

                        <div className="space-y-1">
                          <label htmlFor="hsd-dip-cm-input" className="block text-[10px] font-bold text-slate-300 uppercase">
                            Dip Reading (cm) *
                          </label>
                          <div className="relative">
                            <input
                              id="hsd-dip-cm-input"
                              type="number"
                              step="0.1"
                              min="0"
                              max="211"
                              value={hsdDipCmInput}
                              onChange={(e) => setHsdDipCmInput(e.target.value)}
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 px-3 text-sm text-white font-mono font-bold focus:border-emerald-400 focus:outline-none"
                              placeholder="e.g. 150.2"
                            />
                            <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">cm</span>
                          </div>
                        </div>

                        {/* Auto Chart Calculated Litres */}
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                          <div className="flex justify-between items-center text-xs font-sans">
                            <span className="text-slate-400 font-semibold">Chart Calculated Stock:</span>
                            <span className="font-mono font-extrabold text-indigo-300 text-sm">
                              {hsdMetrics.chartStockText}
                            </span>
                          </div>
                        </div>

                        {/* Edit / Correct Stock Button */}
                        <div className="pt-1">
                          {!hsdIsEditingStock ? (
                            <button
                              type="button"
                              onClick={() => {
                                setHsdIsEditingStock(true);
                                setHsdCorrectedStockInput(hsdMetrics.chartCalculatedStock ? String(hsdMetrics.chartCalculatedStock) : '');
                              }}
                              className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-emerald-950/30 px-3 py-1.5 rounded-md border border-emerald-500/30 transition-all"
                            >
                              <Edit className="h-3 w-3" /> Edit / Correct Stock
                            </button>
                          ) : (
                            <div className="space-y-2 bg-emerald-950/20 p-3 rounded-lg border border-emerald-500/40">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] font-extrabold text-emerald-400 uppercase">Corrected Stock Entry</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setHsdIsEditingStock(false);
                                    setHsdCorrectedStockInput('');
                                    setHsdCorrectionReasonInput('');
                                  }}
                                  className="text-[10px] text-slate-400 hover:text-white underline"
                                >
                                  Cancel Override
                                </button>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-300 uppercase">Verified Corrected Stock (L) *</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={hsdCorrectedStockInput}
                                  onChange={(e) => setHsdCorrectedStockInput(e.target.value)}
                                  className="w-full rounded border border-emerald-500/60 bg-slate-950 py-1.5 px-2.5 text-xs text-emerald-300 font-mono font-bold focus:outline-none"
                                  placeholder="e.g. 14500.0"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-300 uppercase">Reason for Stock Correction *</label>
                                <input
                                  type="text"
                                  value={hsdCorrectionReasonInput}
                                  onChange={(e) => setHsdCorrectionReasonInput(e.target.value)}
                                  className="w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2.5 text-xs text-white focus:outline-none"
                                  placeholder="e.g. Verified via manual gauge stick"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Stock Summary Box */}
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5 text-xs">
                          <div className="flex justify-between text-slate-400">
                            <span>Opening / Carry-forward:</span>
                            <span className="font-mono font-semibold text-slate-300">{hsdMetrics.openingStockText}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Receipts (+):</span>
                            <span className="font-mono font-semibold text-emerald-400">+{hsdMetrics.receipts.toFixed(1)} L</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Meter Dispensed (-):</span>
                            <span className="font-mono font-semibold text-amber-400">-{hsdActiveDispensedLitres.toFixed(1)} L</span>
                          </div>
                          <div className="flex justify-between text-slate-300 font-bold border-t border-slate-850 pt-1">
                            <span>BOOK / EXPECTED STOCK:</span>
                            <span className="font-mono font-bold text-indigo-300">{hsdMetrics.expectedClosingText}</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Chart Stock:</span>
                            <span className="font-mono font-semibold text-slate-300">{hsdMetrics.chartStockText}</span>
                          </div>
                          {hsdIsEditingStock && (
                            <div className="flex justify-between text-emerald-400">
                              <span>Corrected Stock:</span>
                              <span className="font-mono font-bold">{hsdMetrics.correctedStock !== null ? `${hsdMetrics.correctedStock.toFixed(1)} L` : 'Pending'}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-white font-bold border-t border-slate-850 pt-1">
                            <span>PHYSICAL VERIFIED STOCK:</span>
                            <span className="font-mono font-black text-emerald-400">{hsdMetrics.finalVerifiedStockText}</span>
                          </div>
                          <div className="flex justify-between text-slate-400 border-t border-slate-850 pt-1">
                            <span>VARIATION:</span>
                            <span className={`font-mono font-bold ${hsdMetrics.stockVariation === null ? 'text-slate-400 font-normal italic' :
                              hsdMetrics.stockVariation < -0.01 ? 'text-red-400' :
                                hsdMetrics.stockVariation > 0.01 ? 'text-emerald-400' : 'text-slate-300'
                              }`}>
                              {hsdMetrics.variationText}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Testing / Sample Deduction */}
                  <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-3">
                    <span className="text-xs font-extrabold text-white uppercase tracking-wider block border-b border-slate-900 pb-2">TESTING / SAMPLE DEDUCTION</span>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">MS Testing (Litres)</label>
                        <input type="number" step="0.01" min="0" value={msTestingLitres || ''} onChange={(e) => setMsTestingLitres(Number(e.target.value))} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2.5 mt-1 text-xs text-white font-semibold font-mono focus:border-indigo-500 focus:outline-none" placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">HSD Testing (Litres)</label>
                        <input type="number" step="0.01" min="0" value={hsdTestingLitres || ''} onChange={(e) => setHsdTestingLitres(Number(e.target.value))} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2.5 mt-1 text-xs text-white font-semibold font-mono focus:border-indigo-500 focus:outline-none" placeholder="0" />
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">Testing Value: MS ₹{msTestingValue.toFixed(2)} + HSD ₹{hsdTestingValue.toFixed(2)} = ₹{totalTestingValue.toFixed(2)}</div>
                  </div>

                  {/* Paid Sample Box / Load Sale Input (Revenue Generating) */}
                  <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                      <span className="text-xs font-extrabold text-emerald-400 uppercase tracking-wider block">PAID SAMPLE BOX / LOAD SALE (REVENUE)</span>
                      <span className="text-[10px] bg-emerald-950 text-emerald-300 font-mono px-2 py-0.5 rounded border border-emerald-800 font-bold">
                        Total: ₹{sampleBoxSalesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    {activeDuty?.sampleBoxSales?.length > 0 && (
                      <div className="space-y-1">
                        {activeDuty.sampleBoxSales.map((s: any, i: number) => (
                          <div key={s.id || i} className="flex justify-between items-center text-[10px] text-slate-300 bg-slate-900/60 rounded px-2.5 py-1.5 border border-slate-800">
                            <div>
                              <span className="font-bold text-white mr-2">{s.fuelType} Sample Box:</span>
                              <span className="font-mono">{s.quantity} L × ₹{s.unitPrice.toFixed(2)} = ₹{s.totalAmount.toFixed(2)}</span>
                              {s.notes && <span className="text-slate-400 ml-2 italic">({s.notes})</span>}
                            </div>
                            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteSampleBoxSale(s.id); }} className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-950/40 transition-colors" title="Delete Sample Box Sale">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <form onSubmit={handleRecordSampleBoxSale} className="grid grid-cols-4 gap-2 items-end">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">Fuel Type</label>
                        <select value={sampleBoxFuelType} onChange={(e) => setSampleBoxFuelType(e.target.value as 'MS' | 'HSD')} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white font-semibold focus:border-emerald-500 focus:outline-none">
                          <option value="MS">MS (Petrol)</option>
                          <option value="HSD">HSD (Diesel)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">Litres Sold</label>
                        <input type="number" step="0.01" min="0.1" required value={sampleBoxQty} onChange={(e) => setSampleBoxQty(e.target.value)} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none" placeholder="20.0" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase">Notes / Ref</label>
                        <input type="text" value={sampleBoxNotes} onChange={(e) => setSampleBoxNotes(e.target.value)} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white focus:border-emerald-500 focus:outline-none" placeholder="Box #1 / Customer" />
                      </div>
                      <button type="submit" disabled={sampleBoxLoading} className="py-1.5 px-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] transition-colors flex items-center justify-center gap-1">
                        <Plus className="h-3 w-3" /> Record Sale
                      </button>
                    </form>
                  </div>

                  {/* Revenue Summary (ACC Book) */}
                  <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-2 text-xs">
                    <span className="text-xs font-extrabold text-white uppercase tracking-wider block border-b border-slate-900 pb-2">DAILY FUEL & OIL SALES BREAKDOWN</span>
                    <div className="flex justify-between text-slate-400 font-sans">
                      <span>MS METER SALES ({msLitresRaw.toFixed(2)} L - {msTestingLitres} L Test = {msActualLitres.toFixed(2)} L × ₹{msPrice.toFixed(2)})</span>
                      <span className="font-mono font-bold text-emerald-400">₹{totalMsSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 font-sans">
                      <span>HSD METER SALES ({hsdLitresRaw.toFixed(2)} L - {hsdTestingLitres} L Test = {hsdActualLitres.toFixed(2)} L × ₹{hsdPrice.toFixed(2)})</span>
                      <span className="font-mono font-bold text-sky-400">₹{totalHsdSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {sampleBoxSalesTotal > 0 && (
                      <div className="flex justify-between text-slate-400 font-sans">
                        <span>PAID SAMPLE BOX / LOAD SALES ({sampleBoxLitresTotal.toFixed(2)} L)</span>
                        <span className="font-mono font-bold text-emerald-400">+₹{sampleBoxSalesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-400 font-sans border-t border-slate-900 pt-1.5">
                      <span>TOTAL FUEL SALES ({dynamicFuelLitresTotal.toFixed(2)} L)</span>
                      <span className="font-mono font-bold text-indigo-400">₹{dynamicFuelSalesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 font-sans">
                      <span>OIL / LUBRICANTS SALES</span>
                      <span className="font-mono font-bold text-slate-200">₹{oilSalesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-white border-t border-slate-850 pt-2 font-sans">
                      <span>TOTAL DAILY REVENUE (MS + HSD + OIL)</span>
                      <span className="font-mono text-amber-400">₹{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  {/* Oil Sales Input */}
                  <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-3">
                    <span className="text-xs font-extrabold text-white uppercase tracking-wider block border-b border-slate-900 pb-2">OIL / LUBRICANT SALES</span>
                    {activeDuty.oilSales?.length > 0 && (
                      <div className="space-y-1">{activeDuty.oilSales.map((os: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-[10px] text-slate-400 bg-slate-900/50 rounded px-2 py-1 border border-slate-850">
                          <span>{os.productName} × {os.quantity} = ₹{os.totalAmount.toFixed(2)}</span>
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteOilSale(os.id); }} className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-950/30 transition-colors" title="Delete Oil Sale"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      ))}</div>
                    )}
                    <form onSubmit={handleAddOilSale} className="grid grid-cols-3 gap-2 items-end">
                      <div><label className="block text-[10px] font-bold text-slate-400 uppercase">Product</label>
                        <select required value={oilProdId} onChange={(e) => setOilProdId(e.target.value)} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white focus:border-indigo-500 focus:outline-none">
                          <option value="">-- Select --</option>
                          {staticData.products.map((p: any) => (<option key={p.id} value={p.id}>{p.name} (₹{p.price.toFixed(2)})</option>))}
                        </select></div>
                      <div><label className="block text-[10px] font-bold text-slate-400 uppercase">Qty</label>
                        <input type="number" required min="1" value={oilQty || ''} onChange={(e) => setOilQty(Number(e.target.value))} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none" placeholder="0" /></div>
                      <button type="submit" className="py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px]"><Plus className="h-3 w-3 inline mr-1" />Add</button>
                    </form>
                  </div>

                  {/* Bunk Expenses Input */}
                  <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-3">
                    <span className="text-xs font-extrabold text-white uppercase tracking-wider block border-b border-slate-900 pb-2">BUNK OPERATING EXPENSES</span>
                    {activeDuty.expenses?.length > 0 && (
                      <div className="space-y-1">{activeDuty.expenses.map((ex: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-[10px] text-slate-400 bg-slate-900/50 rounded px-2 py-1 border border-slate-850">
                          <span>{ex.description} ({ex.paymentMethod}) — ₹{ex.amount.toFixed(2)}</span>
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteExpense(ex.id); }} className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-950/30 transition-colors" title="Delete Expense"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      ))}</div>
                    )}
                    <form onSubmit={handleAddExpense} className="grid grid-cols-4 gap-2 items-end">
                      <div><label className="block text-[10px] font-bold text-slate-400 uppercase">Category</label>
                        <select required value={expCategory} onChange={(e) => setExpCategory(e.target.value)} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white focus:border-indigo-500 focus:outline-none">
                          <option value="">-- Select --</option>
                          {staticData.categories.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                        </select></div>
                      <div><label className="block text-[10px] font-bold text-slate-400 uppercase">Amount ₹</label>
                        <input type="number" required min="1" value={expAmount || ''} onChange={(e) => setExpAmount(Number(e.target.value))} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none" /></div>
                      <div><label className="block text-[10px] font-bold text-slate-400 uppercase">Description</label>
                        <input type="text" required value={expDesc} onChange={(e) => setExpDesc(e.target.value)} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white focus:border-indigo-500 focus:outline-none" placeholder="Brief" /></div>
                      <button type="submit" className="py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px]"><Plus className="h-3 w-3 inline mr-1" />Add</button>
                    </form>
                  </div>

                  {/* Credit Sales / Collections */}
                  <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                      <span className="text-xs font-extrabold text-white uppercase tracking-wider">CREDIT GIVEN / LEDGER COLLECTIONS</span>
                      <span className="text-[10px] text-amber-400 font-mono font-bold">Customer Credit Ledger</span>
                    </div>

                    {activeDuty.creditTransactions?.length > 0 && (
                      <div className="space-y-1 bg-slate-900/40 p-2 rounded-lg border border-slate-850 max-h-48 overflow-y-auto">
                        {activeDuty.creditTransactions.map((ct: any, i: number) => (
                          <div key={i} className="flex justify-between items-center text-[11px] bg-slate-900/80 rounded px-2.5 py-1.5 border border-slate-800">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] ${ct.transactionType === 'CREDIT_SALE' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                {ct.transactionType === 'CREDIT_SALE' ? 'CREDIT' : 'COLLECTION'}
                              </span>
                              <span className="text-white font-semibold">{ct.customer?.name}</span>
                              {ct.indentNumber && <span className="text-indigo-400 font-mono text-[10px] bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-900/50">Indent: {ct.indentNumber}</span>}
                              {ct.productName && <span className="text-slate-300 text-[10px] font-semibold">[{ct.productName}]</span>}
                              {ct.quantity && <span className="text-slate-300 text-[10px] font-mono">{ct.quantity} L</span>}
                              {ct.unitPrice && <span className="text-slate-400 text-[10px] font-mono">@ ₹{ct.unitPrice.toFixed(2)}</span>}
                              {ct.description && <span className="text-slate-500 text-[10px]">({ct.description})</span>}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="font-mono font-bold text-white">₹{ct.amount.toFixed(2)}</span>
                              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteCredit(ct); }} className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-950/30 transition-colors" title="Delete Credit Entry">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <form onSubmit={handleAddCredit} className="space-y-3 bg-slate-900/50 p-3 rounded-lg border border-slate-850">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase">1. Customer / Company Name</label>
                          <select required value={creditCustId} onChange={(e) => setCreditCustId(e.target.value)} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white focus:border-indigo-500 focus:outline-none">
                            <option value="">-- Select Customer / Company --</option>
                            {staticData.customers.map((c: any) => (<option key={c.id} value={c.id}>{c.name} (Bal: ₹{c.balance.toFixed(2)})</option>))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase">2. Transaction Type</label>
                          <select value={creditType} onChange={(e) => setCreditType(e.target.value as any)} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white font-bold focus:border-indigo-500 focus:outline-none">
                            <option value="CREDIT_SALE">Credit Given (Fuel / Oil / Product)</option>
                            <option value="COLLECTION">Ledger Collection (Cash Received)</option>
                          </select>
                        </div>
                      </div>

                      {creditType === 'CREDIT_SALE' ? (
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end bg-slate-950/60 p-2.5 rounded border border-slate-800">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Indent / Slip No</label>
                            <input type="text" value={indentNumber} onChange={(e) => setIndentNumber(e.target.value)} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none" placeholder="IND-104" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Product</label>
                            <select value={creditProduct} onChange={(e) => {
                              const p = e.target.value;
                              setCreditProduct(p);
                              let rate = 0;
                              if (p === 'MS') rate = msPrice;
                              else if (p === 'HSD') rate = hsdPrice;
                              else {
                                const oil = staticData.products.find((op: any) => op.name === p);
                                if (oil) rate = oil.price;
                              }
                              setCreditUnitPrice(rate);
                              if (creditLitres > 0 && rate > 0) setCreditAmount(creditLitres * rate);
                            }} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white font-bold focus:border-indigo-500 focus:outline-none">
                              <option value="MS">MS (Petrol) - ₹{msPrice.toFixed(2)}</option>
                              <option value="HSD">HSD (Diesel) - ₹{hsdPrice.toFixed(2)}</option>
                              {staticData.products.map((p: any) => (
                                <option key={p.id} value={p.name}>{p.name} - ₹{p.price.toFixed(2)}</option>
                              ))}
                              <option value="OTHER">Custom Amount ₹</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Litres / Qty</label>
                            <input type="number" step="0.01" min="0.01" value={creditLitres || ''} onChange={(e) => {
                              const l = Number(e.target.value);
                              setCreditLitres(l);
                              const rate = creditUnitPrice || (creditProduct === 'MS' ? msPrice : (creditProduct === 'HSD' ? hsdPrice : 0));
                              if (rate > 0) setCreditAmount(l * rate);
                            }} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white font-mono font-bold focus:border-indigo-500 focus:outline-none" placeholder="0.00" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Rate (₹/L)</label>
                            <input type="number" step="0.01" value={creditUnitPrice || (creditProduct === 'MS' ? msPrice : (creditProduct === 'HSD' ? hsdPrice : ''))} onChange={(e) => {
                              const r = Number(e.target.value);
                              setCreditUnitPrice(r);
                              if (creditLitres > 0) setCreditAmount(creditLitres * r);
                            }} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none" placeholder="Rate" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Amount (₹)</label>
                            <input type="number" step="0.01" min="1" value={creditAmount || ''} onChange={(e) => setCreditAmount(Number(e.target.value))} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-amber-400 font-mono font-bold focus:border-indigo-500 focus:outline-none" placeholder="0.00" />
                          </div>
                          <div>
                            <button type="submit" className="w-full py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] uppercase">
                              <Plus className="h-3 w-3 inline mr-1" />Add Credit
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-2 items-end bg-slate-950/60 p-2.5 rounded border border-slate-800">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Receipt / Voucher No</label>
                            <input type="text" value={indentNumber} onChange={(e) => setIndentNumber(e.target.value)} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none" placeholder="REC-001" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Cash Collected ₹</label>
                            <input type="number" required min="1" step="0.01" value={creditAmount || ''} onChange={(e) => setCreditAmount(Number(e.target.value))} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-emerald-400 font-mono font-bold focus:border-indigo-500 focus:outline-none" placeholder="0.00" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Remarks / Note</label>
                            <input type="text" value={creditDesc} onChange={(e) => setCreditDesc(e.target.value)} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2 mt-1 text-xs text-white focus:border-indigo-500 focus:outline-none" placeholder="Optional remark" />
                          </div>
                          <button type="submit" className="py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase">
                            <Plus className="h-3 w-3 inline mr-1" />Add Collection
                          </button>
                        </div>
                      )}
                    </form>
                  </div>

                  {/* Digital Payments */}
                  <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-3">
                    <span className="text-xs font-extrabold text-white uppercase tracking-wider block border-b border-slate-900 pb-2">DIGITAL PAYMENTS</span>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        { id: 'gpay', label: 'GPay', key1: 'gpay1', key2: 'gpay2' },
                        { id: 'pineLabs', label: 'Pine Labs', key1: 'pineLabs1', key2: 'pineLabs2' },
                        { id: 'phonePe', label: 'PhonePe', key1: 'phonePe1', key2: 'phonePe2' },
                        { id: 'paytm', label: 'Paytm', key1: 'paytm1', key2: 'paytm2' },
                        { id: 'bharatPe', label: 'BharatPe', key1: 'bharatPe1', key2: 'bharatPe2' },
                        { id: 'alp', label: 'ALP', key1: 'alp1', key2: 'alp2' },
                        { id: 'ufill', label: 'UFill', key1: 'ufill1', key2: 'ufill2' },
                        { id: 'bank', label: 'Bank', key1: 'bank1', key2: 'bank2' },
                        { id: 'upiQr', label: 'UPI QR', key1: 'upiQr1', key2: 'upiQr2' }
                      ].map(provider => (
                        <div key={provider.id} className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex flex-col gap-2">
                          <label className="block text-[11px] font-bold text-sky-400 uppercase tracking-wider border-b border-slate-800 pb-1.5">{provider.label}</label>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 font-mono w-14 shrink-0">Settlement 1:</span>
                            <input type="number" value={digitalPaymentsState[provider.key1 as keyof typeof digitalPaymentsState] || ''} onChange={(e) => setDigitalPaymentsState({ ...digitalPaymentsState, [provider.key1]: Number(e.target.value) })} className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 text-xs text-white font-semibold font-mono focus:border-indigo-500 focus:outline-none" placeholder="₹0" />
                          </div>
                          {showDigitalSettlement2[provider.id] ? (
                            <div className="space-y-2 pt-1 border-t border-slate-800/50 mt-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 font-mono w-14 shrink-0">Settlement 2:</span>
                                <input type="number" value={digitalPaymentsState[provider.key2 as keyof typeof digitalPaymentsState] || ''} onChange={(e) => setDigitalPaymentsState({ ...digitalPaymentsState, [provider.key2]: Number(e.target.value) })} className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 text-xs text-white font-semibold font-mono focus:border-indigo-500 focus:outline-none" placeholder="₹0" />
                              </div>
                              <button type="button" onClick={() => {
                                setShowDigitalSettlement2({ ...showDigitalSettlement2, [provider.id]: false });
                                setDigitalPaymentsState({ ...digitalPaymentsState, [provider.key2]: 0 });
                              }} className="text-[9px] text-red-400 hover:text-red-300 font-bold uppercase block w-full text-right">Remove Settlement 2</button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setShowDigitalSettlement2({ ...showDigitalSettlement2, [provider.id]: true })} className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center justify-center w-full py-1.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors mt-auto">
                              <Plus className="h-3 w-3 mr-1" /> Add Settlement 2
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs font-bold text-slate-300 border-t border-slate-900 pt-2">
                      <span>TOTAL DIGITAL</span>
                      <span className="font-mono text-emerald-400">₹{digitalPaymentsSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  {/* Final Financial Settlement & Bank Deposit Report */}
                  <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl space-y-3 text-xs">
                    <span className="text-xs font-extrabold text-amber-400 uppercase tracking-wider block border-b border-slate-850 pb-2 flex justify-between items-center">
                      <span>FINAL SHIFT SETTLEMENT & BANK DEPOSIT REPORT</span>
                      <span className="text-[10px] text-slate-400 font-normal font-mono">ACC Book Reconciliation</span>
                    </span>

                    <div className="grid grid-cols-2 gap-4 pt-1">
                      {/* 1. CASH INFLOWS & REVENUE */}
                      <div className="space-y-1.5 bg-slate-900/60 p-3 rounded-lg border border-slate-850">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block border-b border-slate-800 pb-1">CASH INFLOWS & REVENUE</span>
                        <div className="flex justify-between text-slate-300 font-sans">
                          <span>Fuel Sales (Gross):</span>
                          <span className="font-mono font-bold text-white">₹{grossFuelSalesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 font-sans">
                          <span>Oil/Lubricant Sales:</span>
                          <span className="font-mono font-bold text-white">₹{oilSalesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 font-sans">
                          <span>Credit Collections:</span>
                          <span className="font-mono font-bold text-emerald-400">+₹{creditCollectionsCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-800 pt-1 text-xs font-bold text-emerald-300 font-sans">
                          <span>TOTAL CASH REVENUE GENERATED:</span>
                          <span className="font-mono">₹{grossRevenueInflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>

                      {/* 2. DEDUCTIONS / DEBIT (NON-CASH) */}
                      <div className="space-y-1.5 bg-slate-900/60 p-3 rounded-lg border border-slate-850">
                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block border-b border-slate-880 pb-1">2. TOTAL DEDUCTIONS</span>
                        <div className="flex justify-between text-slate-300 font-sans">
                          <span className="font-semibold text-amber-300">Credit Given (Debit):</span>
                          <span className="font-mono font-bold text-amber-400">-₹{creditSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 font-sans">
                          <span>Digital Payments:</span>
                          <span className="font-mono font-bold text-sky-400">-₹{digitalPaymentsSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-slate-300 font-sans">
                          <span>Cash Expenses:</span>
                          <span className="font-mono font-bold text-red-400">-₹{expensesPaidInCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-800 pt-1 text-xs font-bold text-red-300 font-sans">
                          <span>TOTAL DEDUCTIONS:</span>
                          <span className="font-mono">₹{totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>

                    {/* EXPECTED PHYSICAL CASH */}
                    <div className="bg-indigo-950/40 border border-indigo-850 p-3 rounded-lg flex justify-between items-center text-xs">
                      <div>
                        <span className="font-extrabold text-indigo-200 block uppercase">EXPECTED PHYSICAL CASH</span>
                        <span className="text-[10px] text-slate-400 font-sans">Total Cash Revenue Generated &minus; Total Deductions</span>
                      </div>
                      <span className="font-mono text-base font-extrabold text-indigo-300">
                        ₹{expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* FINAL BANK DEPOSIT */}
                  <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl space-y-4 text-xs">
                    <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider block border-b border-slate-850 pb-2 flex justify-between items-center">
                      <span>FINAL BANK DEPOSIT</span>
                      <span className="text-[10px] text-slate-400 font-normal">Auto-Calculated Reconciliation</span>
                    </span>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">EXPECTED CASH TO DEPOSIT</span>
                        <span className="font-mono text-base font-extrabold text-indigo-300 block mt-1">
                          ₹{expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div>
                        <label htmlFor="bank-deposit-input" className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">BANK DEPOSITED CASH (₹) *</label>
                        <input
                          id="bank-deposit-input"
                          type="number"
                          required
                          min="0"
                          value={bankDeposit || ''}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setBankDeposit(val);
                            setActualCash(val);
                          }}
                          className="block w-full rounded-lg border border-emerald-500/50 bg-slate-900 py-2.5 px-3 text-sm text-emerald-400 font-bold font-mono focus:border-emerald-500 focus:outline-none shadow-sm"
                          placeholder="Enter amount deposited to bank"
                        />
                      </div>

                      <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">DIFFERENCE</span>
                        {(() => {
                          const diff = Number(((bankDeposit || 0) - expectedCash).toFixed(2));
                          if (diff < -0.01) {
                            return <span className="font-mono text-base font-extrabold text-red-400 block mt-1">₹{Math.abs(diff).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SHORTAGE</span>;
                          } else if (diff > 0.01) {
                            return <span className="font-mono text-base font-extrabold text-emerald-400 block mt-1">₹{diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SURPLUS</span>;
                          } else {
                            return <span className="font-mono text-base font-extrabold text-slate-300 block mt-1">₹0 BALANCED</span>;
                          }
                        })()}
                      </div>
                    </div>

                    {/* Shortage Attribution Component (> ₹10) */}
                    {((expectedCash - (bankDeposit || 0)) > 10) && (
                      <div className="mt-4 bg-red-950/40 border border-red-500/50 p-4 rounded-xl space-y-3">
                        <div className="flex items-center gap-2 text-red-400 font-extrabold text-xs uppercase tracking-wider">
                          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                          <span>CASH SHORTAGE DETECTED: ₹{(expectedCash - (bankDeposit || 0)).toFixed(2)} (Exceeds ₹10 Threshold)</span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          A cash shortage of ₹{(expectedCash - (bankDeposit || 0)).toFixed(2)} was detected. Select the staff member responsible for this shortage to record responsibility:
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">Staff Member Responsible *</label>
                            <select
                              id="shortage-staff-select"
                              required
                              value={shortageStaffId}
                              onChange={(e) => setShortageStaffId(e.target.value)}
                              className="w-full rounded-lg border border-red-500/60 bg-slate-900 py-2.5 px-3 text-xs text-white font-bold focus:outline-none focus:border-red-400"
                            >
                              <option value="">-- Select Staff Member ▼ --</option>
                              {staticData.staff.map((s: any) => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.role})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">Shortage Remark / Reason</label>
                            <input
                              type="text"
                              value={shortageReason}
                              onChange={(e) => setShortageReason(e.target.value)}
                              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2.5 px-3 text-xs text-white focus:outline-none focus:border-red-400"
                              placeholder="Reason for shortage"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 4: FINAL REVIEW SCREEN BEFORE CLOSING */}
              {wizardStep === 'review' && activeDuty && (
                <div className="space-y-6">
                  <div className="rounded-xl bg-indigo-950/30 border border-indigo-500/40 p-4 flex gap-3 text-xs text-indigo-300 font-medium">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-indigo-400" />
                    <span>
                      Step 4: Review full duty closing report before committing. Inspect all numbers carefully. Clicking "CONFIRM & CLOSE DUTY #{activeDuty.dutyNumber}" will permanently seal this duty session in an atomic database transaction.
                    </span>
                  </div>

                  {/* Review Summary Card */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 space-y-6 text-xs">
                    <div className="flex justify-between items-center border-b border-slate-850 pb-3">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block">SHIFT SETTLEMENT SUMMARY</span>
                        <h4 className="text-base font-extrabold text-white">Duty #{activeDuty.dutyNumber} Closing Report</h4>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-500/10 border border-amber-500/30 text-amber-400">
                        PENDING FINAL CONFIRMATION
                      </span>
                    </div>

                    {/* Meter Readings Review Table */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Meter Readings & Nozzle Sales</span>
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-850 text-slate-500 uppercase font-bold text-[10px]">
                            <th className="py-2">Gun</th>
                            <th className="py-2">Duty Staff</th>
                            <th className="py-2 text-right">Opening</th>
                            <th className="py-2 text-right">Closing</th>
                            <th className="py-2 text-right">Litres</th>
                            <th className="py-2 text-right">Amount (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900 font-mono text-xs">
                          {getSortedReadings(activeDuty.meterReadings).map((mr: any, idx: number) => {
                            const prevVal = mr.previousReading;
                            const currentVal = closingReadings[mr.gunId] !== undefined ? closingReadings[mr.gunId] : mr.currentReading;
                            const litres = Math.max(0, currentVal - prevVal);

                            const hasIntervals = mr.intervals && mr.intervals.length > 0;
                            let sales = 0;
                            if (hasIntervals) {
                              sales = mr.intervals.reduce((sum: number, inv: any, iIdx: number) => {
                                const isLast = iIdx === mr.intervals.length - 1;
                                const invEnd = isLast ? currentVal : inv.endReading;
                                const invLitres = Math.max(0, invEnd - inv.startReading);
                                return sum + (invLitres * inv.priceUsed);
                              }, 0);
                            } else {
                              sales = litres * mr.priceUsed;
                            }

                            const pName = mr.gun?.pump?.name || 'Pump 1';
                            const fType = mr.gun?.fuelType || 'MS';
                            const assignedStaff = getAssignedStaffForGun(activeDuty, mr.gun);

                            return (
                              <tr key={idx}>
                                <td className="py-2 font-sans font-bold text-slate-200">{mr.gun.name} ({mr.gun.fuelType})</td>
                                <td className="py-2 font-sans text-emerald-400">{assignedStaff}</td>
                                <td className="py-2 text-right text-slate-400">{prevVal.toFixed(2)}</td>
                                <td className="py-2 text-right text-white font-bold">{currentVal.toFixed(2)}</td>
                                <td className="py-2 text-right text-indigo-300 font-bold">{litres.toFixed(2)} L</td>
                                <td className="py-2 text-right text-emerald-400 font-bold">₹{sales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Financial Reconciliation Summary */}
                    <div className="grid grid-cols-2 gap-4 border-t border-slate-850 pt-4">
                      <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-850">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">REVENUE INFLOWS</span>
                        <div className="flex justify-between text-slate-300"><span>Gross Fuel Sales:</span><span className="font-mono text-white font-bold">₹{grossFuelSalesTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        <div className="flex justify-between text-slate-300"><span>Oil/Lubricants Sales:</span><span className="font-mono text-white font-bold">₹{oilSalesTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        <div className="flex justify-between text-slate-300"><span>Credit Collections:</span><span className="font-mono text-emerald-400 font-bold">+₹{creditCollectionsCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        <div className="flex justify-between border-t border-slate-800 pt-1 font-bold text-emerald-300"><span>Total Gross Revenue:</span><span className="font-mono">₹{grossRevenueInflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                      </div>

                      <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-850">
                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block">NON-CASH DEDUCTIONS</span>
                        <div className="flex justify-between text-slate-300"><span>Credit Given:</span><span className="font-mono text-amber-400 font-bold">-₹{creditSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        <div className="flex justify-between text-slate-300"><span>Digital Payments:</span><span className="font-mono text-sky-400 font-bold">-₹{digitalPaymentsSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        <div className="flex justify-between text-slate-300"><span>Cash Expenses:</span><span className="font-mono text-red-400 font-bold">-₹{expensesPaidInCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        <div className="flex justify-between border-t border-slate-800 pt-1 font-bold text-red-300"><span>Total Deductions:</span><span className="font-mono">₹{totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                      </div>
                    </div>

                    {/* Final Cash Comparison Box */}
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 grid grid-cols-3 gap-4 items-center">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">EXPECTED CASH</span>
                        <span className="font-mono text-sm font-extrabold text-indigo-300">₹{expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">BANK DEPOSITED CASH</span>
                        <span className="font-mono text-sm font-extrabold text-emerald-400">₹{Number(bankDeposit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">SETTLEMENT STATUS</span>
                        {(() => {
                          const diff = Number(((bankDeposit || 0) - expectedCash).toFixed(2));
                          if (diff < -0.01) {
                            return <span className="font-mono text-sm font-extrabold text-red-400 block">₹{Math.abs(diff).toLocaleString(undefined, { minimumFractionDigits: 2 })} SHORTAGE</span>;
                          } else if (diff > 0.01) {
                            return <span className="font-mono text-sm font-extrabold text-emerald-400 block">₹{diff.toLocaleString(undefined, { minimumFractionDigits: 2 })} SURPLUS</span>;
                          } else {
                            return <span className="font-mono text-sm font-extrabold text-slate-300 block">₹0 BALANCED</span>;
                          }
                        })()}
                      </div>
                    </div>

                    {/* DENSITY & TANK DIP VERIFICATION SUMMARY FOR STEP 4 REVIEW */}
                    <div className="space-y-3 border-t border-slate-850 pt-4 bg-slate-900/40 p-4 rounded-xl border border-slate-850">
                      <span className="text-[10px] font-extrabold text-blue-400 uppercase tracking-wider block">
                        FUEL DENSITY & TANK DIP VERIFICATION SUMMARY
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                        {/* MS Summary */}
                        <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
                          <span className="text-amber-400 font-sans font-extrabold block text-xs">MS PETROL</span>
                          <div className="flex justify-between text-slate-300"><span>Density @ 15°C:</span><span className="font-bold text-white">{msDensityInput ? `${msDensityInput} kg/m³` : 'N/A'}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Opening Stock:</span><span className="font-bold text-slate-200">{msMetrics.openingStockText}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Meter Dispensing:</span><span className="font-bold text-slate-200">{msActiveDispensedLitres.toFixed(1)} L</span></div>
                          <div className="flex justify-between text-slate-300"><span>Expected Closing:</span><span className="font-bold text-slate-200">{msMetrics.expectedClosingText}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Dip Reading:</span><span className="font-bold text-indigo-300">{msDipCmInput !== '' ? `${msDipCmInput} cm` : 'Not entered'}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Chart Calculated Stock:</span><span className="font-bold text-white">{msMetrics.chartStockText}</span></div>
                          {msIsEditingStock && msMetrics.correctedStock !== null && (
                            <div className="flex justify-between text-amber-400"><span>Corrected Stock:</span><span className="font-bold">{msMetrics.correctedStock.toFixed(1)} L ✏️</span></div>
                          )}
                          <div className="flex justify-between text-amber-400 font-black text-sm border-t border-slate-850 pt-1"><span>Final Verified Stock:</span><span>{msMetrics.finalVerifiedStockText}</span></div>
                          <div className="flex justify-between text-slate-400 border-t border-slate-850 pt-1">
                            <span>Stock Variation:</span>
                            <span className={`font-mono font-bold ${msMetrics.stockVariation === null ? 'text-slate-400 font-normal italic' :
                              msMetrics.stockVariation < -0.01 ? 'text-red-400' :
                                msMetrics.stockVariation > 0.01 ? 'text-emerald-400' : 'text-slate-300'
                              }`}>
                              {msMetrics.variationText}
                            </span>
                          </div>
                        </div>

                        {/* HSD Summary */}
                        <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
                          <span className="text-emerald-400 font-sans font-extrabold block text-xs">HSD HIGH SPEED DIESEL</span>
                          <div className="flex justify-between text-slate-300"><span>Density @ 15°C:</span><span className="font-bold text-white">{hsdDensityInput ? `${hsdDensityInput} kg/m³` : 'N/A'}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Opening Stock:</span><span className="font-bold text-slate-200">{hsdMetrics.openingStockText}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Meter Dispensing:</span><span className="font-bold text-slate-200">{hsdActiveDispensedLitres.toFixed(1)} L</span></div>
                          <div className="flex justify-between text-slate-300"><span>Expected Closing:</span><span className="font-bold text-slate-200">{hsdMetrics.expectedClosingText}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Dip Reading:</span><span className="font-bold text-indigo-300">{hsdDipCmInput !== '' ? `${hsdDipCmInput} cm` : 'Not entered'}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Chart Calculated Stock:</span><span className="font-bold text-white">{hsdMetrics.chartStockText}</span></div>
                          {hsdIsEditingStock && hsdMetrics.correctedStock !== null && (
                            <div className="flex justify-between text-emerald-400"><span>Corrected Stock:</span><span className="font-bold">{hsdMetrics.correctedStock.toFixed(1)} L ✏️</span></div>
                          )}
                          <div className="flex justify-between text-emerald-400 font-black text-sm border-t border-slate-850 pt-1"><span>Final Verified Stock:</span><span>{hsdMetrics.finalVerifiedStockText}</span></div>
                          <div className="flex justify-between text-slate-400 border-t border-slate-850 pt-1">
                            <span>Stock Variation:</span>
                            <span className={`font-mono font-bold ${hsdMetrics.stockVariation === null ? 'text-slate-400 font-normal italic' :
                              hsdMetrics.stockVariation < -0.01 ? 'text-red-400' :
                                hsdMetrics.stockVariation > 0.01 ? 'text-emerald-400' : 'text-slate-300'
                              }`}>
                              {hsdMetrics.variationText}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: ASSIGN NEXT DUTY */}
              {wizardStep === 2 && (
                <div className="space-y-6">
                  {justClosedDutyNumber && (
                    <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/40 p-4 flex gap-3 text-xs text-emerald-400 font-bold">
                      <CheckCircle2 className="h-5 w-5 shrink-0" />
                      <span>✓ Duty #{justClosedDutyNumber} successfully closed and sealed. Now assign staff for Duty #{justClosedDutyNumber + 1}.</span>
                    </div>
                  )}

                  {/* Time and details */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="start-time" className="block text-xs font-semibold text-slate-350">Duty Shift Start Date & Time</label>
                      <input
                        id="start-time"
                        type="datetime-local"
                        required
                        value={newDutyStartTime}
                        onChange={(e) => setNewDutyStartTime(e.target.value)}
                        className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 px-3 mt-1 text-xs text-white font-mono focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-350 select-none">Carried Meter Readings</label>
                      <span className="block text-xs font-bold text-emerald-400 mt-1 bg-slate-950 px-3 py-2.5 rounded-lg border border-slate-850">
                        Opening readings inherited automatically from previous closed duty.
                      </span>
                    </div>
                  </div>

                  {/* Staff Assignments */}
                  <div className="bg-slate-950 border border-slate-850 p-6 rounded-xl space-y-4">
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block border-b border-slate-900 pb-2">
                      INDIVIDUAL GUN STAFF ASSIGNMENTS (8 GUNS)
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Pump 1 Staff */}
                      <div className="space-y-4 bg-slate-900/50 p-4 rounded-xl border border-slate-850">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                          <span className="text-xs font-extrabold text-indigo-400">PUMP 1</span>
                          <span className="text-[10px] font-mono text-slate-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">4 Nozzles</span>
                        </div>
                        <div className="space-y-3">
                          <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block">MS (Petrol)</span>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-200">MS-1</label>
                              <span className="text-[10px] text-slate-400 block mb-1">Assigned Staff:</span>
                              <select required value={assignments['MS-1'] || ''} onChange={(e) => setAssignments({ ...assignments, 'MS-1': e.target.value })} className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-indigo-500">
                                <option value="">-- Select Staff ▼ --</option>
                                {staticData.staff.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-200">MS-2</label>
                              <span className="text-[10px] text-slate-400 block mb-1">Assigned Staff:</span>
                              <select required value={assignments['MS-2'] || ''} onChange={(e) => setAssignments({ ...assignments, 'MS-2': e.target.value })} className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-indigo-500">
                                <option value="">-- Select Staff ▼ --</option>
                                {staticData.staff.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </select>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3 pt-2 border-t border-slate-850">
                          <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">HSD (Diesel)</span>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-200">HSD-1</label>
                              <span className="text-[10px] text-slate-400 block mb-1">Assigned Staff:</span>
                              <select required value={assignments['HSD-1'] || ''} onChange={(e) => setAssignments({ ...assignments, 'HSD-1': e.target.value })} className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-indigo-500">
                                <option value="">-- Select Staff ▼ --</option>
                                {staticData.staff.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-200">HSD-2</label>
                              <span className="text-[10px] text-slate-400 block mb-1">Assigned Staff:</span>
                              <select required value={assignments['HSD-2'] || ''} onChange={(e) => setAssignments({ ...assignments, 'HSD-2': e.target.value })} className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-indigo-500">
                                <option value="">-- Select Staff ▼ --</option>
                                {staticData.staff.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Pump 2 Staff */}
                      <div className="space-y-4 bg-slate-900/50 p-4 rounded-xl border border-slate-850">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                          <span className="text-xs font-extrabold text-emerald-400">PUMP 2</span>
                          <span className="text-[10px] font-mono text-slate-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">4 Nozzles</span>
                        </div>
                        <div className="space-y-3">
                          <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block">MS (Petrol)</span>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-200">MS-3</label>
                              <span className="text-[10px] text-slate-400 block mb-1">Assigned Staff:</span>
                              <select required value={assignments['MS-3'] || ''} onChange={(e) => setAssignments({ ...assignments, 'MS-3': e.target.value })} className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-500">
                                <option value="">-- Select Staff ▼ --</option>
                                {staticData.staff.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-200">MS-4</label>
                              <span className="text-[10px] text-slate-400 block mb-1">Assigned Staff:</span>
                              <select required value={assignments['MS-4'] || ''} onChange={(e) => setAssignments({ ...assignments, 'MS-4': e.target.value })} className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-500">
                                <option value="">-- Select Staff ▼ --</option>
                                {staticData.staff.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </select>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3 pt-2 border-t border-slate-850">
                          <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">HSD (Diesel)</span>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-200">HSD-3</label>
                              <span className="text-[10px] text-slate-400 block mb-1">Assigned Staff:</span>
                              <select required value={assignments['HSD-3'] || ''} onChange={(e) => setAssignments({ ...assignments, 'HSD-3': e.target.value })} className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-500">
                                <option value="">-- Select Staff ▼ --</option>
                                {staticData.staff.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-200">HSD-4</label>
                              <span className="text-[10px] text-slate-400 block mb-1">Assigned Staff:</span>
                              <select required value={assignments['HSD-4'] || ''} onChange={(e) => setAssignments({ ...assignments, 'HSD-4': e.target.value })} className="block w-full rounded-lg border border-slate-700 bg-slate-950 py-2 px-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-500">
                                <option value="">-- Select Staff ▼ --</option>
                                {staticData.staff.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-950 px-8 py-4 border-t border-slate-850 space-y-3">
              {errorMessage && (
                <div className="bg-red-950/90 border border-red-500/80 p-3 rounded-xl flex items-center justify-between gap-3 text-red-200 text-xs font-bold animate-pulse shadow-lg">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                    <span>⚠️ Validation Required: {errorMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorMessage(null)}
                    className="text-[10px] text-red-300 hover:text-white underline font-bold shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div className="flex justify-between items-center">
                <div>
                  {wizardStep === 'review' && (
                    <button
                      onClick={() => setWizardStep(1)}
                      className="px-5 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all"
                    >
                      ← Back / Edit Inputs
                    </button>
                  )}
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setWizardOpen(false)}
                    className="px-5 py-2.5 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-350 text-xs font-bold transition-all"
                  >
                    Close Wizard
                  </button>

                  {wizardStep === 'firstDuty' && (
                    <button
                      onClick={handleStartFirstDutyStep}
                      disabled={actionLoading}
                      className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md"
                    >
                      {actionLoading ? 'Initializing First Duty...' : 'Start First Duty'}
                    </button>
                  )}

                  {wizardStep === 1 && (
                    <button
                      onClick={handleProceedToReview}
                      disabled={actionLoading}
                      className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md"
                    >
                      Proceed to Final Review →
                    </button>
                  )}

                  {wizardStep === 'review' && (
                    <button
                      onClick={handleConfirmCloseDuty}
                      disabled={actionLoading}
                      className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-md"
                    >
                      {actionLoading ? 'Closing Duty...' : `CONFIRM & CLOSE DUTY #${activeDuty?.dutyNumber || ''}`}
                    </button>
                  )}

                  {wizardStep === 2 && (
                    <button
                      onClick={handleStartNewDutyStep}
                      disabled={actionLoading}
                      className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md"
                    >
                      {actionLoading ? 'Opening Shift...' : 'Initialize Next Duty Shift'}
                    </button>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
      {/* OWNER METER READING CORRECTION MODAL */}
      {editingReading && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Edit className="h-5 w-5 text-indigo-400" />
                Owner Meter Reading Correction
              </h3>
              <button onClick={() => setEditingReading(null)} className="text-slate-400 hover:text-slate-200 text-xs font-bold">✕</button>
            </div>

            <div className="text-xs text-slate-300 space-y-1.5 bg-slate-950 p-3.5 rounded-xl border border-slate-800 font-mono">
              <p><strong className="text-indigo-400 font-sans">Gun:</strong> {editingReading.gun?.name} ({editingReading.gun?.fuelType})</p>
              <p><strong className="text-slate-400 font-sans">Opening Reading:</strong> {editingReading.previousReading}</p>
              <p><strong className="text-slate-400 font-sans">Current Closing Reading:</strong> {editingReading.currentReading}</p>
              <p><strong className="text-slate-400 font-sans">Applied Rate:</strong> ₹{editingReading.priceUsed}</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">New Closing Reading</label>
                <input
                  type="number"
                  step="0.01"
                  value={newReadingVal}
                  onChange={(e) => setNewReadingVal(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white font-mono font-bold text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">Correction Reason / Security Audit Note</label>
                <input
                  type="text"
                  placeholder="e.g. Closing reading entry typo fixed by Owner"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {newReadingVal < editingReading.previousReading && (
              <p className="text-xs text-red-400 font-bold bg-red-950/40 p-2.5 rounded-lg border border-red-500/20">
                ⚠️ Closing reading cannot be lower than opening reading ({editingReading.previousReading}).
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setEditingReading(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateReading}
                disabled={isSubmittingReadingEdit || newReadingVal < editingReading.previousReading}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-lg"
              >
                {isSubmittingReadingEdit ? 'Saving Correction...' : 'Save Correction & Audit Log'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STAFF ATTENDANCE STATUS CORRECTION MODAL */}
      {statusCorrectionModal?.open && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-indigo-400" />
                <h3 className="font-extrabold text-white text-sm uppercase tracking-wider">Correct Attendance Status</h3>
              </div>
              <button
                onClick={() => setStatusCorrectionModal(null)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Staff Member:</span>
                <span className="font-bold text-white">{statusCorrectionModal.staffName}</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-slate-400">Duty Session:</span>
                <span className="font-bold text-indigo-400">Duty #{statusCorrectionModal.dutyNumber}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Current Status:</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-900 text-slate-300 border border-slate-700">
                  {statusCorrectionModal.currentStatus}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">New Attendance Status</label>
                <select
                  value={statusCorrectionModal.newStatus}
                  onChange={(e) => setStatusCorrectionModal({
                    ...statusCorrectionModal,
                    newStatus: e.target.value as any
                  })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold focus:border-indigo-500 focus:outline-none"
                >
                  <option value="PRESENT">PRESENT (Assigned & Attended)</option>
                  <option value="ABSENT">ABSENT (Owner/Manager Marked Absent)</option>
                  <option value="NOT_SCHEDULED">NOT SCHEDULED (Not Assigned)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Correction Note / Reason</label>
                <input
                  type="text"
                  placeholder="e.g. Authorized leave / Owner correction"
                  value={statusCorrectionModal.reason}
                  onChange={(e) => setStatusCorrectionModal({
                    ...statusCorrectionModal,
                    reason: e.target.value
                  })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setStatusCorrectionModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const key = `${statusCorrectionModal.dutyId}_${statusCorrectionModal.staffId}`;
                  setAttendanceOverrides(prev => ({
                    ...prev,
                    [key]: statusCorrectionModal.newStatus
                  }));

                  // Append Audit Log
                  setAttendanceAuditLogs(prev => [
                    {
                      id: 'aud_' + Date.now(),
                  staffName: statusCorrectionModal.staffName,
                  dutyNumber: statusCorrectionModal.dutyNumber,
                  oldStatus: statusCorrectionModal.currentStatus,
                  newStatus: statusCorrectionModal.newStatus,
                  changedBy: `${session.username} (${session.role})`,
                  timestamp: new Date().toLocaleString(),
                  reason: statusCorrectionModal.reason || 'Manual owner status override'
                },
                ...prev
              ]);

              setStatusCorrectionModal(null);
            }}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-lg"
          >
            Save Attendance Status
          </button>
        </div>
      </div>
    </div>
  )}

  {/* INDIVIDUAL STAFF ATTENDANCE HISTORY MODAL */}
  {staffHistoryModal?.open && (() => {
    const detailStaff = (monthlyAttData?.summary || []).find((s: any) => s.staffId === staffHistoryModal.staffId);

    let historyEntries: any[] = [];
    let totalDays = 0;

    if (detailStaff && detailStaff.details && detailStaff.details.length > 0) {
      historyEntries = detailStaff.details;
      totalDays = detailStaff.workedDays;
    } else {
      const combinedDuties = [
        ...initialHistoricalDuties,
        ...(initialActiveDuty && !initialHistoricalDuties.some((d: any) => d.id === initialActiveDuty.id) ? [initialActiveDuty] : [])
      ];

      historyEntries = combinedDuties
        .filter((d: any) => (d.assignments || []).some((as: any) => as.staffId === staffHistoryModal.staffId || as.staff?.id === staffHistoryModal.staffId || as.staff?.name === staffHistoryModal.staffName))
        .map((d: any) => {
          const startObj = new Date(d.startTime);
          const dateStr = startObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
          const overrideKey = `${d.id}_${staffHistoryModal.staffId}`;
          const status = attendanceOverrides[overrideKey] || 'PRESENT';
          const wDays = status === 'ABSENT' ? 0 : 1.0;
          return {
            id: d.id,
            date: dateStr,
            dutyNumber: d.dutyNumber,
            workedDays: wDays,
            status,
            remarks: '-'
          };
        });
      totalDays = historyEntries.reduce((acc, curr) => acc + curr.workedDays, 0);
    }

    const formatDays = (days: number) => Number.isInteger(days) ? days.toString() : days.toFixed(2).replace(/\.?0+$/, '');

    return (
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 font-extrabold flex items-center justify-center text-xs shrink-0 font-mono">
                {staffHistoryModal.staffName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="font-extrabold text-white text-base font-sans">{staffHistoryModal.staffName} — Attendance History</h3>
                <p className="text-xs text-slate-400 font-mono">Working Days Register</p>
              </div>
            </div>
            <button
              onClick={() => setStaffHistoryModal(null)}
              className="text-slate-400 hover:text-white text-sm font-bold bg-slate-800 px-3 py-1.5 rounded-lg cursor-pointer"
            >
              ✕ Close
            </button>
          </div>

          {/* History Table */}
          <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase font-bold font-mono text-[10px]">
                  <th className="p-3">Date</th>
                  <th className="p-3">Duty</th>
                  <th className="p-3">Pumps / Nozzles</th>
                  <th className="p-3 text-right">Working Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 font-mono">
                {historyEntries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-500 italic font-sans">No duty history records found.</td>
                  </tr>
                ) : (
                  historyEntries.map((r, idx) => (
                    <tr key={r.id || idx} className="hover:bg-slate-900/50">
                      <td className="p-3 font-sans font-bold text-slate-200">{r.date}</td>
                      <td className="p-3 font-bold text-indigo-400">#{r.dutyNumber}</td>
                      <td className="p-3 text-indigo-300 font-sans text-xs">{r.pumpNozzleStr || r.gunName || r.pumpName || '-'}</td>
                      <td className="p-3 text-right font-black text-indigo-300">{formatDays(r.workedDays)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
              </div>
            </div>
          </div>
        );
      })()}


      {/* Toast Notification Container */}
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />

      {/* Guided Walkthrough Tour Modal */}
      <FirstTimeWalkthroughModal isOpen={tourOpen} onClose={() => setTourOpen(false)} />

      {/* MOBILE BOTTOM NAVIGATION BAR (lg:hidden) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[var(--bg-surface)] border-t border-[var(--border-color)] flex items-center justify-around z-40 px-2 shadow-xl pb-safe transition-colors duration-200"
      >
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 text-[11px] font-semibold transition-all touch-target-44 ${activeTab === 'dashboard'
              ? 'text-blue-600 dark:text-blue-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          aria-label="Home Dashboard"
        >
          <LayoutDashboard className="h-5 w-5" />
          <span>Home</span>
        </button>

        <button
          onClick={() => setActiveTab('current-duty')}
          className={`flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 text-[11px] font-semibold relative transition-all touch-target-44 ${activeTab === 'current-duty'
              ? 'text-blue-600 dark:text-blue-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          aria-label="Current Duty"
        >
          <Activity className="h-5 w-5" />
          <span>Duty</span>
          {activeDuty ? (
            <span className="absolute top-1 right-2.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          ) : (
            <span className="absolute top-1 right-2.5 h-1.5 w-1.5 rounded-full bg-red-400" />
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('reports');
            setReportsTab('sales');
          }}
          className={`flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 text-[11px] font-semibold transition-all touch-target-44 ${activeTab === 'reports' && reportsTab === 'sales'
              ? 'text-blue-600 dark:text-blue-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          aria-label="Fuel Sales"
        >
          <DollarSign className="h-5 w-5" />
          <span>Sales</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('reports');
          }}
          className={`flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 text-[11px] font-semibold transition-all touch-target-44 ${activeTab === 'reports' && reportsTab !== 'sales'
              ? 'text-blue-600 dark:text-blue-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          aria-label="All Reports"
        >
          <BarChart3 className="h-5 w-5" />
          <span>Reports</span>
        </button>

        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-all touch-target-44"
          aria-label="Open Full Menu"
        >
          <Menu className="h-5 w-5" />
          <span>Menu</span>
        </button>
      </nav>

      {/* EDIT ATTENDANCE MODAL */}
      {showEditAttModal && editingAttRecord && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                  <Edit className="h-5 w-5 text-indigo-400" />
                  Edit Attendance Entry
                </h3>
                <p className="text-[11px] text-slate-400">Modify working days counter or status for staff shift</p>
              </div>
              <button onClick={() => setShowEditAttModal(false)} className="text-slate-400 hover:text-white text-sm font-bold">✕</button>
            </div>

            <form onSubmit={handleSubmitEditAtt} className="space-y-4 text-xs">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 space-y-1 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Staff Member:</span>
                  <span className="font-bold text-white font-sans">{editAttStaffName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Duty Session:</span>
                  <span className="font-bold text-indigo-400">Duty #{editAttDutyNumber}</span>
                </div>
                {editAttDate && (
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">Date:</span>
                    <span className="font-bold text-slate-300">{editAttDate}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Attendance Status *</label>
                <select
                  value={editAttStatusInput}
                  onChange={(e) => {
                    const st = e.target.value;
                    setEditAttStatusInput(st);
                    if (st === 'ABSENT') {
                      setEditAttDaysInput('0');
                    } else if (st === 'PRESENT' && (editAttDaysInput === '0' || editAttDaysInput === 0)) {
                      setEditAttDaysInput('1.0');
                    } else if (st === 'PARTIAL' || st === 'EMERGENCY') {
                      if (editAttDaysInput === '1.0' || editAttDaysInput === 1) setEditAttDaysInput('0.5');
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold text-xs focus:border-indigo-500 focus:outline-none"
                >
                  <option value="PRESENT">PRESENT (1.0 Working Day)</option>
                  <option value="PARTIAL">PARTIAL (Partial Shift)</option>
                  <option value="EMERGENCY">EMERGENCY (Emergency Exit)</option>
                  <option value="ABSENT">ABSENT (0.0 Working Days)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Working Days Value (e.g. 1.0, 0.5, 0.25, 0) *</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="2"
                  required
                  value={editAttDaysInput}
                  onChange={(e) => setEditAttDaysInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono font-bold text-sm focus:border-indigo-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 block mt-1">
                  Assigned = 1.0 day, Absent = 0.0 days, Emergency = 0.5 days. Changeable to any decimal.
                </span>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Remarks / Reason (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Left due to emergency"
                  value={editAttRemarksInput}
                  onChange={(e) => setEditAttRemarksInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end border-t border-slate-800 pt-3 gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditAttModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEditAtt}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md disabled:opacity-50"
                >
                  {isSubmittingEditAtt ? 'Updating...' : 'Save Attendance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DAILY ATTENDANCE BREAKDOWN MODAL */}
      {showAttDetailModal && detailModalStaff && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-extrabold text-white text-base">
                  Daily Attendance Breakdown: {detailModalStaff.staffName}
                </h3>
                <p className="text-xs text-slate-400">
                  Total Working Days: <strong className="text-indigo-400 font-mono text-sm">{detailModalStaff.workedDays} Days</strong>
                </p>
              </div>
              <button onClick={() => setShowAttDetailModal(false)} className="text-slate-400 hover:text-white text-sm font-bold bg-slate-800 px-3 py-1.5 rounded-lg cursor-pointer">✕ Close</button>
            </div>

            <div className="overflow-x-auto border border-slate-850 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 uppercase font-bold text-[10px] border-b border-slate-850 font-mono">
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Duty</th>
                    <th className="p-2.5">Pump / Nozzle</th>
                    <th className="p-2.5 text-center">Status</th>
                    <th className="p-2.5 text-right">Working Days</th>
                    <th className="p-2.5">Remarks</th>
                    <th className="p-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
                  {(!detailModalStaff.details || detailModalStaff.details.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-slate-500 italic font-sans">No attendance records for this period.</td>
                    </tr>
                  ) : (
                    detailModalStaff.details.map((record: any) => (
                      <tr key={record.id} className="hover:bg-slate-950/40">
                        <td className="p-2.5 font-bold text-white font-sans">{record.date}</td>
                        <td className="p-2.5 font-bold text-indigo-400">Duty #{record.dutyNumber}</td>
                        <td className="p-2.5 font-sans text-slate-300">{record.pumpName} ({record.gunName})</td>
                        <td className="p-2.5 text-center font-sans">
                          {record.status === 'PRESENT' && <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold">PRESENT</span>}
                          {record.status === 'ABSENT' && <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 text-[10px] font-bold">ABSENT</span>}
                          {(record.status === 'PARTIAL' || record.status === 'PARTIAL_DUTY') && <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[10px] font-bold">PARTIAL</span>}
                          {record.status === 'EMERGENCY' && <span className="px-2 py-0.5 rounded bg-orange-950 text-orange-300 border border-orange-800 text-[10px] font-bold">EMERGENCY</span>}
                          {record.status === 'REPLACEMENT' && <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 text-[10px] font-bold">REPLACEMENT</span>}
                        </td>
                        <td className="p-2.5 text-right font-black text-indigo-300">{record.workedDays}</td>
                        <td className="p-2.5 font-sans text-slate-400 text-[10px]">{record.remarks || record.reason || '-'}</td>
                        <td className="p-2.5 text-center font-sans">
                          <button
                            type="button"
                            onClick={() => handleOpenEditAtt(record)}
                            className="px-2.5 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold cursor-pointer"
                          >
                            Edit
                          </button>
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

      {/* ADD / EDIT EMAIL RECIPIENT MODAL */}
      {showRecipientModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                  <Mail className="h-5 w-5 text-indigo-400" />
                  {editingRecipient ? 'Edit Email Recipient' : 'Add Email Recipient'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {editingRecipient ? 'Update recipient details & notification preferences' : 'Configure a new email recipient stored in database'}
                </p>
              </div>
              <button onClick={() => setShowRecipientModal(false)} className="text-slate-400 hover:text-white text-sm font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveEmailRecipient} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-bold block mb-1">Recipient Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Owner, Manager, Accountant, Operations"
                  value={recNameInput}
                  onChange={(e) => setRecNameInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-medium text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. recipient@example.com"
                  value={recEmailInput}
                  onChange={(e) => setRecEmailInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="space-y-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Notifications Subscriptions</span>

                <label className="flex items-center gap-2.5 text-slate-200 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={recDutyReportsInput}
                    onChange={(e) => setRecDutyReportsInput(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                  />
                  Duty Closing Summary Reports
                </label>

                <label className="flex items-center gap-2.5 text-slate-200 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={recLowStockInput}
                    onChange={(e) => setRecLowStockInput(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                  />
                  Low Fuel Stock Alerts (≤ 6,000 L)
                </label>
              </div>

              <div className="flex justify-end border-t border-slate-800 pt-3 gap-2">
                <button
                  type="button"
                  onClick={() => setShowRecipientModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingRecipient}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md disabled:opacity-50"
                >
                  {isSavingRecipient ? 'Saving...' : 'Save Recipient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* RESET CURRENT PUMP READINGS MODAL */}
      {showClearReadingsModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-indigo-800/60 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl text-slate-100">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-indigo-400 font-extrabold text-base">
                <RefreshCw className="h-5 w-5 text-indigo-400" />
                <span>Reset Current Pump Readings?</span>
              </div>
              <button onClick={() => setShowClearReadingsModal(false)} className="text-slate-400 hover:text-white font-bold">✕</button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This will clear current uncommitted pump reading inputs only. Past duties, reports, sales, stock records and historical meter readings will not be deleted.
            </p>

            <div className="bg-indigo-950/40 border border-indigo-500/30 p-3 rounded-xl text-[11px] text-indigo-200 space-y-1">
              <p>✓ <strong>Active Duty:</strong> Preserved and remains active.</p>
              <p>✓ <strong>Opening Readings &amp; Stock:</strong> Untouched.</p>
              <p>✓ <strong>Past Reports &amp; Audit Logs:</strong> Never affected.</p>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setShowClearReadingsModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearCurrentInputs}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reset Pump Readings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL SYSTEM RESET MODAL (OWNER ONLY) */}
      {showResetModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-700/60 rounded-2xl p-6 max-w-lg w-full space-y-5 shadow-2xl text-slate-100">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400 font-black text-lg">
                <ShieldAlert className="h-6 w-6 animate-pulse" />
                <span>FULL SYSTEM RESET (OWNER ONLY)</span>
              </div>
              <button onClick={() => setShowResetModal(false)} className="text-slate-400 hover:text-white font-bold">✕</button>
            </div>

            <div className="bg-rose-950/60 border border-rose-500/50 p-4 rounded-xl space-y-2 text-xs text-rose-200">
              <p className="font-extrabold text-sm text-rose-300 uppercase tracking-wide">⚠️ EXTREMELY DANGEROUS OPERATION</p>
              <p>You are about to reset the petrol pump management system. All operational data (duty sessions, meter readings, expenses, credit transactions, oil sales) will be permanently cleared.</p>
              <p className="text-rose-300 font-semibold">• Owner &amp; Manager User Accounts will NOT be deleted.</p>
              <p className="text-rose-300 font-semibold">• Pump, Gun, and Staff configurations will survive.</p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-bold block mb-1">
                  Step 1: Type <span className="font-mono text-rose-400 font-extrabold uppercase">RESET SYSTEM</span> to confirm *
                </label>
                <input
                  type="text"
                  required
                  placeholder="RESET SYSTEM"
                  value={resetTextInput}
                  onChange={(e) => setResetTextInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono text-xs focus:border-rose-500 focus:outline-none"
                />
                {resetTextInput && resetTextInput.trim().toUpperCase() !== 'RESET SYSTEM' && (
                  <p className="text-[11px] text-amber-400 font-semibold mt-1 flex items-center gap-1">
                    ⚠️ Type exact words <span className="font-mono font-bold">RESET SYSTEM</span> (not your username &quot;owner&quot;)
                  </p>
                )}
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">
                  Step 2: Enter Owner Account Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter Owner Password"
                  value={resetPasswordInput}
                  onChange={(e) => setResetPasswordInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono text-xs focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSystemReset}
                disabled={isResettingSystem || resetTextInput.trim().toUpperCase() !== 'RESET SYSTEM' || !resetPasswordInput}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-lg disabled:opacity-50 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                <AlertTriangle className="h-4 w-4" />
                {isResettingSystem ? 'Resetting System...' : 'EXECUTE FULL SYSTEM RESET'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HANDOVER / LEAVE DUTY MODAL */}
      {showHandoverModal && handoverTarget && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-indigo-400" />
                  Shift Handover / Leave Duty
                </h3>
                <p className="text-[11px] text-slate-400">Transfer nozzle responsibility to another staff member or end shift</p>
              </div>
              <button onClick={() => setShowHandoverModal(false)} className="text-slate-400 hover:text-white text-sm font-bold">✕</button>
            </div>

            <form onSubmit={handleSubmitHandover} className="space-y-4 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 space-y-1">
                <div className="text-slate-400 text-[11px]">
                  Outgoing Staff: <strong className="text-white font-bold">{handoverTarget.outgoingStaffName}</strong>
                </div>
                <div className="text-slate-400 text-[11px]">
                  Pump / Nozzle: <strong className="text-indigo-400 font-bold">{handoverTarget.pumpName || 'Pump'} ({handoverTarget.gunName || 'Nozzle'})</strong>
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Who is taking over this pump?</label>
                <select
                  value={incomingStaffInput}
                  onChange={(e) => setIncomingStaffInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-medium text-xs focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">-- No Replacement (End Responsibility) --</option>
                  {(staticData.staff || [])
                    .filter((s: any) => s.id !== handoverTarget.outgoingStaffId && s.active)
                    .map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
                <span className="text-[10px] text-slate-500 block mt-1">
                  Select replacement employee taking over, or choose &quot;No Replacement&quot; if nobody takes over.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-bold block mb-1">Handover Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={handoverTimeInput}
                    onChange={(e) => setHandoverTimeInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-bold block mb-1">Handover Meter Reading *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={handoverMeterInput}
                    onChange={(e) => setHandoverMeterInput(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Outgoing Staff Status</label>
                <select
                  value={handoverStatusInput}
                  onChange={(e) => setHandoverStatusInput(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium text-xs focus:border-indigo-500 focus:outline-none"
                >
                  <option value="EMERGENCY">Emergency Leave</option>
                  <option value="PARTIAL_DUTY">Partial Duty Shift</option>
                  <option value="EARLY_EXIT">Early Shift Exit</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Reason / Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Medical emergency, Shift rotation, Family issue"
                  value={handoverReasonInput}
                  onChange={(e) => setHandoverReasonInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end border-t border-slate-800 pt-3 gap-2">
                <button
                  type="button"
                  onClick={() => setShowHandoverModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingHandover}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md disabled:opacity-50"
                >
                  {isSubmittingHandover ? 'Saving...' : 'Confirm Handover'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MARK ABSENT MODAL */}
      {showAbsentModal && absentTarget && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-rose-400" />
                  Mark Staff Absent
                </h3>
                <p className="text-[11px] text-slate-400">Record absenteeism for assigned employee who did not report</p>
              </div>
              <button onClick={() => setShowAbsentModal(false)} className="text-slate-400 hover:text-white text-sm font-bold">✕</button>
            </div>

            <form onSubmit={handleSubmitAbsent} className="space-y-4 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 space-y-1">
                <div className="text-slate-400 text-[11px]">
                  Assigned Staff: <strong className="text-rose-400 font-bold">{absentTarget.staffName}</strong>
                </div>
                <div className="text-slate-400 text-[11px]">
                  Pump / Gun: <strong className="text-white font-bold">{absentTarget.gunName || 'Nozzle'}</strong>
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Replacement Staff (Optional)</label>
                <select
                  value={absentReplacementInput}
                  onChange={(e) => setAbsentReplacementInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-medium text-xs focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">-- No Immediate Replacement --</option>
                  {(staticData.staff || [])
                    .filter((s: any) => s.id !== absentTarget.staffId && s.active)
                    .map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Reason</label>
                <input
                  type="text"
                  required
                  value={absentReasonInput}
                  onChange={(e) => setAbsentReasonInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-indigo-500 focus:outline-none"
                  placeholder="e.g. Did not report, Sick leave, Uninformed absence"
                />
              </div>

              <div className="flex justify-end border-t border-slate-800 pt-3 gap-2">
                <button
                  type="button"
                  onClick={() => setShowAbsentModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAbsent}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md disabled:opacity-50"
                >
                  {isSubmittingAbsent ? 'Saving...' : 'Confirm Mark Absent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ATTENDANCE DETAIL & HISTORY BREAKDOWN MODAL */}
      {showAttDetailModal && detailModalStaff && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-4xl w-full space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-indigo-400" />
                  {detailModalStaff.staffName} — Attendance History & Breakdown
                </h3>
                <p className="text-[11px] text-slate-400">
                  Full duty history register, pump/nozzle assignments, and worked days calculation
                </p>
              </div>
              <button onClick={() => setShowAttDetailModal(false)} className="text-slate-400 hover:text-white text-sm font-bold cursor-pointer">✕</button>
            </div>

            {/* In-Modal Filter & Date Range Bar */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Period Filter</span>
                  <select
                    value={attFilterPreset}
                    onChange={async (e) => {
                      const p = e.target.value as any;
                      handleAttPresetChange(p);
                    }}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-bold text-xs focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="THIS_MONTH">This Month</option>
                    <option value="LAST_MONTH">Last Month</option>
                    <option value="WEEKLY">Last 7 Days (Weekly)</option>
                    <option value="CUSTOM">Custom Date Range</option>
                  </select>
                </div>

                {attFilterPreset === 'CUSTOM' || attFilterPreset === 'WEEKLY' ? (
                  <>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">From Date</span>
                      <input
                        type="date"
                        value={attCustomStartDate}
                        onChange={(e) => setAttCustomStartDate(e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-white font-bold text-xs focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">To Date</span>
                      <input
                        type="date"
                        value={attCustomEndDate}
                        onChange={(e) => setAttCustomEndDate(e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-white font-bold text-xs focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Month</span>
                      <select
                        value={attFilterMonth}
                        onChange={(e) => setAttFilterMonth(Number(e.target.value))}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-bold text-xs focus:border-indigo-500 focus:outline-none"
                      >
                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
                          <option key={i} value={i + 1}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Year</span>
                      <select
                        value={attFilterYear}
                        onChange={(e) => setAttFilterYear(Number(e.target.value))}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-bold text-xs focus:border-indigo-500 focus:outline-none"
                      >
                        {[2024, 2025, 2026, 2027].map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={async () => {
                  const fresh = await loadMonthlyAttendance();
                  if (fresh && fresh.summary) {
                    const st = fresh.summary.find((s: any) => s.staffId === detailModalStaff.staffId);
                    if (st) setDetailModalStaff(st);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow cursor-pointer flex items-center gap-1 shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh History
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3 text-center text-xs">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                <span className="text-[10px] text-slate-500 font-bold block">Worked Days</span>
                <span className="text-indigo-400 font-extrabold text-sm font-mono">{detailModalStaff.workedDays} Days</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                <span className="text-[10px] text-slate-500 font-bold block">Full Duties</span>
                <span className="text-emerald-400 font-extrabold text-sm font-mono">{detailModalStaff.fullDutiesCount}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                <span className="text-[10px] text-slate-500 font-bold block">Partial / Emergency</span>
                <span className="text-amber-400 font-extrabold text-sm font-mono">{detailModalStaff.partialDutiesCount}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                <span className="text-[10px] text-slate-500 font-bold block">Absences</span>
                <span className="text-rose-400 font-extrabold text-sm font-mono">{detailModalStaff.absentCount}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-bold sticky top-0">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Duty #</th>
                    <th className="p-2.5">Pump / Nozzle</th>
                    <th className="p-2.5">Start</th>
                    <th className="p-2.5">End</th>
                    <th className="p-2.5 text-center">Status</th>
                    <th className="p-2.5 text-right">Worked Days</th>
                    <th className="p-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 font-mono text-[11px]">
                  {(!detailModalStaff.details || detailModalStaff.details.length === 0) ? (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-slate-500 italic font-sans">No duty history records found for this period.</td>
                    </tr>
                  ) : (
                    detailModalStaff.details.map((d: any) => (
                      <tr key={d.id} className="hover:bg-slate-900/50">
                        <td className="p-2.5 text-slate-300 font-sans">{d.date}</td>
                        <td className="p-2.5 font-bold text-white">#{d.dutyNumber}</td>
                        <td className="p-2.5 text-indigo-300 font-sans">{d.pumpNozzleStr || (d.gunName ? `${d.pumpName} (${d.gunName})` : d.pumpName)}</td>
                        <td className="p-2.5 text-slate-300">{d.startTimeStr}</td>
                        <td className="p-2.5 text-slate-300">{d.endTimeStr}</td>
                        <td className="p-2.5 text-center font-sans">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${d.status === 'PRESENT' ? 'bg-emerald-500/20 text-emerald-400' :
                              d.status === 'ABSENT' ? 'bg-rose-500/20 text-rose-400' :
                                d.status === 'EMERGENCY' ? 'bg-amber-500/20 text-amber-300' :
                                  'bg-indigo-500/20 text-indigo-300'
                            }`}>
                            {d.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-bold text-white">{d.workedDays}</td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenEditAtt(d)}
                            className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] shadow transition-all cursor-pointer inline-flex items-center gap-1"
                            title="Edit attendance status and working days"
                          >
                            <Edit className="h-3 w-3" />
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setShowAttDetailModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold shadow cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT ATTENDANCE MODAL */}
      {showEditAttModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                  <Edit className="h-5 w-5 text-indigo-400" />
                  Edit Attendance
                </h3>
                <p className="text-[11px] text-slate-400">
                  {editAttStaffName} — Duty #{editAttDutyNumber} ({editAttDate})
                </p>
              </div>
              <button onClick={() => setShowEditAttModal(false)} className="text-slate-400 hover:text-white text-sm font-bold">✕</button>
            </div>

            <form onSubmit={handleSubmitEditAtt} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-bold block mb-1">Status</label>
                <select
                  value={editAttStatusInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditAttStatusInput(val);
                    if (val === 'PRESENT') setEditAttDaysInput(1.0);
                    else if (val === 'PARTIAL' || val === 'PARTIAL_DUTY') setEditAttDaysInput(0.5);
                    else if (val === 'ABSENT') setEditAttDaysInput(0.0);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-medium text-xs focus:border-indigo-500 focus:outline-none"
                >
                  <option value="PRESENT">Present (1.0 day)</option>
                  <option value="PARTIAL">Partial Duty (0.5 day)</option>
                  <option value="EMERGENCY">Emergency Exit (0.5 day)</option>
                  <option value="ABSENT">Absent (0.0 days)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Working Days</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="5"
                  required
                  value={editAttDaysInput}
                  onChange={(e) => setEditAttDaysInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold text-xs focus:border-indigo-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 block mt-1">
                  1.0 = Full Day, 0.5 = Half Day, 0.25 = Quarter Day, 0.0 = Absent
                </span>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Remarks (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Approved leave, shift adjustment"
                  value={editAttRemarksInput}
                  onChange={(e) => setEditAttRemarksInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end border-t border-slate-800 pt-3 gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditAttModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEditAtt}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md disabled:opacity-50"
                >
                  {isSubmittingEditAtt ? 'Saving...' : 'Save Attendance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DAY OPERATIONAL AUDIT & METER READING DRILL-DOWN MODAL */}
      {showDayDrillDownModal && selectedDayDrillDownDate && (() => {
        const dayDuties = (historicalDuties || []).filter((d: any) => {
          const dDate = d.date || (d.startTime ? d.startTime.slice(0, 10) : '');
          return dDate === selectedDayDrillDownDate;
        });

        // Collect all meter readings for this date
        let dayReadings: any[] = [];
        let dayDips: any[] = [];
        let dayTests: any[] = [];
        let dayMsVolume = 0;
        let dayHsdVolume = 0;
        let dayMsSales = 0;
        let dayHsdSales = 0;

        dayDuties.forEach((d: any) => {
          (d.meterReadings || []).forEach((mr: any) => {
            const litres = mr.litresSold || (mr.currentReading - mr.previousReading) || 0;
            const price = mr.priceUsed || (mr.gun?.fuelType === 'HSD' ? 100.08 : 112.15);
            const amount = mr.salesAmount || (litres * price);
            const fuelType = mr.gun?.fuelType || 'MS';

            if (fuelType === 'HSD') {
              dayHsdVolume += litres;
              dayHsdSales += amount;
            } else {
              dayMsVolume += litres;
              dayMsSales += amount;
            }

            dayReadings.push({
              dutyId: d.id,
              dutyNumber: d.dutyNumber || d.id,
              shift: d.shift || 'General',
              gunName: mr.gun?.name || mr.gunId || 'Nozzle',
              fuelType,
              openingReading: mr.previousReading,
              closingReading: mr.currentReading,
              intervals: mr.intervals || [],
              litresSold: litres,
              priceUsed: price,
              salesAmount: amount,
              staffName: mr.staff?.name || d.staffAttendance?.[0]?.staff?.name || 'Assigned Staff'
            });
          });

          if (d.tankDipReadings || d.tankDips) {
            dayDips.push(...(d.tankDipReadings || d.tankDips || []));
          }
          if (d.fuelTestings) {
            dayTests.push(...(d.fuelTestings || []));
          }
        });

        const dayTotalVolume = dayMsVolume + dayHsdVolume;
        const dayTotalSales = dayMsSales + dayHsdSales;
        const formattedDateStr = new Date(selectedDayDrillDownDate).toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });

        return (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[70] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full p-5 sm:p-7 shadow-2xl space-y-6 my-auto max-h-[90vh] overflow-y-auto">
              
              {/* HEADER */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[11px] font-mono font-bold">
                      {selectedDayDrillDownDate}
                    </span>
                    <span className="text-xs text-slate-400">• {dayDuties.length} Duty Shift(s)</span>
                  </div>
                  <h2 className="text-xl font-black text-white mt-1">
                    Daily Operational & Nozzle Meter Reading Audit
                  </h2>
                  <p className="text-xs text-slate-400">{formattedDateStr}</p>
                </div>
                <button
                  onClick={() => {
                    setShowDayDrillDownModal(false);
                    setSelectedDayDrillDownDate(null);
                  }}
                  className="self-end sm:self-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all flex items-center gap-2 cursor-pointer"
                >
                  ✕ Close Audit Modal
                </button>
              </div>

              {/* DAY SUMMARY KPI CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80">
                  <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-1">MS (Petrol) Total Sold</div>
                  <div className="text-xl font-extrabold text-white font-mono">{dayMsVolume.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</div>
                  <div className="text-xs font-semibold text-slate-400 mt-1">Revenue: ₹{dayMsSales.toLocaleString('en-IN')}</div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80">
                  <div className="text-[11px] font-bold text-blue-400 uppercase tracking-wider mb-1">HSD (Diesel) Total Sold</div>
                  <div className="text-xl font-extrabold text-white font-mono">{dayHsdVolume.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</div>
                  <div className="text-xs font-semibold text-slate-400 mt-1">Revenue: ₹{dayHsdSales.toLocaleString('en-IN')}</div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-indigo-500/30">
                  <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Total Fuel Volume & Revenue</div>
                  <div className="text-xl font-black text-indigo-300 font-mono">{dayTotalVolume.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</div>
                  <div className="text-xs font-bold text-emerald-400 mt-1">Total Sales: ₹{dayTotalSales.toLocaleString('en-IN')}</div>
                </div>
              </div>

              {/* ACTUAL NOZZLE METER READINGS AUDIT REGISTER */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                    Actual Nozzle Meter Readings ({selectedDayDrillDownDate})
                  </h3>
                  <span className="text-[11px] text-slate-400 italic">litres calculated directly from meter closing - opening</span>
                </div>

                <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900/90 text-slate-400 uppercase font-bold text-[10px] tracking-wider border-b border-slate-800 font-mono">
                        <th className="p-3">Duty #</th>
                        <th className="p-3">Nozzle</th>
                        <th className="p-3">Fuel</th>
                        <th className="p-3 text-right">Opening Reading</th>
                        <th className="p-3 text-right">Closing Reading</th>
                        <th className="p-3 text-right">Litres Sold</th>
                        <th className="p-3 text-right">Rate (₹)</th>
                        <th className="p-3 text-right">Sales Amount (₹)</th>
                        <th className="p-3">Staff Attendant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 font-mono text-[11px]">
                      {dayReadings.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-5 text-center text-slate-500 italic font-sans">
                            No meter reading entries logged for this date.
                          </td>
                        </tr>
                      ) : (
                        dayReadings.map((mr: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-900/50 transition-all">
                            <td className="p-3 font-bold text-indigo-400">Duty #{mr.dutyNumber}</td>
                            <td className="p-3 font-bold text-white">{mr.gunName}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                mr.fuelType === 'MS' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              }`}>
                                {mr.fuelType}
                              </span>
                            </td>
                            <td className="p-3 text-right text-slate-300">{mr.openingReading?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="p-3 text-right font-bold text-white">{mr.closingReading?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="p-3 text-right font-black text-emerald-400">{mr.litresSold?.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L</td>
                            <td className="p-3 text-right text-slate-400">₹{mr.priceUsed}</td>
                            <td className="p-3 text-right font-bold text-white">₹{mr.salesAmount?.toLocaleString('en-IN')}</td>
                            <td className="p-3 text-slate-300 font-sans">{mr.staffName}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* DUTIES CONDUCTED & COMPLETE RECORD DRILL-DOWN BUTTONS */}
              <div className="space-y-3 border-t border-slate-800 pt-4">
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                  Associated Duty Shift Operational Records
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dayDuties.map((d: any) => (
                    <div key={d.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-extrabold text-white text-sm">Duty #{d.dutyNumber || d.id}</div>
                        <div className="text-xs text-slate-400 mt-0.5">Shift: {d.shift || 'General'} | Status: <span className="text-emerald-400 font-bold">{d.status || 'CLOSED'}</span></div>
                        <div className="text-[11px] text-indigo-400 font-mono mt-1">
                          Total Duty Sales: ₹{(d.totalSales || d.meterReadings?.reduce((s: number, m: any) => s + (m.salesAmount || 0), 0) || 0).toLocaleString('en-IN')}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedDutyId(d.id);
                          setShowDayDrillDownModal(false);
                          setActiveTab('past-duty');
                        }}
                        className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shrink-0 flex items-center gap-1.5 cursor-pointer"
                      >
                        View Complete Record →
                      </button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}
