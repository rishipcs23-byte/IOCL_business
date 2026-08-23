'use server';

import { db } from './db';
import { getSession, hashPassword, requireAuth, loginUser, logoutUser } from './auth';
import { revalidatePath } from 'next/cache';

// Helper to log audit events
async function logAudit(userId: string, action: string, recordType: string, recordId: string, oldValue?: string, newValue?: string) {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action,
        recordType,
        recordId,
        oldValue: oldValue || null,
        newValue: newValue || null,
      },
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}

// ----------------- AUTHENTICATION ACTIONS -----------------

export async function loginAction(prevState: any, formData: FormData) {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  if (!username || !password) {
    return { error: 'Please enter both username and password' };
  }

  const passHash = hashPassword(password);
  const session = await loginUser(username, passHash);

  if (!session) {
    return { error: 'Invalid username or password' };
  }

  return { success: true, role: session.role };
}

export async function logoutAction() {
  await logoutUser();
  revalidatePath('/');
}

// ----------------- SETUP / SETTINGS ACTIONS -----------------

export async function updateFuelPriceAction(fuelType: 'MS' | 'HSD', price: number, effectiveFromStr: string) {
  const session = await requireAuth(['OWNER']);
  const effectiveFrom = new Date(effectiveFromStr);

  const newPrice = await db.fuelPrice.create({
    data: {
      fuelType,
      price,
      effectiveFrom,
    },
  });

  await logAudit(session.id, 'CREATE_FUEL_PRICE', 'FuelPrice', newPrice.id, undefined, `${fuelType} -> ₹${price} (eff: ${effectiveFromStr})`);
  revalidatePath('/pricing');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function addStaffAction(name: string) {
  const session = await requireAuth(['OWNER']);
  const staff = await db.staff.create({
    data: { name },
  });
  await logAudit(session.id, 'CREATE_STAFF', 'Staff', staff.id, undefined, name);
  revalidatePath('/staff');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function toggleStaffStatusAction(id: string, active: boolean) {
  const session = await requireAuth(['OWNER']);
  const staff = await db.staff.update({
    where: { id },
    data: { active },
  });
  await logAudit(session.id, 'TOGGLE_STAFF_STATUS', 'Staff', id, `active: ${!active}`, `active: ${active}`);
  revalidatePath('/staff');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function deleteStaffAction(id: string) {
  const session = await requireAuth(['OWNER']);
  const assignmentCount = await db.dutyAssignment.count({ where: { staffId: id } });
  
  if (assignmentCount > 0) {
    // Soft delete / Deactivate to preserve historical records
    await db.staff.update({
      where: { id },
      data: { active: false },
    });
    await logAudit(session.id, 'DISABLE_STAFF', 'Staff', id, undefined, 'Soft deactivated due to historical duty records');
    revalidatePath('/staff');
    revalidatePath('/dashboard');
    return { success: true, message: 'Staff member deactivated because historical duty records exist.' };
  } else {
    await db.staff.delete({ where: { id } });
    await logAudit(session.id, 'DELETE_STAFF', 'Staff', id);
    revalidatePath('/staff');
    revalidatePath('/dashboard');
    return { success: true, message: 'Staff member deleted successfully.' };
  }
}

export async function addCustomerAction(name: string, contactDetails?: string, address?: string) {
  const session = await requireAuth(['OWNER']);
  const customer = await db.customer.create({
    data: { name, contactDetails, address, balance: 0 },
  });
  await logAudit(session.id, 'CREATE_CUSTOMER', 'Customer', customer.id, undefined, name);
  revalidatePath('/credit');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function toggleCustomerStatusAction(id: string, active: boolean) {
  const session = await requireAuth(['OWNER']);
  const customer = await db.customer.update({
    where: { id },
    data: { active },
  });
  await logAudit(session.id, 'TOGGLE_CUSTOMER_STATUS', 'Customer', id, `active: ${!active}`, `active: ${active}`);
  revalidatePath('/credit');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function deleteCustomerAction(id: string) {
  const session = await requireAuth(['OWNER']);
  const txCount = await db.creditTransaction.count({ where: { customerId: id } });

  if (txCount > 0) {
    await db.customer.update({
      where: { id },
      data: { active: false },
    });
    await logAudit(session.id, 'DISABLE_CUSTOMER', 'Customer', id, undefined, 'Soft deactivated due to historical credit transactions');
    revalidatePath('/credit');
    revalidatePath('/dashboard');
    return { success: true, message: 'Customer deactivated because historical credit transactions exist.' };
  } else {
    await db.customer.delete({ where: { id } });
    await logAudit(session.id, 'DELETE_CUSTOMER', 'Customer', id);
    revalidatePath('/credit');
    revalidatePath('/dashboard');
    return { success: true, message: 'Customer deleted successfully.' };
  }
}

export async function addOilProductAction(name: string, price: number) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const product = await db.oilProduct.create({
    data: { name, price },
  });

  await db.oilPriceHistory.create({
    data: {
      productId: product.id,
      price,
    },
  });

  await logAudit(session.id, 'CREATE_OIL_PRODUCT', 'OilProduct', product.id, undefined, `${name} -> ₹${price}`);
  revalidatePath('/oil');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function updateOilPriceAction(productId: string, price: number) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const oldProduct = await db.oilProduct.findUnique({ where: { id: productId } });
  
  const product = await db.oilProduct.update({
    where: { id: productId },
    data: { price },
  });

  await db.oilPriceHistory.create({
    data: {
      productId,
      price,
    },
  });

  await logAudit(session.id, 'UPDATE_OIL_PRICE', 'OilProduct', productId, `₹${oldProduct?.price}`, `₹${price}`);
  revalidatePath('/oil');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function toggleOilProductStatusAction(id: string, active: boolean) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  await db.oilProduct.update({
    where: { id },
    data: { active },
  });
  await logAudit(session.id, 'TOGGLE_OIL_PRODUCT', 'OilProduct', id, undefined, `Status -> ${active ? 'Active' : 'Disabled'}`);
  revalidatePath('/oil');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function deleteOilProductAction(id: string) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const salesCount = await db.oilSale.count({ where: { productId: id } });
  if (salesCount > 0) {
    await db.oilProduct.update({
      where: { id },
      data: { active: false },
    });
    await logAudit(session.id, 'DISABLE_OIL_PRODUCT', 'OilProduct', id, undefined, 'Soft deactivated due to historical sales');
    revalidatePath('/oil');
    revalidatePath('/dashboard');
    return { success: true, message: 'Product deactivated (historical sales exist).' };
  } else {
    await db.oilProduct.delete({ where: { id } });
    await logAudit(session.id, 'DELETE_OIL_PRODUCT', 'OilProduct', id);
    revalidatePath('/oil');
    revalidatePath('/dashboard');
    return { success: true, message: 'Product deleted successfully.' };
  }
}

// ----------------- DUTY SESSION CORE WORKFLOW -----------------

export async function getActiveDutySession() {
  return await db.dutySession.findFirst({
    where: { status: 'OPEN' },
    include: {
      assignments: { include: { staff: true, pump: true } },
      meterReadings: { include: { gun: { include: { pump: true } } } },
      oilSales: { include: { enteredBy: true } },
      expenses: { include: { category: true, enteredBy: true } },
      creditTransactions: { include: { customer: true, enteredBy: true } },
      tankDips: true,
      tankSamples: true,
      manager: true,
    },
  });
}

export async function startNewDutySession(startTimeStr: string, assignments: { pumpId: string, fuelType: string, staffId: string }[]) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const startTime = new Date(startTimeStr);

  // Validate there is no active duty session
  const activeSession = await db.dutySession.findFirst({
    where: { status: 'OPEN' },
  });
  if (activeSession) {
    throw new Error('A duty session is already open. Please close it first.');
  }

  // Find next duty number
  const lastSession = await db.dutySession.findFirst({
    orderBy: { dutyNumber: 'desc' },
  });
  const nextDutyNumber = lastSession ? lastSession.dutyNumber + 1 : 100;

  // Let's retrieve closing readings of the previous duty session to carry forward
  let previousReadings: Record<string, number> = {};
  if (lastSession) {
    const lastReadings = await db.meterReading.findMany({
      where: { dutySessionId: lastSession.id },
      include: { gun: true },
    });
    for (const r of lastReadings) {
      previousReadings[r.gun.name] = r.currentReading;
    }
  }

  // Get active guns in database
  const activeGuns = await db.gun.findMany({
    where: { active: true },
  });

  // Create the new duty session inside a transaction
  const newDuty = await db.$transaction(async (tx) => {
    const s = await tx.dutySession.create({
      data: {
        dutyNumber: nextDutyNumber,
        startTime,
        managerId: session.id,
        status: 'OPEN',
      },
    });

    // Create staff assignments
    for (const a of assignments) {
      await tx.dutyAssignment.create({
        data: {
          dutySessionId: s.id,
          pumpId: a.pumpId,
          fuelType: a.fuelType,
          staffId: a.staffId,
        },
      });
    }

    // Create default meter reading slots for each active gun
    for (const gun of activeGuns) {
      // Find the appropriate historical fuel price effective at session startTime
      const priceRecord = await tx.fuelPrice.findFirst({
        where: {
          fuelType: gun.fuelType,
          effectiveFrom: { lte: startTime },
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      const price = priceRecord ? priceRecord.price : (gun.fuelType === 'MS' ? 112.15 : 100.08); // fallback to seed prices

      const prevReading = previousReadings[gun.name] !== undefined ? previousReadings[gun.name] : 0.0;

      await tx.meterReading.create({
        data: {
          dutySessionId: s.id,
          gunId: gun.id,
          previousReading: prevReading,
          currentReading: prevReading, // initialize current reading to previous reading
          litresSold: 0.0,
          priceUsed: price,
          salesAmount: 0.0,
        },
      });
    }

    return s;
  });

  await logAudit(session.id, 'START_DUTY_SESSION', 'DutySession', newDuty.id, undefined, `Duty #${nextDutyNumber} started`);
  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  return { success: true, dutyId: newDuty.id };
}

export async function saveMeterReadingsAction(dutySessionId: string, readings: { gunId: string, currentReading: number, previousReading?: number }[]) {
  const session = await requireAuth(['OWNER', 'MANAGER']);

  // Fetch the duty session
  const duty = await db.dutySession.findUnique({
    where: { id: dutySessionId },
    include: { meterReadings: { include: { gun: true } } },
  });

  if (!duty || duty.status !== 'OPEN') {
    throw new Error('Duty session is not open or does not exist');
  }

  // Validate all readings
  for (const r of readings) {
    const existing = duty.meterReadings.find((mr) => mr.gunId === r.gunId);
    if (!existing) continue;

    const prevReading = (r.previousReading !== undefined && session.role === 'OWNER')
      ? r.previousReading
      : existing.previousReading;

    if (r.currentReading < prevReading) {
      throw new Error(`Current reading for ${existing.gun.name} (${r.currentReading}) cannot be lower than the previous reading (${prevReading}).`);
    }
  }

  // Save readings inside a transaction
  await db.$transaction(async (tx) => {
    for (const r of readings) {
      const existing = duty.meterReadings.find((mr) => mr.gunId === r.gunId);
      if (!existing) continue;

      const prevReading = (r.previousReading !== undefined && session.role === 'OWNER')
        ? r.previousReading
        : existing.previousReading;

      const litresSold = r.currentReading - prevReading;
      const salesAmount = litresSold * existing.priceUsed;

      await tx.meterReading.update({
        where: { id: existing.id },
        data: {
          previousReading: prevReading,
          currentReading: r.currentReading,
          litresSold,
          salesAmount,
        },
      });
    }
  });

  await logAudit(session.id, 'SAVE_METER_READINGS', 'DutySession', dutySessionId, undefined, 'Updated meter readings');
  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  return { success: true };
}

// ----------------- OPERATIONAL TRANSACTION ACTIONS -----------------

export async function addOilSaleAction(dutySessionId: string, productId: string, quantity: number) {
  const session = await requireAuth(['OWNER', 'MANAGER']);

  const product = await db.oilProduct.findUnique({ where: { id: productId } });
  if (!product) throw new Error('Product not found');

  const totalAmount = quantity * product.price;

  const sale = await db.oilSale.create({
    data: {
      dutySessionId,
      productId,
      productName: product.name,
      quantity,
      unitPrice: product.price,
      totalAmount,
      enteredById: session.id,
    },
  });

  await logAudit(session.id, 'ADD_OIL_SALE', 'OilSale', sale.id, undefined, `${product.name} x ${quantity} = ₹${totalAmount}`);
  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  return { success: true };
}

export async function deleteOilSaleAction(id: string) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const sale = await db.oilSale.delete({ where: { id } });
  await logAudit(session.id, 'DELETE_OIL_SALE', 'OilSale', id, JSON.stringify(sale));
  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  return { success: true };
}

export async function addExpenseAction(dutySessionId: string, categoryId: string, description: string, amount: number, paymentMethod: string, remarks?: string) {
  const session = await requireAuth(['OWNER', 'MANAGER']);

  const expense = await db.expense.create({
    data: {
      dutySessionId,
      categoryId,
      description,
      amount,
      paymentMethod,
      remarks,
      enteredById: session.id,
    },
  });

  await logAudit(session.id, 'ADD_EXPENSE', 'Expense', expense.id, undefined, `₹${amount} for ${description}`);
  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  return { success: true };
}

export async function deleteExpenseAction(id: string) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const expense = await db.expense.delete({ where: { id } });
  await logAudit(session.id, 'DELETE_EXPENSE', 'Expense', id, JSON.stringify(expense));
  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  return { success: true };
}

export async function addCreditTransactionAction(
  dutySessionId: string,
  customerId: string,
  transactionType: 'CREDIT_SALE' | 'COLLECTION',
  amount: number,
  indentNumber?: string,
  productName?: string,
  quantity?: number,
  unitPrice?: number,
  description?: string
) {
  const session = await requireAuth(['OWNER', 'MANAGER']);

  if (!dutySessionId) throw new Error('Duty session ID is required');
  if (!customerId) throw new Error('Customer ID is required');
  if (!transactionType || (transactionType !== 'CREDIT_SALE' && transactionType !== 'COLLECTION')) {
    throw new Error('Invalid transaction type');
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Transaction amount must be a positive number greater than ₹0');
  }

  // Transact and update Customer balance
  const trans = await db.$transaction(async (tx) => {
    const t = await tx.creditTransaction.create({
      data: {
        customerId,
        dutySessionId,
        transactionType,
        indentNumber: indentNumber ? indentNumber.trim() : null,
        productName: productName ? productName.trim() : null,
        quantity: quantity !== undefined && !isNaN(Number(quantity)) && Number(quantity) > 0 ? Number(quantity) : null,
        unitPrice: unitPrice !== undefined && !isNaN(Number(unitPrice)) && Number(unitPrice) > 0 ? Number(unitPrice) : null,
        amount: numAmount,
        description: description ? description.trim() : null,
        enteredById: session.id,
      },
      include: { customer: true, enteredBy: true },
    });

    const balanceAdjustment = transactionType === 'CREDIT_SALE' ? numAmount : -numAmount;

    await tx.customer.update({
      where: { id: customerId },
      data: {
        balance: { increment: balanceAdjustment },
      },
    });

    return t;
  });

  await logAudit(session.id, 'ADD_CREDIT_TRANSACTION', 'CreditTransaction', trans.id, undefined, `${transactionType}: ${trans.customer.name} - ${productName || ''} (${quantity || 0} L @ ₹${unitPrice || 0}) = ₹${numAmount}`);
  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  return { success: true, transactionId: trans.id };
}

export async function deleteCreditTransactionAction(id: string) {
  const session = await requireAuth(['OWNER', 'MANAGER']);

  // Fetch transaction to reverse balance before deleting
  const trans = await db.creditTransaction.findUnique({ where: { id } });
  if (!trans) throw new Error('Transaction not found');

  await db.$transaction(async (tx) => {
    const balanceAdjustment = trans.transactionType === 'CREDIT_SALE' ? -trans.amount : trans.amount;

    await tx.customer.update({
      where: { id: trans.customerId },
      data: {
        balance: { increment: balanceAdjustment },
      },
    });

    await tx.creditTransaction.delete({ where: { id } });
  });

  await logAudit(session.id, 'DELETE_CREDIT_TRANSACTION', 'CreditTransaction', id, JSON.stringify(trans));
  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  return { success: true };
}

export async function recordTankDipAction(dutySessionId: string, fuelType: 'MS' | 'HSD', physicalDip: number, expectedClosing: number) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const variance = physicalDip - expectedClosing;

  const dip = await db.tankDip.upsert({
    where: {
      dutySessionId_fuelType: {
        dutySessionId,
        fuelType,
      },
    },
    update: {
      physicalDip,
      expectedClosing,
      variance,
      timestamp: new Date(),
    },
    create: {
      dutySessionId,
      fuelType,
      physicalDip,
      expectedClosing,
      variance,
    },
  });

  await logAudit(session.id, 'RECORD_TANK_DIP', 'TankDip', dip.id, undefined, `${fuelType} physical dip: ${physicalDip} L (var: ${variance} L)`);
  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  return { success: true };
}

export async function recordTankSampleAction(dutySessionId: string, msLitres: number, hsdLitres: number) {
  const session = await requireAuth(['OWNER', 'MANAGER']);

  const duty = await db.dutySession.findUnique({
    where: { id: dutySessionId },
    include: { meterReadings: true }
  });

  if (!duty || duty.status !== 'OPEN') {
    throw new Error('Duty session is not open or valid.');
  }

  // Get active prices for MS and HSD
  const msPriceRecord = await db.fuelPrice.findFirst({
    where: { fuelType: 'MS' },
    orderBy: { effectiveFrom: 'desc' },
  });
  const hsdPriceRecord = await db.fuelPrice.findFirst({
    where: { fuelType: 'HSD' },
    orderBy: { effectiveFrom: 'desc' },
  });

  const msPrice = msPriceRecord ? msPriceRecord.price : 112.15;
  const hsdPrice = hsdPriceRecord ? hsdPriceRecord.price : 100.08;

  const validMsLitres = Math.max(0, Number(msLitres) || 0);
  const validHsdLitres = Math.max(0, Number(hsdLitres) || 0);

  const msAmount = Number((validMsLitres * msPrice).toFixed(2));
  const hsdAmount = Number((validHsdLitres * hsdPrice).toFixed(2));

  await db.$transaction(async (tx) => {
    // Upsert MS Sample
    await tx.tankSample.upsert({
      where: {
        dutySessionId_fuelType: {
          dutySessionId,
          fuelType: 'MS',
        },
      },
      update: {
        litres: validMsLitres,
        priceUsed: msPrice,
        amount: msAmount,
        createdBy: session.id,
      },
      create: {
        dutySessionId,
        fuelType: 'MS',
        litres: validMsLitres,
        priceUsed: msPrice,
        amount: msAmount,
        createdBy: session.id,
      },
    });

    // Upsert HSD Sample
    await tx.tankSample.upsert({
      where: {
        dutySessionId_fuelType: {
          dutySessionId,
          fuelType: 'HSD',
        },
      },
      update: {
        litres: validHsdLitres,
        priceUsed: hsdPrice,
        amount: hsdAmount,
        createdBy: session.id,
      },
      create: {
        dutySessionId,
        fuelType: 'HSD',
        litres: validHsdLitres,
        priceUsed: hsdPrice,
        amount: hsdAmount,
        createdBy: session.id,
      },
    });
  });

  await logAudit(
    session.id,
    'RECORD_TANK_SAMPLE',
    'TankSample',
    dutySessionId,
    undefined,
    `MS Sample: ${validMsLitres} L (₹${msAmount}), HSD Sample: ${validHsdLitres} L (₹${hsdAmount})`
  );

  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  return { success: true };
}

// ----------------- DUTY CLOSING & RECONCILIATION -----------------

export async function closeDutySessionAction(
  dutySessionId: string,
  actualCash: number,
  digitalPayments: number,
  cardPayments: number,
  expectedCash: number
) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const cashDifference = actualCash - expectedCash;

  // Perform closing operations in a database transaction
  await db.$transaction(async (tx) => {
    // 1. Fetch current duty data
    const duty = await tx.dutySession.findUnique({
      where: { id: dutySessionId },
      include: {
        meterReadings: { include: { gun: true } },
        tankDips: true,
      },
    });

    if (!duty || duty.status !== 'OPEN') {
      throw new Error('Duty session is not open');
    }

    // 2. Update Duty session details
    await tx.dutySession.update({
      where: { id: dutySessionId },
      data: {
        status: 'CLOSED',
        endTime: new Date(),
        expectedCash,
        actualCash,
        cashDifference,
      },
    });

    // 3. Update Tank Stock balances
    // For each fuel type, expected closing stock becomes opening stock for next.
    // We update the official TankStock table.
    const fuelTypes = ['MS', 'HSD'];
    for (const fuelType of fuelTypes) {
      // Get physical dip variance
      const dipRecord = duty.tankDips.find(d => d.fuelType === fuelType);
      const physicalDip = dipRecord ? dipRecord.physicalDip : 0.0;
      
      // Get total sales in litres for this fuel type in this duty
      const fuelReadings = duty.meterReadings.filter(mr => mr.gun.fuelType === fuelType);
      const totalLitresSold = fuelReadings.reduce((sum, r) => sum + r.litresSold, 0);

      // Get last stock entry
      const lastStock = await tx.tankStock.findFirst({
        where: { fuelType },
        orderBy: { timestamp: 'desc' },
      });

      const openingStock = lastStock ? lastStock.physicalDip : 0.0; // Opening is previous physical dip (adjusted closing)
      // Receipts in this duty duration: we can check tank receipts or allow manual addition
      const receipts = 0.0; // For simplified local seed, assume 0 or manual later
      const expectedClosing = openingStock + receipts - totalLitresSold;
      const variance = physicalDip - expectedClosing;

      await tx.tankStock.create({
        data: {
          fuelType,
          openingStock,
          receipts,
          sales: totalLitresSold,
          expectedClosing,
          physicalDip: physicalDip > 0 ? physicalDip : expectedClosing, // fallback if dip not recorded
          variance: physicalDip > 0 ? variance : 0.0,
        },
      });
    }
  });

  await logAudit(session.id, 'CLOSE_DUTY_SESSION', 'DutySession', dutySessionId, undefined, `Duty closed, difference: ₹${cashDifference}`);
  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  revalidatePath('/acc/history');
  return { success: true };
}

// ----------------- REPORTS & HISTORICAL QUERIES -----------------

export async function getHistoricalDuties() {
  return await db.dutySession.findMany({
    orderBy: { dutyNumber: 'desc' },
    include: {
      manager: true,
      meterReadings: {
        include: { gun: true },
      },
      assignments: { include: { staff: true, pump: true } },
      oilSales: { include: { enteredBy: true } },
      expenses: { include: { category: true, enteredBy: true } },
      creditTransactions: { include: { customer: true, enteredBy: true } },
      tankDips: true,
      tankSamples: true,
    },
  });
}

export async function getDutyReport(dutySessionId: string) {
  return await db.dutySession.findUnique({
    where: { id: dutySessionId },
    include: {
      assignments: { include: { staff: true, pump: true } },
      meterReadings: { include: { gun: { include: { pump: true } } } },
      oilSales: { include: { enteredBy: true } },
      expenses: { include: { category: true, enteredBy: true } },
      creditTransactions: { include: { customer: true, enteredBy: true } },
      tankDips: true,
      tankSamples: true,
      manager: true,
    },
  });
}

export async function getDashboardStats() {
  // Return key indicators for Owner dashboard
  const activeDuty = await getActiveDutySession();
  const lastClosedDuty = await db.dutySession.findFirst({
    where: { status: 'CLOSED' },
    orderBy: { dutyNumber: 'desc' },
    include: { meterReadings: true, oilSales: true, expenses: true, creditTransactions: true },
  });

  const totalOutstandingCredit = await db.customer.aggregate({
    _sum: { balance: true },
  });

  const outstandingVal = totalOutstandingCredit._sum.balance || 0.0;

  // Let's get total fuel sales (last 30 days or general aggregated)
  const closedDuties = await db.dutySession.findMany({
    where: { status: 'CLOSED' },
    take: 10,
    orderBy: { dutyNumber: 'desc' },
    include: {
      meterReadings: true,
    },
  });

  return {
    activeDutyId: activeDuty?.id || null,
    activeDutyNumber: activeDuty?.dutyNumber || null,
    outstandingCredit: outstandingVal,
    recentDuties: closedDuties.map(d => ({
      id: d.id,
      dutyNumber: d.dutyNumber,
      startTime: d.startTime,
      endTime: d.endTime,
      sales: d.meterReadings.reduce((sum, r) => sum + r.salesAmount, 0),
      cashDiff: d.cashDifference,
    })),
  };
}

export async function getStaffPerformanceReport() {
  const assignments = await db.dutyAssignment.findMany({
    include: {
      staff: true,
      dutySession: {
        include: {
          meterReadings: { include: { gun: true } },
        },
      },
    },
  });

  const staffReport: Record<string, { name: string, duties: number, msLitres: number, hsdLitres: number, sales: number }> = {};

  for (const a of assignments) {
    if (a.dutySession.status !== 'CLOSED') continue; // only count closed duties

    if (!staffReport[a.staffId]) {
      staffReport[a.staffId] = {
        name: a.staff.name,
        duties: 0,
        msLitres: 0,
        hsdLitres: 0,
        sales: 0,
      };
    }

    const report = staffReport[a.staffId];
    report.duties += 1;

    // A staff handles MS/HSD for a pump. Let's calculate the litres sold for the guns they were responsible for.
    // Pump assignments apply to all guns of that fuelType belonging to that pump.
    const relevantReadings = a.dutySession.meterReadings.filter(
      (mr) => mr.gun.pumpId === a.pumpId && mr.gun.fuelType === a.fuelType
    );

    for (const mr of relevantReadings) {
      if (a.fuelType === 'MS') {
        report.msLitres += mr.litresSold;
      } else {
        report.hsdLitres += mr.litresSold;
      }
      report.sales += mr.salesAmount;
    }
  }

  return Object.values(staffReport);
}

export async function getCreditLedgerReport() {
  const customers = await db.customer.findMany({
    include: {
      transactions: {
        orderBy: { timestamp: 'asc' },
        include: { dutySession: true, enteredBy: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  return customers;
}

export async function getExpenseReport() {
  return await db.expense.findMany({
    orderBy: { timestamp: 'desc' },
    include: {
      category: true,
      dutySession: true,
      enteredBy: true,
    },
  });
}

export async function getOilSalesReport() {
  return await db.oilSale.findMany({
    orderBy: { timestamp: 'desc' },
    include: {
      dutySession: true,
      enteredBy: true,
    },
  });
}

export async function getStockReport() {
  return await db.tankStock.findMany({
    orderBy: { timestamp: 'desc' },
  });
}

export async function getAuditLogs() {
  const session = await requireAuth(['OWNER']);
  return await db.auditLog.findMany({
    orderBy: { timestamp: 'desc' },
    include: { user: true },
    take: 100,
  });
}

export async function getStaticData() {
  // Fetch lists needed for drop-downs
  const pumps = await db.pump.findMany({ where: { active: true }, include: { guns: true } });
  const staff = await db.staff.findMany({ where: { active: true } });
  const products = await db.oilProduct.findMany({ where: { active: true } });
  const categories = await db.expenseCategory.findMany();
  const customers = await db.customer.findMany({ where: { active: true } });
  
  // Find current fuel prices
  const msPrice = await db.fuelPrice.findFirst({
    where: { fuelType: 'MS' },
    orderBy: { effectiveFrom: 'desc' },
  });
  
  const hsdPrice = await db.fuelPrice.findFirst({
    where: { fuelType: 'HSD' },
    orderBy: { effectiveFrom: 'desc' },
  });

  return {
    pumps,
    staff,
    products,
    categories,
    customers,
    prices: {
      MS: msPrice ? msPrice.price : 112.15,
      HSD: hsdPrice ? hsdPrice.price : 100.08,
    },
  };
}

export async function updateMeterReadingAction(readingId: string, newCurrentReading: number, reason: string) {
  const session = await requireAuth(['OWNER']);

  if (isNaN(newCurrentReading) || newCurrentReading < 0) {
    throw new Error('Invalid reading value.');
  }

  const reading = await db.meterReading.findUnique({
    where: { id: readingId },
    include: { gun: true }
  });

  if (!reading) {
    throw new Error('Meter reading record not found.');
  }

  if (newCurrentReading < reading.previousReading) {
    throw new Error(`Closing reading (${newCurrentReading}) cannot be less than opening reading (${reading.previousReading}).`);
  }

  const litresSold = newCurrentReading - reading.previousReading;
  const salesAmount = litresSold * reading.priceUsed;

  const oldValue = `Current Reading: ${reading.currentReading}, Litres: ${reading.litresSold}, Amount: ₹${reading.salesAmount}`;

  const updated = await db.meterReading.update({
    where: { id: readingId },
    data: {
      currentReading: newCurrentReading,
      litresSold,
      salesAmount
    }
  });

  await logAudit(
    session.id,
    'CORRECT_METER_READING',
    'MeterReading',
    readingId,
    oldValue,
    `Corrected Reading: ${newCurrentReading}, Litres: ${litresSold}, Amount: ₹${salesAmount} | Reason: ${reason || 'Owner Correction'}`
  );

  revalidatePath('/dashboard');
  revalidatePath('/acc/current');

  return { success: true, reading: updated };
}

export async function requireUserAction() {
  const session = await getSession();
  return session;
}
