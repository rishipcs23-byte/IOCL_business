'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Fuel, LayoutDashboard, History, FileSpreadsheet, DollarSign, Settings,
  Activity, Users, ShieldAlert, LogOut, ArrowRight, UserCheck, CheckCircle2,
  AlertTriangle, Plus, Trash2, Calendar, FileText, ChevronRight, HelpCircle,
  Database, Info, TrendingUp, ArrowUpRight, ArrowDownRight, Wallet, HardDrive, BarChart3, CreditCard,
  Edit, Eye, Layers, Building2, Check, ChevronDown, Filter, Lock, ShieldCheck
} from 'lucide-react';
import {
  logoutAction, getActiveDutySession, startNewDutySession, saveMeterReadingsAction,
  addOilSaleAction, deleteOilSaleAction, addExpenseAction, deleteExpenseAction,
  addCreditTransactionAction, deleteCreditTransactionAction, recordTankDipAction,
  closeDutySessionAction, updateFuelPriceAction, addStaffAction, toggleStaffStatusAction,
  deleteStaffAction, addCustomerAction, toggleCustomerStatusAction, deleteCustomerAction,
  addOilProductAction, updateOilPriceAction, toggleOilProductStatusAction, deleteOilProductAction,
  getStaticData, getCreditLedgerReport, updateMeterReadingAction
} from '@/lib/actions';
import * as XLSX from 'xlsx';

const GUN_SORT_ORDER = ['MS-1', 'HSD-1', 'MS-2', 'HSD-2', 'MS-3', 'HSD-3', 'MS-4', 'HSD-4'];

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
  initialStockHistory,
  initialAuditLogs
}: DashboardContainerProps) {
  const router = useRouter();

  // Navigation State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'current-duty' | 'history' | 'reports' | 'pricing' | 'settings' | 'audit'>(
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
  const [stockHistory, setStockHistory] = useState<any[]>(initialStockHistory);
  const [auditLogs, setAuditLogs] = useState<any[]>(initialAuditLogs);

  // Loading States
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // --- Change Duty Wizard State ---
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1); // 1: Close active duty, 2: Start new duty

  // Closing form state
  const [closingReadings, setClosingReadings] = useState<Record<string, number>>({});
  const [openingReadings, setOpeningReadings] = useState<Record<string, number>>({});
  const [actualCash, setActualCash] = useState<number>(0);
  const [digitalPayments, setDigitalPayments] = useState<{
    phonepe: number;
    gpay: number;
    paytm: number;
    bharatpe: number;
    cards: number;
    bank: number;
  }>({ phonepe: 0, gpay: 0, paytm: 0, bharatpe: 0, cards: 0, bank: 0 });

  // Testing/Sample deduction state (both Owner and Manager can enter)
  const [msTestingLitres, setMsTestingLitres] = useState<number>(0);
  const [hsdTestingLitres, setHsdTestingLitres] = useState<number>(0);

  // Starting new duty form state
  const [newDutyStartTime, setNewDutyStartTime] = useState<string>('');
  const [assignments, setAssignments] = useState<Record<string, string>>({
    'Pump1_MS': '',
    'Pump1_HSD': '',
    'Pump2_MS': '',
    'Pump2_HSD': '',
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
  const [selectedLedgerCustomer, setSelectedLedgerCustomer] = useState<string>('ALL');
  const [isSubmittingCredit, setIsSubmittingCredit] = useState(false);

  const [dipFuelType, setDipFuelType] = useState<'MS' | 'HSD'>('MS');
  const [dipPhysical, setDipPhysical] = useState<number>(0);

  // Owner controls form state
  const [priceFuelType, setPriceFuelType] = useState<'MS' | 'HSD'>('MS');
  const [newFuelPrice, setNewFuelPrice] = useState<number>(0);
  const [priceEffectiveFrom, setPriceEffectiveFrom] = useState('');

  const [newStaffName, setNewStaffName] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddr, setNewCustAddr] = useState('');

  const [newOilName, setNewOilName] = useState('');
  const [newOilPrice, setNewOilPrice] = useState<number>(0);

  // Reports view states
  const [reportsTab, setReportsTab] = useState<'sales' | 'staff' | 'credit' | 'expenses' | 'oil' | 'stock' | 'cash'>('sales');

  // Owner Verification Filter & Reading Correction Modal state
  const [selectedDutyId, setSelectedDutyId] = useState<string>('CURRENT');
  const [filterStaffId, setFilterStaffId] = useState<string>('ALL');
  const [filterPumpId, setFilterPumpId] = useState<string>('ALL');
  const [editingReading, setEditingReading] = useState<any>(null);
  const [newReadingVal, setNewReadingVal] = useState<number>(0);
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [isSubmittingReadingEdit, setIsSubmittingReadingEdit] = useState<boolean>(false);
  const [expandedPumpId, setExpandedPumpId] = useState<string | null>(null);

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

  // Update readings state when activeDuty session initializes or changes ID, PRESERVING user-entered inputs
  useEffect(() => {
    if (activeDuty) {
      setClosingReadings((prev) => {
        const next = { ...prev };
        for (const mr of activeDuty.meterReadings) {
          if (next[mr.gunId] === undefined) {
            next[mr.gunId] = mr.currentReading || 0;
          }
        }
        return next;
      });

      setOngoingReadings((prev) => {
        const next = { ...prev };
        for (const mr of activeDuty.meterReadings) {
          if (next[mr.gunId] === undefined) {
            next[mr.gunId] = mr.currentReading || 0;
          }
        }
        return next;
      });
    }
  }, [activeDuty?.id]);

  const flashMessage = (msg: string, type: 'success' | 'error') => {
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
  const GUN_SORT_ORDER = ['MS-1', 'HSD-1', 'MS-2', 'HSD-2', 'MS-3', 'HSD-3', 'MS-4', 'HSD-4'];
  const getSortedReadings = (readings: any[]) => {
    if (!readings) return [];
    return [...readings].sort((a, b) => {
      const idxA = GUN_SORT_ORDER.indexOf(a.gun?.name);
      const idxB = GUN_SORT_ORDER.indexOf(b.gun?.name);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
  };

  const handleSaveOngoingReadings = async () => {
    if (!activeDuty) return;

    // Check validation: Current Reading cannot be lower than previous reading
    for (const mr of activeDuty.meterReadings) {
      const val = ongoingReadings[mr.gunId];
      if (val !== undefined && val !== null && !isNaN(Number(val)) && Number(val) < mr.previousReading) {
        flashMessage(`Current reading cannot be lower than previous reading for ${mr.gun.name}.`, 'error');
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
        router.refresh();
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
      const updatedLedger = await getCreditLedgerReport();
      if (updatedLedger) {
        setCreditLedger(updatedLedger);
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
        flashMessage('Oil sale logged successfully.', 'success');
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
      flashMessage('Oil sale deleted.', 'success');
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
        flashMessage('Expense logged successfully.', 'success');
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
      flashMessage('Expense deleted.', 'success');
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
      prodName = 'CASH COLLECTION';
      if (creditAmount <= 0) {
        const msg = 'Please enter a valid Cash Collection Amount (₹).';
        console.warn("[ADD CREDIT VALIDATION FAIL]", msg);
        flashMessage(msg, 'error');
        return;
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
        creditDesc ? creditDesc.trim() : undefined
      );

      console.log("[ADD CREDIT DEBUG] Server Action Response:", res);

      if (res && res.success) {
        // Reset input fields cleanly
        setIndentNumber('');
        setCreditLitres(0);
        setCreditUnitPrice(0);
        setCreditAmount(0);
        setCreditDesc('');

        // Refresh active duty and customer ledger state from database
        await refreshActiveDuty();

        flashMessage(
          creditType === 'CREDIT_SALE'
            ? `Credit sale of ₹${finalAmount.toFixed(2)} logged to customer ledger.`
            : `Cash collection of ₹${finalAmount.toFixed(2)} recorded in ledger.`,
          'success'
        );
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

  const handleDeleteCredit = async (id: string) => {
    if (!confirm('Are you sure you want to delete this credit transaction?')) return;
    setActionLoading(true);
    try {
      const res = await deleteCreditTransactionAction(id);
      if (res && res.success) {
        flashMessage('Credit transaction reversed.', 'success');
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
      const prevVal = openingReadings[mr.gunId] !== undefined ? openingReadings[mr.gunId] : mr.previousReading;
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
      const prevVal = openingReadings[mr.gunId] !== undefined ? openingReadings[mr.gunId] : mr.previousReading;
      const val = closingReadings[mr.gunId] !== undefined ? closingReadings[mr.gunId] : mr.currentReading;
      return sum + Math.max(0, val - prevVal);
    }, 0) || 0;

  const hsdPrice = activeDuty?.meterReadings?.find((mr: any) => mr.gun.fuelType === 'HSD')?.priceUsed || 100.08;
  const hsdActualLitres = Math.max(0, hsdLitresRaw - hsdTestingLitres);
  const totalHsdSalesAmount = hsdActualLitres * hsdPrice;
  const hsdTestingValue = hsdTestingLitres * hsdPrice;
  const totalTestingValue = msTestingValue + hsdTestingValue;

  // 3. Combined Fuel Sales & Revenue
  const grossFuelSalesTotal = (msLitresRaw * msPrice) + (hsdLitresRaw * hsdPrice);
  const dynamicFuelLitresTotal = msLitresRaw + hsdLitresRaw;
  const dynamicFuelSalesTotal = totalMsSalesAmount + totalHsdSalesAmount;
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

  // Expected Cash calculation based on accounting flow
  const digitalPaymentsSum = Object.values(digitalPayments).reduce((sum, val) => sum + Number(val), 0);
  const grossRevenueInflow = grossFuelSalesTotal + oilSalesTotal + creditCollectionsCash;
  const totalDeductions = creditSalesAmount + digitalPaymentsSum + expensesPaidInCash + totalTestingValue;
  const expectedCash = grossRevenueInflow - totalDeductions;
  const cashDiff = actualCash - expectedCash;

  const handleCloseActiveDutyStep = async () => {
    if (!activeDuty) return;
    setActionLoading(true);
    setErrorMessage(null);
    try {
      // 1. First save the closing and opening meter readings entered in the form
      const readingsPayload = activeDuty.meterReadings.map((mr: any) => ({
        gunId: mr.gunId,
        currentReading: closingReadings[mr.gunId] !== undefined ? Number(closingReadings[mr.gunId]) : mr.currentReading,
        previousReading: openingReadings[mr.gunId] !== undefined ? Number(openingReadings[mr.gunId]) : mr.previousReading,
      }));

      await saveMeterReadingsAction(activeDuty.id, readingsPayload);

      // 2. Call the close action
      const res = await closeDutySessionAction(
        activeDuty.id,
        Number(actualCash),
        digitalPaymentsSum,
        0, // Card payments represented in digitalPayments.cards
        expectedCash
      );

      if (res.success) {
        // Move to starting new duty configuration
        setWizardStep(2);
        flashMessage('Current duty session closed successfully. Now, set up the next duty.', 'success');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to close duty');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartNewDutyStep = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const pumpAssignments: { pumpId: string, fuelType: string, staffId: string }[] = [];

      const pump1 = staticData.pumps.find((p: any) => p.name === 'Pump 1');
      const pump2 = staticData.pumps.find((p: any) => p.name === 'Pump 2');

      if (pump1) {
        if (!assignments.Pump1_MS || !assignments.Pump1_HSD) {
          throw new Error('Please assign staff to both MS and HSD for Pump 1');
        }
        pumpAssignments.push({ pumpId: pump1.id, fuelType: 'MS', staffId: assignments.Pump1_MS });
        pumpAssignments.push({ pumpId: pump1.id, fuelType: 'HSD', staffId: assignments.Pump1_HSD });
      }

      if (pump2) {
        if (!assignments.Pump2_MS || !assignments.Pump2_HSD) {
          throw new Error('Please assign staff to both MS and HSD for Pump 2');
        }
        pumpAssignments.push({ pumpId: pump2.id, fuelType: 'MS', staffId: assignments.Pump2_MS });
        pumpAssignments.push({ pumpId: pump2.id, fuelType: 'HSD', staffId: assignments.Pump2_HSD });
      }

      const res = await startNewDutySession(newDutyStartTime, pumpAssignments);
      if (res.success) {
        flashMessage(`Duty session #${activeDuty ? activeDuty.dutyNumber + 1 : 100} started.`, 'success');
        setWizardOpen(false);
        setWizardStep(1);
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
      await updateFuelPriceAction(priceFuelType, newFuelPrice, priceEffectiveFrom);
      flashMessage(`Updated ${priceFuelType} price to ₹${newFuelPrice}`, 'success');
      setNewFuelPrice(0);
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

  const handleToggleStaff = async (id: string, active: boolean) => {
    setActionLoading(true);
    try {
      await toggleStaffStatusAction(id, active);
      flashMessage(`Staff member ${active ? 'enabled' : 'disabled'} successfully.`, 'success');
      router.refresh();
    } catch (err: any) {
      flashMessage(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (!confirm('Are you sure you want to delete or deactivate this staff member?')) return;
    setActionLoading(true);
    try {
      const res = await deleteStaffAction(id);
      if (res.success) {
        flashMessage(res.message || 'Staff status updated.', 'success');
        router.refresh();
      }
    } catch (err: any) {
      flashMessage(err.message, 'error');
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

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">

      {/* SIDEBAR NAVIGATION */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo Brand */}
          <div className="h-16 border-b border-slate-800 flex items-center px-6 gap-3 bg-slate-900/50">
            <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-600/20">
              <Fuel className="h-6 w-6" />
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-wider text-slate-100">BUNK ACCOUNTING</span>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Control Panel</p>
            </div>
          </div>

          {/* User profile */}
          <div className="p-4 border-b border-slate-800/50 bg-slate-900/30 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-indigo-400 text-sm">
              {session.username.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-200 block">{session.username}</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-indigo-400 border border-indigo-500/20 uppercase tracking-widest mt-0.5">
                {session.role}
              </span>
            </div>
          </div>

          {/* Nav List */}
          <nav className="p-4 space-y-1">
            {session.role === 'OWNER' && (
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'dashboard'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
              >
                <LayoutDashboard className="h-5 w-5" />
                Dashboard
              </button>
            )}

            <button
              onClick={() => setActiveTab('current-duty')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'current-duty'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
            >
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5" />
                Current Duty Entry
              </div>
              {activeDuty ? (
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-red-500" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'history'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
            >
              <History className="h-5 w-5" />
              ACC History Logs
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'reports'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
            >
              <FileSpreadsheet className="h-5 w-5" />
              Reports Ledger
            </button>

            {session.role === 'OWNER' && (
              <>
                <div className="h-px bg-slate-800 my-4" />
                <span className="px-4 text-[10px] text-slate-500 font-bold uppercase tracking-widest block mb-2">Master Config</span>

                <button
                  onClick={() => setActiveTab('pricing')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'pricing'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                >
                  <DollarSign className="h-5 w-5" />
                  Fuel Pricing
                </button>

                <button
                  onClick={() => setActiveTab('settings')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'settings'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                >
                  <Settings className="h-5 w-5" />
                  System Config
                </button>

                <button
                  onClick={() => setActiveTab('audit')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'audit'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                >
                  <ShieldAlert className="h-5 w-5" />
                  Audit Security Logs
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-850 hover:bg-slate-800 text-red-400 hover:text-red-300 text-sm font-semibold border border-slate-800 transition-all"
          >
            <LogOut className="h-4 w-4" />
            Logout Account
          </button>
        </div>
      </aside>

      {/* MAIN VIEW AREA */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">

        {/* Top Header */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/30 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-tight text-white capitalize">{activeTab.replace('-', ' ')}</h1>

            {activeDuty ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Session: #{activeDuty.dutyNumber}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/25">
                No active duty session
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {isMounted ? (
              <div className="text-xs text-slate-400 font-medium">
                System Time: <span className="font-mono text-slate-200 font-semibold">{currentClock}</span>
              </div>
            ) : (
              <div className="text-xs text-slate-400 font-medium">
                System Time: <span className="font-mono text-slate-200 font-semibold">&nbsp;</span>
              </div>
            )}

            {/* Change Duty Action */}
            {activeDuty ? (
              <button
                onClick={() => {
                  setWizardOpen(true);
                  setWizardStep(1);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/10"
              >
                Change Duty Session
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={() => {
                  setWizardOpen(true);
                  setWizardStep(2);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/10"
              >
                Start First Duty
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </header>

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
        <div className="flex-1 overflow-y-auto p-8 space-y-8">

          {/* TAB 1: OWNER DASHBOARD & VERIFICATION REPORT */}
          {activeTab === 'dashboard' && session.role === 'OWNER' && (
            <div className="space-y-8">
              {/* TOP CONTROLS & FILTER BAR */}
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30 flex items-center justify-center">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white uppercase tracking-wider">Owner Operations & Verification Dashboard</h2>
                    <p className="text-xs text-slate-400">Authoritative 24-Hour Bunk Ledger & Shift Reconciliation Control</p>
                  </div>
                </div>

                {/* Duty & Filters Selector */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
                    <Filter className="h-3.5 w-3.5 text-indigo-400" />
                    <span className="text-slate-400 font-semibold">Duty Session:</span>
                    <select
                      value={selectedDutyId}
                      onChange={(e) => setSelectedDutyId(e.target.value)}
                      className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
                    >
                      <option value="CURRENT" className="bg-slate-900 text-white">Current Active Duty {activeDuty ? `#${activeDuty.dutyNumber}` : '(Closed)'}</option>
                      {initialHistoricalDuties.map((hd: any) => (
                        <option key={hd.id} value={hd.id} className="bg-slate-900 text-white">
                          Duty #{hd.dutyNumber} ({new Date(hd.startTime).toLocaleDateString()}) - {hd.status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
                    <Users className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-slate-400 font-semibold">Staff:</span>
                    <select
                      value={filterStaffId}
                      onChange={(e) => setFilterStaffId(e.target.value)}
                      className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
                    >
                      <option value="ALL" className="bg-slate-900 text-white">All Staff Members</option>
                      {staticData.staff.map((s: any) => (
                        <option key={s.id} value={s.id} className="bg-slate-900 text-white">{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
                    <Fuel className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-slate-400 font-semibold">Pump:</span>
                    <select
                      value={filterPumpId}
                      onChange={(e) => setFilterPumpId(e.target.value)}
                      className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
                    >
                      <option value="ALL" className="bg-slate-900 text-white">All Bunk Pumps</option>
                      {staticData.pumps.map((p: any) => (
                        <option key={p.id} value={p.id} className="bg-slate-900 text-white">{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* DYNAMIC DUTY COMPUTATION CONTEXT */}
              {(() => {
                const targetDuty = selectedDutyId === 'CURRENT' ? activeDuty : initialHistoricalDuties.find((d: any) => d.id === selectedDutyId);

                if (!targetDuty && selectedDutyId === 'CURRENT') {
                  return (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center max-w-xl mx-auto space-y-4">
                      <ShieldAlert className="h-10 w-10 text-amber-400 mx-auto" />
                      <h3 className="text-lg font-bold text-white">No Active Duty Session Currently Running</h3>
                      <p className="text-xs text-slate-400">Select a historical duty session from the top filter above to verify past reports.</p>
                    </div>
                  );
                }

                if (!targetDuty) {
                  return (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center max-w-xl mx-auto text-slate-400 text-xs">
                      Selected duty report not found.
                    </div>
                  );
                }

                // Computation for selected target duty
                const dutyStart = new Date(targetDuty.startTime);
                const dutyEnd24h = new Date(dutyStart.getTime() + 24 * 60 * 60 * 1000);
                const dutyEndActual = targetDuty.endTime ? new Date(targetDuty.endTime) : dutyEnd24h;

                // Meter readings
                const meterReadings = targetDuty.meterReadings || [];
                const msReadings = meterReadings.filter((mr: any) => mr.gun?.fuelType === 'MS');
                const hsdReadings = meterReadings.filter((mr: any) => mr.gun?.fuelType === 'HSD');

                const msLitres = msReadings.reduce((sum: number, mr: any) => sum + (mr.litresSold || Math.max(0, mr.currentReading - mr.previousReading)), 0);
                const hsdLitres = hsdReadings.reduce((sum: number, mr: any) => sum + (mr.litresSold || Math.max(0, mr.currentReading - mr.previousReading)), 0);

                const msSales = msReadings.reduce((sum: number, mr: any) => sum + (mr.salesAmount || Math.max(0, mr.currentReading - mr.previousReading) * mr.priceUsed), 0);
                const hsdSales = hsdReadings.reduce((sum: number, mr: any) => sum + (mr.salesAmount || Math.max(0, mr.currentReading - mr.previousReading) * mr.priceUsed), 0);
                const totalFuelSales = msSales + hsdSales;

                // Oil Sales
                const oilSalesList = targetDuty.oilSales || [];
                const totalOilSales = oilSalesList.reduce((sum: number, o: any) => sum + o.totalAmount, 0);

                // Credit Sales & Collections
                const creditTrans = targetDuty.creditTransactions || [];
                const creditSalesList = creditTrans.filter((ct: any) => ct.transactionType === 'CREDIT_SALE');
                const creditCollList = creditTrans.filter((ct: any) => ct.transactionType === 'COLLECTION');

                const creditSalesAmount = creditSalesList.reduce((sum: number, ct: any) => sum + ct.amount, 0);
                const creditCollectionsCash = creditCollList.reduce((sum: number, ct: any) => sum + ct.amount, 0);
                const netOutstandingAdded = creditSalesAmount - creditCollectionsCash;

                // Expenses
                const expensesList = targetDuty.expenses || [];
                const totalExpenses = expensesList.reduce((sum: number, e: any) => sum + e.amount, 0);
                const cashExpenses = expensesList.filter((e: any) => e.paymentMethod === 'Cash').reduce((sum: number, e: any) => sum + e.amount, 0);

                // Digital payments
                const digitalPaymentsSum = expensesList.filter((e: any) => ['PhonePe', 'GPay', 'Paytm', 'BharatPe', 'Cards', 'Bank'].includes(e.paymentMethod)).reduce((sum: number, e: any) => sum + e.amount, 0);

                // Testing deductions
                const msTestingL = msTestingLitres || 0;
                const hsdTestingL = hsdTestingLitres || 0;
                const testingValue = (msTestingL * staticData.prices.MS) + (hsdTestingL * staticData.prices.HSD);

                // Financial calculations
                const grossRevenueInflow = totalFuelSales + totalOilSales + creditCollectionsCash;
                const totalDeductions = creditSalesAmount + digitalPaymentsSum + cashExpenses + testingValue;
                const expectedCash = Math.max(0, grossRevenueInflow - totalDeductions);
                const actualCash = targetDuty.actualCash || expectedCash;
                const cashDiff = targetDuty.status === 'OPEN' ? (actualCash - expectedCash) : (targetDuty.cashDifference || 0);

                // Group meter readings by Pump
                const pumpGroupMap: Record<string, any> = {};
                for (const p of staticData.pumps) {
                  pumpGroupMap[p.id] = {
                    pumpName: p.name,
                    msGuns: [],
                    hsdGuns: [],
                    assignments: (targetDuty.assignments || []).filter((as: any) => as.pumpId === p.id)
                  };
                }

                for (const mr of meterReadings) {
                  const pId = mr.gun?.pumpId || mr.gun?.pump?.id;
                  if (pId && pumpGroupMap[pId]) {
                    if (mr.gun?.fuelType === 'MS') pumpGroupMap[pId].msGuns.push(mr);
                    else pumpGroupMap[pId].hsdGuns.push(mr);
                  }
                }

                return (
                  <div className="space-y-8">
                    {/* SECTION 1: TOP EXECUTIVE SUMMARY KPI CARDS */}
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
                        <span className="text-[10px] text-slate-500 block">{oilSalesList.length} lubricant sale entries</span>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">TOTAL GROSS INFLOW</span>
                        <h4 className="text-2xl font-black text-white font-mono">₹{grossRevenueInflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h4>
                        <span className="text-[10px] text-slate-500 block">Fuel + Oil + Credit Collections</span>
                      </div>
                    </div>

                    {/* SECTION 2: BANK DEPOSIT & CASH RECONCILIATION SUMMARY BANNER */}
                    <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 p-6 rounded-2xl shadow-2xl space-y-6">
                      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 flex items-center justify-center">
                            <Wallet className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                              Bank Deposit & Physical Cash Verification Report
                            </h3>
                            <p className="text-xs text-slate-400">Duty #{targetDuty.dutyNumber} - Supervisor: <strong className="text-slate-200">{targetDuty.manager?.username}</strong></p>
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

                      {/* Bank Deposit Verification Metrics Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-xs">
                        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                          <span className="text-slate-400 font-medium block">Total Sales</span>
                          <span className="font-mono font-bold text-white block mt-1">₹{(totalFuelSales + totalOilSales).toFixed(2)}</span>
                        </div>
                        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                          <span className="text-slate-400 font-medium block">Digital Received</span>
                          <span className="font-mono font-bold text-sky-400 block mt-1">₹{digitalPaymentsSum.toFixed(2)}</span>
                        </div>
                        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                          <span className="text-slate-400 font-medium block">Credit Given</span>
                          <span className="font-mono font-bold text-amber-400 block mt-1">₹{creditSalesAmount.toFixed(2)}</span>
                        </div>
                        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                          <span className="text-slate-400 font-medium block">Credit Collected</span>
                          <span className="font-mono font-bold text-emerald-400 block mt-1">₹{creditCollectionsCash.toFixed(2)}</span>
                        </div>
                        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                          <span className="text-slate-400 font-medium block">Total Expenses</span>
                          <span className="font-mono font-bold text-red-400 block mt-1">₹{totalExpenses.toFixed(2)}</span>
                        </div>
                        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                          <span className="text-slate-400 font-medium block">Expected Cash</span>
                          <span className="font-mono font-bold text-indigo-300 block mt-1">₹{expectedCash.toFixed(2)}</span>
                        </div>
                        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                          <span className="text-slate-400 font-medium block">Actual Cash</span>
                          <span className="font-mono font-bold text-white block mt-1">₹{actualCash.toFixed(2)}</span>
                        </div>
                        <div className="bg-emerald-950/40 p-3 rounded-xl border border-emerald-500/40 text-center">
                          <span className="text-emerald-400 font-bold uppercase tracking-wider text-[9px] block">EXPECTED BANK DEPOSIT</span>
                          <span className="font-mono font-black text-emerald-300 text-sm block mt-0.5">₹{actualCash.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 3: 24-HOUR DUTY & STAFF ATTENDANCE VERIFICATION */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                      <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                        <div className="flex items-center gap-3">
                          <Calendar className="h-5 w-5 text-indigo-400" />
                          <div>
                            <h3 className="font-extrabold text-white text-base">24-Hour Duty Assignment & Staff Attendance Log</h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Shift Interval: <strong className="text-slate-200" suppressHydrationWarning>{dutyStart.toLocaleDateString()} {dutyStart.toLocaleTimeString()}</strong> &rarr; <strong className="text-slate-200" suppressHydrationWarning>{dutyEndActual.toLocaleDateString()} {dutyEndActual.toLocaleTimeString()}</strong> (24-Hour Assignment)
                            </p>
                          </div>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/25">
                          Supervisor: {targetDuty.manager?.username}
                        </span>
                      </div>

                      <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          {(targetDuty.assignments || []).length === 0 ? (
                            <div className="col-span-4 text-center py-6 text-slate-500 text-xs italic">
                              No staff assignments linked to this 24-hour duty.
                            </div>
                          ) : (
                            (targetDuty.assignments || []).map((as: any, idx: number) => (
                              <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{as.pump?.name || 'Pump'} - {as.fuelType}</span>
                                  <span className="px-2 py-0.5 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
                                    PRESENT / ACTIVE
                                  </span>
                                </div>
                                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                  <UserCheck className="h-4 w-4 text-emerald-400" />
                                  {as.staff?.name}
                                </h4>
                                <div className="text-[11px] text-slate-500 space-y-0.5 pt-1 border-t border-slate-900">
                                  <p>Duty Period: 24 Hours</p>
                                  <p suppressHydrationWarning>Start: {dutyStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                  <p suppressHydrationWarning>End: {dutyEndActual.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {/* SECTION 4: HIERARCHICAL FUEL SALES VERIFICATION (Date -> Duty -> Staff -> Pump -> Fuel Type) */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden space-y-6">
                      <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                        <div>
                          <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                            <Fuel className="h-5 w-5 text-indigo-400" />
                            Hierarchical Fuel Sales Verification Report
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">Structure: Date &rarr; Duty #{targetDuty.dutyNumber} &rarr; Staff &rarr; Pump &rarr; Fuel Type</p>
                        </div>
                        {session.role === 'OWNER' && (
                          <span className="text-xs text-amber-400 font-bold bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-500/25 flex items-center gap-1.5">
                            <Lock className="h-3.5 w-3.5" /> Owner Meter Correction Enabled
                          </span>
                        )}
                      </div>

                      <div className="px-6 pb-6 space-y-6">
                        {staticData.pumps.map((pump: any) => {
                          const pData = pumpGroupMap[pump.id] || { msGuns: [], hsdGuns: [], assignments: [] };

                          // Calculate totals for Pump
                          const pumpMsLitres = pData.msGuns.reduce((sum: number, mr: any) => sum + (mr.litresSold || Math.max(0, mr.currentReading - mr.previousReading)), 0);
                          const pumpHsdLitres = pData.hsdGuns.reduce((sum: number, mr: any) => sum + (mr.litresSold || Math.max(0, mr.currentReading - mr.previousReading)), 0);
                          const pumpMsSales = pData.msGuns.reduce((sum: number, mr: any) => sum + (mr.salesAmount || Math.max(0, mr.currentReading - mr.previousReading) * mr.priceUsed), 0);
                          const pumpHsdSales = pData.hsdGuns.reduce((sum: number, mr: any) => sum + (mr.salesAmount || Math.max(0, mr.currentReading - mr.previousReading) * mr.priceUsed), 0);

                          const msStaff = pData.assignments.find((a: any) => a.fuelType === 'MS')?.staff?.name || 'Assigned Staff';
                          const hsdStaff = pData.assignments.find((a: any) => a.fuelType === 'HSD')?.staff?.name || 'Assigned Staff';

                          const isExpanded = expandedPumpId === pump.id;

                          return (
                            <div key={pump.id} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                              {/* Pump Header Summary Card */}
                              <div className="p-4 bg-slate-900/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <div className="h-9 w-9 bg-indigo-600/20 text-indigo-400 rounded-lg flex items-center justify-center font-bold text-sm">
                                    {pump.name}
                                  </div>
                                  <div>
                                    <h4 className="font-extrabold text-white text-sm uppercase">{pump.name} Operational Meter Summary</h4>
                                    <p className="text-[11px] text-slate-400">Staff Assigned: <strong className="text-slate-200">MS: {msStaff}</strong> | <strong className="text-slate-200">HSD: {hsdStaff}</strong></p>
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
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all"
                                  >
                                    <Eye className="h-3.5 w-3.5 text-indigo-400" />
                                    {isExpanded ? 'Hide Gun Details' : 'View Gun Details'}
                                  </button>
                                </div>
                              </div>

                              {/* Pump Fuel Type Breakdown Table */}
                              <div className="p-4">
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
                                      <td className="py-2.5 font-semibold text-slate-300">{msStaff}</td>
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
                                      <td className="py-2.5 font-semibold text-slate-300">{hsdStaff}</td>
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
                                            className="px-3 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 font-bold text-[11px] flex items-center gap-1 transition-all"
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
                    </div>

                    {/* SECTION 5: TESTING & SAMPLE DEDUCTION CARD */}
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-6">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30 flex items-center justify-center">
                          <Info className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-white text-sm">Testing / Sample Quantity Deductions</h4>
                          <p className="text-xs text-slate-400">Fuel dispensed for density & quality calibration testing (deducted from revenue & cash calculation).</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 text-xs">
                        <div>
                          <span className="text-slate-400 font-semibold block">MS Testing</span>
                          <span className="font-mono font-bold text-indigo-400 text-sm">{msTestingL} L</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold block">HSD Testing</span>
                          <span className="font-mono font-bold text-emerald-400 text-sm">{hsdTestingL} L</span>
                        </div>
                        <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800">
                          <span className="text-slate-400 font-semibold block text-[10px]">Total Testing Value</span>
                          <span className="font-mono font-bold text-amber-400 text-sm">₹{testingValue.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 6: OIL / LUBRICANT SALES VERIFICATION CARD */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                      <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                        <div>
                          <h3 className="font-extrabold text-white text-base">Oil / Lubricant Sales Breakdown</h3>
                          <p className="text-xs text-slate-400 mt-0.5">Itemized lubricant sales configured via Master Config.</p>
                        </div>
                        <span className="text-sm font-black text-sky-400 font-mono">
                          TOTAL OIL SALES: ₹{totalOilSales.toFixed(2)}
                        </span>
                      </div>

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
                            {oilSalesList.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="p-4 text-center text-slate-500">No oil sales logged for this duty session.</td>
                              </tr>
                            ) : (
                              oilSalesList.map((o: any, idx: number) => (
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
                    </div>

                    {/* SECTION 7: CREDIT / CUSTOMER LEDGER VERIFICATION CARD */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden space-y-4 p-6">
                      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                        <div>
                          <h3 className="font-extrabold text-white text-base">Credit & Customer Ledger Verification</h3>
                          <p className="text-xs text-slate-400 mt-0.5">Tracks credit sales (debits) and cash collections (credits) for customer transport accounts.</p>
                        </div>

                        <div className="flex items-center gap-4 text-xs font-mono">
                          <div className="bg-amber-950/40 px-3 py-1.5 rounded-lg border border-amber-500/30">
                            <span className="text-amber-400 font-semibold block text-[10px]">Credit Given Today</span>
                            <span className="font-bold text-amber-300">₹{creditSalesAmount.toFixed(2)}</span>
                          </div>
                          <div className="bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-500/30">
                            <span className="text-emerald-400 font-semibold block text-[10px]">Collections Today</span>
                            <span className="font-bold text-emerald-300">₹{creditCollectionsCash.toFixed(2)}</span>
                          </div>
                          <div className="bg-indigo-950/40 px-3 py-1.5 rounded-lg border border-indigo-500/30">
                            <span className="text-indigo-400 font-semibold block text-[10px]">Net Outstanding Added</span>
                            <span className="font-bold text-indigo-200">₹{netOutstandingAdded.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

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
                            {creditTrans.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="p-4 text-center text-slate-500">No credit transactions recorded for this duty session.</td>
                              </tr>
                            ) : (
                              creditTrans.map((t: any, idx: number) => (
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
                    </div>

                    {/* SECTION 8: OPERATING EXPENSES CARD */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                      <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                        <div>
                          <h3 className="font-extrabold text-white text-base">Shift Operating Expenses Verification</h3>
                          <p className="text-xs text-slate-400 mt-0.5">Bunk operating payouts logged by supervisor.</p>
                        </div>
                        <span className="text-sm font-black text-red-400 font-mono">
                          TOTAL EXPENSES: ₹{totalExpenses.toFixed(2)}
                        </span>
                      </div>

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
                            {expensesList.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="p-4 text-center text-slate-500">No expenses logged for this duty session.</td>
                              </tr>
                            ) : (
                              expensesList.map((e: any, idx: number) => (
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
                    </div>

                    {/* SECTION 9: DIGITAL PAYMENTS SUMMARY */}
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-6">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-sky-500/20 text-sky-400 rounded-xl border border-sky-500/30 flex items-center justify-center">
                          <CreditCard className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-white text-sm">Digital Payments Summary (Non-Cash)</h4>
                          <p className="text-xs text-slate-400">PhonePe, GPay, Paytm, Cards, Bank Transfer collections (excluded from physical cash drawer count).</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 font-mono text-xs">
                        <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800">
                          <span className="text-slate-400 block text-[10px]">TOTAL DIGITAL RECEIPTS</span>
                          <span className="font-bold text-sky-300 text-base">₹{digitalPaymentsSum.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 10: CASH RECONCILIATION BREAKDOWN FORMULA */}
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
                      <h3 className="font-extrabold text-white text-base border-b border-slate-800 pb-3 flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-indigo-400" />
                        Final Shift Cash Reconciliation Audit Formula
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-mono">
                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                          <h4 className="font-sans font-bold text-emerald-400 uppercase tracking-wider text-[11px]">Revenue Inflows (+)</h4>
                          <div className="flex justify-between text-slate-300"><span>Fuel Sales:</span><span>₹{totalFuelSales.toFixed(2)}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Oil Sales:</span><span>₹{totalOilSales.toFixed(2)}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Credit Cash Collections:</span><span>+₹{creditCollectionsCash.toFixed(2)}</span></div>
                          <div className="flex justify-between text-white font-bold border-t border-slate-800 pt-2 text-sm"><span>TOTAL GROSS INFLOW:</span><span>₹{grossRevenueInflow.toFixed(2)}</span></div>
                        </div>

                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                          <h4 className="font-sans font-bold text-amber-400 uppercase tracking-wider text-[11px]">Deductions & Non-Cash (-)</h4>
                          <div className="flex justify-between text-slate-300"><span>Credit Sales Given:</span><span>-₹{creditSalesAmount.toFixed(2)}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Digital Payments:</span><span>-₹{digitalPaymentsSum.toFixed(2)}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Testing / Sample Value:</span><span>-₹{testingValue.toFixed(2)}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Operating Expenses:</span><span>-₹{cashExpenses.toFixed(2)}</span></div>
                          <div className="flex justify-between text-white font-bold border-t border-slate-800 pt-2 text-sm"><span>TOTAL DEDUCTIONS:</span><span>₹{totalDeductions.toFixed(2)}</span></div>
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
                      setWizardStep(2);
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-all"
                  >
                    Start A New Shift Session
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ) : (
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
                      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                        <div>
                          <h3 className="font-extrabold text-white text-lg">Gun Meter Readings (Grouped by Pump)</h3>
                          <p className="text-xs text-slate-400 mt-1">Enter current meter reading for each gun. Litres sold and sales are calculated automatically.</p>
                        </div>
                        <button
                          onClick={handleSaveOngoingReadings}
                          disabled={actionLoading}
                          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md"
                        >
                          {actionLoading ? 'Saving...' : 'Save Meter Readings'}
                        </button>
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
                                    <span className="text-sm font-bold text-slate-200">{mr.gun.name}</span>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-indigo-400 border border-indigo-500/10">
                                      {mr.gun.fuelType} (₹{mr.priceUsed.toFixed(2)})
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Previous Reading</label>
                                      <span className="block text-sm font-mono font-bold text-slate-450 mt-1.5 bg-slate-900 px-3 py-2 rounded-lg border border-slate-800 select-none">
                                        {mr.previousReading.toFixed(2)}
                                      </span>
                                    </div>
                                    <div>
                                      <label htmlFor={`reading-${mr.gunId}`} className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current Reading</label>
                                      <input
                                        id={`reading-${mr.gunId}`}
                                        type="number"
                                        step="0.01"
                                        value={ongoingReadings[mr.gunId] !== undefined ? ongoingReadings[mr.gunId] : ''}
                                        onChange={(e) => {
                                          setOngoingReadings({
                                            ...ongoingReadings,
                                            [mr.gunId]: Number(e.target.value),
                                          });
                                        }}
                                        className="block w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 mt-1 text-sm text-slate-100 font-mono font-semibold placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                                        placeholder="Enter reading"
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
                                    <span className="text-sm font-bold text-slate-200">{mr.gun.name}</span>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-emerald-400 border border-emerald-500/10">
                                      {mr.gun.fuelType} (₹{mr.priceUsed.toFixed(2)})
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Previous Reading</label>
                                      <span className="block text-sm font-mono font-bold text-slate-450 mt-1.5 bg-slate-900 px-3 py-2 rounded-lg border border-slate-800 select-none">
                                        {mr.previousReading.toFixed(2)}
                                      </span>
                                    </div>
                                    <div>
                                      <label htmlFor={`reading-${mr.gunId}`} className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current Reading</label>
                                      <input
                                        id={`reading-${mr.gunId}`}
                                        type="number"
                                        step="0.01"
                                        value={ongoingReadings[mr.gunId] !== undefined ? ongoingReadings[mr.gunId] : ''}
                                        onChange={(e) => {
                                          setOngoingReadings({
                                            ...ongoingReadings,
                                            [mr.gunId]: Number(e.target.value),
                                          });
                                        }}
                                        className="block w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 mt-1 text-sm text-slate-100 font-mono font-semibold placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                                        placeholder="Enter reading"
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

                      <div className="flex justify-end pt-4 border-t border-slate-800">
                        <button
                          onClick={handleSaveOngoingReadings}
                          disabled={actionLoading}
                          className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-all"
                        >
                          {actionLoading ? 'Saving...' : 'Save Current Readings'}
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
                                <option value="COLLECTION">Ledger Collection (Cash Received)</option>
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
                            <div className="grid grid-cols-4 gap-2 items-end bg-slate-900/60 p-2.5 rounded border border-slate-800">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase">Receipt / Voucher No</label>
                                <input type="text" value={indentNumber} onChange={(e) => setIndentNumber(e.target.value)} className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 mt-1 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none" placeholder="REC-001" />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase">Cash Collected ₹</label>
                                <input type="number" required min="1" step="0.01" value={creditAmount || ''} onChange={(e) => setCreditAmount(Number(e.target.value))} className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 mt-1 text-xs text-emerald-400 font-mono font-bold focus:border-indigo-500 focus:outline-none" placeholder="0.00" />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase">Remarks / Note</label>
                                <input type="text" value={creditDesc} onChange={(e) => setCreditDesc(e.target.value)} className="block w-full rounded border border-slate-700 bg-slate-950 py-1.5 px-2 mt-1 text-xs text-white focus:border-indigo-500 focus:outline-none" placeholder="Optional remark" />
                              </div>
                              <button type="submit" disabled={isSubmittingCredit || actionLoading} className="py-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs uppercase transition-all flex items-center justify-center gap-1 shadow-md">
                                {isSubmittingCredit ? <span>Saving...</span> : <><Plus className="h-3.5 w-3.5 inline mr-1" />+ ADD COLLECTION</>}
                              </button>
                            </div>
                          )}
                        </form>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold text-[10px]">
                                <th className="p-2.5">Customer</th>
                                <th className="p-2.5">Type</th>
                                <th className="p-2.5">Indent / Slip</th>
                                <th className="p-2.5">Product</th>
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
                                        <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">COLLECTION</span>
                                      )}
                                    </td>
                                    <td className="p-2.5 text-indigo-300 font-bold">{ct.indentNumber || '-'}</td>
                                    <td className="p-2.5 text-slate-300 font-sans">{ct.productName || '-'}</td>
                                    <td className="p-2.5 text-right text-slate-200 font-bold">{ct.quantity ? `${ct.quantity.toFixed(2)} L` : '-'}</td>
                                    <td className="p-2.5 text-right text-slate-400">{ct.unitPrice ? `₹${ct.unitPrice.toFixed(2)}` : '-'}</td>
                                    <td className="p-2.5 text-right font-bold text-amber-400">₹{ct.amount.toFixed(2)}</td>
                                    <td className="p-2.5 text-slate-400 font-sans text-[11px]">{ct.description || '-'}</td>
                                    <td className="p-2.5 text-center">
                                      <button onClick={() => handleDeleteCredit(ct.id)} className="text-red-500 hover:text-red-400 p-1" title="Delete credit transaction">
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

                      {/* Active Staff list */}
                      <div className="border-t border-slate-800 pt-4 space-y-2 text-xs">
                        <span className="text-slate-450 block font-bold uppercase tracking-wider text-[10px]">Staff Assignments</span>
                        <div className="grid grid-cols-2 gap-2 text-slate-300">
                          {activeDuty.assignments.map((as: any, idx: number) => (
                            <div key={idx} className="bg-slate-950 px-3 py-2 rounded border border-slate-850">
                              <span className="text-[10px] text-slate-500 block font-bold uppercase">{as.pump.name} - {as.fuelType}</span>
                              <span className="text-slate-100 font-bold">{as.staff.name}</span>
                            </div>
                          ))}
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
              )}
            </div>
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
            <div className="space-y-8">
              {/* Report Tabs */}
              <div className="flex border-b border-slate-800 gap-2 shrink-0 overflow-x-auto pb-px">
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
              {reportsTab === 'sales' && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                  <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <div>
                      <h4 className="font-extrabold text-white text-base">Fuel Meter Sales Report</h4>
                      <p className="text-xs text-slate-400 mt-1">Detailed volume and value calculations for each gun across completed duties.</p>
                    </div>
                    <button
                      onClick={() => handleExportExcel('sales-report-table', 'Fuel_Sales_Report')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-850 text-indigo-400 hover:text-indigo-300 text-xs font-bold transition-all"
                    >
                      Export to Excel
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table id="sales-report-table" className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold">
                          <th className="p-3">Duty Session</th>
                          <th className="p-3">Gun Name</th>
                          <th className="p-3">Fuel Type</th>
                          <th className="p-3 text-right">Previous Reading</th>
                          <th className="p-3 text-right">Current Reading</th>
                          <th className="p-3 text-right">Litres Sold</th>
                          <th className="p-3 text-right">Price Applied</th>
                          <th className="p-3 text-right">Total sales amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {historicalDuties.flatMap((d: any) =>
                          (d.meterReadings || []).map((mr: any, idx: number) => (
                            <tr key={`${d.id}-${idx}`} className="hover:bg-slate-950/20">
                              <td className="p-3 font-semibold text-indigo-400">Duty #{d.dutyNumber}</td>
                              <td className="p-3 text-slate-200">{mr.gun?.name || 'Nozzle'}</td>
                              <td className="p-3 text-slate-350">{mr.gun?.fuelType || '-'}</td>
                              <td className="p-3 text-right font-mono text-slate-350">{(mr.previousReading || 0).toFixed(2)}</td>
                              <td className="p-3 text-right font-mono text-slate-350">{(mr.currentReading || 0).toFixed(2)}</td>
                              <td className="p-3 text-right font-mono text-white">{(mr.litresSold || 0).toFixed(2)} L</td>
                              <td className="p-3 text-right font-mono text-slate-350">₹{(mr.priceUsed || 0).toFixed(2)}</td>
                              <td className="p-3 text-right font-mono font-bold text-indigo-400">₹{(mr.salesAmount || 0).toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* STAFF REPORT SUB-TAB */}
              {reportsTab === 'staff' && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                  <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <div>
                      <h4 className="font-extrabold text-white text-base">Staff Duty Handling & Performance</h4>
                      <p className="text-xs text-slate-400 mt-1">Aggregated fuel volume and total sales revenue managed by each staff member.</p>
                    </div>
                    <button
                      onClick={() => handleExportExcel('staff-report-table', 'Staff_Performance_Report')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-850 text-indigo-400 hover:text-indigo-300 text-xs font-bold transition-all"
                    >
                      Export to Excel
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table id="staff-report-table" className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold">
                          <th className="p-3">Staff Name</th>
                          <th className="p-3 text-right">Duties Handled</th>
                          <th className="p-3 text-right">MS Litres Handled</th>
                          <th className="p-3 text-right">HSD Litres Handled</th>
                          <th className="p-3 text-right">Total Revenue Handled</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {staffPerformance.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-4 text-center text-slate-500">No staff performance logs.</td>
                          </tr>
                        ) : (
                          staffPerformance.map((s: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-950/20">
                              <td className="p-3 font-semibold text-slate-200">{s.name}</td>
                              <td className="p-3 text-right font-mono text-slate-350">{s.duties}</td>
                              <td className="p-3 text-right font-mono text-slate-350">{s.msLitres.toFixed(2)} L</td>
                              <td className="p-3 text-right font-mono text-slate-350">{s.hsdLitres.toFixed(2)} L</td>
                              <td className="p-3 text-right font-mono font-bold text-indigo-400">₹{s.sales.toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* CREDIT REPORT SUB-TAB */}
              {reportsTab === 'credit' && (
                <div className="space-y-6">
                  {/* Customer Filter & Summary Bar */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h4 className="font-extrabold text-white text-base">Customer & Transport Credit Ledger Statements</h4>
                      <p className="text-xs text-slate-400 mt-1">Select a customer or transport company to view full ledger history, itemized indents, fuel volume, rate, debit/credit transactions, and running balance.</p>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <select
                        value={selectedLedgerCustomer}
                        onChange={(e) => setSelectedLedgerCustomer(e.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-950 py-2 px-3 text-xs font-bold text-white focus:border-indigo-500 focus:outline-none w-full md:w-72"
                      >
                        <option value="ALL">-- All Customers / Transport Ledgers --</option>
                        {creditLedger.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.name} (Bal: ₹{c.balance.toFixed(2)})
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => handleExportExcel('credit-ledger-table', `Credit_Ledger_${selectedLedgerCustomer === 'ALL' ? 'All' : 'Company'}`)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-700 bg-slate-850 text-indigo-400 hover:text-indigo-300 text-xs font-bold transition-all shrink-0"
                      >
                        Export Ledger to Excel
                      </button>
                    </div>
                  </div>

                  {/* Calculated Ledger Summary Cards */}
                  {(() => {
                    // Compute chronological running balance per customer
                    const customerMap: Record<string, any[]> = {};
                    creditLedger.forEach((c: any) => {
                      if (selectedLedgerCustomer === 'ALL' || c.id === selectedLedgerCustomer) {
                        const sorted = [...(c.transactions || [])].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                        let running = 0;
                        const computed = sorted.map((t: any) => {
                          if (t.transactionType === 'CREDIT_SALE') {
                            running += t.amount;
                          } else {
                            running -= t.amount;
                          }
                          return {
                            ...t,
                            customerName: c.name,
                            runningBalance: running,
                          };
                        });
                        customerMap[c.id] = computed;
                      }
                    });

                    const allTrans = Object.values(customerMap).flat().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                    const totalCreditGiven = allTrans.filter(t => t.transactionType === 'CREDIT_SALE').reduce((sum, t) => sum + t.amount, 0);
                    const totalCollections = allTrans.filter(t => t.transactionType === 'COLLECTION').reduce((sum, t) => sum + t.amount, 0);
                    const netOutstanding = totalCreditGiven - totalCollections;

                    return (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-lg">
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total Credit Given (Debits)</span>
                              <h5 className="text-2xl font-mono font-black text-amber-400 mt-1">₹{totalCreditGiven.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h5>
                              <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">{allTrans.filter(t => t.transactionType === 'CREDIT_SALE').length} Credit Sale Slips</span>
                            </div>
                            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                              <CreditCard className="h-6 w-6" />
                            </div>
                          </div>

                          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-lg">
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total Collections (Credits)</span>
                              <h5 className="text-2xl font-mono font-black text-emerald-400 mt-1">₹{totalCollections.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h5>
                              <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">{allTrans.filter(t => t.transactionType === 'COLLECTION').length} Cash Payments Received</span>
                            </div>
                            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                              <Plus className="h-6 w-6" />
                            </div>
                          </div>

                          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-lg">
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Net Outstanding Balance</span>
                              <h5 className="text-2xl font-mono font-black text-indigo-300 mt-1">₹{netOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h5>
                              <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">Current Total Balance Due</span>
                            </div>
                            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                              <CreditCard className="h-6 w-6" />
                            </div>
                          </div>
                        </div>

                        {/* Comprehensive Detailed Transaction Table */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                          <div className="overflow-x-auto">
                            <table id="credit-ledger-table" className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-bold text-[10px]">
                                  <th className="p-3">Date & Time</th>
                                  <th className="p-3">Shift Ref</th>
                                  <th className="p-3">Company / Customer</th>
                                  <th className="p-3">Indent / Slip No</th>
                                  <th className="p-3">Product Name</th>
                                  <th className="p-3 text-right">Litres / Qty</th>
                                  <th className="p-3 text-right">Rate (₹/L)</th>
                                  <th className="p-3 text-right">Debit (Credit Sale)</th>
                                  <th className="p-3 text-right">Credit (Collection)</th>
                                  <th className="p-3 text-right">Running Balance</th>
                                  <th className="p-3">Entered By</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/40 font-mono text-xs">
                                {allTrans.length === 0 ? (
                                  <tr>
                                    <td colSpan={11} className="p-6 text-center text-slate-500 font-sans">
                                      No ledger credit transactions recorded for this selection.
                                    </td>
                                  </tr>
                                ) : (
                                  allTrans.map((t: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-slate-950/20">
                                      <td className="p-3 text-slate-350" suppressHydrationWarning>{new Date(t.timestamp).toLocaleString()}</td>
                                      <td className="p-3 font-sans text-slate-400 font-bold">Duty #{t.dutySession?.dutyNumber || '-'}</td>
                                      <td className="p-3 font-sans font-bold text-slate-200">{t.customerName}</td>
                                      <td className="p-3 font-bold text-indigo-300">{t.indentNumber || '-'}</td>
                                      <td className="p-3 font-sans text-slate-300">{t.productName || (t.transactionType === 'CREDIT_SALE' ? 'Fuel/Oil' : 'Cash Collection')}</td>
                                      <td className="p-3 text-right text-slate-200">{t.quantity ? `${t.quantity.toFixed(2)} L` : '-'}</td>
                                      <td className="p-3 text-right text-slate-400">{t.unitPrice ? `₹${t.unitPrice.toFixed(2)}` : '-'}</td>
                                      <td className="p-3 text-right font-bold text-amber-400">
                                        {t.transactionType === 'CREDIT_SALE' ? `+₹${t.amount.toFixed(2)}` : '-'}
                                      </td>
                                      <td className="p-3 text-right font-bold text-emerald-400">
                                        {t.transactionType === 'COLLECTION' ? `-₹${t.amount.toFixed(2)}` : '-'}
                                      </td>
                                      <td className="p-3 text-right font-bold text-indigo-300 bg-slate-950/40">
                                        ₹{t.runningBalance.toFixed(2)}
                                      </td>
                                      <td className="p-3 font-sans text-slate-400 text-[11px]">{t.enteredBy?.username || 'Manager'}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
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
                <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                  <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <div>
                      <h4 className="font-extrabold text-white text-base">Underground Fuel Stock & Variance Log</h4>
                      <p className="text-xs text-slate-400 mt-1">Monitors opening levels, sales volumes, physical dip measurements, and variance shortages.</p>
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
                  <h3 className="font-extrabold text-white text-base border-b border-slate-800 pb-2">Staff Roster Management</h3>

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
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md flex items-center gap-1 shrink-0"
                    >
                      <Plus className="h-4 w-4" /> Add Staff
                    </button>
                  </form>

                  <div className="overflow-y-auto max-h-72 border border-slate-850 rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-850 text-slate-450 uppercase font-bold">
                          <th className="p-3">Name</th>
                          <th className="p-3 text-center">Status</th>
                          <th className="p-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {staticData.staff.map((s: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-950/20">
                            <td className="p-3 font-semibold text-slate-200">{s.name}</td>
                            <td className="p-3 text-center">
                              {s.active ? (
                                <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">ACTIVE</span>
                              ) : (
                                <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-850 text-slate-500 border border-slate-700">DISABLED</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => handleToggleStaff(s.id, !s.active)}
                                className={`px-2.5 py-1 rounded text-[10px] font-bold ${s.active ? 'bg-red-950/50 hover:bg-red-900/50 text-red-400' : 'bg-emerald-950/50 hover:bg-emerald-900/50 text-emerald-400'
                                  }`}
                              >
                                {s.active ? 'Disable' : 'Enable'}
                              </button>
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
                              <button
                                onClick={() => handleToggleCustomer(c.id, !c.active)}
                                className={`px-2.5 py-1 rounded text-[10px] font-bold ${c.active ? 'bg-red-950/50 hover:bg-red-900/50 text-red-400' : 'bg-emerald-950/50 hover:bg-emerald-900/50 text-emerald-400'
                                  }`}
                              >
                                {c.active ? 'Disable' : 'Enable'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                            <td className="p-4 text-slate-400">{log.recordType}</td>
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
          <div className="bg-slate-900 border border-slate-850 w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl animate-scale-up my-8">

            {/* Modal Header */}
            <div className="bg-slate-950 px-8 py-5 border-b border-slate-850 flex justify-between items-center">
              <div>
                <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest block">Operational Shift Change Wizard</span>
                <h3 className="text-lg font-black text-white">
                  {wizardStep === 1 ? 'Step 1: Record Closing Readings & Cash' : 'Step 2: Assign Staff for Next Duty Shift'}
                </h3>
              </div>
              <button
                onClick={() => setWizardOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-xs font-bold"
              >
                Cancel Wizard
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 space-y-6">

              {/* STEP 1: CLOSE ACTIVE DUTY */}
              {wizardStep === 1 && activeDuty && (
                <div className="space-y-6">
                  {/* Informative banner */}
                  <div className="rounded-xl bg-indigo-950/20 border border-indigo-500/25 p-4 flex gap-3 text-xs text-indigo-400 font-medium">
                    <Info className="h-5 w-5 shrink-0" />
                    <span>
                      Please enter the final closing meter readings for the active shift. The system will calculate litres sold, total revenue, digital payments, and expected cash drawer balance dynamically.
                    </span>
                  </div>

                  {/* SHIFT CLOSING READINGS Table */}
                  <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 space-y-3 overflow-x-auto">
                    <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                      <span className="text-xs font-extrabold text-white uppercase tracking-wider block">
                        SHIFT CLOSING READINGS
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">PUMP 1 & PUMP 2 NOZZLES</span>
                    </div>
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-850 text-slate-400 uppercase font-bold text-[10px]">
                          <th className="p-2.5">Gun</th>
                          <th className="p-2.5 text-right">Opening</th>
                          <th className="p-2.5 text-right">Closing</th>
                          <th className="p-2.5 text-right">Litres Sold</th>
                          <th className="p-2.5 text-right">Price</th>
                          <th className="p-2.5 text-right">Sales</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 font-mono">
                        {getSortedReadings(activeDuty.meterReadings).map((mr: any, idx: number) => {
                          const prevVal = openingReadings[mr.gunId] !== undefined ? openingReadings[mr.gunId] : mr.previousReading;
                          const currentVal = closingReadings[mr.gunId] !== undefined ? closingReadings[mr.gunId] : mr.currentReading;
                          const litres = Math.max(0, currentVal - prevVal);
                          const sales = litres * mr.priceUsed;
                          const isOwner = session?.role === 'OWNER';
                          return (
                            <tr key={idx} className="hover:bg-slate-900/50">
                              <td className="p-2.5 font-sans font-bold text-slate-200">{mr.gun.name} <span className="text-[10px] text-slate-500 font-normal">({mr.gun.fuelType})</span></td>
                              <td className="p-2.5 text-right">
                                {isOwner ? (
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={openingReadings[mr.gunId] !== undefined ? openingReadings[mr.gunId] : mr.previousReading}
                                    onChange={(e) => {
                                      setOpeningReadings({
                                        ...openingReadings,
                                        [mr.gunId]: Number(e.target.value),
                                      });
                                    }}
                                    className="w-28 rounded border border-amber-500/60 bg-slate-950 py-1 px-2 text-xs font-mono font-bold text-amber-300 text-right focus:border-amber-400 focus:outline-none"
                                    title="Owner Privilege: Edit Opening Meter Reading"
                                  />
                                ) : (
                                  <span className="text-slate-400 font-mono">{mr.previousReading.toFixed(2)}</span>
                                )}
                              </td>
                              <td className="p-2.5 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={closingReadings[mr.gunId] !== undefined ? closingReadings[mr.gunId] : ''}
                                  onChange={(e) => {
                                    setClosingReadings({
                                      ...closingReadings,
                                      [mr.gunId]: Number(e.target.value),
                                    });
                                  }}
                                  className="w-28 rounded border border-slate-700 bg-slate-900 py-1 px-2 text-xs font-mono font-bold text-white text-right focus:border-indigo-500 focus:outline-none"
                                />
                              </td>
                              <td className="p-2.5 text-right text-white font-bold">{litres.toFixed(2)} L</td>
                              <td className="p-2.5 text-right text-slate-400">₹{mr.priceUsed.toFixed(2)}</td>
                              <td className="p-2.5 text-right font-bold text-indigo-400">
                                ₹{sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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

                  {/* Revenue Summary (ACC Book) */}
                  <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-2 text-xs">
                    <span className="text-xs font-extrabold text-white uppercase tracking-wider block border-b border-slate-900 pb-2">DAILY FUEL & OIL SALES BREAKDOWN</span>
                    <div className="flex justify-between text-slate-400 font-sans">
                      <span>MS SALES ({msLitresRaw.toFixed(2)} L - {msTestingLitres} L Test = {msActualLitres.toFixed(2)} L × ₹{msPrice.toFixed(2)})</span>
                      <span className="font-mono font-bold text-emerald-400">₹{totalMsSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 font-sans">
                      <span>HSD SALES ({hsdLitresRaw.toFixed(2)} L - {hsdTestingLitres} L Test = {hsdActualLitres.toFixed(2)} L × ₹{hsdPrice.toFixed(2)})</span>
                      <span className="font-mono font-bold text-sky-400">₹{totalHsdSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
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
                              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteCredit(ct.id); }} className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-950/30 transition-colors" title="Delete Credit Entry">
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
                    <div className="grid grid-cols-3 gap-3">
                      {Object.keys(digitalPayments).map((key) => (
                        <div key={key}>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider capitalize">{key}</label>
                          <input type="number" value={digitalPayments[key as keyof typeof digitalPayments] || ''} onChange={(e) => setDigitalPayments({ ...digitalPayments, [key]: Number(e.target.value) })} className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-2.5 mt-1 text-xs text-white font-semibold font-mono focus:border-indigo-500 focus:outline-none" placeholder="₹0" />
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
                          <span>GROSS REVENUE:</span>
                          <span className="font-mono">₹{grossRevenueInflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>

                      {/* 2. DEDUCTIONS / DEBIT (NON-CASH) */}
                      <div className="space-y-1.5 bg-slate-900/60 p-3 rounded-lg border border-slate-850">
                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block border-b border-slate-800 pb-1">2. DEDUCTIONS / DEBIT (NON-CASH)</span>
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
                        <div className="flex justify-between text-slate-300 font-sans">
                          <span>Testing/Sample Value:</span>
                          <span className="font-mono font-bold text-slate-400">-₹{totalTestingValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-800 pt-1 text-xs font-bold text-red-300 font-sans">
                          <span>TOTAL DEBITS / DEDUCTIONS:</span>
                          <span className="font-mono">₹{totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>

                    {/* NET EXPECTED CASH */}
                    <div className="bg-indigo-950/40 border border-indigo-850 p-3 rounded-lg flex justify-between items-center text-xs">
                      <div>
                        <span className="font-extrabold text-indigo-200 block uppercase">NET EXPECTED CASH</span>
                        <span className="text-[10px] text-slate-400 font-sans">Gross Revenue (including collections) - Deductions (Credit Sales, Digital, Expenses & Testing)</span>
                      </div>
                      <span className="font-mono text-base font-extrabold text-indigo-300">
                        ₹{expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Cash Drawer Reconciliation */}
                  <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl grid grid-cols-2 gap-6 items-center">
                    <div>
                      <label htmlFor="actual-cash" className="block text-xs font-bold text-slate-300 uppercase">PHYSICAL CASH COUNTED IN DRAWER (₹)</label>
                      <input id="actual-cash" type="number" required value={actualCash || ''} onChange={(e) => setActualCash(Number(e.target.value))} className="block w-full rounded border border-slate-700 bg-slate-900 py-2 px-3 mt-1.5 text-sm text-white font-bold font-mono focus:border-indigo-500 focus:outline-none" placeholder="Enter counted cash drawer" />
                    </div>
                    <div className="space-y-1.5 text-xs font-semibold text-slate-300">
                      <div className="flex justify-between"><span>EXPECTED FOR DEPOSIT:</span><span className="font-mono text-white">₹{expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                      <div className="flex justify-between"><span>PHYSICAL COUNTED:</span><span className="font-mono text-white">₹{actualCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                      <div className="flex justify-between border-t border-slate-850 pt-1.5 font-bold">
                        <span>SHORT / SURPLUS:</span>
                        <span className={`font-mono ${cashDiff < 0 ? 'text-red-400' : cashDiff > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {cashDiff < 0 ? `-₹${Math.abs(cashDiff).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (SHORTAGE)` : cashDiff > 0 ? `+₹${cashDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (SURPLUS)` : '₹0 (BALANCED)'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}


              {/* STEP 2: START NEW DUTY */}
              {wizardStep === 2 && (
                <div className="space-y-6">
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
                      <label className="block text-xs font-semibold text-slate-355 select-none">Carried Readings</label>
                      <span className="block text-xs font-bold text-slate-500 mt-2 bg-slate-950 px-3 py-2.5 rounded-lg border border-slate-850">
                        Previous closed readings inherited.
                      </span>
                    </div>
                  </div>

                  {/* Staff Assignments */}
                  <div className="bg-slate-950 border border-slate-850 p-6 rounded-xl space-y-4">
                    <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block border-b border-slate-900 pb-2">Shift Staff Assignments</span>

                    <div className="grid grid-cols-2 gap-6">
                      {/* Pump 1 Staff */}
                      <div className="space-y-4">
                        <span className="text-xs font-bold text-indigo-400 block border-b border-slate-900 pb-1">Pump 1 (MS-1, HSD-1, MS-2, HSD-2)</span>
                        <div>
                          <label htmlFor="pump1-ms" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">MS Staff Assignment</label>
                          <select
                            id="pump1-ms"
                            required
                            value={assignments.Pump1_MS}
                            onChange={(e) => setAssignments({ ...assignments, Pump1_MS: e.target.value })}
                            className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-3 mt-1 text-xs text-slate-100 focus:outline-none"
                          >
                            <option value="">-- Assign Staff --</option>
                            {staticData.staff.map((s: any) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="pump1-hsd" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">HSD Staff Assignment</label>
                          <select
                            id="pump1-hsd"
                            required
                            value={assignments.Pump1_HSD}
                            onChange={(e) => setAssignments({ ...assignments, Pump1_HSD: e.target.value })}
                            className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-3 mt-1 text-xs text-slate-100 focus:outline-none"
                          >
                            <option value="">-- Assign Staff --</option>
                            {staticData.staff.map((s: any) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Pump 2 Staff */}
                      <div className="space-y-4">
                        <span className="text-xs font-bold text-emerald-400 block border-b border-slate-900 pb-1">Pump 2 (MS-3, HSD-3, MS-4, HSD-4)</span>
                        <div>
                          <label htmlFor="pump2-ms" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">MS Staff Assignment</label>
                          <select
                            id="pump2-ms"
                            required
                            value={assignments.Pump2_MS}
                            onChange={(e) => setAssignments({ ...assignments, Pump2_MS: e.target.value })}
                            className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-3 mt-1 text-xs text-slate-100 focus:outline-none"
                          >
                            <option value="">-- Assign Staff --</option>
                            {staticData.staff.map((s: any) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="pump2-hsd" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">HSD Staff Assignment</label>
                          <select
                            id="pump2-hsd"
                            required
                            value={assignments.Pump2_HSD}
                            onChange={(e) => setAssignments({ ...assignments, Pump2_HSD: e.target.value })}
                            className="block w-full rounded border border-slate-700 bg-slate-900 py-1.5 px-3 mt-1 text-xs text-slate-100 focus:outline-none"
                          >
                            <option value="">-- Assign Staff --</option>
                            {staticData.staff.map((s: any) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-950 px-8 py-5 border-t border-slate-850 flex justify-end gap-4">
              <button
                onClick={() => setWizardOpen(false)}
                className="px-5 py-2.5 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-350 text-xs font-bold transition-all"
              >
                Close Wizard
              </button>

              {wizardStep === 1 ? (
                <button
                  onClick={handleCloseActiveDutyStep}
                  disabled={actionLoading}
                  className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all shadow-md"
                >
                  {actionLoading ? 'Closing shift...' : 'Verify Readings & Close Shift'}
                </button>
              ) : (
                <button
                  onClick={handleStartNewDutyStep}
                  disabled={actionLoading}
                  className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md"
                >
                  {actionLoading ? 'Opening shift...' : 'Initialize Next Duty Shift'}
                </button>
              )}
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

    </div>
  );
}
