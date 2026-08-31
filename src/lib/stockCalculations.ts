import { getChartCalculatedStock } from '@/lib/dipChart20KL';

export interface StockCalculationInputs {
  fuelType: 'MS' | 'HSD';
  openingStock?: number | null;        // Physical tank stock at start of duty session (litres)
  receipts?: number | null;            // Fuel receipts delivered during duty session (litres)
  physicalDispensing?: number | null;  // Total physical nozzle sales litres during duty session
  dipCm?: number | string | null;      // Dip reading in cm
  isCorrected?: boolean;
  correctedLitres?: number | string | null; // Manual override litres if corrected
}

export interface StockCalculationResult {
  fuelType: 'MS' | 'HSD';
  openingStock: number | null;
  receipts: number;
  physicalDispensing: number;
  expectedClosingStock: number | null;
  dipCm: number | null;
  chartCalculatedStock: number | null;
  correctedStock: number | null;
  finalVerifiedStock: number | null;
  stockVariation: number | null;
  isCorrected: boolean;
  
  // Human-readable status strings for UI
  openingStockText: string;
  chartStockText: string;
  expectedClosingText: string;
  finalVerifiedStockText: string;
  variationText: string;
  isComplete: boolean;
}

/**
 * Calculates Expected Closing Stock and Stock Variation for a single fuel type (MS or HSD).
 * Centralized logic used across:
 * - Change Duty Wizard (Step 1 & Step 4 Review)
 * - Duty Settlement Engine (settlement.ts)
 * - Database Closing Actions (actions.ts)
 * - Past Duty Reports (OwnerPastDutyReport.tsx)
 * - Owner Stock & Variance Reports
 */
export function calculateStockMetrics(inputs: StockCalculationInputs): StockCalculationResult {
  const { fuelType } = inputs;

  // 1. OPENING STOCK
  const openingStock = (inputs.openingStock !== null && inputs.openingStock !== undefined && !isNaN(Number(inputs.openingStock)))
    ? Number(inputs.openingStock)
    : null;

  // 2. FUEL RECEIPTS (defaults to 0 L if none during duty)
  const receipts = (inputs.receipts !== null && inputs.receipts !== undefined && !isNaN(Number(inputs.receipts)) && Number(inputs.receipts) >= 0)
    ? Number(inputs.receipts)
    : 0;

  // 3. PHYSICAL DISPENSING (must come from meter movement litres)
  const physicalDispensing = (inputs.physicalDispensing !== null && inputs.physicalDispensing !== undefined && !isNaN(Number(inputs.physicalDispensing)))
    ? Math.max(0, Number(inputs.physicalDispensing))
    : 0;

  // 4. EXPECTED CLOSING STOCK = Opening + Receipts - Physical Dispensing
  const expectedClosingStock = openingStock !== null
    ? Number((openingStock + receipts - physicalDispensing).toFixed(1))
    : null;

  // 5. DIP & CHART STOCK
  const rawDip = inputs.dipCm;
  const dipCm = (rawDip !== null && rawDip !== undefined && rawDip !== '' && !isNaN(Number(rawDip)) && Number(rawDip) >= 0 && Number(rawDip) <= 211)
    ? Number(rawDip)
    : null;

  const chartCalculatedStock = dipCm !== null
    ? Number(getChartCalculatedStock(dipCm).toFixed(1))
    : null;

  // 6. MANUAL CORRECTION & FINAL VERIFIED STOCK
  const isCorrected = !!inputs.isCorrected;
  const rawCorrected = inputs.correctedLitres;
  const correctedStock = (isCorrected && rawCorrected !== null && rawCorrected !== undefined && rawCorrected !== '' && !isNaN(Number(rawCorrected)))
    ? Number(Number(rawCorrected).toFixed(1))
    : null;

  // Final verified stock is null if dip was not entered/valid!
  let finalVerifiedStock: number | null = null;
  if (isCorrected && correctedStock !== null) {
    finalVerifiedStock = correctedStock;
  } else if (chartCalculatedStock !== null) {
    finalVerifiedStock = chartCalculatedStock;
  }

  // 7. STOCK VARIATION = Final Verified Stock - Expected Closing Stock
  // VARIATION IS PENDING UNLESS ALL REQUIRED INPUTS EXIST
  let stockVariation: number | null = null;
  if (finalVerifiedStock !== null && expectedClosingStock !== null) {
    stockVariation = Number((finalVerifiedStock - expectedClosingStock).toFixed(1));
  }

  // 8. TEXT RENDERING HELPERS
  const openingStockText = openingStock !== null
    ? `${openingStock.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
    : 'Opening stock unavailable';

  const chartStockText = chartCalculatedStock !== null
    ? `${chartCalculatedStock.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
    : (dipCm === null ? 'Enter Dip cm' : 'Pending');

  const expectedClosingText = expectedClosingStock !== null
    ? `${expectedClosingStock.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
    : 'Pending';

  const finalVerifiedStockText = finalVerifiedStock !== null
    ? `${finalVerifiedStock.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
    : 'Pending';

  let variationText = 'Pending';
  if (stockVariation !== null) {
    if (stockVariation > 0.01) {
      variationText = `+${stockVariation.toFixed(1)} L SURPLUS`;
    } else if (stockVariation < -0.01) {
      variationText = `${stockVariation.toFixed(1)} L SHORTAGE`;
    } else {
      variationText = '0.0 L BALANCED';
    }
  }

  const isComplete = stockVariation !== null;

  return {
    fuelType,
    openingStock,
    receipts,
    physicalDispensing,
    expectedClosingStock,
    dipCm,
    chartCalculatedStock,
    correctedStock,
    finalVerifiedStock,
    stockVariation,
    isCorrected,
    openingStockText,
    chartStockText,
    expectedClosingText,
    finalVerifiedStockText,
    variationText,
    isComplete,
  };
}
