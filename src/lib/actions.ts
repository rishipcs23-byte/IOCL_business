'use server';

import { db } from './db';
import { getSession, hashPassword, requireAuth, loginUser, logoutUser } from './auth';
import { revalidatePath } from 'next/cache';
import { calculateStockMetrics } from '@/lib/stockCalculations';
import { sendLowFuelStockAlert, sendDutyClosingReport, sendTestEmail, diagnoseSmtpConfig, LOW_FUEL_THRESHOLD_LITRES, DutyClosingReportData, ensureDefaultEmailRecipientsMigrated } from '@/lib/email';
import { calculateDutySettlement } from '@/lib/settlement';

const TX_OPTIONS = { maxWait: 20000, timeout: 60000 };




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
  try {
    const username = ((formData.get('username') as string) || '').trim().toLowerCase();
    const password = ((formData.get('password') as string) || '').trim();

    if (!username || !password) {
      return { error: 'Please enter both username and password' };
    }

    let passHash = hashPassword(password);
    let session = await loginUser(username, passHash);

    // Fallback demo password support (password123)
    if (!session) {
      if (password === 'password123') {
        const altHash = hashPassword(username === 'owner' ? 'owner123' : 'manager123');
        session = await loginUser(username, altHash);
      } else if (password === 'owner123' || password === 'manager123') {
        const altHash = hashPassword('password123');
        session = await loginUser(username, altHash);
      }
    }

    if (!session) {
      return { error: 'Invalid username or password' };
    }

    return { success: true, role: session.role };
  } catch (err: any) {
    console.error('Login action error:', err);
    return { error: err?.message || 'Authentication error occurred.' };
  }
}

export async function logoutAction() {
  await logoutUser();
  revalidatePath('/');
}

// ----------------- SETUP / SETTINGS ACTIONS -----------------

export async function updateFuelPriceAction(
  fuelType: 'MS' | 'HSD',
  price: number,
  effectiveFromStr: string,
  checkpointReadings?: Record<string, number>
) {
  const session = await requireAuth(['OWNER']);
  const effectiveFrom = new Date(effectiveFromStr);

  const newPrice = await db.fuelPrice.create({
    data: {
      fuelType,
      price,
      effectiveFrom,
    },
  });

  // Process OPEN duty sessions to create price checkpoints per nozzle
  const openDuties = await db.dutySession.findMany({
    where: { status: 'OPEN' },
    include: {
      meterReadings: {
        include: {
          gun: true,
          intervals: { orderBy: { createdAt: 'asc' } },
        },
      },
    },
  });

  for (const duty of openDuties) {
    for (const mr of duty.meterReadings) {
      if (mr.gun && mr.gun.fuelType === fuelType) {
        // Determine checkpoint meter reading for this gun
        const checkpointVal = checkpointReadings && checkpointReadings[mr.gunId] !== undefined
          ? Number(checkpointReadings[mr.gunId])
          : Math.max(mr.previousReading, mr.currentReading);

        const existingIntervals = mr.intervals || [];

        if (existingIntervals.length === 0) {
          // Interval 1: Pre-price-change interval (Preserve old price & readings)
          const litres1 = Number(Math.max(0, checkpointVal - mr.previousReading).toFixed(2));
          const sales1 = Number((litres1 * mr.priceUsed).toFixed(2));

          await db.meterReadingInterval.create({
            data: {
              meterReadingId: mr.id,
              startReading: mr.previousReading,
              endReading: checkpointVal,
              litresSold: litres1,
              priceUsed: mr.priceUsed, // PRESERVED PERMANENTLY
              salesAmount: sales1,
              effectiveFrom: duty.startTime,
              checkpointReason: 'PRE_PRICE_REVISION',
            },
          });

          // Interval 2: Post-price-change interval (New price starting from checkpointVal)
          await db.meterReadingInterval.create({
            data: {
              meterReadingId: mr.id,
              startReading: checkpointVal,
              endReading: checkpointVal,
              litresSold: 0.0,
              priceUsed: price, // NEW PRICE
              salesAmount: 0.0,
              effectiveFrom: effectiveFrom,
              checkpointReason: 'MID_DUTY_PRICE_CHANGE',
            },
          });
        } else {
          // Close active interval at checkpointVal
          const lastInterval = existingIntervals[existingIntervals.length - 1];
          const litresPrev = Number(Math.max(0, checkpointVal - lastInterval.startReading).toFixed(2));
          const salesPrev = Number((litresPrev * lastInterval.priceUsed).toFixed(2));

          await db.meterReadingInterval.update({
            where: { id: lastInterval.id },
            data: {
              endReading: checkpointVal,
              litresSold: litresPrev,
              salesAmount: salesPrev,
            },
          });

          // Create new active interval at new price
          await db.meterReadingInterval.create({
            data: {
              meterReadingId: mr.id,
              startReading: checkpointVal,
              endReading: checkpointVal,
              litresSold: 0.0,
              priceUsed: price,
              salesAmount: 0.0,
              effectiveFrom: effectiveFrom,
              checkpointReason: 'MID_DUTY_PRICE_CHANGE',
            },
          });
        }

        // Recalculate total litres & sales amount for the overall MeterReading from all intervals
        const allIntervals = await db.meterReadingInterval.findMany({
          where: { meterReadingId: mr.id },
        });

        const totalLitres = Number(allIntervals.reduce((sum, i) => sum + i.litresSold, 0).toFixed(2));
        const totalSales = Number(allIntervals.reduce((sum, i) => sum + i.salesAmount, 0).toFixed(2));

        await db.meterReading.update({
          where: { id: mr.id },
          data: {
            currentReading: Math.max(mr.currentReading, checkpointVal),
            litresSold: totalLitres,
            salesAmount: totalSales,
            priceUsed: price,
          },
        });
      }
    }

    const samples = await db.tankSample.findMany({
      where: { dutySessionId: duty.id, fuelType },
    });
    for (const sample of samples) {
      const newAmount = Number((sample.litres * price).toFixed(2));
      await db.tankSample.update({
        where: { id: sample.id },
        data: {
          priceUsed: price,
          amount: newAmount,
        },
      });
    }
  }

  await logAudit(session.id, 'CREATE_FUEL_PRICE', 'FuelPrice', newPrice.id, undefined, `${fuelType} -> ₹${price} (eff: ${effectiveFromStr})`);
  revalidatePath('/pricing');
  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
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
  const staff = await db.staff.findUnique({ where: { id } });
  if (!staff) throw new Error('Staff member not found.');

  await db.$transaction(async (tx) => {
    await (tx as any).staffAttendance.updateMany({
      where: { outgoingStaffId: id },
      data: { outgoingStaffId: null },
    });
    await (tx as any).staffAttendance.updateMany({
      where: { incomingStaffId: id },
      data: { incomingStaffId: null },
    });
    await (tx as any).staffAttendance.deleteMany({
      where: { staffId: id },
    });
    await tx.dutyAssignment.deleteMany({
      where: { staffId: id },
    });
    await (tx as any).shortageAssignment.deleteMany({
      where: { staffId: id },
    });
    await tx.staff.delete({
      where: { id },
    });
  });

  await logAudit(session.id, 'DELETE_STAFF', 'Staff', id, staff.name, 'Permanently deleted staff member');
  revalidatePath('/staff');
  revalidatePath('/dashboard');
  revalidatePath('/reports');
  return { success: true, message: `Staff member "${staff.name}" permanently deleted.` };
}

export async function addCustomerAction(name: string, contactDetails?: string, address?: string) {
  const session = await requireAuth(['OWNER']);
  const trimmedName = name?.trim() || '';
  if (!trimmedName) {
    throw new Error('Customer name is required.');
  }

  const existing = await db.customer.findFirst({
    where: { name: trimmedName },
  });
  if (existing) {
    throw new Error(`A customer with the name "${trimmedName}" already exists.`);
  }

  try {
    const customer = await db.customer.create({
      data: { name: trimmedName, contactDetails, address, balance: 0 },
    });
    await logAudit(session.id, 'CREATE_CUSTOMER', 'Customer', customer.id, undefined, trimmedName);
    revalidatePath('/credit');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: any) {
    if (err?.code === 'P2002' || (err?.message && err.message.includes('Unique constraint'))) {
      throw new Error(`A customer with the name "${trimmedName}" already exists.`);
    }
    throw err;
  }
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
  const trimmedName = name?.trim() || '';
  if (!trimmedName || isNaN(price) || price <= 0) {
    throw new Error('Valid product name and selling price are required.');
  }

  const existing = await db.oilProduct.findFirst({
    where: { name: trimmedName },
  });
  if (existing) {
    throw new Error(`An oil product with the name "${trimmedName}" already exists.`);
  }

  try {
    const product = await db.oilProduct.create({
      data: { name: trimmedName, price },
    });

    await db.oilPriceHistory.create({
      data: {
        productId: product.id,
        price,
      },
    });

    await logAudit(session.id, 'CREATE_OIL_PRODUCT', 'OilProduct', product.id, undefined, `${trimmedName} -> ₹${price}`);
    revalidatePath('/oil');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: any) {
    if (err?.code === 'P2002' || (err?.message && err.message.includes('Unique constraint'))) {
      throw new Error(`An oil product with the name "${trimmedName}" already exists.`);
    }
    throw err;
  }
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
  try {
    const session = await requireAuth(['OWNER', 'MANAGER']);
    const product = await db.oilProduct.findUnique({ where: { id } });
    if (!product) return { success: false, error: 'Product not found' };

    await db.$transaction(async (tx) => {
      // Delete associated sales & purchase items to allow clean removal of test/invalid products
      await tx.oilSale.deleteMany({ where: { productId: id } });
      await tx.oilPurchaseItem.deleteMany({ where: { productId: id } });
      await tx.oilProduct.delete({ where: { id } });
    }, TX_OPTIONS);

    // Run global inventory recalculation outside transaction after commit
    await recalculateCentralOilInventory();

    await logAudit(session.id, 'DELETE_OIL_PRODUCT', 'OilProduct', id, JSON.stringify(product));
    revalidatePath('/oil');
    revalidatePath('/dashboard');
    return { success: true, message: `Product "${product.name}" deleted successfully.` };
  } catch (err: any) {
    console.error('Error in deleteOilProductAction:', err);
    return { success: false, error: err?.message || 'Failed to delete product.' };
  }
}

// ----------------- DUTY SESSION CORE WORKFLOW -----------------

export async function getActiveDutySession() {
  return await db.dutySession.findFirst({
    where: { status: 'OPEN' },
    include: {
      assignments: { include: { staff: true, pump: true, gun: true } },
      meterReadings: {
        include: {
          gun: { include: { pump: true } },
          intervals: { orderBy: { createdAt: 'asc' } },
        },
      },
      oilSales: { include: { enteredBy: true, product: true } },
      sampleBoxSales: { include: { enteredBy: true } },
      expenses: { include: { category: true, enteredBy: true } },
      creditTransactions: { include: { customer: true, enteredBy: true } },
      tankDips: true,
      tankSamples: true,
      shortageAssignments: { include: { staff: true, assignedBy: true } },
      staffAttendances: { include: { staff: true, pump: true, gun: true, outgoingStaff: true, incomingStaff: true } },
      manager: true,
    },
  });
}

export async function startNewDutySession(
  startTimeStr: string,
  assignments: { pumpId: string, fuelType: string, gunId?: string, staffId: string }[],
  initialOpeningReadings?: Record<string, number>
) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const startTime = new Date(startTimeStr);

  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    throw new Error('Duty initialization failed: Mandatory staff assignments are missing. All guns must be assigned to staff.');
  }

  // Validate there is no active duty session
  const activeSession = await db.dutySession.findFirst({
    where: { status: 'OPEN' },
  });
  if (activeSession) {
    throw new Error(`An active duty is already in progress. Complete Duty #${activeSession.dutyNumber} before starting another duty.`);
  }

  // Find next duty number
  const lastSession = await db.dutySession.findFirst({
    orderBy: { dutyNumber: 'desc' },
  });
  const nextDutyNumber = lastSession ? lastSession.dutyNumber + 1 : 100;

  // Retrieve closing readings of the previous duty session to carry forward, or use initialOpeningReadings for First Duty
  let previousReadings: Record<string, number> = {};
  if (initialOpeningReadings && Object.keys(initialOpeningReadings).length > 0) {
    previousReadings = { ...initialOpeningReadings };
  } else if (lastSession) {
    const lastReadings = await db.meterReading.findMany({
      where: { dutySessionId: lastSession.id },
      include: { gun: true },
    });
    for (const r of lastReadings) {
      previousReadings[r.gun.name] = r.currentReading;
      previousReadings[r.gun.id] = r.currentReading;
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

    // Create staff assignments & initial attendance records
    for (const a of assignments) {
      await tx.dutyAssignment.create({
        data: {
          dutySessionId: s.id,
          pumpId: a.pumpId,
          fuelType: a.fuelType,
          gunId: a.gunId || null,
          staffId: a.staffId,
        },
      });

      const openingReading = a.gunId && previousReadings[a.gunId] ? previousReadings[a.gunId] : 0;

      await (tx as any).staffAttendance.create({
        data: {
          dutySessionId: s.id,
          staffId: a.staffId,
          pumpId: a.pumpId,
          gunId: a.gunId || null,
          fuelType: a.fuelType,
          startTime: startTime,
          startMeterReading: openingReading || 0,
          status: 'PRESENT',
          workingDays: 1.0,
          recordedById: session.id,
        },
      });
    }

    // Create default meter reading slots for each active gun
    for (const gun of activeGuns) {
      // Find the appropriate historical fuel price effective at session startTime
      let priceRecord = await tx.fuelPrice.findFirst({
        where: {
          fuelType: gun.fuelType,
          effectiveFrom: { lte: startTime },
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (!priceRecord) {
        priceRecord = await tx.fuelPrice.findFirst({
          where: { fuelType: gun.fuelType },
          orderBy: { effectiveFrom: 'desc' },
        });
      }
      const price = priceRecord ? priceRecord.price : (gun.fuelType === 'MS' ? 112.15 : 100.08); // fallback to seed prices

      const prevReading = previousReadings[gun.name] !== undefined
        ? previousReadings[gun.name]
        : (previousReadings[gun.id] !== undefined ? previousReadings[gun.id] : 0.0);

      await tx.meterReading.create({
        data: {
          dutySessionId: s.id,
          gunId: gun.id,
          previousReading: prevReading,
          currentReading: prevReading, // initialize current reading to previous reading (0 litres sold at start)
          litresSold: 0.0,
          priceUsed: price,
          salesAmount: 0.0,
        },
      });
    }

    return s;
  }, TX_OPTIONS);

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
    include: {
      meterReadings: {
        include: {
          gun: true,
          intervals: { orderBy: { createdAt: 'asc' } },
        },
      },
    },
  });

  if (!duty || duty.status !== 'OPEN') {
    throw new Error('Duty session is not open or does not exist');
  }

  // Validate all readings
  for (const r of readings) {
    const existing = duty.meterReadings.find((mr) => mr.gunId === r.gunId);
    if (!existing) continue;

    const existingIntervals = existing.intervals || [];
    const applicablePrev = existingIntervals.length > 0
      ? existingIntervals[existingIntervals.length - 1].startReading
      : existing.previousReading;

    if (r.currentReading < applicablePrev) {
      throw new Error(`Closing reading for ${existing.gun.name} (${r.currentReading}) cannot be lower than the previous reading (${applicablePrev}).`);
    }
  }

  // Save readings inside a transaction
  await db.$transaction(async (tx) => {
    for (const r of readings) {
      const existing = duty.meterReadings.find((mr) => mr.gunId === r.gunId);
      if (!existing) continue;

      const prevReading = (r.previousReading !== undefined && (session.role === 'OWNER' || existing.previousReading === 0))
        ? r.previousReading
        : existing.previousReading;

      const existingIntervals = existing.intervals || [];

      if (existingIntervals.length > 0) {
        const lastInterval = existingIntervals[existingIntervals.length - 1];
        const lastLitres = Math.max(0, r.currentReading - lastInterval.startReading);
        const lastSales = Number((lastLitres * lastInterval.priceUsed).toFixed(2));

        await tx.meterReadingInterval.update({
          where: { id: lastInterval.id },
          data: {
            endReading: r.currentReading,
            litresSold: Number(lastLitres.toFixed(2)),
            salesAmount: lastSales,
          },
        });

        const otherIntervalsLitres = existingIntervals.slice(0, existingIntervals.length - 1).reduce((sum: number, i: any) => sum + (i.litresSold || 0), 0);
        const otherIntervalsSales = existingIntervals.slice(0, existingIntervals.length - 1).reduce((sum: number, i: any) => sum + (i.salesAmount || 0), 0);
        const totalLitres = Number((otherIntervalsLitres + lastLitres).toFixed(2));
        const totalSales = Number((otherIntervalsSales + lastSales).toFixed(2));

        await tx.meterReading.update({
          where: { id: existing.id },
          data: {
            previousReading: prevReading,
            currentReading: r.currentReading,
            litresSold: totalLitres,
            salesAmount: totalSales,
          },
        });
      } else {
        const litresSold = Math.max(0, r.currentReading - prevReading);
        const salesAmount = Number((litresSold * existing.priceUsed).toFixed(2));

        await tx.meterReadingInterval.create({
          data: {
            meterReadingId: existing.id,
            startReading: prevReading,
            endReading: r.currentReading,
            litresSold: Number(litresSold.toFixed(2)),
            priceUsed: existing.priceUsed,
            salesAmount,
            effectiveFrom: duty.startTime,
            checkpointReason: 'SAVED_CHECKPOINT',
          },
        });

        await tx.meterReading.update({
          where: { id: existing.id },
          data: {
            previousReading: prevReading,
            currentReading: r.currentReading,
            litresSold: Number(litresSold.toFixed(2)),
            salesAmount,
          },
        });
      }
    }
  }, TX_OPTIONS);

  await logAudit(session.id, 'SAVE_METER_READINGS', 'DutySession', dutySessionId, undefined, 'Updated meter readings');
  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  return { success: true };
}

// ----------------- OPERATIONAL TRANSACTION ACTIONS -----------------

export async function recalculateCentralOilInventory(tx?: any) {
  const client = tx || db;

  const products = await client.oilProduct.findMany({
    include: {
      purchaseItems: true,
      sales: true,
    },
  });

  const updatedProducts = [];

  for (const product of products) {
    const openingStock = (product as any).openingStock || 0.0;

    // Sum valid purchase items
    const totalPurchased = product.purchaseItems.reduce(
      (sum: number, item: any) => sum + (item.quantity || 0),
      0
    );

    // Sum valid sales
    const totalSold = product.sales.reduce(
      (sum: number, sale: any) => sum + (sale.quantity || 0),
      0
    );

    // Current Stock derived EXCLUSIVELY from transaction ledger: Opening + Purchases - Sales
    const currentStock = Number((openingStock + totalPurchased - totalSold).toFixed(2));

    // Weighted-Average Purchase Cost calculation
    let totalPurchaseCost = openingStock * (product.purchasePrice || 0);
    let totalPurchasedQtyForAvg = openingStock;

    for (const item of product.purchaseItems) {
      totalPurchaseCost += (item.quantity || 0) * (item.unitPurchasePrice || 0);
      totalPurchasedQtyForAvg += (item.quantity || 0);
    }

    const weightedAverageCost = totalPurchasedQtyForAvg > 0
      ? Number((totalPurchaseCost / totalPurchasedQtyForAvg).toFixed(2))
      : Number((product.purchasePrice || 0).toFixed(2));

    // Synchronize DB model with authoritative ledger calculation only if state changed
    let updated = product;
    if (product.stockQuantity !== currentStock || Number(product.purchasePrice || 0) !== weightedAverageCost) {
      updated = await client.oilProduct.update({
        where: { id: product.id },
        data: {
          stockQuantity: currentStock,
          purchasePrice: weightedAverageCost,
        },
      });
    }

    const inventoryCostValue = Number((currentStock * weightedAverageCost).toFixed(2));
    const potentialRetailValue = Number((currentStock * product.price).toFixed(2));
    const minAlert = product.minStockAlert || 5.0;
    const isLowStock = currentStock <= minAlert && currentStock > 0;
    const isOutOfStock = currentStock <= 0;

    updatedProducts.push({
      ...updated,
      purchasedQty: totalPurchased,
      soldQty: totalSold,
      currentQty: currentStock,
      weightedAverageCost,
      inventoryCostValue,
      potentialRetailValue,
      isLowStock,
      isOutOfStock,
    });
  }

  return updatedProducts;
}

export async function addOilSaleAction(dutySessionId: string, productId: string, quantity: number) {
  try {
    const session = await requireAuth(['OWNER', 'MANAGER']);
    const numQty = Number(quantity);
    if (isNaN(numQty) || numQty <= 0) return { success: false, error: 'Quantity must be greater than 0' };

    let finalDutyId = dutySessionId;
    if (!finalDutyId || finalDutyId === 'LATEST') {
      const openDuty = await db.dutySession.findFirst({ where: { status: 'OPEN' } });
      if (openDuty) {
        finalDutyId = openDuty.id;
      } else {
        const latestDuty = await db.dutySession.findFirst({ orderBy: { dutyNumber: 'desc' } });
        if (latestDuty) {
          finalDutyId = latestDuty.id;
        } else {
          return { success: false, error: 'No duty session found in system to record oil sale.' };
        }
      }
    }

    const sale = await db.$transaction(async (tx) => {
      // Atomic stock validation on transaction client to prevent race conditions
      const product = await tx.oilProduct.findUnique({
        where: { id: productId },
        include: { purchaseItems: true, sales: true },
      });
      if (!product) throw new Error('Product not found');

      const openingStock = (product as any).openingStock || 0;
      const totalPurchased = product.purchaseItems.reduce((sum: number, item: any) => sum + item.quantity, 0);
      const totalSold = product.sales.reduce((sum: number, sale: any) => sum + sale.quantity, 0);
      const currentAvailableStock = openingStock + totalPurchased - totalSold;

      if (currentAvailableStock <= 0) {
        throw new Error(`Out of stock! "${product.name}" has 0 units available in stock. Cannot record sale.`);
      }

      if (numQty > currentAvailableStock) {
        throw new Error(`Insufficient stock! Cannot sell ${numQty} units of "${product.name}". Only ${currentAvailableStock} units available.`);
      }

      const totalAmount = numQty * product.price;

      const s = await tx.oilSale.create({
        data: {
          dutySessionId: finalDutyId,
          productId,
          productName: product.name,
          quantity: numQty,
          unitPrice: product.price,
          totalAmount,
          enteredById: session.id,
        },
      });

      // Update product stock directly inside atomic transaction
      const newStock = Number((currentAvailableStock - numQty).toFixed(2));
      await tx.oilProduct.update({
        where: { id: productId },
        data: { stockQuantity: newStock },
      });

      return s;
    }, TX_OPTIONS);

    // Sync global ledger & weighted prices outside the transaction
    await recalculateCentralOilInventory();

    await logAudit(session.id, 'ADD_OIL_SALE', 'OilSale', sale.id, undefined, `${sale.productName} x ${numQty} = ₹${sale.totalAmount}`);
    revalidatePath('/dashboard');
    revalidatePath('/acc/current');
    revalidatePath('/oil');
    return { success: true };
  } catch (err: any) {
    console.error('Error in addOilSaleAction:', err);
    return { success: false, error: err?.message || 'Failed to record oil sale.' };
  }
}

export async function deleteOilSaleAction(id: string) {
  try {
    const session = await requireAuth(['OWNER', 'MANAGER']);
    const sale = await db.oilSale.findUnique({ where: { id } });
    if (!sale) return { success: false, error: 'Sale not found' };

    await db.$transaction(async (tx) => {
      await tx.oilSale.delete({ where: { id } });
      await tx.oilProduct.update({
        where: { id: sale.productId },
        data: { stockQuantity: { increment: sale.quantity } },
      });
    }, TX_OPTIONS);

    // Recalculate central balances outside transaction after commit
    await recalculateCentralOilInventory();

    await logAudit(session.id, 'DELETE_OIL_SALE', 'OilSale', id, JSON.stringify(sale));
    revalidatePath('/dashboard');
    revalidatePath('/acc/current');
    revalidatePath('/oil');
    return { success: true };
  } catch (err: any) {
    console.error('Error in deleteOilSaleAction:', err);
    return { success: false, error: err?.message || 'Failed to delete oil sale.' };
  }
}

export async function recordOilPurchaseAction(
  supplierName: string,
  invoiceNumber: string,
  invoiceDateStr: string,
  items: { productId: string; quantity: number; unitPurchasePrice: number }[],
  notes?: string
) {
  try {
    const session = await requireAuth(['OWNER', 'MANAGER']);
    const invoiceDate = new Date(invoiceDateStr);

    if (!supplierName?.trim() || !invoiceNumber?.trim() || !items || items.length === 0) {
      return { success: false, error: 'Please fill all required invoice fields and at least one item.' };
    }

    // Prevent duplicate invoice entries
    const existingInv = await db.oilPurchase.findFirst({
      where: { invoiceNumber: invoiceNumber.trim() },
    });
    if (existingInv) {
      return { success: false, error: `Invoice number "${invoiceNumber.trim()}" already exists (Recorded on ${new Date(existingInv.invoiceDate).toLocaleDateString()}). Please enter a unique invoice number.` };
    }

    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPurchasePrice), 0);

    const purchase = await db.$transaction(async (tx) => {
      const p = await tx.oilPurchase.create({
        data: {
          supplierName: supplierName.trim(),
          invoiceNumber: invoiceNumber.trim(),
          invoiceDate,
          totalAmount,
          notes: notes ? notes.trim() : null,
          createdById: session.id,
          items: {
            create: items.map(item => ({
              productId: item.productId,
              quantity: Number(item.quantity),
              unitPurchasePrice: Number(item.unitPurchasePrice),
              totalPrice: Number(item.quantity) * Number(item.unitPurchasePrice),
            })),
          },
        },
        include: { items: true },
      });

      // Update product stock quantities for purchased items inside transaction
      for (const item of items) {
        await tx.oilProduct.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: Number(item.quantity) } },
        });
      }

      return p;
    }, TX_OPTIONS);

    // Recalculate global balances & weighted costs outside transaction after commit
    await recalculateCentralOilInventory();

    await logAudit(session.id, 'RECORD_OIL_PURCHASE', 'OilPurchase', purchase.id, undefined, `Inv #${invoiceNumber} from ${supplierName} for ₹${totalAmount}`);
    revalidatePath('/dashboard');
    revalidatePath('/oil');
    return { success: true, purchaseId: purchase.id };
  } catch (err: any) {
    console.error('Error in recordOilPurchaseAction:', err);
    return { success: false, error: err?.message || 'Failed to record purchase invoice.' };
  }
}

export async function deleteOilPurchaseAction(id: string) {
  try {
    const session = await requireAuth(['OWNER', 'MANAGER']);
    const purchase = await db.oilPurchase.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!purchase) return { success: false, error: 'Purchase invoice not found' };

    await db.$transaction(async (tx) => {
      await tx.oilPurchaseItem.deleteMany({ where: { purchaseId: id } });
      await tx.oilPurchase.delete({ where: { id } });
    }, TX_OPTIONS);

    await recalculateCentralOilInventory();

    await logAudit(session.id, 'DELETE_OIL_PURCHASE', 'OilPurchase', id, JSON.stringify(purchase));
    revalidatePath('/dashboard');
    revalidatePath('/oil');
    return { success: true };
  } catch (err: any) {
    console.error('Error in deleteOilPurchaseAction:', err);
    return { success: false, error: err?.message || 'Failed to delete purchase invoice.' };
  }
}

export async function updateOilProductOpeningStockAction(productId: string, openingStock: number) {
  try {
    const session = await requireAuth(['OWNER']);
    const numOpening = Math.max(0, Number(openingStock) || 0);

    const product = await db.oilProduct.findUnique({ where: { id: productId } });
    if (!product) return { success: false, error: 'Oil product not found' };

    const oldStock = product.openingStock;

    await db.oilProduct.update({
      where: { id: productId },
      data: { openingStock: numOpening },
    });

    await recalculateCentralOilInventory();

    await logAudit(session.id, 'UPDATE_OIL_OPENING_STOCK', 'OilProduct', productId, `Opening stock: ${oldStock}`, `Opening stock: ${numOpening}`);
    revalidatePath('/oil');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: any) {
    console.error('Error in updateOilProductOpeningStockAction:', err);
    return { success: false, error: err?.message || 'Failed to update opening stock.' };
  }
}


export async function createOilProductAction(
  name: string,
  price: number,
  purchasePrice: number = 0,
  minStockAlert: number = 5,
  openingStock: number = 0
) {
  try {
    const session = await requireAuth(['OWNER', 'MANAGER']);
    const trimmedName = name?.trim() || '';
    if (!trimmedName || isNaN(price) || price <= 0) {
      return { success: false, error: 'Valid product name and selling price are required.' };
    }

    const existing = await db.oilProduct.findFirst({
      where: { name: trimmedName },
    });
    if (existing) {
      return { success: false, error: `An oil product with the name "${trimmedName}" already exists.` };
    }

    const product = await db.$transaction(async (tx) => {
      const prod = await tx.oilProduct.create({
        data: {
          name: trimmedName,
          price: Number(price),
          purchasePrice: Math.max(0, Number(purchasePrice) || 0),
          minStockAlert: Math.max(1, Number(minStockAlert) || 5),
          openingStock: Math.max(0, Number(openingStock) || 0),
          stockQuantity: Math.max(0, Number(openingStock) || 0),
          active: true,
        } as any,
      });
      await recalculateCentralOilInventory(tx);
      return prod;
    }, TX_OPTIONS);

    await logAudit(session.id, 'CREATE_OIL_PRODUCT', 'OilProduct', product.id, undefined, `Created ${product.name}`);
    revalidatePath('/dashboard');
    revalidatePath('/oil');
    return { success: true, product };
  } catch (err: any) {
    if (err?.code === 'P2002' || (err?.message && err.message.includes('Unique constraint'))) {
      return { success: false, error: `An oil product with the name "${name?.trim()}" already exists.` };
    }
    console.error('Error in createOilProductAction:', err);
    return { success: false, error: err?.message || 'Failed to create oil product' };
  }
}

export async function updateOilProductAction(
  id: string,
  data: {
    name?: string;
    price?: number;
    purchasePrice?: number;
    minStockAlert?: number;
    openingStock?: number;
    active?: boolean;
  }
) {
  try {
    const session = await requireAuth(['OWNER', 'MANAGER']);
    const product = await db.oilProduct.findUnique({ where: { id } });
    if (!product) return { success: false, error: 'Product not found' };

    if (data.name !== undefined) {
      const trimmedName = data.name.trim();
      if (trimmedName.toLowerCase() !== product.name.toLowerCase()) {
        const existing = await db.oilProduct.findFirst({
          where: { name: trimmedName, id: { not: id } },
        });
        if (existing) {
          return { success: false, error: `An oil product with the name "${trimmedName}" already exists.` };
        }
      }
    }

    await db.$transaction(async (tx) => {
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name.trim();
      if (data.price !== undefined) updateData.price = Number(data.price);
      if (data.purchasePrice !== undefined) updateData.purchasePrice = Number(data.purchasePrice);
      if (data.minStockAlert !== undefined) updateData.minStockAlert = Number(data.minStockAlert);
      if (data.openingStock !== undefined) updateData.openingStock = Math.max(0, Number(data.openingStock));
      if (data.active !== undefined) updateData.active = Boolean(data.active);

      await tx.oilProduct.update({
        where: { id },
        data: updateData,
      });
      await recalculateCentralOilInventory(tx);
    }, TX_OPTIONS);

    await logAudit(session.id, 'UPDATE_OIL_PRODUCT', 'OilProduct', id, JSON.stringify(product), JSON.stringify(data));
    revalidatePath('/dashboard');
    revalidatePath('/oil');
    return { success: true };
  } catch (err: any) {
    if (err?.code === 'P2002' || (err?.message && err.message.includes('Unique constraint'))) {
      return { success: false, error: `An oil product with the name "${data.name?.trim()}" already exists.` };
    }
    console.error('Error in updateOilProductAction:', err);
    return { success: false, error: err?.message || 'Failed to update oil product' };
  }
}


export async function assignShortageAction(
  dutySessionId: string,
  staffId: string,
  amount: number,
  reason?: string
) {
  const session = await requireAuth(['OWNER', 'MANAGER']);

  if (!dutySessionId || !staffId || isNaN(amount) || amount <= 0) {
    throw new Error('Invalid shortage assignment details');
  }

  const assignment = await db.shortageAssignment.create({
    data: {
      dutySessionId,
      staffId,
      amount: Number(amount),
      reason: reason ? reason.trim() : 'Shortage Recorded',
      assignedById: session.id,
    },
    include: {
      staff: true,
      dutySession: true,
      assignedBy: true,
    },
  });

  await logAudit(
    session.id,
    'ASSIGN_SHORTAGE',
    'ShortageAssignment',
    assignment.id,
    undefined,
    `Assigned ₹${amount} shortage to ${assignment.staff.name} for Duty #${assignment.dutySession.dutyNumber}`
  );

  revalidatePath('/dashboard');
  revalidatePath('/acc/history');
  return { success: true, assignment };
}

export async function addExpenseAction(dutySessionId: string, categoryId: string, description: string, amount: number, paymentMethod: string, remarks?: string) {
  const session = await requireAuth(['OWNER', 'MANAGER']);

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Expense amount must be a positive number greater than ₹0');
  }
  if (!description || description.trim().length === 0) {
    throw new Error('Expense description is required');
  }

  let finalDutyId = dutySessionId;
  if (!finalDutyId || finalDutyId === 'LATEST') {
    const openDuty = await db.dutySession.findFirst({ where: { status: 'OPEN' } });
    if (openDuty) {
      finalDutyId = openDuty.id;
    } else {
      const latestDuty = await db.dutySession.findFirst({ orderBy: { dutyNumber: 'desc' } });
      if (latestDuty) {
        finalDutyId = latestDuty.id;
      } else {
        throw new Error('No duty session found in system to record expense.');
      }
    }
  }

  const expense = await db.expense.create({
    data: {
      dutySessionId: finalDutyId,
      categoryId,
      description: description.trim(),
      amount: numAmount,
      paymentMethod,
      remarks: remarks ? remarks.trim() : null,
      enteredById: session.id,
    },
  });

  await logAudit(session.id, 'ADD_EXPENSE', 'Expense', expense.id, undefined, `₹${numAmount} for ${description}`);
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
  dutySessionId: string | null | undefined,
  customerId: string,
  transactionType: 'CREDIT_SALE' | 'COLLECTION',
  amount: number,
  indentNumber?: string,
  productName?: string,
  quantity?: number,
  unitPrice?: number,
  description?: string,
  paymentMethod?: string,
  paymentReference?: string,
  bankName?: string,
  paymentDate?: string | Date
) {
  const session = await requireAuth(['OWNER', 'MANAGER']);

  let finalDutyId: string | null = null;
  if (dutySessionId === 'LATEST' || dutySessionId === 'CURRENT_DUTY') {
    const openDuty = await db.dutySession.findFirst({ where: { status: 'OPEN' } });
    if (openDuty) {
      finalDutyId = openDuty.id;
    } else {
      const latestDuty = await db.dutySession.findFirst({ orderBy: { dutyNumber: 'desc' } });
      if (latestDuty) {
        finalDutyId = latestDuty.id;
      }
    }
  } else if (dutySessionId && dutySessionId !== 'NONE') {
    finalDutyId = dutySessionId;
  } else {
    finalDutyId = null;
  }

  if (!customerId) throw new Error('Customer ID is required');
  if (!transactionType || (transactionType !== 'CREDIT_SALE' && transactionType !== 'COLLECTION')) {
    throw new Error('Invalid transaction type');
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Collection amount must be a positive number greater than ₹0');
  }

  const methodUpper = paymentMethod ? paymentMethod.trim().toUpperCase() : 'CASH';

  // Validate Collection against Customer Balance & Specific Fields
  if (transactionType === 'COLLECTION') {
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new Error('Customer not found');

    if (customer.balance > 0 && numAmount > customer.balance + 0.01) {
      throw new Error(`Collection amount (₹${numAmount.toLocaleString('en-IN')}) cannot exceed the customer's current outstanding balance (₹${customer.balance.toLocaleString('en-IN')}).`);
    }

    if (methodUpper === 'CHEQUE') {
      if (!paymentReference || !paymentReference.trim()) {
        throw new Error('Cheque number is required for Cheque payment method.');
      }
      if (!paymentDate) {
        throw new Error('Cheque date is required for Cheque payment method.');
      }
    } else if (['RTGS', 'NEFT', 'UPI', 'BANK_TRANSFER'].includes(methodUpper)) {
      if (!paymentReference || !paymentReference.trim()) {
        throw new Error(`UTR / Transaction Reference Number is required for ${methodUpper} payment method.`);
      }
    }
  }

  // Transact and update Customer balance
  const trans = await db.$transaction(async (tx) => {
    const t = await tx.creditTransaction.create({
      data: {
        customerId,
        dutySessionId: finalDutyId,
        transactionType,
        indentNumber: indentNumber ? indentNumber.trim() : null,
        productName: productName ? productName.trim() : (transactionType === 'COLLECTION' ? `${methodUpper} COLLECTION` : null),
        quantity: quantity !== undefined && !isNaN(Number(quantity)) && Number(quantity) > 0 ? Number(quantity) : null,
        unitPrice: unitPrice !== undefined && !isNaN(Number(unitPrice)) && Number(unitPrice) > 0 ? Number(unitPrice) : null,
        amount: numAmount,
        description: description ? description.trim() : null,
        paymentMethod: methodUpper,
        paymentReference: paymentReference ? paymentReference.trim() : null,
        bankName: bankName ? bankName.trim() : null,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
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
  }, TX_OPTIONS);

  await logAudit(session.id, 'ADD_CREDIT_TRANSACTION', 'CreditTransaction', trans.id, undefined, `${transactionType} [${methodUpper}]: ${trans.customer.name} - ₹${numAmount} (Ref: ${paymentReference || 'N/A'})`);
  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  revalidatePath('/credit');
  revalidatePath('/reports');
  return { success: true, transactionId: trans.id };
}

export async function updateCreditTransactionAction(
  id: string,
  amount: number,
  paymentMethod?: string,
  paymentReference?: string,
  bankName?: string,
  paymentDate?: string | Date,
  description?: string
) {
  const session = await requireAuth(['OWNER', 'MANAGER']);

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Transaction amount must be a positive number greater than ₹0');
  }

  const existingTrans = await db.creditTransaction.findUnique({
    where: { id },
    include: { customer: true }
  });
  if (!existingTrans) throw new Error('Credit transaction not found');

  const methodUpper = paymentMethod ? paymentMethod.trim().toUpperCase() : existingTrans.paymentMethod || 'CASH';

  if (existingTrans.transactionType === 'COLLECTION') {
    const maxAvailable = existingTrans.customer.balance + existingTrans.amount;
    if (numAmount > maxAvailable + 0.01) {
      throw new Error(`Updated collection amount (₹${numAmount.toLocaleString('en-IN')}) cannot exceed maximum outstanding balance (₹${maxAvailable.toLocaleString('en-IN')}).`);
    }

    if (methodUpper === 'CHEQUE') {
      if (!paymentReference || !paymentReference.trim()) {
        throw new Error('Cheque number is required for Cheque payment method.');
      }
    } else if (['RTGS', 'NEFT', 'UPI', 'BANK_TRANSFER'].includes(methodUpper)) {
      if (!paymentReference || !paymentReference.trim()) {
        throw new Error(`UTR / Transaction Reference Number is required for ${methodUpper} payment method.`);
      }
    }
  }

  const updatedTrans = await db.$transaction(async (tx) => {
    const balanceDiff = existingTrans.transactionType === 'COLLECTION'
      ? existingTrans.amount - numAmount
      : numAmount - existingTrans.amount;

    await tx.customer.update({
      where: { id: existingTrans.customerId },
      data: {
        balance: { increment: balanceDiff },
      },
    });

    return await tx.creditTransaction.update({
      where: { id },
      data: {
        amount: numAmount,
        paymentMethod: methodUpper,
        paymentReference: paymentReference ? paymentReference.trim() : null,
        bankName: bankName ? bankName.trim() : null,
        paymentDate: paymentDate ? new Date(paymentDate) : existingTrans.paymentDate,
        description: description !== undefined ? (description ? description.trim() : null) : existingTrans.description,
      },
      include: { customer: true }
    });
  }, TX_OPTIONS);

  await logAudit(
    session.id,
    'UPDATE_CREDIT_TRANSACTION',
    'CreditTransaction',
    id,
    JSON.stringify({ amount: existingTrans.amount, method: existingTrans.paymentMethod }),
    JSON.stringify({ amount: updatedTrans.amount, method: updatedTrans.paymentMethod })
  );

  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  revalidatePath('/credit');
  revalidatePath('/reports');
  return { success: true };
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
  }, TX_OPTIONS);

  await logAudit(session.id, 'DELETE_CREDIT_TRANSACTION', 'CreditTransaction', id, JSON.stringify(trans));
  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  revalidatePath('/credit');
  revalidatePath('/reports');
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
  }, TX_OPTIONS);

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

export async function recordSampleBoxSaleAction(
  dutySessionId: string,
  fuelType: 'MS' | 'HSD',
  quantity: number,
  unitPrice?: number,
  notes?: string,
  paymentMethod: string = 'CASH'
) {
  const session = await requireAuth(['OWNER', 'MANAGER']);

  let finalDutyId = dutySessionId;
  if (!finalDutyId || finalDutyId === 'LATEST') {
    const openDuty = await db.dutySession.findFirst({ where: { status: 'OPEN' } });
    if (openDuty) {
      finalDutyId = openDuty.id;
    } else {
      const latestDuty = await db.dutySession.findFirst({ orderBy: { dutyNumber: 'desc' } });
      if (latestDuty) {
        finalDutyId = latestDuty.id;
      } else {
        throw new Error('No valid duty session found to record sample box / load sale.');
      }
    }
  }

  const validQty = Number(quantity);
  if (isNaN(validQty) || validQty <= 0) {
    throw new Error('Sample box / load sale litres quantity must be greater than 0.');
  }

  if (fuelType !== 'MS' && fuelType !== 'HSD') {
    throw new Error('Invalid fuel type. Must be MS or HSD.');
  }

  // Determine rate: use passed unitPrice or fetch active price from FuelPrice table
  let price = Number(unitPrice || 0);
  if (isNaN(price) || price <= 0) {
    const priceRec = await db.fuelPrice.findFirst({
      where: { fuelType },
      orderBy: { effectiveFrom: 'desc' },
    });
    price = priceRec ? priceRec.price : (fuelType === 'MS' ? 112.15 : 100.08);
  }

  const totalAmount = Number((validQty * price).toFixed(2));

  const sale = await db.sampleBoxSale.create({
    data: {
      dutySessionId: finalDutyId,
      fuelType,
      quantity: validQty,
      unitPrice: price,
      totalAmount,
      notes: notes ? notes.trim() : `Paid ${fuelType} Sample Box / Load Sale`,
      paymentMethod: paymentMethod ? paymentMethod.trim().toUpperCase() : 'CASH',
      enteredById: session.id,
    },
    include: {
      enteredBy: true,
      dutySession: true,
    },
  });

  await logAudit(
    session.id,
    'RECORD_SAMPLE_BOX_SALE',
    'SampleBoxSale',
    sale.id,
    undefined,
    `Recorded ${fuelType} Sample Box Sale: ${validQty} L @ ₹${price}/L = ₹${totalAmount} (Duty #${sale.dutySession.dutyNumber})`
  );

  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  revalidatePath('/acc/history');
  revalidatePath('/reports');
  revalidatePath('/sales');
  return { success: true, sale };
}

export async function deleteSampleBoxSaleAction(id: string) {
  const session = await requireAuth(['OWNER', 'MANAGER']);

  const sale = await db.sampleBoxSale.findUnique({ where: { id } });
  if (!sale) throw new Error('Sample box / load sale record not found.');

  await db.sampleBoxSale.delete({ where: { id } });

  await logAudit(
    session.id,
    'DELETE_SAMPLE_BOX_SALE',
    'SampleBoxSale',
    id,
    JSON.stringify(sale),
    `Deleted ${sale.fuelType} Sample Box Sale: ${sale.quantity} L (₹${sale.totalAmount})`
  );

  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  revalidatePath('/acc/history');
  revalidatePath('/reports');
  revalidatePath('/sales');
  return { success: true };
}

// ----------------- DUTY CLOSING & RECONCILIATION -----------------

export async function closeDutySessionAction(
  dutySessionId: string,
  bankDepositAmount: number,
  digitalPayments: number,
  cardPayments: number,
  expectedCash: number,
  digitalBreakdown?: {
    phonePe?: number;
    gpay?: number;
    paytm?: number;
    bharatPe?: number;
    cardPayments?: number;
    bankTransfer?: number;
    totalDigital?: number;
  },
  bankDepositDetails?: {
    bankDeposit?: number;
    cashRetained?: number;
  },
  readingsPayload?: { gunId: string; currentReading: number; previousReading?: number }[],
  testingPayload?: { msTestingLitres: number; hsdTestingLitres: number },
  shortagePayload?: { staffId: string; amount?: number; reason?: string },
  densityPayload?: { msDensity?: number; hsdDensity?: number },
  tankDipPayload?: {
    ms?: {
      dipCm: number;
      chartCalculatedLitres: number;
      correctedLitres?: number | null;
      finalLitres: number;
      isCorrected?: boolean;
      correctionReason?: string;
    };
    hsd?: {
      dipCm: number;
      chartCalculatedLitres: number;
      correctedLitres?: number | null;
      finalLitres: number;
      isCorrected?: boolean;
      correctionReason?: string;
    };
  }
) {
  const session = await requireAuth(['OWNER', 'MANAGER']);

  // Validate Density range if provided
  if (densityPayload) {
    if (densityPayload.msDensity !== undefined && densityPayload.msDensity !== null && !isNaN(densityPayload.msDensity)) {
      if (densityPayload.msDensity < 710 || densityPayload.msDensity > 780) {
        throw new Error('MS density must be between 710 and 780 kg/m³ at 15°C.');
      }
    }
    if (densityPayload.hsdDensity !== undefined && densityPayload.hsdDensity !== null && !isNaN(densityPayload.hsdDensity)) {
      if (densityPayload.hsdDensity < 810 || densityPayload.hsdDensity > 870) {
        throw new Error('HSD density must be between 810 and 870 kg/m³ at 15°C.');
      }
    }
  }

  const bDep = Number(bankDepositDetails?.bankDeposit !== undefined ? bankDepositDetails.bankDeposit : bankDepositAmount);
  const cashDifference = Number((bDep - expectedCash).toFixed(2));

  // Perform closing operations in a single database transaction
  await db.$transaction(async (tx) => {
    // 1. Fetch current duty data
    const duty = await tx.dutySession.findUnique({
      where: { id: dutySessionId },
      include: {
        meterReadings: {
          include: {
            gun: true,
            intervals: { orderBy: { createdAt: 'asc' } },
          },
        },
        tankDips: true,
      },
    });

    if (!duty || duty.status !== 'OPEN') {
      throw new Error('Duty session is not open or has already been closed.');
    }

    // 2. Save final meter readings inside transaction if provided
    if (readingsPayload && readingsPayload.length > 0) {
      for (const item of readingsPayload) {
        const existingReading = duty.meterReadings.find(mr => mr.gunId === item.gunId);
        if (!existingReading) continue;

        const prevReading = (item.previousReading !== undefined && (session.role === 'OWNER' || existingReading.previousReading === 0))
          ? item.previousReading
          : existingReading.previousReading;
        const existingIntervals = existingReading.intervals || [];
        const applicablePrev = existingIntervals.length > 0
          ? existingIntervals[existingIntervals.length - 1].startReading
          : prevReading;

        if (item.currentReading < applicablePrev) {
          const gunName = existingReading?.gun?.name || 'Gun';
          throw new Error(`Closing reading (${item.currentReading}) cannot be lower than the previous reading (${applicablePrev}) for ${gunName}.`);
        }

        if (existingIntervals.length > 0) {
          const lastInterval = existingIntervals[existingIntervals.length - 1];
          const lastLitres = Math.max(0, item.currentReading - lastInterval.startReading);
          const lastSales = Number((lastLitres * lastInterval.priceUsed).toFixed(2));

          await tx.meterReadingInterval.update({
            where: { id: lastInterval.id },
            data: {
              endReading: item.currentReading,
              litresSold: Number(lastLitres.toFixed(2)),
              salesAmount: lastSales,
            },
          });

          const otherIntervalsLitres = existingIntervals.slice(0, existingIntervals.length - 1).reduce((sum: number, i: any) => sum + (i.litresSold || 0), 0);
          const otherIntervalsSales = existingIntervals.slice(0, existingIntervals.length - 1).reduce((sum: number, i: any) => sum + (i.salesAmount || 0), 0);

          const totalLitres = Number((otherIntervalsLitres + lastLitres).toFixed(2));
          const totalSales = Number((otherIntervalsSales + lastSales).toFixed(2));

          await tx.meterReading.update({
            where: { id: existingReading.id },
            data: {
              previousReading: prevReading,
              currentReading: item.currentReading,
              litresSold: totalLitres,
              salesAmount: totalSales,
            },
          });
        } else {
          const litresSold = Number((item.currentReading - prevReading).toFixed(2));
          const priceUsed = existingReading ? existingReading.priceUsed : 112.15;
          const salesAmount = Number((litresSold * priceUsed).toFixed(2));

          await tx.meterReadingInterval.create({
            data: {
              meterReadingId: existingReading.id,
              startReading: prevReading,
              endReading: item.currentReading,
              litresSold,
              priceUsed,
              salesAmount,
              effectiveFrom: duty.startTime,
              checkpointReason: 'DUTY_CLOSING',
            },
          });

          await tx.meterReading.update({
            where: { id: existingReading.id },
            data: {
              previousReading: prevReading,
              currentReading: item.currentReading,
              litresSold,
              salesAmount,
            },
          });
        }
      }
    }

    // 3. Save testing litres inside transaction if provided
    if (testingPayload) {
      const validMsLitres = Math.max(0, Number(testingPayload.msTestingLitres) || 0);
      const validHsdLitres = Math.max(0, Number(testingPayload.hsdTestingLitres) || 0);

      const msPriceRecord = await tx.fuelPrice.findFirst({
        where: { fuelType: 'MS' },
        orderBy: { effectiveFrom: 'desc' },
      });
      const hsdPriceRecord = await tx.fuelPrice.findFirst({
        where: { fuelType: 'HSD' },
        orderBy: { effectiveFrom: 'desc' },
      });

      const msPrice = msPriceRecord ? msPriceRecord.price : 112.15;
      const hsdPrice = hsdPriceRecord ? hsdPriceRecord.price : 100.08;

      const msAmount = Number((validMsLitres * msPrice).toFixed(2));
      const hsdAmount = Number((validHsdLitres * hsdPrice).toFixed(2));

      await tx.tankSample.upsert({
        where: { dutySessionId_fuelType: { dutySessionId, fuelType: 'MS' } },
        update: { litres: validMsLitres, priceUsed: msPrice, amount: msAmount },
        create: { dutySessionId, fuelType: 'MS', litres: validMsLitres, priceUsed: msPrice, amount: msAmount },
      });

      await tx.tankSample.upsert({
        where: { dutySessionId_fuelType: { dutySessionId, fuelType: 'HSD' } },
        update: { litres: validHsdLitres, priceUsed: hsdPrice, amount: hsdAmount },
        create: { dutySessionId, fuelType: 'HSD', litres: validHsdLitres, priceUsed: hsdPrice, amount: hsdAmount },
      });
    }

    const pPe = Number(digitalBreakdown?.phonePe || 0);
    const gPy = Number(digitalBreakdown?.gpay || 0);
    const pTm = Number(digitalBreakdown?.paytm || 0);
    const bPe = Number(digitalBreakdown?.bharatPe || 0);
    const cPay = Number(digitalBreakdown?.cardPayments || cardPayments || 0);
    const bTr = Number(digitalBreakdown?.bankTransfer || 0);
    const totDig = Number(digitalBreakdown?.totalDigital || digitalPayments || (pPe + gPy + pTm + bPe + cPay + bTr));

    const cRet = Number(bankDepositDetails?.cashRetained || 0);

    // 4. Save staff shortage assignment if shortage > 10 rs and staffId is provided
    const shortageAmt = Number(Math.abs(cashDifference).toFixed(2));
    if (cashDifference < -10 && shortagePayload?.staffId) {
      await tx.shortageAssignment.create({
        data: {
          dutySessionId,
          staffId: shortagePayload.staffId,
          amount: shortagePayload.amount || shortageAmt,
          reason: shortagePayload.reason || `Duty Session Shortage (-₹${shortageAmt})`,
          assignedById: session.id,
        },
      });
    }

    // 5. Save Density Records if provided
    const validMsDensity = densityPayload?.msDensity ? Number(densityPayload.msDensity) : null;
    const validHsdDensity = densityPayload?.hsdDensity ? Number(densityPayload.hsdDensity) : null;

    if (validMsDensity) {
      await tx.dutyDensity.upsert({
        where: { dutySessionId_fuelType: { dutySessionId, fuelType: 'MS' } },
        update: { densityAt15C: validMsDensity, recordedById: session.id },
        create: { dutySessionId, fuelType: 'MS', densityAt15C: validMsDensity, recordedById: session.id },
      });
    }

    if (validHsdDensity) {
      await tx.dutyDensity.upsert({
        where: { dutySessionId_fuelType: { dutySessionId, fuelType: 'HSD' } },
        update: { densityAt15C: validHsdDensity, recordedById: session.id },
        create: { dutySessionId, fuelType: 'HSD', densityAt15C: validHsdDensity, recordedById: session.id },
      });
    }

    // 6. Save Tank Dip Records (Dip Cm, Chart Stock, Corrected Stock, Final Stock, Variance)
    if (tankDipPayload) {
      const updatedReadingsForDip = await tx.meterReading.findMany({
        where: { dutySessionId },
        include: { gun: true }
      });

      // Find previous closed duty session to get previous closing physical dip stock
      const currentDutyRec = await tx.dutySession.findUnique({ where: { id: dutySessionId } });
      const prevDutyRec = currentDutyRec ? await tx.dutySession.findFirst({
        where: {
          dutyNumber: { lt: currentDutyRec.dutyNumber },
          status: 'CLOSED',
        },
        orderBy: { dutyNumber: 'desc' },
        include: { tankDips: true },
      }) : null;

      for (const fType of ['MS', 'HSD'] as const) {
        const dipItem = fType === 'MS' ? tankDipPayload.ms : tankDipPayload.hsd;
        if (dipItem && dipItem.dipCm !== undefined) {
          const salesVol = updatedReadingsForDip
            .filter(mr => mr.gun.fuelType === fType)
            .reduce((sum, mr) => sum + mr.litresSold, 0);

          // Opening Stock: Prioritize previous closed duty's final verified physical stock first
          const prevDip = prevDutyRec?.tankDips?.find(d => d.fuelType === fType);
          const invRecord = await tx.fuelInventory.findUnique({ where: { fuelType: fType } });

          let openingStock: number | null = null;
          if (prevDip && prevDip.finalLitres !== null && prevDip.finalLitres !== undefined && Number(prevDip.finalLitres) > 0) {
            openingStock = Number(prevDip.finalLitres);
          } else if (prevDip && prevDip.physicalDip !== null && prevDip.physicalDip !== undefined && Number(prevDip.physicalDip) > 0) {
            openingStock = Number(prevDip.physicalDip);
          } else if (invRecord && invRecord.currentStock !== undefined && invRecord.currentStock !== null && invRecord.currentStock > 0) {
            openingStock = invRecord.currentStock;
          } else {
            openingStock = fType === 'MS' ? 12000 : 15000;
          }

          // Ensure FuelInventory is updated with starting opening stock if missing
          await tx.fuelInventory.upsert({
            where: { fuelType: fType },
            update: { currentStock: openingStock },
            create: { fuelType: fType, currentStock: openingStock },
          });


          // Fetch receipts delivered during this duty session
          const receiptsRecs = await tx.fuelStockMovement.findMany({
            where: { dutySessionId, fuelType: fType, movementType: 'RECEIPT' }
          });
          const receiptsVol = receiptsRecs.reduce((sum, r) => sum + r.quantityLitres, 0);

          const metrics = calculateStockMetrics({
            fuelType: fType,
            openingStock,
            receipts: receiptsVol,
            physicalDispensing: salesVol,
            dipCm: dipItem.dipCm,
            isCorrected: dipItem.isCorrected,
            correctedLitres: dipItem.correctedLitres,
          });

          const densVal = fType === 'MS' ? validMsDensity : validHsdDensity;

          await tx.tankDip.upsert({
            where: { dutySessionId_fuelType: { dutySessionId, fuelType: fType } },
            update: {
              openingStock: metrics.openingStock,
              receipts: metrics.receipts,
              physicalDispensing: metrics.physicalDispensing,
              expectedClosing: metrics.expectedClosingStock,
              dipCm: metrics.dipCm,
              chartCalculatedLitres: metrics.chartCalculatedStock,
              correctedLitres: metrics.correctedStock,
              finalLitres: metrics.finalVerifiedStock,
              physicalDip: metrics.finalVerifiedStock ?? 0,
              variance: metrics.stockVariation,
              density: densVal,
              isCorrected: !!dipItem.isCorrected,
              correctionReason: dipItem.isCorrected ? (dipItem.correctionReason || 'Manual Verification') : null,
              correctedById: dipItem.isCorrected ? session.id : null,
              correctedAt: dipItem.isCorrected ? new Date() : null,
              timestamp: new Date(),
            },
            create: {
              dutySessionId,
              fuelType: fType,
              openingStock: metrics.openingStock,
              receipts: metrics.receipts,
              physicalDispensing: metrics.physicalDispensing,
              expectedClosing: metrics.expectedClosingStock,
              dipCm: metrics.dipCm,
              chartCalculatedLitres: metrics.chartCalculatedStock,
              correctedLitres: metrics.correctedStock,
              finalLitres: metrics.finalVerifiedStock,
              physicalDip: metrics.finalVerifiedStock ?? 0,
              variance: metrics.stockVariation,
              density: densVal,
              isCorrected: !!dipItem.isCorrected,
              correctionReason: dipItem.isCorrected ? (dipItem.correctionReason || 'Manual Verification') : null,
              correctedById: dipItem.isCorrected ? session.id : null,
              correctedAt: dipItem.isCorrected ? new Date() : null,
            },
          });

          if (dipItem.isCorrected) {
            await tx.auditLog.create({
              data: {
                userId: session.id,
                action: 'CORRECT_TANK_DIP',
                recordType: 'TankDip',
                recordId: dutySessionId,
                oldValue: `${dipItem.chartCalculatedLitres} L (Chart)`,
                newValue: `${dipItem.correctedLitres} L (${dipItem.correctionReason || 'Manual Verification'})`,
                timestamp: new Date(),
              }
            });
          }

          // Update current stock in FuelInventory if finalLitres exists
          if (metrics.finalVerifiedStock !== null) {
            await tx.fuelInventory.upsert({
              where: { fuelType: fType },
              update: { currentStock: metrics.finalVerifiedStock },
              create: { fuelType: fType, currentStock: metrics.finalVerifiedStock },
            });
          }
        }
      }
    }

    // 7. Update Duty session details to CLOSED
    await tx.dutySession.update({
      where: { id: dutySessionId },
      data: {
        status: 'CLOSED',
        endTime: new Date(),
        expectedCash,
        actualCash: bDep,
        cashDifference,
        phonePe: pPe,
        gpay: gPy,
        paytm: pTm,
        bharatPe: bPe,
        cardPayments: cPay,
        bankTransfer: bTr,
        totalDigital: totDig,
        bankDeposit: bDep,
        cashRetained: cRet,
        msDensity: validMsDensity,
        hsdDensity: validHsdDensity,
      },
    });

    // 7. Update Fuel Inventory and record Stock Movements for physical gun dispensing
    const updatedReadings = await tx.meterReading.findMany({
      where: { dutySessionId },
      include: { gun: true }
    });

    const fuelTypes = ['MS', 'HSD'];
    for (const fuelType of fuelTypes) {
      const dipRecord = duty.tankDips.find(d => d.fuelType === fuelType);
      const physicalDip = dipRecord ? dipRecord.physicalDip : 0.0;

      const fuelReadings = updatedReadings.filter(mr => mr.gun.fuelType === fuelType);
      const totalLitresSold = fuelReadings.reduce((sum, r) => sum + r.litresSold, 0);

      // Deduct total physical dispensing from FuelInventory
      if (totalLitresSold > 0) {
        const inv = await tx.fuelInventory.findUnique({ where: { fuelType } });
        const currentStock = inv ? inv.currentStock : 0.0;

        if (currentStock < totalLitresSold) {
          throw new Error(`Insufficient ${fuelType} stock for this transaction. Available: ${currentStock.toFixed(2)} L, Dispensed: ${totalLitresSold.toFixed(2)} L.`);
        }

        const newStock = Number((currentStock - totalLitresSold).toFixed(2));
        await tx.fuelInventory.upsert({
          where: { fuelType },
          update: { currentStock: newStock },
          create: { fuelType, currentStock: newStock },
        });

        await tx.fuelStockMovement.create({
          data: {
            fuelType,
            movementType: 'DUTY_DISPENSING',
            quantityLitres: -totalLitresSold,
            balanceAfter: newStock,
            dutySessionId,
            createdById: session.id,
          },
        });
      }

      const lastStock = await tx.tankStock.findFirst({
        where: { fuelType },
        orderBy: { timestamp: 'desc' },
      });

      const openingStock = lastStock ? lastStock.physicalDip : 0.0;
      const receipts = 0.0;
      const expectedClosing = openingStock + receipts - totalLitresSold;
      const variance = physicalDip - expectedClosing;

      await tx.tankStock.create({
        data: {
          fuelType,
          openingStock,
          receipts,
          sales: totalLitresSold,
          expectedClosing,
          physicalDip: physicalDip > 0 ? physicalDip : expectedClosing,
          variance: physicalDip > 0 ? variance : 0.0,
        },
      });
    }
  }, TX_OPTIONS);

  // --- POST-DUTY CLOSE EMAIL NOTIFICATIONS (Fire & Forget, non-blocking) ---
  try {
    const closedDuty = await db.dutySession.findUnique({
      where: { id: dutySessionId },
      include: {
        manager: true,
        tankDips: true,
        meterReadings: { include: { gun: { include: { pump: true } } } },
        assignments: { include: { staff: true, pump: true } },
        shortageAssignments: { include: { staff: true } },
        expenses: true,
        creditTransactions: { include: { customer: true } },
        oilSales: true,
      }
    });

    if (closedDuty) {
      const settlement = calculateDutySettlement(closedDuty);

      // 1. Low Fuel Stock Alert Check (VERIFIED PHYSICAL STOCK ONLY)
      const msDip = settlement.tankDips.ms;
      const hsdDip = settlement.tankDips.hsd;

      const msPhysical = msDip ? (msDip.finalLitres ?? msDip.physicalDip) : null;
      const hsdPhysical = hsdDip ? (hsdDip.finalLitres ?? hsdDip.physicalDip) : null;

      const msLow = msPhysical !== null && msPhysical <= LOW_FUEL_THRESHOLD_LITRES;
      const hsdLow = hsdPhysical !== null && hsdPhysical <= LOW_FUEL_THRESHOLD_LITRES;

      const msStateSetting = (db as any).systemSetting ? await (db as any).systemSetting.findUnique({ where: { key: 'MS_ALERT_STATE' } }) : null;
      const hsdStateSetting = (db as any).systemSetting ? await (db as any).systemSetting.findUnique({ where: { key: 'HSD_ALERT_STATE' } }) : null;

      const msTriggered = msStateSetting?.value === 'TRIGGERED';
      const hsdTriggered = hsdStateSetting?.value === 'TRIGGERED';

      if (msLow && hsdLow) {
        if (!msTriggered || !hsdTriggered) {
          await sendLowFuelStockAlert({
            fuelType: 'BOTH',
            dutyNumber: closedDuty.dutyNumber,
            msStock: {
              physicalStock: msPhysical!,
              bookStock: msDip?.expectedClosing,
              isCorrected: msDip?.isCorrected,
              correctionReason: msDip?.correctionReason,
            },
            hsdStock: {
              physicalStock: hsdPhysical!,
              bookStock: hsdDip?.expectedClosing,
              isCorrected: hsdDip?.isCorrected,
              correctionReason: hsdDip?.correctionReason,
            }
          });

          if ((db as any).systemSetting) {
            await (db as any).systemSetting.upsert({ where: { key: 'MS_ALERT_STATE' }, update: { value: 'TRIGGERED' }, create: { key: 'MS_ALERT_STATE', value: 'TRIGGERED' } });
            await (db as any).systemSetting.upsert({ where: { key: 'HSD_ALERT_STATE' }, update: { value: 'TRIGGERED' }, create: { key: 'HSD_ALERT_STATE', value: 'TRIGGERED' } });
          }
        }
      } else {
        if (msLow) {
          if (!msTriggered) {
            await sendLowFuelStockAlert({
              fuelType: 'MS',
              dutyNumber: closedDuty.dutyNumber,
              msStock: {
                physicalStock: msPhysical!,
                bookStock: msDip?.expectedClosing,
                isCorrected: msDip?.isCorrected,
                correctionReason: msDip?.correctionReason,
              }
            });
            if ((db as any).systemSetting) {
              await (db as any).systemSetting.upsert({ where: { key: 'MS_ALERT_STATE' }, update: { value: 'TRIGGERED' }, create: { key: 'MS_ALERT_STATE', value: 'TRIGGERED' } });
            }
          }
        } else if (msPhysical !== null && msPhysical > LOW_FUEL_THRESHOLD_LITRES) {
          if ((db as any).systemSetting) {
            await (db as any).systemSetting.upsert({ where: { key: 'MS_ALERT_STATE' }, update: { value: 'RESET' }, create: { key: 'MS_ALERT_STATE', value: 'RESET' } });
          }
        }

        if (hsdLow) {
          if (!hsdTriggered) {
            await sendLowFuelStockAlert({
              fuelType: 'HSD',
              dutyNumber: closedDuty.dutyNumber,
              hsdStock: {
                physicalStock: hsdPhysical!,
                bookStock: hsdDip?.expectedClosing,
                isCorrected: hsdDip?.isCorrected,
                correctionReason: hsdDip?.correctionReason,
              }
            });
            if ((db as any).systemSetting) {
              await (db as any).systemSetting.upsert({ where: { key: 'HSD_ALERT_STATE' }, update: { value: 'TRIGGERED' }, create: { key: 'HSD_ALERT_STATE', value: 'TRIGGERED' } });
            }
          }
        } else if (hsdPhysical !== null && hsdPhysical > LOW_FUEL_THRESHOLD_LITRES) {
          if ((db as any).systemSetting) {
            await (db as any).systemSetting.upsert({ where: { key: 'HSD_ALERT_STATE' }, update: { value: 'RESET' }, create: { key: 'HSD_ALERT_STATE', value: 'RESET' } });
          }
        }
      }

      // 2. Prepare & Send Duty Closing Summary Report
      const reportData: DutyClosingReportData = {
        dutyNumber: closedDuty.dutyNumber,
        managerName: closedDuty.manager?.username || 'Manager',
        startTime: closedDuty.startTime,
        endTime: closedDuty.endTime || new Date(),
        ms: settlement.tankDips.ms ? {
          openingStock: settlement.tankDips.ms.openingStock,
          receipts: settlement.tankDips.ms.receipts,
          sales: settlement.tankDips.ms.sales,
          bookStock: settlement.tankDips.ms.expectedClosing,
          physicalStock: settlement.tankDips.ms.finalLitres ?? settlement.tankDips.ms.physicalDip,
          dipCm: settlement.tankDips.ms.dipCm,
          isCorrected: settlement.tankDips.ms.isCorrected,
          correctionReason: settlement.tankDips.ms.correctionReason,
          variance: settlement.tankDips.ms.variance,
        } : undefined,
        hsd: settlement.tankDips.hsd ? {
          openingStock: settlement.tankDips.hsd.openingStock,
          receipts: settlement.tankDips.hsd.receipts,
          sales: settlement.tankDips.hsd.sales,
          bookStock: settlement.tankDips.hsd.expectedClosing,
          physicalStock: settlement.tankDips.hsd.finalLitres ?? settlement.tankDips.hsd.physicalDip,
          dipCm: settlement.tankDips.hsd.dipCm,
          isCorrected: settlement.tankDips.hsd.isCorrected,
          correctionReason: settlement.tankDips.hsd.correctionReason,
          variance: settlement.tankDips.hsd.variance,
        } : undefined,
        meterReadings: settlement.meterReadingsOrdered.map(mr => ({
          gunName: mr.gunName,
          fuelType: mr.fuelType,
          startReading: mr.previousReading,
          endReading: mr.currentReading,
          totalLitres: mr.litresSold,
          saleAmount: mr.salesAmount,
        })),
        staffAssignments: settlement.staffAttendance.map(sa => ({
          staffName: sa.staffName,
          pumpName: sa.assignedPump,
        })),
        expectedCash: settlement.expectedCash,
        actualCash: settlement.actualCash,
        cashDifference: settlement.cashDifference,
        settlementStatus: settlement.settlementStatus as any,
        totalFuelSales: settlement.totalFuelSalesAmount,
        totalOilSales: settlement.totalOilSales,
        totalExpenses: settlement.totalExpenses,
        totalCreditGiven: settlement.totalCreditGiven,
        totalCreditCollections: settlement.totalCreditCollections,
        digitalPayments: {
          upi: closedDuty.phonePe || 0,
          card: closedDuty.cardPayments || 0,
          phonePe: closedDuty.phonePe || 0,
          other: (closedDuty.gpay || 0) + (closedDuty.paytm || 0) + (closedDuty.bharatPe || 0) + (closedDuty.bankTransfer || 0),
          total: closedDuty.totalDigital || 0,
        },
        bankDepositedCash: closedDuty.bankDeposit || 0,
        responsibleEmployee: closedDuty.shortageAssignments?.[0]?.staff?.name,
      };

      await sendDutyClosingReport(reportData);
    }
  } catch (emailErr) {
    // Crucial requirement: Email delivery failure MUST NOT fail duty closing operation
    console.error('[EMAIL] Duty closing email notification error (ignored to preserve duty close):', emailErr);
  }

  await logAudit(session.id, 'CLOSE_DUTY_SESSION', 'DutySession', dutySessionId, undefined, `Duty closed, difference: ₹${cashDifference}`);
  revalidatePath('/dashboard');
  revalidatePath('/acc/current');
  revalidatePath('/acc/history');
  revalidatePath('/stock');
  return { success: true };
}

// ----------------- FUEL INVENTORY MANAGEMENT ACTIONS -----------------

export async function recalculateCentralInventory(tx?: any) {
  const client = tx || db;

  // 1. Get active duty session if any
  const activeDuty = await client.dutySession.findFirst({
    where: { status: 'OPEN' },
    select: { id: true }
  });
  const activeDutyId = activeDuty ? activeDuty.id : null;

  // 2. Fetch all stock movements ordered chronologically with duty session status
  const movements = await client.fuelStockMovement.findMany({
    orderBy: { createdAt: 'asc' },
    include: { dutySession: { select: { status: true } } }
  });

  // Auto-seed INITIAL_STOCK of 20000 L for both fuels if no movements exist at all
  const movementCount = await client.fuelStockMovement.count();
  if (movementCount === 0) {
    const systemUser = await client.user.findFirst({ select: { id: true } });
    if (systemUser) {
      const INITIAL_STOCK_L = 20000;
      await client.fuelStockMovement.createMany({
        data: [
          { fuelType: 'MS',  movementType: 'INITIAL_STOCK', quantityLitres: INITIAL_STOCK_L, balanceAfter: INITIAL_STOCK_L, createdById: systemUser.id },
          { fuelType: 'HSD', movementType: 'INITIAL_STOCK', quantityLitres: INITIAL_STOCK_L, balanceAfter: INITIAL_STOCK_L, createdById: systemUser.id },
        ],
      });
      await client.fuelInventory.upsert({ where: { fuelType: 'MS' },  update: { currentStock: INITIAL_STOCK_L }, create: { fuelType: 'MS',  currentStock: INITIAL_STOCK_L } });
      await client.fuelInventory.upsert({ where: { fuelType: 'HSD' }, update: { currentStock: INITIAL_STOCK_L }, create: { fuelType: 'HSD', currentStock: INITIAL_STOCK_L } });
    }
  }

  let runningMs = 0;
  let runningHsd = 0;

  let msFinalized = 0;
  let hsdFinalized = 0;
  let msActiveReceipts = 0;
  let hsdActiveReceipts = 0;

  for (const mov of movements) {
    if (mov.fuelType === 'MS') {
      runningMs += mov.quantityLitres;
      const calcBal = Number(runningMs.toFixed(2));
      if (mov.balanceAfter !== calcBal) {
        await client.fuelStockMovement.update({
          where: { id: mov.id },
          data: { balanceAfter: calcBal },
        });
      }

      const isClosedOrIndependent = !mov.dutySessionId || (mov.dutySessionId !== activeDutyId && mov.dutySession?.status === 'CLOSED');
      if (isClosedOrIndependent) {
        msFinalized += mov.quantityLitres;
      } else if (mov.movementType === 'RECEIPT') {
        msActiveReceipts += mov.quantityLitres;
      }
    } else if (mov.fuelType === 'HSD') {
      runningHsd += mov.quantityLitres;
      const calcBal = Number(runningHsd.toFixed(2));
      if (mov.balanceAfter !== calcBal) {
        await client.fuelStockMovement.update({
          where: { id: mov.id },
          data: { balanceAfter: calcBal },
        });
      }

      const isClosedOrIndependent = !mov.dutySessionId || (mov.dutySessionId !== activeDutyId && mov.dutySession?.status === 'CLOSED');
      if (isClosedOrIndependent) {
        hsdFinalized += mov.quantityLitres;
      } else if (mov.movementType === 'RECEIPT') {
        hsdActiveReceipts += mov.quantityLitres;
      }
    }
  }

  // 3. Active dispensing from nozzle meter readings & fuel testing (tank samples)
  let msActiveDispensed = 0;
  let hsdActiveDispensed = 0;
  let msActiveTesting = 0;
  let hsdActiveTesting = 0;

  if (activeDutyId) {
    const activeReadings = await client.meterReading.findMany({
      where: { dutySessionId: activeDutyId },
      include: { gun: { select: { fuelType: true } } }
    });

    for (const mr of activeReadings) {
      const sold = Math.max(0, (mr.currentReading || 0) - (mr.previousReading || 0));
      if (mr.gun?.fuelType === 'MS') msActiveDispensed += sold;
      if (mr.gun?.fuelType === 'HSD') hsdActiveDispensed += sold;
    }

    const activeSamples = await client.tankSample.findMany({
      where: { dutySessionId: activeDutyId }
    });
    for (const sample of activeSamples) {
      if (sample.fuelType === 'MS') msActiveTesting += (sample.litres || 0);
      if (sample.fuelType === 'HSD') hsdActiveTesting += (sample.litres || 0);
    }
  }

  // Ensure positive default baselines if no historical movements exist (initial stock = 20000 L each)
  if (msFinalized <= 0) msFinalized = 20000;
  if (hsdFinalized <= 0) hsdFinalized = 20000;

  const msBookStock = Number((msFinalized + msActiveReceipts - msActiveDispensed - msActiveTesting).toFixed(2));
  const hsdBookStock = Number((hsdFinalized + hsdActiveReceipts - hsdActiveDispensed - hsdActiveTesting).toFixed(2));

  await client.fuelInventory.upsert({
    where: { fuelType: 'MS' },
    update: { currentStock: msBookStock },
    create: { fuelType: 'MS', currentStock: msBookStock },
  });

  await client.fuelInventory.upsert({
    where: { fuelType: 'HSD' },
    update: { currentStock: hsdBookStock },
    create: { fuelType: 'HSD', currentStock: hsdBookStock },
  });

  // 4. Fetch latest physical dip stock records
  let msDipRecord: any = null;
  let hsdDipRecord: any = null;

  if (activeDutyId) {
    const dips = await client.tankDip.findMany({
      where: { dutySessionId: activeDutyId }
    });
    msDipRecord = dips.find((d: any) => d.fuelType === 'MS') || null;
    hsdDipRecord = dips.find((d: any) => d.fuelType === 'HSD') || null;
  }

  if (!msDipRecord || !hsdDipRecord) {
    const lastClosedDuty = await client.dutySession.findFirst({
      where: { status: 'CLOSED' },
      orderBy: { dutyNumber: 'desc' },
      include: { tankDips: true }
    });

    if (lastClosedDuty) {
      if (!msDipRecord) msDipRecord = lastClosedDuty.tankDips.find((d: any) => d.fuelType === 'MS') || null;
      if (!hsdDipRecord) hsdDipRecord = lastClosedDuty.tankDips.find((d: any) => d.fuelType === 'HSD') || null;
    }
  }

  const msPhysicalStock = msDipRecord ? (msDipRecord.finalLitres ?? msDipRecord.chartCalculatedLitres ?? msDipRecord.physicalDip) : null;
  const hsdPhysicalStock = hsdDipRecord ? (hsdDipRecord.finalLitres ?? hsdDipRecord.chartCalculatedLitres ?? hsdDipRecord.physicalDip) : null;

  const msVariance = msPhysicalStock !== null ? Number((msPhysicalStock - msBookStock).toFixed(2)) : null;
  const hsdVariance = hsdPhysicalStock !== null ? Number((hsdPhysicalStock - hsdBookStock).toFixed(2)) : null;

  return {
    MS: msBookStock,
    HSD: hsdBookStock,
    inventoryState: {
      MS: {
        openingStock: Number(msFinalized.toFixed(2)),
        activeReceipts: Number(msActiveReceipts.toFixed(2)),
        activeDispensed: Number(msActiveDispensed.toFixed(2)),
        activeTesting: Number(msActiveTesting.toFixed(2)),
        currentBookStock: msBookStock,
        physicalDipStock: msPhysicalStock,
        variance: msVariance,
        dipCm: msDipRecord?.dipCm ?? null,
        isCorrected: msDipRecord?.isCorrected ?? false,
      },
      HSD: {
        openingStock: Number(hsdFinalized.toFixed(2)),
        activeReceipts: Number(hsdActiveReceipts.toFixed(2)),
        activeDispensed: Number(hsdActiveDispensed.toFixed(2)),
        activeTesting: Number(hsdActiveTesting.toFixed(2)),
        currentBookStock: hsdBookStock,
        physicalDipStock: hsdPhysicalStock,
        variance: hsdVariance,
        dipCm: hsdDipRecord?.dipCm ?? null,
        isCorrected: hsdDipRecord?.isCorrected ?? false,
      }
    }
  };
}

export async function getCentralFuelStockStateAction() {
  await requireAuth(['OWNER', 'MANAGER']);

  const stockMap = await db.$transaction(async (tx) => {
    return await recalculateCentralInventory(tx);
  }, TX_OPTIONS);

  return {
    success: true,
    currentStock: { MS: stockMap.MS, HSD: stockMap.HSD },
    inventoryState: stockMap.inventoryState,
  };
}

export async function addFuelReceiptAction(payload: {
  invoiceNumber: string;
  invoiceDate: string;
  supplier?: string;
  fuelType: 'MS' | 'HSD';
  quantityLitres: number;
  remarks?: string;
}) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const { invoiceNumber, invoiceDate, supplier, fuelType, quantityLitres, remarks } = payload;

  if (!invoiceNumber || !invoiceNumber.trim()) throw new Error('Invoice / Delivery number is required.');
  if (!fuelType || !['MS', 'HSD'].includes(fuelType)) throw new Error('Valid fuel type (MS or HSD) is required.');
  if (!quantityLitres || quantityLitres <= 0) throw new Error('Quantity in litres must be greater than 0.');

  const qty = Number(Number(quantityLitres).toFixed(2));

  const result = await db.$transaction(async (tx) => {
    const activeDuty = await tx.dutySession.findFirst({
      where: { status: 'OPEN' },
    });

    const rec = await tx.fuelReceipt.create({
      data: {
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: new Date(invoiceDate),
        receivedDate: new Date(),
        supplier: supplier?.trim() || 'IOCL Supplier',
        fuelType,
        quantityLitres: qty,
        remarks: remarks?.trim() || null,
        createdById: session.id,
      },
    });

    await tx.fuelStockMovement.create({
      data: {
        fuelType,
        movementType: 'RECEIPT',
        quantityLitres: qty,
        balanceAfter: 0,
        fuelReceiptId: rec.id,
        dutySessionId: activeDuty ? activeDuty.id : null,
        createdById: session.id,
      },
    });

    const stockMap = await recalculateCentralInventory(tx);
    return { rec, stockMap };
  }, TX_OPTIONS);

  await logAudit(session.id, 'ADD_FUEL_RECEIPT', 'FuelReceipt', result.rec.id, undefined, `Added ${qty} L of ${fuelType} under invoice ${invoiceNumber}`);
  revalidatePath('/stock');
  revalidatePath('/dashboard');
  revalidatePath('/reports');
  revalidatePath('/acc/current');
  revalidatePath('/acc/history');
  return { success: true, receipt: result.rec, currentStock: { MS: result.stockMap.MS, HSD: result.stockMap.HSD }, inventoryState: result.stockMap.inventoryState };
}

export async function updateFuelReceiptAction(
  receiptId: string,
  payload: {
    invoiceNumber: string;
    invoiceDate: string;
    supplier?: string;
    fuelType: 'MS' | 'HSD';
    quantityLitres: number;
    remarks?: string;
  }
) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const { invoiceNumber, invoiceDate, supplier, fuelType, quantityLitres, remarks } = payload;

  if (!receiptId) throw new Error('Receipt ID is required.');
  if (!invoiceNumber || !invoiceNumber.trim()) throw new Error('Invoice / Delivery number is required.');
  if (!fuelType || !['MS', 'HSD'].includes(fuelType)) throw new Error('Valid fuel type (MS or HSD) is required.');
  if (!quantityLitres || quantityLitres <= 0) throw new Error('Quantity in litres must be greater than 0.');

  const newQty = Number(Number(quantityLitres).toFixed(2));

  const result = await db.$transaction(async (tx) => {
    const oldRec = await tx.fuelReceipt.findUnique({ where: { id: receiptId } });
    if (!oldRec) throw new Error('Fuel receipt not found.');

    const movement = await tx.fuelStockMovement.findFirst({
      where: { fuelReceiptId: receiptId },
      include: { dutySession: true },
    });

    if (movement?.dutySession && movement.dutySession.status === 'CLOSED') {
      if (session.role !== 'OWNER') {
        throw new Error(`Receipt #${oldRec.invoiceNumber} is attached to closed Duty #${movement.dutySession.dutyNumber}. Only the Owner can modify receipts from closed duties.`);
      }
    }

    const rec = await tx.fuelReceipt.update({
      where: { id: receiptId },
      data: {
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: new Date(invoiceDate),
        supplier: supplier?.trim() || 'IOCL Supplier',
        fuelType,
        quantityLitres: newQty,
        remarks: remarks?.trim() || null,
      },
    });

    await tx.fuelStockMovement.updateMany({
      where: { fuelReceiptId: receiptId },
      data: {
        fuelType,
        quantityLitres: newQty,
      },
    });

    const stockMap = await recalculateCentralInventory(tx);
    return { rec, oldRec, stockMap };
  }, TX_OPTIONS);

  await logAudit(
    session.id,
    'UPDATE_FUEL_RECEIPT',
    'FuelReceipt',
    receiptId,
    `Invoice: ${result.oldRec.invoiceNumber}, Qty: ${result.oldRec.quantityLitres} L, Type: ${result.oldRec.fuelType}`,
    `Invoice: ${invoiceNumber}, Qty: ${newQty} L, Type: ${fuelType}`
  );
  revalidatePath('/stock');
  revalidatePath('/dashboard');
  revalidatePath('/reports');
  revalidatePath('/acc/current');
  revalidatePath('/acc/history');
  return { success: true, receipt: result.rec, currentStock: { MS: result.stockMap.MS, HSD: result.stockMap.HSD }, inventoryState: result.stockMap.inventoryState };
}

export async function deleteFuelReceiptAction(receiptId: string) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  if (!receiptId) throw new Error('Receipt ID is required.');

  await db.$transaction(async (tx) => {
    const oldRec = await tx.fuelReceipt.findUnique({ where: { id: receiptId } });
    if (!oldRec) return;

    const movement = await tx.fuelStockMovement.findFirst({
      where: { fuelReceiptId: receiptId },
      include: { dutySession: true },
    });

    if (movement?.dutySession && movement.dutySession.status === 'CLOSED') {
      if (session.role !== 'OWNER') {
        throw new Error(`Receipt #${oldRec.invoiceNumber} is attached to closed Duty #${movement.dutySession.dutyNumber}. Only the Owner can delete receipts from closed duties.`);
      }
    }

    await tx.fuelStockMovement.deleteMany({ where: { fuelReceiptId: receiptId } });
    await tx.fuelReceipt.deleteMany({ where: { id: receiptId } });
    await recalculateCentralInventory(tx);
  }, TX_OPTIONS);

  await logAudit(session.id, 'DELETE_FUEL_RECEIPT', 'FuelReceipt', receiptId, undefined, `Deleted fuel receipt ID ${receiptId}`);
  revalidatePath('/stock');
  revalidatePath('/dashboard');
  revalidatePath('/reports');
  revalidatePath('/acc/current');
  revalidatePath('/acc/history');
  return { success: true };
}

export async function deleteFuelStockMovementAction(movementId: string) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  if (!movementId) throw new Error('Movement ID is required.');

  await db.$transaction(async (tx) => {
    const mov = await tx.fuelStockMovement.findUnique({
      where: { id: movementId },
      include: { dutySession: true },
    });
    if (!mov) return;

    if (mov.dutySession && mov.dutySession.status === 'CLOSED') {
      if (session.role !== 'OWNER') {
        throw new Error(`Movement entry is attached to closed Duty #${mov.dutySession.dutyNumber}. Only the Owner can delete historical movement entries.`);
      }
    }

    if (mov.fuelReceiptId) {
      await tx.fuelStockMovement.deleteMany({ where: { fuelReceiptId: mov.fuelReceiptId } });
      await tx.fuelReceipt.deleteMany({ where: { id: mov.fuelReceiptId } });
    } else {
      await tx.fuelStockMovement.deleteMany({ where: { id: movementId } });
    }

    await recalculateCentralInventory(tx);
  }, TX_OPTIONS);

  await logAudit(session.id, 'DELETE_STOCK_MOVEMENT', 'FuelStockMovement', movementId, undefined, `Deleted stock movement ID ${movementId}`);
  revalidatePath('/stock');
  revalidatePath('/dashboard');
  revalidatePath('/reports');
  revalidatePath('/acc/current');
  revalidatePath('/acc/history');
  return { success: true };
}

export async function getFuelInventoryAction() {
  await requireAuth(['OWNER', 'MANAGER']);

  const stockMap = await db.$transaction(async (tx) => {
    return await recalculateCentralInventory(tx);
  }, TX_OPTIONS);

  const receipts = await db.fuelReceipt.findMany({
    orderBy: { createdAt: 'desc' },
    include: { createdBy: { select: { username: true } } },
    take: 100,
  });

  const movements = await db.fuelStockMovement.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { username: true } },
      dutySession: { select: { dutyNumber: true, startTime: true, msDensity: true, hsdDensity: true } },
      fuelReceipt: { select: { invoiceNumber: true, supplier: true, id: true } },
    },
    take: 100,
  });

  return {
    success: true,
    currentStock: { MS: stockMap.MS, HSD: stockMap.HSD },
    inventoryState: stockMap.inventoryState,
    receipts,
    movements,
  };
}

export async function setInitialFuelStockAction(fuelType: 'MS' | 'HSD', initialStock: number) {
  const session = await requireAuth(['OWNER']);
  if (isNaN(initialStock) || initialStock < 0) throw new Error('Initial stock cannot be negative.');

  const qty = Number(Number(initialStock).toFixed(2));

  await db.$transaction(async (tx) => {
    await tx.fuelInventory.upsert({
      where: { fuelType },
      update: { currentStock: qty },
      create: { fuelType, currentStock: qty },
    });

    await tx.fuelStockMovement.create({
      data: {
        fuelType,
        movementType: 'INITIAL_STOCK',
        quantityLitres: qty,
        balanceAfter: qty,
        createdById: session.id,
      },
    });
  }, TX_OPTIONS);

  await logAudit(session.id, 'SET_INITIAL_FUEL_STOCK', 'FuelInventory', fuelType, undefined, `Set ${fuelType} initial stock to ${qty} L`);
  revalidatePath('/stock');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function updateHistoricalDutyAction(
  dutySessionId: string,
  field: 'actualCash' | 'bankDeposit' | 'notes' | 'phonePe' | 'gpay' | 'paytm' | 'bharatPe' | 'cardPayments' | 'bankTransfer',
  newValue: number | string,
  reason: string
) {
  const session = await requireAuth(['OWNER']); // Owner authorization required for historical edits

  if (!dutySessionId || !field || !reason) {
    throw new Error('Duty ID, field, and reason are required for historical correction');
  }

  const existingDuty = await db.dutySession.findUnique({
    where: { id: dutySessionId }
  });

  if (!existingDuty) {
    throw new Error('Historical duty session not found');
  }

  const oldValue = String((existingDuty as any)[field] ?? '');
  const updatedValue = typeof newValue === 'number' ? Number(newValue) : String(newValue);

  await db.dutySession.update({
    where: { id: dutySessionId },
    data: {
      [field]: updatedValue,
    },
  });

  await logAudit(
    session.id,
    'OWNER_CORRECT_DUTY',
    'DutySession',
    dutySessionId,
    `${field}: ${oldValue}`,
    `${field}: ${updatedValue} (Reason: ${reason})`
  );

  revalidatePath('/dashboard');
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
        include: {
          gun: { include: { pump: true } },
          intervals: { orderBy: { createdAt: 'asc' } },
        },
      },
      assignments: { include: { staff: true, pump: true, gun: true } },
      oilSales: { include: { enteredBy: true, product: true } },
      sampleBoxSales: { include: { enteredBy: true } },
      expenses: { include: { category: true, enteredBy: true } },
      creditTransactions: { include: { customer: true, enteredBy: true } },
      tankDips: true,
      tankSamples: true,
      shortageAssignments: { include: { staff: true, assignedBy: true } },
      dutyDensities: { include: { recordedBy: true } },
    },
  });
}

export async function getDutyReport(dutySessionId: string) {
  return await db.dutySession.findUnique({
    where: { id: dutySessionId },
    include: {
      assignments: { include: { staff: true, pump: true, gun: true } },
      meterReadings: {
        include: {
          gun: { include: { pump: true } },
          intervals: { orderBy: { createdAt: 'asc' } },
        },
      },
      oilSales: { include: { enteredBy: true, product: true } },
      sampleBoxSales: { include: { enteredBy: true } },
      expenses: { include: { category: true, enteredBy: true } },
      creditTransactions: { include: { customer: true, enteredBy: true } },
      tankDips: true,
      tankSamples: true,
      shortageAssignments: { include: { staff: true, assignedBy: true } },
      dutyDensities: { include: { recordedBy: true } },
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

export async function getStaffPerformanceReport(includeInactive: boolean = false) {
  const assignments = await db.dutyAssignment.findMany({
    where: includeInactive ? {} : { staff: { active: true } },
    include: {
      staff: true,
      gun: true,
      dutySession: {
        include: {
          meterReadings: { include: { gun: true } },
        },
      },
    },
  });

  const staffReport: Record<string, { name: string, dutyIds: Set<string>, msLitres: number, hsdLitres: number, sales: number }> = {};

  for (const a of assignments) {
    if (a.dutySession.status !== 'CLOSED') continue; // only count closed duties

    if (!staffReport[a.staffId]) {
      staffReport[a.staffId] = {
        name: a.staff.name,
        dutyIds: new Set<string>(),
        msLitres: 0,
        hsdLitres: 0,
        sales: 0,
      };
    }

    const report = staffReport[a.staffId];
    report.dutyIds.add(a.dutySessionId);

    // Calculate litres sold for the specific gun assigned (or fallback to pump+fuelType)
    const relevantReadings = a.dutySession.meterReadings.filter(
      (mr) => a.gunId ? mr.gunId === a.gunId : (mr.gun.pumpId === a.pumpId && mr.gun.fuelType === a.fuelType)
    );

    for (const mr of relevantReadings) {
      if (mr.gun.fuelType === 'MS') {
        report.msLitres += mr.litresSold;
      } else {
        report.hsdLitres += mr.litresSold;
      }
      report.sales += mr.salesAmount;
    }
  }

  return Object.entries(staffReport).map(([staffId, data]) => ({
    staffId,
    name: data.name,
    duties: data.dutyIds.size,
    msLitres: data.msLitres,
    hsdLitres: data.hsdLitres,
    totalLitres: data.msLitres + data.hsdLitres,
    sales: data.sales,
  }));
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
      product: true,
    },
  });
}

export async function getOilPurchasesReport() {
  return await db.oilPurchase.findMany({
    orderBy: { invoiceDate: 'desc' },
    include: {
      items: { include: { product: true } },
      createdBy: true,
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

export async function getBusinessSettingsAction() {
  let settings: Record<string, string> = {
    BUSINESS_NAME: 'IOCL Petrol Bunk & Retail Outlet',
    BUSINESS_ADDRESS: 'Main Highway Station, Retail Outlet',
    BUSINESS_CONTACT: '+91 9876543210',
    REPORT_HEADER: 'IOCL Authorized Dealer Accounting Ledger',
    MS_LOW_THRESHOLD: '6000',
    HSD_LOW_THRESHOLD: '6000',
  };
  try {
    const records = await db.systemSetting.findMany({ select: { key: true, value: true } });
    for (const r of records) {
      settings[r.key] = r.value;
    }
  } catch (err) {
    console.error('getBusinessSettingsAction error:', err);
  }
  return settings;
}

export async function addPumpAction(name: string) {
  const session = await requireAuth(['OWNER']);
  if (!name || !name.trim()) throw new Error('Pump name is required.');
  const trimmedName = name.trim();
  const existingPump = await db.pump.findFirst({ where: { name: trimmedName } });
  if (existingPump) {
    throw new Error(`A pump with the name "${trimmedName}" already exists.`);
  }
  const pump = await db.pump.create({
    data: { name: trimmedName, active: true }
  });
  await logAudit(session.id, 'ADD_PUMP', 'Pump', pump.id, undefined, pump.name);
  revalidatePath('/dashboard');
  return { success: true, pump };
}

export async function togglePumpAction(pumpId: string, active: boolean) {
  const session = await requireAuth(['OWNER']);
  const pump = await db.pump.update({
    where: { id: pumpId },
    data: { active }
  });
  await logAudit(session.id, 'TOGGLE_PUMP', 'Pump', pump.id, undefined, `Active: ${active}`);
  revalidatePath('/dashboard');
  return { success: true };
}

export async function addGunAction(pumpId: string, name: string, fuelType: 'MS' | 'HSD') {
  const session = await requireAuth(['OWNER']);
  if (!pumpId || !name || !name.trim() || !fuelType) throw new Error('Pump, gun name, and fuel type are required.');
  const trimmedName = name.trim();

  const gun = await db.gun.create({
    data: { pumpId, name: trimmedName, fuelType, active: true }
  });
  await logAudit(session.id, 'ADD_GUN', 'Gun', gun.id, undefined, `${gun.name} (${fuelType})`);
  revalidatePath('/dashboard');
  return { success: true, gun };
}

export async function toggleGunAction(gunId: string, active: boolean) {
  const session = await requireAuth(['OWNER']);
  const gun = await db.gun.update({
    where: { id: gunId },
    data: { active }
  });
  await logAudit(session.id, 'TOGGLE_GUN', 'Gun', gun.id, undefined, `Active: ${active}`);
  revalidatePath('/dashboard');
  return { success: true };
}

export async function deleteGunAction(gunId: string) {
  const session = await requireAuth(['OWNER']);
  const gun = await db.gun.findUnique({
    where: { id: gunId },
    include: { pump: true }
  });
  if (!gun) throw new Error('Nozzle/Gun not found.');

  await db.$transaction(async (tx) => {
    await tx.dutyAssignment.deleteMany({ where: { gunId } });
    await tx.meterReading.deleteMany({ where: { gunId } });
    await tx.gun.delete({ where: { id: gunId } });
  }, TX_OPTIONS);

  await logAudit(session.id, 'DELETE_GUN', 'Gun', gunId, undefined, `Permanently deleted nozzle ${gun.name}`);
  revalidatePath('/dashboard');
  return { success: true };
}

export async function deletePumpAction(pumpId: string) {
  const session = await requireAuth(['OWNER']);
  let pump = await db.pump.findUnique({
    where: { id: pumpId },
    include: { guns: true }
  });
  if (!pump) {
    pump = await db.pump.findFirst({
      where: { name: pumpId },
      include: { guns: true }
    });
  }
  if (!pump) throw new Error('Pump unit not found.');

  const targetPumpId = pump.id;
  const gunIds = pump.guns.map((g) => g.id);

  await db.$transaction(async (tx) => {
    await tx.dutyAssignment.deleteMany({
      where: { OR: [{ pumpId: targetPumpId }, { gunId: { in: gunIds } }] }
    });
    if (gunIds.length > 0) {
      await tx.meterReading.deleteMany({ where: { gunId: { in: gunIds } } });
      await tx.gun.deleteMany({ where: { pumpId: targetPumpId } });
    }
    await tx.pump.delete({ where: { id: targetPumpId } });
  }, TX_OPTIONS);

  await logAudit(session.id, 'DELETE_PUMP', 'Pump', targetPumpId, undefined, `Permanently deleted pump ${pump.name}`);
  revalidatePath('/dashboard');
  return { success: true };
}

export async function getStaticData() {
  // Fetch lists needed for drop-downs
  const pumps = await db.pump.findMany({ where: { active: true }, include: { guns: true } });
  const allPumps = await db.pump.findMany({ include: { guns: true } });
  const guns = await db.gun.findMany({ where: { active: true }, include: { pump: true }, orderBy: { name: 'asc' } });
  const allGuns = await db.gun.findMany({ include: { pump: true }, orderBy: { name: 'asc' } });
  const staff = await db.staff.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  const allStaff = await db.staff.findMany({ orderBy: { name: 'asc' } });
  const categories = await db.expenseCategory.findMany();
  const customers = await db.customer.findMany({ where: { active: true } });
  const businessSettings = await getBusinessSettingsAction();

  // Recalculate central fuel & oil inventory state directly outside interactive transaction
  const invRes = await recalculateCentralInventory();
  const products = await recalculateCentralOilInventory();

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
    allPumps,
    guns,
    allGuns,
    staff,
    allStaff,
    products,
    categories,
    customers,
    businessSettings,
    fuelStock: { MS: invRes.MS, HSD: invRes.HSD },
    inventoryState: invRes.inventoryState,
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

// ----------------- DYNAMIC MULTI-RECIPIENT EMAIL SYSTEM ACTIONS -----------------

export async function getEmailRecipientsAction() {
  await requireAuth(['OWNER', 'MANAGER']);
  await ensureDefaultEmailRecipientsMigrated();
  try {
    const recipients = await (db as any).emailRecipient.findMany({
      orderBy: { createdAt: 'asc' }
    });
    return recipients || [];
  } catch (err) {
    console.error('getEmailRecipientsAction error:', err);
    return [];
  }
}

export async function addEmailRecipientAction(data: {
  name: string;
  email: string;
  dutyReportsEnabled: boolean;
  lowFuelAlertsEnabled: boolean;
}) {
  const session = await requireAuth(['OWNER']);
  if (!data.name || !data.name.trim()) throw new Error('Recipient Name is required.');
  if (!data.email || !data.email.trim()) throw new Error('Recipient Email Address is required.');

  const normalizedEmail = data.email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    throw new Error('Invalid Email Address format.');
  }

  const existing = await (db as any).emailRecipient.findFirst({
    where: { email: normalizedEmail }
  });
  if (existing) {
    throw new Error(`An email recipient with the address "${normalizedEmail}" already exists.`);
  }

  const recipient = await (db as any).emailRecipient.create({
    data: {
      name: data.name.trim(),
      email: normalizedEmail,
      active: true,
      dutyReportsEnabled: !!data.dutyReportsEnabled,
      lowFuelAlertsEnabled: !!data.lowFuelAlertsEnabled,
    }
  });

  await logAudit(
    session.id,
    'ADD_EMAIL_RECIPIENT',
    'EmailRecipient',
    recipient.id,
    undefined,
    `${recipient.name} (${recipient.email})`
  );

  revalidatePath('/dashboard');
  return { success: true, recipient };
}

export async function updateEmailRecipientAction(
  id: string,
  data: {
    name: string;
    email: string;
    dutyReportsEnabled: boolean;
    lowFuelAlertsEnabled: boolean;
    active?: boolean;
  }
) {
  const session = await requireAuth(['OWNER']);
  if (!data.name || !data.name.trim()) throw new Error('Recipient Name is required.');
  if (!data.email || !data.email.trim()) throw new Error('Recipient Email Address is required.');

  const normalizedEmail = data.email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    throw new Error('Invalid Email Address format.');
  }

  const existing = await (db as any).emailRecipient.findFirst({
    where: { email: normalizedEmail, NOT: { id } }
  });
  if (existing) {
    throw new Error(`Another recipient with email address "${normalizedEmail}" already exists.`);
  }

  const recipient = await (db as any).emailRecipient.update({
    where: { id },
    data: {
      name: data.name.trim(),
      email: normalizedEmail,
      dutyReportsEnabled: !!data.dutyReportsEnabled,
      lowFuelAlertsEnabled: !!data.lowFuelAlertsEnabled,
      ...(data.active !== undefined ? { active: !!data.active } : {}),
    }
  });

  await logAudit(
    session.id,
    'UPDATE_EMAIL_RECIPIENT',
    'EmailRecipient',
    id,
    undefined,
    `${recipient.name} (${recipient.email})`
  );

  revalidatePath('/dashboard');
  return { success: true, recipient };
}

export async function toggleEmailRecipientStatusAction(id: string, active: boolean) {
  const session = await requireAuth(['OWNER']);
  const recipient = await (db as any).emailRecipient.update({
    where: { id },
    data: { active }
  });

  await logAudit(
    session.id,
    'TOGGLE_EMAIL_RECIPIENT',
    'EmailRecipient',
    id,
    undefined,
    `Recipient: ${recipient.name}, Active: ${active}`
  );

  revalidatePath('/dashboard');
  return { success: true };
}

export async function deleteEmailRecipientAction(id: string) {
  const session = await requireAuth(['OWNER']);
  const recipient = await (db as any).emailRecipient.findUnique({ where: { id } });
  if (!recipient) throw new Error('Recipient not found.');

  await (db as any).emailRecipient.delete({ where: { id } });

  await logAudit(
    session.id,
    'DELETE_EMAIL_RECIPIENT',
    'EmailRecipient',
    id,
    undefined,
    `Deleted recipient ${recipient.name} (${recipient.email})`
  );

  revalidatePath('/dashboard');
  return { success: true };
}

export async function getEmailSettingsAction() {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  await ensureDefaultEmailRecipientsMigrated();
  try {
    const recipients = await (db as any).emailRecipient.findMany({
      orderBy: { createdAt: 'asc' }
    });
    return {
      recipients: recipients || [],
      alertEnabled: true,
    };
  } catch (err) {
    console.error('getEmailSettingsAction error:', err);
    return {
      recipients: [],
      alertEnabled: true,
    };
  }
}

export async function sendTestEmailAction(targetEmail?: string) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const explicitRecipients = targetEmail && targetEmail.trim() ? [targetEmail.trim()] : undefined;
  const result = await sendTestEmail(explicitRecipients);
  return result;
}

export async function getEmailLogsAction() {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  if (!(db as any).emailLog) {
    return [];
  }
  try {
    const logs = await (db as any).emailLog.findMany({
      orderBy: { sentAt: 'desc' },
      take: 50,
    });
    return logs;
  } catch (err) {
    console.error('getEmailLogsAction error:', err);
    return [];
  }
}

export async function verifySmtpConnectionAction() {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const diag = await diagnoseSmtpConfig();
  return diag;
}


// ----------------- TANK DIP CORRECTION ACTION (OWNER ONLY) -----------------

export async function correctTankDipAction(
  dutySessionId: string,
  fuelType: 'MS' | 'HSD',
  correctedLitres: number,
  reason: string
) {
  const session = await requireAuth(['OWNER']);

  if (!dutySessionId || !fuelType || correctedLitres === undefined || correctedLitres === null || correctedLitres < 0) {
    throw new Error('Invalid parameters for tank dip correction');
  }

  if (!reason || !reason.trim()) {
    throw new Error('Correction reason is required for audit trail');
  }

  const existingDip = await db.tankDip.findUnique({
    where: { dutySessionId_fuelType: { dutySessionId, fuelType } },
    include: { dutySession: true }
  });

  if (!existingDip) {
    throw new Error('Tank dip record not found for this duty session');
  }

  // Original chart-derived stock must NEVER be overwritten!
  const chartVal = existingDip.chartCalculatedLitres ?? existingDip.finalLitres;
  const oldFinal = existingDip.finalLitres;
  const newFinal = correctedLitres;
  const newVariance = newFinal - (existingDip.expectedClosing ?? 0);

  const updatedDip = await db.tankDip.update({
    where: { dutySessionId_fuelType: { dutySessionId, fuelType } },
    data: {
      chartCalculatedLitres: chartVal, // Preserve original chart-derived value
      correctedLitres: correctedLitres,
      finalLitres: newFinal,
      physicalDip: newFinal,
      variance: newVariance,
      isCorrected: true,
      correctionReason: reason.trim(),
      correctedById: session.id,
      correctedAt: new Date(),
    }
  });

  await logAudit(
    session.id,
    'CORRECT_TANK_DIP',
    'TankDip',
    existingDip.id,
    `Original Physical: ${oldFinal} L`,
    `Corrected Physical: ${newFinal} L | Reason: ${reason.trim()}`
  );

  // Re-evaluate low-stock alert state for this fuel type based on VERIFIED PHYSICAL STOCK
  if ((db as any).systemSetting) {
    const alertStateKey = `${fuelType}_ALERT_STATE`;
    const currentStateSetting = await (db as any).systemSetting.findUnique({ where: { key: alertStateKey } });
    const isCurrentlyTriggered = currentStateSetting?.value === 'TRIGGERED';

    if (newFinal <= LOW_FUEL_THRESHOLD_LITRES) {
      if (!isCurrentlyTriggered) {
        const dutyNum = existingDip.dutySession?.dutyNumber || 0;
        await sendLowFuelStockAlert({
          fuelType,
          dutyNumber: dutyNum,
          msStock: fuelType === 'MS' ? {
            physicalStock: newFinal,
            bookStock: existingDip.expectedClosing,
            isCorrected: true,
            correctionReason: reason.trim()
          } : undefined,
          hsdStock: fuelType === 'HSD' ? {
            physicalStock: newFinal,
            bookStock: existingDip.expectedClosing,
            isCorrected: true,
            correctionReason: reason.trim()
          } : undefined,
        });
        await (db as any).systemSetting.upsert({
          where: { key: alertStateKey },
          update: { value: 'TRIGGERED' },
          create: { key: alertStateKey, value: 'TRIGGERED' }
        });
      }
    } else {
      // Physical stock > 6000 L, reset alert state
      await (db as any).systemSetting.upsert({
        where: { key: alertStateKey },
        update: { value: 'RESET' },
        create: { key: alertStateKey, value: 'RESET' }
      });
    }
  }

  revalidatePath('/dashboard');
  revalidatePath('/acc/history');
  revalidatePath('/stock');

  return { success: true, updatedDip };
}

// ----------------- DUTY DELETION ACTION (OWNER ONLY) -----------------

export async function deleteDutyAction(dutySessionId: string, reason: string) {
  const session = await requireAuth(['OWNER']);

  if (!dutySessionId) {
    throw new Error('Duty session ID is required for deletion.');
  }

  if (!reason || !reason.trim()) {
    throw new Error('Mandatory deletion reason is required for audit trail.');
  }

  const duty = await db.dutySession.findUnique({
    where: { id: dutySessionId },
    include: {
      creditTransactions: true,
    }
  });

  if (!duty) {
    throw new Error('Duty session not found.');
  }

  if (duty.status === 'OPEN') {
    throw new Error(`ACTIVE DUTY CANNOT BE DELETED. Duty #${duty.dutyNumber} is currently active. You must complete or close the duty session before performing deletion.`);
  }

  const dutyNumber = duty.dutyNumber;
  const oldSummary = `Duty #${dutyNumber} (${duty.startTime.toISOString().slice(0, 10)}) - Manager: ${duty.managerId}`;

  // Execute deletion inside a transaction
  await db.$transaction(async (tx) => {
    // 1. If duty had credit transactions, adjust customer balances accordingly
    if (duty.creditTransactions && duty.creditTransactions.length > 0) {
      for (const ct of duty.creditTransactions) {
        const customer = await tx.customer.findUnique({ where: { id: ct.customerId } });
        if (customer) {
          let balanceAdj = 0;
          if (ct.transactionType === 'CREDIT_SALE') {
            balanceAdj = -ct.amount; // Remove credit sale -> reduce customer balance
          } else if (ct.transactionType === 'COLLECTION') {
            balanceAdj = ct.amount; // Remove collection -> restore customer balance
          }
          if (balanceAdj !== 0) {
            await tx.customer.update({
              where: { id: ct.customerId },
              data: { balance: { increment: balanceAdj } }
            });
          }
        }
      }
    }

    // 2. Delete DutySession (Prisma cascade-deletes MeterReading, DutyAssignment, OilSale, Expense, TankDip, etc.)
    await tx.dutySession.delete({
      where: { id: dutySessionId }
    });
  }, TX_OPTIONS);

  // 3. Log Audit Record permanently
  await logAudit(
    session.id,
    'DELETE_DUTY',
    'DutySession',
    dutySessionId,
    oldSummary,
    `Reason: ${reason.trim()}`
  );

  // 4. Recalculate central inventory
  await recalculateCentralInventory();
  await recalculateCentralOilInventory();

  revalidatePath('/dashboard');
  revalidatePath('/acc/history');
  revalidatePath('/reports/credit');
  revalidatePath('/stock');

  return { success: true, message: `✓ Duty #${dutyNumber} deleted successfully.` };
}

// ----------------- FULL SYSTEM RESET ACTION (OWNER ONLY) -----------------

export async function resetSystemAction(confirmText: string, ownerPassword?: string) {
  const session = await requireAuth(['OWNER']);

  if (confirmText.trim().toUpperCase() !== 'RESET SYSTEM') {
    throw new Error('Reset failed: Confirmation text must match "RESET SYSTEM".');
  }

  // Validate Owner Password if provided
  if (ownerPassword) {
    const ownerUser = await db.user.findUnique({ where: { id: session.id } });
    if (ownerUser && ownerUser.passwordHash !== hashPassword(ownerPassword)) {
      throw new Error('Authentication failed: Invalid Owner password.');
    }
  }

  // Execute full operational reset in a database transaction
  await db.$transaction(async (tx) => {
    // 1. Delete operational records
    await tx.meterReadingInterval.deleteMany({});
    await tx.meterReading.deleteMany({});
    await tx.dutyAssignment.deleteMany({});
    await tx.shortageAssignment.deleteMany({});
    await tx.oilSale.deleteMany({});
    await tx.sampleBoxSale.deleteMany({});
    await tx.expense.deleteMany({});
    await tx.creditTransaction.deleteMany({});
    await tx.tankDip.deleteMany({});
    await tx.tankSample.deleteMany({});
    await tx.dutyDensity.deleteMany({});
    await tx.fuelStockMovement.deleteMany({});
    await tx.fuelReceipt.deleteMany({});
    await tx.tankStock.deleteMany({});
    await tx.oilPurchaseItem.deleteMany({});
    await tx.oilPurchase.deleteMany({});
    await tx.dutySession.deleteMany({});

    if ((tx as any).emailLog) {
      await (tx as any).emailLog.deleteMany({});
    }

    // 2. Reset customer balances to 0.0
    await tx.customer.updateMany({
      data: { balance: 0.0 }
    });

    // 3. Reset oil product stock quantities to initial baseline
    const oilProducts = await tx.oilProduct.findMany({});
    for (const p of oilProducts) {
      await tx.oilProduct.update({
        where: { id: p.id },
        data: { stockQuantity: p.openingStock ?? 0.0 }
      });
    }

    // 4. Reset alert states in SystemSetting if present
    if ((tx as any).systemSetting) {
      await (tx as any).systemSetting.deleteMany({
        where: { key: { in: ['MS_ALERT_STATE', 'HSD_ALERT_STATE'] } }
      });
    }
  }, TX_OPTIONS);

  // Log Audit Record permanently
  await logAudit(
    session.id,
    'FULL_SYSTEM_RESET',
    'System',
    'ALL_OPERATIONAL_DATA',
    undefined,
    'Operational data reset to fresh setup state'
  );

  // Recalculate inventory
  await recalculateCentralInventory();
  await recalculateCentralOilInventory();

  revalidatePath('/dashboard');
  revalidatePath('/acc/history');
  revalidatePath('/stock');
  revalidatePath('/reports/credit');

  return {
    success: true,
    message: '✓ System reset successfully. Operational data removed. Ready for first duty initialization.'
  };
}

// ----------------- BUSINESS SETTINGS ACTION (OWNER ONLY) -----------------

export async function updateBusinessSettingsAction(settingsPayload: {
  businessName?: string;
  businessAddress?: string;
  businessContact?: string;
  reportHeader?: string;
  msLowThreshold?: number;
  hsdLowThreshold?: number;
}) {
  const session = await requireAuth(['OWNER']);

  const entries = [
    { key: 'BUSINESS_NAME', val: (settingsPayload.businessName || '').trim() },
    { key: 'BUSINESS_ADDRESS', val: (settingsPayload.businessAddress || '').trim() },
    { key: 'BUSINESS_CONTACT', val: (settingsPayload.businessContact || '').trim() },
    { key: 'REPORT_HEADER', val: (settingsPayload.reportHeader || '').trim() },
    { key: 'MS_LOW_THRESHOLD', val: String(settingsPayload.msLowThreshold ?? 6000) },
    { key: 'HSD_LOW_THRESHOLD', val: String(settingsPayload.hsdLowThreshold ?? 6000) },
  ];

  for (const entry of entries) {
    if (entry.val) {
      await db.systemSetting.upsert({
        where: { key: entry.key },
        update: { value: entry.val },
        create: { key: entry.key, value: entry.val },
      });
    }
  }

  await logAudit(
    session.id,
    'UPDATE_BUSINESS_SETTINGS',
    'SystemSetting',
    'BUSINESS_CONFIG',
    undefined,
    JSON.stringify(settingsPayload)
  );

  revalidatePath('/dashboard');
  return { success: true, message: '✓ Business settings updated successfully.' };
}

// ----------------- STAFF ATTENDANCE & SHIFT HANDOVER ACTIONS -----------------

export async function recordStaffHandoverAction(params: {
  dutySessionId: string;
  gunId?: string;
  pumpId: string;
  outgoingStaffId: string;
  incomingStaffId?: string | null;
  handoverTimeStr: string;
  handoverMeterReading: number;
  status?: string;
  reason?: string;
  remarks?: string;
}) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const handoverTime = new Date(params.handoverTimeStr);
  const {
    dutySessionId, gunId, pumpId, outgoingStaffId, incomingStaffId,
    handoverMeterReading, status, reason, remarks
  } = params;

  const dutySession = await db.dutySession.findUnique({ where: { id: dutySessionId } });
  if (!dutySession) throw new Error('Duty session not found');

  const outgoingStaff = await db.staff.findUnique({ where: { id: outgoingStaffId } });
  const incomingStaff = incomingStaffId ? await db.staff.findUnique({ where: { id: incomingStaffId } }) : null;

  await db.$transaction(async (tx) => {
    // 1. Find active StaffAttendance record for outgoing staff on this pump/gun
    const currentAttendance = await (tx as any).staffAttendance.findFirst({
      where: {
        dutySessionId,
        staffId: outgoingStaffId,
        pumpId,
        ...(gunId ? { gunId } : {}),
        endTime: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (currentAttendance) {
      await (tx as any).staffAttendance.update({
        where: { id: currentAttendance.id },
        data: {
          endTime: handoverTime,
          endMeterReading: handoverMeterReading,
          status: status || 'PARTIAL_DUTY',
          reason: reason || 'Shift Handover',
          remarks: remarks || null,
          incomingStaffId: incomingStaffId || null,
        },
      });
    } else {
      await (tx as any).staffAttendance.create({
        data: {
          dutySessionId,
          staffId: outgoingStaffId,
          pumpId,
          gunId: gunId || null,
          startTime: dutySession.startTime,
          endTime: handoverTime,
          endMeterReading: handoverMeterReading,
          status: status || 'PARTIAL_DUTY',
          reason: reason || 'Shift Handover',
          remarks: remarks || null,
          incomingStaffId: incomingStaffId || null,
          recordedById: session.id,
        },
      });
    }

    // 2. Handle incoming staff replacement if provided
    if (incomingStaffId) {
      await (tx as any).staffAttendance.create({
        data: {
          dutySessionId,
          staffId: incomingStaffId,
          pumpId,
          gunId: gunId || null,
          fuelType: currentAttendance?.fuelType || 'MS',
          startTime: handoverTime,
          startMeterReading: handoverMeterReading,
          status: 'REPLACEMENT',
          outgoingStaffId: outgoingStaffId,
          recordedById: session.id,
          remarks: remarks || `Took over from ${outgoingStaff?.name || 'Staff'}`,
        },
      });

      if (gunId) {
        await tx.dutyAssignment.upsert({
          where: { dutySessionId_gunId: { dutySessionId, gunId } },
          create: {
            dutySessionId,
            pumpId,
            gunId,
            fuelType: currentAttendance?.fuelType || 'MS',
            staffId: incomingStaffId,
          },
          update: {
            staffId: incomingStaffId,
          },
        });
      }
    } else {
      // No replacement -> remove assignment so it displays NO STAFF ASSIGNED
      if (gunId) {
        await tx.dutyAssignment.deleteMany({
          where: { dutySessionId, gunId },
        });
      }
    }

    await logAudit(
      session.id,
      'STAFF_HANDOVER',
      'StaffAttendance',
      outgoingStaffId,
      `Outgoing: ${outgoingStaff?.name}`,
      `Incoming: ${incomingStaff?.name || 'NONE (Unassigned)'}, Meter: ${handoverMeterReading}, Time: ${handoverTime.toLocaleTimeString()}`
    );
  }, TX_OPTIONS);

  revalidatePath('/dashboard');
  revalidatePath('/staff');
  return {
    success: true,
    message: incomingStaff
      ? `✓ Handover confirmed: ${outgoingStaff?.name} ➔ ${incomingStaff.name} at meter ${handoverMeterReading}`
      : `✓ Responsibility ended for ${outgoingStaff?.name}. No replacement assigned.`,
  };
}

export async function markStaffAbsentAction(params: {
  dutySessionId: string;
  gunId?: string;
  pumpId: string;
  staffId: string;
  replacementStaffId?: string | null;
  reason?: string;
  remarks?: string;
}) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const { dutySessionId, gunId, pumpId, staffId, replacementStaffId, reason, remarks } = params;

  const dutySession = await db.dutySession.findUnique({ where: { id: dutySessionId } });
  if (!dutySession) throw new Error('Duty session not found');

  const absentStaff = await db.staff.findUnique({ where: { id: staffId } });
  const replacementStaff = replacementStaffId ? await db.staff.findUnique({ where: { id: replacementStaffId } }) : null;

  await db.$transaction(async (tx) => {
    const existing = await (tx as any).staffAttendance.findFirst({
      where: { dutySessionId, staffId, pumpId, ...(gunId ? { gunId } : {}) },
    });

    if (existing) {
      await (tx as any).staffAttendance.update({
        where: { id: existing.id },
        data: {
          status: 'ABSENT',
          workingDays: 0.0,
          startTime: null,
          endTime: null,
          startMeterReading: null,
          endMeterReading: null,
          reason: reason || 'Did not report for duty',
          remarks: remarks || null,
          incomingStaffId: replacementStaffId || null,
        },
      });
    } else {
      await (tx as any).staffAttendance.create({
        data: {
          dutySessionId,
          staffId,
          pumpId,
          gunId: gunId || null,
          status: 'ABSENT',
          workingDays: 0.0,
          reason: reason || 'Did not report for duty',
          remarks: remarks || null,
          incomingStaffId: replacementStaffId || null,
          recordedById: session.id,
        },
      });
    }

    if (replacementStaffId) {
      let openingReading = 0;
      if (gunId) {
        const mr = await tx.meterReading.findUnique({
          where: { dutySessionId_gunId: { dutySessionId, gunId } },
        });
        if (mr) openingReading = mr.previousReading;
      }

      await (tx as any).staffAttendance.create({
        data: {
          dutySessionId,
          staffId: replacementStaffId,
          pumpId,
          gunId: gunId || null,
          startTime: dutySession.startTime,
          startMeterReading: openingReading,
          status: 'REPLACEMENT',
          workingDays: 1.0,
          outgoingStaffId: staffId,
          recordedById: session.id,
          remarks: `Replaced absent staff ${absentStaff?.name || ''}`,
        },
      });

      if (gunId) {
        await tx.dutyAssignment.upsert({
          where: { dutySessionId_gunId: { dutySessionId, gunId } },
          create: {
            dutySessionId,
            pumpId,
            gunId,
            fuelType: existing?.fuelType || 'MS',
            staffId: replacementStaffId,
          },
          update: {
            staffId: replacementStaffId,
          },
        });
      }
    } else {
      if (gunId) {
        await tx.dutyAssignment.deleteMany({
          where: { dutySessionId, gunId },
        });
      }
    }

    await logAudit(
      session.id,
      'MARK_STAFF_ABSENT',
      'StaffAttendance',
      staffId,
      `Staff: ${absentStaff?.name}`,
      `Status: ABSENT, Replacement: ${replacementStaff?.name || 'NONE'}`
    );
  }, TX_OPTIONS);

  revalidatePath('/dashboard');
  revalidatePath('/staff');
  return {
    success: true,
    message: `✓ ${absentStaff?.name || 'Staff'} marked ABSENT.${replacementStaff ? ` Replaced by ${replacementStaff.name}.` : ''}`,
  };
}

export async function assignMidDutyStaffAction(params: {
  dutySessionId: string;
  gunId?: string;
  pumpId: string;
  fuelType?: string;
  staffId: string;
  startTimeStr?: string;
  startMeterReading?: number;
}) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const { dutySessionId, gunId, pumpId, fuelType, staffId, startTimeStr, startMeterReading } = params;

  const dutySession = await db.dutySession.findUnique({ where: { id: dutySessionId } });
  if (!dutySession) throw new Error('Duty session not found');

  const startTime = startTimeStr ? new Date(startTimeStr) : new Date();

  await db.$transaction(async (tx) => {
    let reading = startMeterReading;
    if (reading === undefined && gunId) {
      const mr = await tx.meterReading.findUnique({
        where: { dutySessionId_gunId: { dutySessionId, gunId } },
      });
      if (mr) reading = mr.currentReading || mr.previousReading;
    }

    await (tx as any).staffAttendance.create({
      data: {
        dutySessionId,
        staffId,
        pumpId,
        gunId: gunId || null,
        fuelType: fuelType || 'MS',
        startTime,
        startMeterReading: reading || 0,
        status: 'PRESENT',
        recordedById: session.id,
      },
    });

    if (gunId) {
      await tx.dutyAssignment.upsert({
        where: { dutySessionId_gunId: { dutySessionId, gunId } },
        create: {
          dutySessionId,
          pumpId,
          gunId,
          fuelType: fuelType || 'MS',
          staffId,
        },
        update: {
          staffId,
        },
      });
    }
  }, TX_OPTIONS);

  revalidatePath('/dashboard');
  revalidatePath('/staff');
  return { success: true, message: '✓ Staff assigned to pump nozzle successfully.' };
}

export async function updateStaffAttendanceAction(
  attendanceId: string,
  status: string,
  workingDays: number,
  remarks?: string,
  staffId?: string,
  dutySessionId?: string
) {
  const session = await requireAuth(['OWNER', 'MANAGER']);

  if (!attendanceId && !dutySessionId) throw new Error('Attendance ID or Duty Session ID is required');
  const numDays = Number(workingDays);
  if (isNaN(numDays) || numDays < 0 || numDays > 5) {
    throw new Error('Working days must be a valid non-negative number (e.g. 1.0, 0.5, 0.25, 0).');
  }

  const newStatus = status.trim().toUpperCase();

  // 1. Try finding by ID
  let existing = attendanceId
    ? await (db as any).staffAttendance.findUnique({
        where: { id: attendanceId },
        include: { staff: true, dutySession: true },
      })
    : null;

  // 2. Try finding by dutySessionId + staffId
  if (!existing && (dutySessionId || attendanceId) && staffId) {
    const targetDutyId = dutySessionId || attendanceId;
    existing = await (db as any).staffAttendance.findFirst({
      where: {
        dutySessionId: targetDutyId,
        staffId: staffId,
      },
      include: { staff: true, dutySession: true },
    });
  }

  // 3. Try finding by dutySessionId alone
  if (!existing && (dutySessionId || attendanceId)) {
    const targetDutyId = dutySessionId || attendanceId;
    existing = await (db as any).staffAttendance.findFirst({
      where: {
        dutySessionId: targetDutyId,
      },
      include: { staff: true, dutySession: true },
    });
  }

  let updated;
  if (existing) {
    const oldStatus = existing.status;
    const oldDays = existing.workingDays !== null && existing.workingDays !== undefined ? existing.workingDays : (existing.status === 'ABSENT' ? 0 : 1.0);

    const targetDutyId = existing.dutySessionId;
    const targetStaffId = existing.staffId;

    // Update ALL nozzle attendance records for this staff member in this duty session
    await (db as any).staffAttendance.updateMany({
      where: {
        dutySessionId: targetDutyId,
        staffId: targetStaffId,
      },
      data: {
        status: newStatus,
        workingDays: numDays,
        remarks: remarks ? remarks.trim() : null,
      },
    });

    updated = await (db as any).staffAttendance.findUnique({
      where: { id: existing.id },
    });

    await logAudit(
      session.id,
      'UPDATE_STAFF_ATTENDANCE',
      'StaffAttendance',
      existing.id,
      `Status: ${oldStatus}, Days: ${oldDays}`,
      `Status: ${newStatus}, Days: ${numDays} | Remarks: ${remarks ? remarks.trim() : 'N/A'}`
    );
  } else {
    // Create new StaffAttendance record if missing
    const targetDutyId = dutySessionId || attendanceId;
    const targetStaffId = staffId;

    if (!targetStaffId) throw new Error('Staff member is required to create attendance record.');

    const pump = await db.pump.findFirst({ where: { active: true } });
    if (!pump) throw new Error('No active pump found.');

    updated = await (tx => (tx as any).staffAttendance.create({
      data: {
        dutySessionId: targetDutyId,
        staffId: targetStaffId,
        pumpId: pump.id,
        status: newStatus,
        workingDays: numDays,
        remarks: remarks ? remarks.trim() : null,
        recordedById: session.id,
      },
    }))(db);

    await logAudit(
      session.id,
      'CREATE_STAFF_ATTENDANCE',
      'StaffAttendance',
      updated.id,
      'None',
      `Status: ${newStatus}, Days: ${numDays} | Remarks: ${remarks ? remarks.trim() : 'N/A'}`
    );
  }

  revalidatePath('/dashboard');
  revalidatePath('/staff');
  revalidatePath('/reports');
  return { success: true, updated };
}

export async function getStaffMonthlyAttendanceReportAction(
  month: number,
  year: number,
  staffIdFilter?: string,
  pumpIdFilter?: string,
  statusFilter?: string,
  includeInactive: boolean = false,
  customStartDate?: string,
  customEndDate?: string
) {
  const session = await requireAuth(['OWNER', 'MANAGER']);

  let startDate: Date;
  let endDate: Date;

  if (customStartDate && customEndDate) {
    startDate = new Date(`${customStartDate}T00:00:00`);
    endDate = new Date(`${customEndDate}T23:59:59`);
  } else {
    startDate = new Date(year, month - 1, 1, 0, 0, 0);
    endDate = new Date(year, month, 0, 23, 59, 59);
  }

  const allStaff = await db.staff.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: 'asc' }
  });

  const attendances = await (db as any).staffAttendance.findMany({
    where: {
      dutySession: {
        startTime: {
          gte: startDate,
          lte: endDate,
        },
      },
      ...(staffIdFilter ? { staffId: staffIdFilter } : {}),
      ...(pumpIdFilter ? { pumpId: pumpIdFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: {
      staff: true,
      pump: true,
      gun: true,
      dutySession: true,
      outgoingStaff: true,
      incomingStaff: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const staffSummaryMap: Record<string, {
    staffId: string;
    staffName: string;
    workedDays: number;
    fullDutiesCount: number;
    partialDutiesCount: number;
    emergencyExitsCount: number;
    absentCount: number;
    details: any[];
  }> = {};

  for (const s of allStaff) {
    if (staffIdFilter && s.id !== staffIdFilter) continue;
    staffSummaryMap[s.id] = {
      staffId: s.id,
      staffName: s.name,
      workedDays: 0,
      fullDutiesCount: 0,
      partialDutiesCount: 0,
      emergencyExitsCount: 0,
      absentCount: 0,
      details: [],
    };
  }

  // Group attendances by staffId
  const attendancesByStaff: Record<string, any[]> = {};
  for (const att of attendances) {
    if (!attendancesByStaff[att.staffId]) {
      attendancesByStaff[att.staffId] = [];
    }
    attendancesByStaff[att.staffId].push(att);
  }

  for (const [sId, staffAtts] of Object.entries(attendancesByStaff)) {
    if (!staffSummaryMap[sId]) {
      staffSummaryMap[sId] = {
        staffId: sId,
        staffName: staffAtts[0]?.staff?.name || 'Unknown Staff',
        workedDays: 0,
        fullDutiesCount: 0,
        partialDutiesCount: 0,
        emergencyExitsCount: 0,
        absentCount: 0,
        details: [],
      };
    }

    const summary = staffSummaryMap[sId];

    // Group this staff member's attendances by dutySessionId
    const dutyGroupsMap: Record<string, any[]> = {};
    for (const att of staffAtts) {
      const dId = att.dutySessionId;
      if (!dutyGroupsMap[dId]) {
        dutyGroupsMap[dId] = [];
      }
      dutyGroupsMap[dId].push(att);
    }

    // Sort duty groups by duty start time / createdAt desc
    const sortedDutyGroupEntries = Object.entries(dutyGroupsMap).sort((a, b) => {
      const timeA = new Date(a[1][0]?.dutySession?.startTime || a[1][0]?.createdAt).getTime();
      const timeB = new Date(b[1][0]?.dutySession?.startTime || b[1][0]?.createdAt).getTime();
      return timeB - timeA;
    });

    for (const [dId, groupAtts] of sortedDutyGroupEntries) {
      const firstAtt = groupAtts[0];
      const dutySession = firstAtt.dutySession;

      const dutyStart = firstAtt.startTime || dutySession?.startTime;
      const dutyEnd = firstAtt.endTime || dutySession?.endTime || new Date();

      const explicitRecord = groupAtts.find((a: any) => a.workingDays !== null && a.workingDays !== undefined);
      const wDays = explicitRecord
        ? Number(explicitRecord.workingDays)
        : (firstAtt.status === 'ABSENT' ? 0 : 1.0);

      summary.workedDays += wDays;

      if (firstAtt.status === 'ABSENT' || wDays === 0) {
        summary.absentCount += 1;
      } else if (firstAtt.status === 'EMERGENCY') {
        summary.emergencyExitsCount += 1;
        summary.partialDutiesCount += 1;
      } else if (firstAtt.status === 'PARTIAL' || firstAtt.status === 'PARTIAL_DUTY' || firstAtt.status === 'EARLY_EXIT' || (wDays > 0 && wDays < 1.0)) {
        summary.partialDutiesCount += 1;
      } else {
        summary.fullDutiesCount += 1;
      }

      // Collect unique guns and pumps for combined display
      const pumpToGuns: Record<string, Set<string>> = {};
      for (const a of groupAtts) {
        const pName = a.pump?.name || 'Pump';
        const gName = a.gun?.name || a.fuelType || 'Nozzle';
        if (!pumpToGuns[pName]) {
          pumpToGuns[pName] = new Set<string>();
        }
        pumpToGuns[pName].add(gName);
      }

      const pumpParts: string[] = [];
      const allGunNames: string[] = [];

      for (const [pName, gunsSet] of Object.entries(pumpToGuns)) {
        const gunsArr = Array.from(gunsSet);
        allGunNames.push(...gunsArr);
        pumpParts.push(`${pName} (${gunsArr.join(', ')})`);
      }

      const pumpNameStr = Object.keys(pumpToGuns).join(', ');
      const gunNameStr = Array.from(new Set(allGunNames)).join(', ');
      const pumpNozzleStr = pumpParts.join(', ');

      summary.details.push({
        id: firstAtt.id,
        allAttendanceIds: groupAtts.map((a: any) => a.id),
        staffId: firstAtt.staffId,
        dutySessionId: firstAtt.dutySessionId,
        date: dutySession?.startTime
          ? new Date(dutySession.startTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          : 'N/A',
        dutyNumber: dutySession?.dutyNumber || 0,
        staffName: firstAtt.staff?.name || summary.staffName,
        pumpName: pumpNameStr,
        gunName: gunNameStr,
        pumpNozzleStr,
        startTimeStr: dutyStart ? new Date(dutyStart).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A',
        endTimeStr: firstAtt.endTime ? new Date(firstAtt.endTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : (dutySession?.endTime ? new Date(dutySession.endTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'Active'),
        status: firstAtt.status,
        startMeter: firstAtt.startMeterReading,
        endMeter: groupAtts[groupAtts.length - 1]?.endMeterReading || firstAtt.endMeterReading,
        reason: groupAtts.map((a: any) => a.reason).filter(Boolean).join('; ') || 'N/A',
        remarks: groupAtts.map((a: any) => a.remarks).filter(Boolean).join('; ') || '',
        workedDays: wDays,
        outgoingStaffName: firstAtt.outgoingStaff?.name || null,
        incomingStaffName: firstAtt.incomingStaff?.name || null,
      });
    }
  }

  const summaryList = Object.values(staffSummaryMap).map((s) => ({
    ...s,
    workedDays: Number(s.workedDays.toFixed(2)),
  }));

  return {
    month,
    year,
    summary: summaryList,
    recordsCount: attendances.length,
  };
}


