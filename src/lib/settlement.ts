import { calculateStockMetrics } from '@/lib/stockCalculations';

export interface DutySettlementResult {
  dutyId: string;
  dutyNumber: number;
  status: string;
  startTime: Date | string;
  endTime: Date | string | null;
  managerName: string;

  // 3. Staff Assignment & Attendance
  assignmentsByPump: Array<{
    pumpName: string;
    msStaff: string;
    hsdStaff: string;
  }>;
  staffAttendance: Array<{
    staffId: string;
    staffName: string;
    status: 'PRESENT' | 'ABSENT' | 'NOT SCHEDULED';
    assignedPump?: string;
  }>;

  // 4. Stock / Dip / Density / Variation
  tankDips: {
    ms?: {
      openingStock: number;
      receipts: number;
      sales: number;
      expectedClosing: number;
      physicalDip: number;
      dipCm?: number;
      chartCalculatedLitres?: number;
      correctedLitres?: number;
      finalLitres?: number;
      density?: number;
      variance: number;
      isCorrected?: boolean;
      correctionReason?: string;
    };
    hsd?: {
      openingStock: number;
      receipts: number;
      sales: number;
      expectedClosing: number;
      physicalDip: number;
      dipCm?: number;
      chartCalculatedLitres?: number;
      correctedLitres?: number;
      finalLitres?: number;
      density?: number;
      variance: number;
      isCorrected?: boolean;
      correctionReason?: string;
    };
  };

  // 5. Complete Meter Readings (Strict Order: Pump 1 [MS-1, HSD-1, MS-2, HSD-2], Pump 2 [MS-3, HSD-3, MS-4, HSD-4])
  meterReadingsOrdered: Array<{
    id: string;
    pumpName: string;
    gunName: string;
    fuelType: string;
    assignedStaff: string;
    previousReading: number;
    currentReading: number;
    litresSold: number;
    priceUsed: number;
    salesAmount: number;
  }>;

  // 6. Fuel Sales Summary
  totalMsSoldLitres: number;
  totalMsSalesAmount: number;
  totalHsdSoldLitres: number;
  totalHsdSalesAmount: number;
  totalFuelSoldLitres: number;
  totalFuelSalesAmount: number;

  // 7. Tank Sample / Testing
  msTestingLitres: number;
  msTestingAmount: number;
  hsdTestingLitres: number;
  hsdTestingAmount: number;
  totalTestingAmount: number;

  // 8. Oil Sales
  oilSales: Array<{
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
  }>;
  totalOilSales: number;

  // 9. Credit Given & Collections
  creditGiven: Array<{
    id: string;
    customerName: string;
    indentNumber?: string;
    productName?: string;
    quantity?: number;
    unitPrice?: number;
    amount: number;
  }>;
  creditCollections: Array<{
    id: string;
    customerName: string;
    description?: string;
    amount: number;
  }>;
  totalCreditGiven: number;
  totalCreditCollections: number;

  // 10. Expenses
  expenses: Array<{
    id: string;
    categoryName: string;
    description: string;
    amount: number;
    paymentMethod: string;
    enteredBy: string;
    timestamp: Date | string;
  }>;
  totalExpenses: number;
  cashExpenses: number;
  digitalExpenses: number;

  // 11. Digital Payments Breakdown
  digitalPayments: {
    phonePe: number;
    gpay: number;
    paytm: number;
    bharatPe: number;
    cardPayments: number;
    bankTransfer: number;
    totalDigital: number;
  };

  // 12. Final Accounting Settlement
  grossInflow: number; // Fuel Sales + Oil Sales + Credit Collections
  totalDeductions: number; // Digital Payments + Credit Given + Testing + Cash Expenses
  expectedCash: number;
  actualCash: number;
  cashDifference: number;
  settlementStatus: 'BALANCED' | 'SHORTAGE' | 'SURPLUS';

  // 13. Bank Deposit
  bankDeposit: number;
  cashRetained: number;

  // 14. Shortage / Surplus Assignments
  shortageAssignments: Array<{
    id: string;
    staffName: string;
    amount: number;
    reason?: string;
    assignedBy: string;
  }>;
}

const GUN_STRICT_ORDER = ['MS-1', 'HSD-1', 'MS-2', 'HSD-2', 'MS-3', 'HSD-3', 'MS-4', 'HSD-4'];

export function calculateDutySettlement(
  dutySession: any,
  allStaff?: any[],
  allPumps?: any[]
): DutySettlementResult {
  if (!dutySession) {
    throw new Error("No duty session provided to calculateDutySettlement");
  }

  // 1. Meter Readings & Sorting (Section 5)
  const assignments = dutySession.assignments || [];
  const rawReadings = dutySession.meterReadings || [];
  const meterReadingsOrdered = [...rawReadings].sort((a, b) => {
    const nameA = a.gun?.name || '';
    const nameB = b.gun?.name || '';
    const indexA = GUN_STRICT_ORDER.indexOf(nameA);
    const indexB = GUN_STRICT_ORDER.indexOf(nameB);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    return nameA.localeCompare(nameB);
  }).map((mr: any) => {
    const pName = mr.gun?.pump?.name || 'Pump 1';
    const fType = mr.gun?.fuelType || 'MS';
    const matchedAssignment = assignments.find((a: any) => 
      (a.pump?.name === pName || a.pumpId === pName) && a.fuelType === fType
    );
    const assignedStaff = matchedAssignment?.staff?.name || 'Unassigned';

    return {
      id: mr.id,
      pumpName: pName,
      gunName: mr.gun?.name || 'Gun',
      fuelType: fType,
      assignedStaff,
      previousReading: Number(mr.previousReading || 0),
      currentReading: Number(mr.currentReading || 0),
      litresSold: Number(mr.litresSold || 0),
      priceUsed: Number(mr.priceUsed || 0),
      salesAmount: Number(mr.salesAmount || 0),
    };
  });

  // 2. Fuel Summary (Section 6)
  let totalMsSoldLitres = 0;
  let totalMsSalesAmount = 0;
  let totalHsdSoldLitres = 0;
  let totalHsdSalesAmount = 0;

  meterReadingsOrdered.forEach((mr) => {
    if (mr.fuelType === 'MS') {
      totalMsSoldLitres += mr.litresSold;
      totalMsSalesAmount += mr.salesAmount;
    } else {
      totalHsdSoldLitres += mr.litresSold;
      totalHsdSalesAmount += mr.salesAmount;
    }
  });

  const totalFuelSoldLitres = totalMsSoldLitres + totalHsdSoldLitres;
  const totalFuelSalesAmount = totalMsSalesAmount + totalHsdSalesAmount;

  // 3. Tank Sample / Testing (Section 7)
  const samples = dutySession.tankSamples || [];
  const msSample = samples.find((s: any) => s.fuelType === 'MS');
  const hsdSample = samples.find((s: any) => s.fuelType === 'HSD');

  const msTestingLitres = Number(msSample?.litres || 0);
  const msTestingAmount = Number(msSample?.amount || 0);
  const hsdTestingLitres = Number(hsdSample?.litres || 0);
  const hsdTestingAmount = Number(hsdSample?.amount || 0);
  const totalTestingAmount = msTestingAmount + hsdTestingAmount;

  // 4. Oil Sales (Section 8)
  const oilSalesRaw = dutySession.oilSales || [];
  const oilSales = oilSalesRaw.map((s: any) => ({
    id: s.id,
    productName: s.productName || s.product?.name || 'Oil Product',
    quantity: Number(s.quantity || 0),
    unitPrice: Number(s.unitPrice || 0),
    totalAmount: Number(s.totalAmount || 0),
  }));
  const totalOilSales = oilSales.reduce((sum: number, s: any) => sum + s.totalAmount, 0);

  // 5. Credit Given & Collections (Section 9)
  const creditTxs = dutySession.creditTransactions || [];
  const creditGiven = creditTxs
    .filter((t: any) => t.transactionType === 'CREDIT_SALE')
    .map((t: any) => ({
      id: t.id,
      customerName: t.customer?.name || 'Customer',
      indentNumber: t.indentNumber,
      productName: t.productName,
      quantity: t.quantity,
      unitPrice: t.unitPrice,
      amount: Number(t.amount || 0),
    }));

  const creditCollections = creditTxs
    .filter((t: any) => t.transactionType === 'COLLECTION')
    .map((t: any) => ({
      id: t.id,
      customerName: t.customer?.name || 'Customer',
      description: t.description,
      amount: Number(t.amount || 0),
    }));

  const totalCreditGiven = creditGiven.reduce((sum: number, t: any) => sum + t.amount, 0);
  const totalCreditCollections = creditCollections.reduce((sum: number, t: any) => sum + t.amount, 0);

  // 6. Expenses (Section 10)
  const expensesRaw = dutySession.expenses || [];
  const expenses = expensesRaw.map((e: any) => ({
    id: e.id,
    categoryName: e.category?.name || 'General',
    description: e.description || '',
    amount: Number(e.amount || 0),
    paymentMethod: e.paymentMethod || 'Cash',
    enteredBy: e.enteredBy?.username || 'Staff',
    timestamp: e.timestamp,
  }));

  const totalExpenses = expenses.reduce((sum: number, e: any) => sum + e.amount, 0);
  const cashExpenses = expenses
    .filter((e: any) => (e.paymentMethod || '').toLowerCase() === 'cash')
    .reduce((sum: number, e: any) => sum + e.amount, 0);
  const digitalExpenses = totalExpenses - cashExpenses;

  // 7. Digital Payments Breakdown (Section 11)
  // Extract persisted digital payments or sum up digital payment methods from expenses / duty fields
  let phonePe = Number(dutySession.phonePe || 0);
  let gpay = Number(dutySession.gpay || 0);
  let paytm = Number(dutySession.paytm || 0);
  let bharatPe = Number(dutySession.bharatPe || 0);
  let cardPayments = Number(dutySession.cardPayments || 0);
  let bankTransfer = Number(dutySession.bankTransfer || 0);

  let totalDigital = Number(dutySession.totalDigital || 0);
  if (totalDigital === 0) {
    totalDigital = phonePe + gpay + paytm + bharatPe + cardPayments + bankTransfer;
  }

  // 8. Gross Inflow & Accounting Settlement (Section 12)
  const grossInflow = totalFuelSalesAmount + totalOilSales + totalCreditCollections;
  const totalDeductions = totalDigital + totalCreditGiven + totalTestingAmount + cashExpenses;
  
  // 8. Gross Inflow & Accounting Settlement
  const expectedCash = Number((grossInflow - totalDeductions).toFixed(2));
  // Bank Deposited Cash is entered directly by manager
  const bankDeposit = Number(dutySession.bankDeposit || dutySession.actualCash || 0);
  const actualCash = bankDeposit;
  const cashDifference = Number((bankDeposit - expectedCash).toFixed(2));

  let settlementStatus: 'BALANCED' | 'SHORTAGE' | 'SURPLUS' = 'BALANCED';
  if (cashDifference < -0.01) {
    settlementStatus = 'SHORTAGE';
  } else if (cashDifference > 0.01) {
    settlementStatus = 'SURPLUS';
  }

  const cashRetained = Number(dutySession.cashRetained || 0);

  // 10. Staff Assignment & Attendance (Section 3)
  const assignmentsByPump = [
    {
      pumpName: 'Pump 1',
      msStaff: assignments.find((a: any) => (a.pump?.name === 'Pump 1' || a.pumpId === 'Pump 1') && a.fuelType === 'MS')?.staff?.name || 'Not Assigned',
      hsdStaff: assignments.find((a: any) => (a.pump?.name === 'Pump 1' || a.pumpId === 'Pump 1') && a.fuelType === 'HSD')?.staff?.name || 'Not Assigned',
    },
    {
      pumpName: 'Pump 2',
      msStaff: assignments.find((a: any) => (a.pump?.name === 'Pump 2' || a.pumpId === 'Pump 2') && a.fuelType === 'MS')?.staff?.name || 'Not Assigned',
      hsdStaff: assignments.find((a: any) => (a.pump?.name === 'Pump 2' || a.pumpId === 'Pump 2') && a.fuelType === 'HSD')?.staff?.name || 'Not Assigned',
    },
  ];

  const assignedStaffIds = new Set(assignments.map((a: any) => a.staffId));
  const staffAttendance: DutySettlementResult['staffAttendance'] = [];

  if (allStaff && Array.isArray(allStaff)) {
    allStaff.forEach((s: any) => {
      const isAssigned = assignedStaffIds.has(s.id);
      const assignedAssignment = assignments.find((a: any) => a.staffId === s.id);
      staffAttendance.push({
        staffId: s.id,
        staffName: s.name,
        status: isAssigned ? 'PRESENT' : 'NOT SCHEDULED',
        assignedPump: assignedAssignment ? `${assignedAssignment.pump?.name || 'Pump'} (${assignedAssignment.fuelType})` : undefined,
      });
    });
  } else {
    // If master staff list is not passed, use assigned staff as PRESENT
    assignments.forEach((a: any) => {
      if (a.staff) {
        staffAttendance.push({
          staffId: a.staff.id,
          staffName: a.staff.name,
          status: 'PRESENT',
          assignedPump: `${a.pump?.name || 'Pump'} (${a.fuelType})`,
        });
      }
    });
  }

  // 11. Stock / Dip / Density / Variation (Section 4)
  const dips = dutySession.tankDips || [];
  const msDip = dips.find((d: any) => d.fuelType === 'MS');
  const hsdDip = dips.find((d: any) => d.fuelType === 'HSD');

  const getMsOpeningStock = () => {
    if (!msDip) return null;
    if (msDip.openingStock !== null && msDip.openingStock !== undefined && Number(msDip.openingStock) > 0) {
      return Number(msDip.openingStock);
    }
    if (msDip.expectedClosing !== null && msDip.expectedClosing !== undefined && Number(msDip.expectedClosing) > 0) {
      return Number(msDip.expectedClosing) + totalMsSoldLitres;
    }
    const finalVal = msDip.finalLitres ?? msDip.physicalDip ?? msDip.chartCalculatedLitres;
    if (finalVal !== null && finalVal !== undefined && Number(finalVal) > 0) {
      return Number(finalVal) + totalMsSoldLitres;
    }
    return null;
  };

  const getHsdOpeningStock = () => {
    if (!hsdDip) return null;
    if (hsdDip.openingStock !== null && hsdDip.openingStock !== undefined && Number(hsdDip.openingStock) > 0) {
      return Number(hsdDip.openingStock);
    }
    if (hsdDip.expectedClosing !== null && hsdDip.expectedClosing !== undefined && Number(hsdDip.expectedClosing) > 0) {
      return Number(hsdDip.expectedClosing) + totalHsdSoldLitres;
    }
    const finalVal = hsdDip.finalLitres ?? hsdDip.physicalDip ?? hsdDip.chartCalculatedLitres;
    if (finalVal !== null && finalVal !== undefined && Number(finalVal) > 0) {
      return Number(finalVal) + totalHsdSoldLitres;
    }
    return null;
  };

  const msMetrics = msDip ? calculateStockMetrics({
    fuelType: 'MS',
    openingStock: getMsOpeningStock(),
    receipts: msDip.receipts ?? 0,
    physicalDispensing: msDip.physicalDispensing ?? totalMsSoldLitres,
    dipCm: msDip.dipCm,
    isCorrected: msDip.isCorrected,
    correctedLitres: msDip.correctedLitres,
  }) : null;

  const hsdMetrics = hsdDip ? calculateStockMetrics({
    fuelType: 'HSD',
    openingStock: getHsdOpeningStock(),
    receipts: hsdDip.receipts ?? 0,
    physicalDispensing: hsdDip.physicalDispensing ?? totalHsdSoldLitres,
    dipCm: hsdDip.dipCm,
    isCorrected: hsdDip.isCorrected,
    correctedLitres: hsdDip.correctedLitres,
  }) : null;

  const tankDips: DutySettlementResult['tankDips'] = {
    ms: msDip && msMetrics ? {
      openingStock: msMetrics.openingStock ?? 0,
      receipts: msMetrics.receipts,
      sales: msMetrics.physicalDispensing,
      expectedClosing: msMetrics.expectedClosingStock ?? 0,
      physicalDip: msMetrics.finalVerifiedStock ?? 0,
      dipCm: msMetrics.dipCm ?? undefined,
      chartCalculatedLitres: msMetrics.chartCalculatedStock ?? undefined,
      correctedLitres: msMetrics.correctedStock ?? undefined,
      finalLitres: msMetrics.finalVerifiedStock ?? undefined,
      density: dutySession.msDensity ? Number(dutySession.msDensity) : (msDip.density ? Number(msDip.density) : undefined),
      variance: msMetrics.stockVariation ?? 0,
      isCorrected: !!msDip.isCorrected,
      correctionReason: msDip.correctionReason || undefined,
    } : undefined,
    hsd: hsdDip && hsdMetrics ? {
      openingStock: hsdMetrics.openingStock ?? 0,
      receipts: hsdMetrics.receipts,
      sales: hsdMetrics.physicalDispensing,
      expectedClosing: hsdMetrics.expectedClosingStock ?? 0,
      physicalDip: hsdMetrics.finalVerifiedStock ?? 0,
      dipCm: hsdMetrics.dipCm ?? undefined,
      chartCalculatedLitres: hsdMetrics.chartCalculatedStock ?? undefined,
      correctedLitres: hsdMetrics.correctedStock ?? undefined,
      finalLitres: hsdMetrics.finalVerifiedStock ?? undefined,
      density: dutySession.hsdDensity ? Number(dutySession.hsdDensity) : (hsdDip.density ? Number(hsdDip.density) : undefined),
      variance: hsdMetrics.stockVariation ?? 0,
      isCorrected: !!hsdDip.isCorrected,
      correctionReason: hsdDip.correctionReason || undefined,
    } : undefined,
  };

  // 12. Shortage Assignments (Section 14)
  const shortageAssignments = (dutySession.shortageAssignments || []).map((sa: any) => ({
    id: sa.id,
    staffName: sa.staff?.name || 'Staff Member',
    amount: Number(sa.amount || 0),
    reason: sa.reason || 'Shortage Assigned',
    assignedBy: sa.assignedBy?.username || 'Owner',
  }));

  return {
    dutyId: dutySession.id,
    dutyNumber: dutySession.dutyNumber,
    status: dutySession.status,
    startTime: dutySession.startTime,
    endTime: dutySession.endTime,
    managerName: dutySession.manager?.username || 'Manager',
    assignmentsByPump,
    staffAttendance,
    tankDips,
    meterReadingsOrdered,
    totalMsSoldLitres,
    totalMsSalesAmount,
    totalHsdSoldLitres,
    totalHsdSalesAmount,
    totalFuelSoldLitres,
    totalFuelSalesAmount,
    msTestingLitres,
    msTestingAmount,
    hsdTestingLitres,
    hsdTestingAmount,
    totalTestingAmount,
    oilSales,
    totalOilSales,
    creditGiven,
    creditCollections,
    totalCreditGiven,
    totalCreditCollections,
    expenses,
    totalExpenses,
    cashExpenses,
    digitalExpenses,
    digitalPayments: {
      phonePe,
      gpay,
      paytm,
      bharatPe,
      cardPayments,
      bankTransfer,
      totalDigital,
    },
    grossInflow,
    totalDeductions,
    expectedCash,
    actualCash,
    cashDifference,
    settlementStatus,
    bankDeposit,
    cashRetained,
    shortageAssignments,
  };
}
