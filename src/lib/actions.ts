'use server';

import { db } from './db';
import { getSession, hashPassword, requireAuth, loginUser, logoutUser } from './auth';
import { revalidatePath } from 'next/cache';
import { calculateStockMetrics } from '@/lib/stockCalculations';

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
  const product = await db.oilProduct.findUnique({ where: { id } });
  if (!product) throw new Error('Product not found');

  try {
    await db.$transaction(async (tx) => {
      // Delete associated sales & purchase items to allow clean removal of test/invalid products
      await tx.oilSale.deleteMany({ where: { productId: id } });
      await tx.oilPurchaseItem.deleteMany({ where: { productId: id } });
      await tx.oilProduct.delete({ where: { id } });
    });

    // Run global inventory recalculation outside transaction after commit
    await recalculateCentralOilInventory();

    await logAudit(session.id, 'DELETE_OIL_PRODUCT', 'OilProduct', id, JSON.stringify(product));
    revalidatePath('/oil');
    revalidatePath('/dashboard');
    return { success: true, message: `Product "${product.name}" deleted successfully.` };
  } catch (err: any) {
    if (err instanceof Error) throw err;
    throw new Error(err?.message || 'Failed to delete product.');
  }
}

// ----------------- DUTY SESSION CORE WORKFLOW -----------------

export async function getActiveDutySession() {
  return await db.dutySession.findFirst({
    where: { status: 'OPEN' },
    include: {
      assignments: { include: { staff: true, pump: true, gun: true } },
      meterReadings: { include: { gun: { include: { pump: true } } } },
      oilSales: { include: { enteredBy: true, product: true } },
      expenses: { include: { category: true, enteredBy: true } },
      creditTransactions: { include: { customer: true, enteredBy: true } },
      tankDips: true,
      tankSamples: true,
      shortageAssignments: { include: { staff: true, assignedBy: true } },
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
    throw new Error('A duty session is already open. Please close it first.');
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

    // Create staff assignments
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
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const numQty = Number(quantity);
  if (isNaN(numQty) || numQty <= 0) throw new Error('Quantity must be greater than 0');

  try {
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
          dutySessionId,
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
    });

    // Sync global ledger & weighted prices outside the transaction
    await recalculateCentralOilInventory();

    await logAudit(session.id, 'ADD_OIL_SALE', 'OilSale', sale.id, undefined, `${sale.productName} x ${numQty} = ₹${sale.totalAmount}`);
    revalidatePath('/dashboard');
    revalidatePath('/acc/current');
    revalidatePath('/oil');
    return { success: true };
  } catch (err: any) {
    if (err instanceof Error) throw err;
    throw new Error(err?.message || 'Failed to record oil sale.');
  }
}

export async function deleteOilSaleAction(id: string) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const sale = await db.oilSale.findUnique({ where: { id } });
  if (!sale) throw new Error('Sale not found');

  try {
    await db.$transaction(async (tx) => {
      await tx.oilSale.delete({ where: { id } });
      await tx.oilProduct.update({
        where: { id: sale.productId },
        data: { stockQuantity: { increment: sale.quantity } },
      });
    });

    // Recalculate central balances outside transaction after commit
    await recalculateCentralOilInventory();

    await logAudit(session.id, 'DELETE_OIL_SALE', 'OilSale', id, JSON.stringify(sale));
    revalidatePath('/dashboard');
    revalidatePath('/acc/current');
    revalidatePath('/oil');
    return { success: true };
  } catch (err: any) {
    if (err instanceof Error) throw err;
    throw new Error(err?.message || 'Failed to delete oil sale.');
  }
}

export async function recordOilPurchaseAction(
  supplierName: string,
  invoiceNumber: string,
  invoiceDateStr: string,
  items: { productId: string; quantity: number; unitPurchasePrice: number }[],
  notes?: string
) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const invoiceDate = new Date(invoiceDateStr);

  if (!supplierName || !invoiceNumber || !items || items.length === 0) {
    throw new Error('Please fill all required invoice fields and at least one item.');
  }

  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPurchasePrice), 0);

  try {
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
    });

    // Recalculate global balances & weighted costs outside transaction after commit
    await recalculateCentralOilInventory();

    await logAudit(session.id, 'RECORD_OIL_PURCHASE', 'OilPurchase', purchase.id, undefined, `Inv #${invoiceNumber} from ${supplierName} for ₹${totalAmount}`);
    revalidatePath('/dashboard');
    revalidatePath('/oil');
    return { success: true, purchaseId: purchase.id };
  } catch (err: any) {
    if (err instanceof Error) throw err;
    throw new Error(err?.message || 'Failed to record purchase invoice.');
  }
}

export async function deleteOilPurchaseAction(id: string) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const purchase = await db.oilPurchase.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!purchase) throw new Error('Purchase invoice not found');

  try {
    await db.$transaction(async (tx) => {
      await tx.oilPurchaseItem.deleteMany({ where: { purchaseId: id } });
      await tx.oilPurchase.delete({ where: { id } });
    });

    await recalculateCentralOilInventory();

    await logAudit(session.id, 'DELETE_OIL_PURCHASE', 'OilPurchase', id, JSON.stringify(purchase));
    revalidatePath('/dashboard');
    revalidatePath('/oil');
    return { success: true };
  } catch (err: any) {
    if (err instanceof Error) throw err;
    throw new Error(err?.message || 'Failed to delete purchase invoice.');
  }
}

export async function updateOilProductOpeningStockAction(productId: string, openingStock: number) {
  const session = await requireAuth(['OWNER']);
  const numOpening = Math.max(0, Number(openingStock) || 0);

  try {
    await db.oilProduct.update({
      where: { id: productId },
      data: { openingStock: numOpening } as any,
    });

    await recalculateCentralOilInventory();

    await logAudit(session.id, 'UPDATE_OIL_OPENING_STOCK', 'OilProduct', productId, undefined, `Opening Stock set to ${numOpening}`);
    revalidatePath('/dashboard');
    revalidatePath('/oil');
    return { success: true };
  } catch (err: any) {
    if (err instanceof Error) throw err;
    throw new Error(err?.message || 'Failed to update opening stock.');
  }
}


export async function createOilProductAction(
  name: string,
  price: number,
  purchasePrice: number = 0,
  minStockAlert: number = 5,
  openingStock: number = 0
) {
  const session = await requireAuth(['OWNER', 'MANAGER']);
  if (!name || isNaN(price) || price <= 0) {
    throw new Error('Valid product name and selling price are required.');
  }

  const product = await db.$transaction(async (tx) => {
    const prod = await tx.oilProduct.create({
      data: {
        name: name.trim(),
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
  });

  await logAudit(session.id, 'CREATE_OIL_PRODUCT', 'OilProduct', product.id, undefined, `Created ${product.name}`);
  revalidatePath('/dashboard');
  revalidatePath('/oil');
  return { success: true, product };
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
  const session = await requireAuth(['OWNER', 'MANAGER']);
  const product = await db.oilProduct.findUnique({ where: { id } });
  if (!product) throw new Error('Product not found');

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
  });

  await logAudit(session.id, 'UPDATE_OIL_PRODUCT', 'OilProduct', id, JSON.stringify(product), JSON.stringify(data));
  revalidatePath('/dashboard');
  revalidatePath('/oil');
  return { success: true };
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
        meterReadings: { include: { gun: true } },
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
        const prevReading = item.previousReading !== undefined 
          ? item.previousReading 
          : (existingReading ? existingReading.previousReading : 0);
        
        if (item.currentReading < prevReading) {
          const gunName = existingReading?.gun?.name || 'Gun';
          throw new Error(`Closing reading (${item.currentReading}) cannot be lower than opening reading (${prevReading}) for ${gunName}.`);
        }

        const litresSold = Number((item.currentReading - prevReading).toFixed(2));
        const priceUsed = existingReading ? existingReading.priceUsed : 112.15;
        const salesAmount = Number((litresSold * priceUsed).toFixed(2));

        if (existingReading) {
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

          // Opening Stock: ALWAYS read from FuelInventory central inventory ledger first
          const invRecord = await tx.fuelInventory.findUnique({ where: { fuelType: fType } });
          let openingStock = (invRecord && invRecord.currentStock !== undefined && invRecord.currentStock !== null && invRecord.currentStock > 0)
            ? invRecord.currentStock
            : null;

          if (openingStock === null) {
            const prevDip = prevDutyRec?.tankDips?.find(d => d.fuelType === fType);
            if (prevDip && prevDip.finalLitres !== null && prevDip.finalLitres !== undefined && Number(prevDip.finalLitres) > 0) {
              openingStock = Number(prevDip.finalLitres);
            } else if (prevDip && prevDip.physicalDip !== null && prevDip.physicalDip !== undefined && Number(prevDip.physicalDip) > 0) {
              openingStock = Number(prevDip.physicalDip);
            } else {
              openingStock = fType === 'MS' ? 12000 : 15000;
            }

            await tx.fuelInventory.upsert({
              where: { fuelType: fType },
              update: { currentStock: openingStock },
              create: { fuelType: fType, currentStock: openingStock },
            });
          }

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
  });

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

  // 3. Active dispensing from nozzle meter readings of current active duty
  let msActiveDispensed = 0;
  let hsdActiveDispensed = 0;

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
  }

  // Ensure positive default baselines if no historical movements exist
  if (msFinalized <= 0) msFinalized = 12000;
  if (hsdFinalized <= 0) hsdFinalized = 15000;

  const msBookStock = Number((msFinalized + msActiveReceipts - msActiveDispensed).toFixed(2));
  const hsdBookStock = Number((hsdFinalized + hsdActiveReceipts - hsdActiveDispensed).toFixed(2));

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

  return {
    MS: msBookStock,
    HSD: hsdBookStock,
    inventoryState: {
      MS: {
        openingStock: Number(msFinalized.toFixed(2)),
        activeReceipts: Number(msActiveReceipts.toFixed(2)),
        activeDispensed: Number(msActiveDispensed.toFixed(2)),
        currentBookStock: msBookStock,
      },
      HSD: {
        openingStock: Number(hsdFinalized.toFixed(2)),
        activeReceipts: Number(hsdActiveReceipts.toFixed(2)),
        activeDispensed: Number(hsdActiveDispensed.toFixed(2)),
        currentBookStock: hsdBookStock,
      }
    }
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
  });

  await logAudit(session.id, 'ADD_FUEL_RECEIPT', 'FuelReceipt', result.rec.id, undefined, `Added ${qty} L of ${fuelType} under invoice ${invoiceNumber}`);
  revalidatePath('/stock');
  revalidatePath('/dashboard');
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
  });

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
  });

  await logAudit(session.id, 'DELETE_FUEL_RECEIPT', 'FuelReceipt', receiptId, undefined, `Deleted fuel receipt ID ${receiptId}`);
  revalidatePath('/stock');
  revalidatePath('/dashboard');
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
  });

  await logAudit(session.id, 'DELETE_STOCK_MOVEMENT', 'FuelStockMovement', movementId, undefined, `Deleted stock movement ID ${movementId}`);
  revalidatePath('/stock');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function getFuelInventoryAction() {
  await requireAuth(['OWNER', 'MANAGER']);

  const stockMap = await db.$transaction(async (tx) => {
    return await recalculateCentralInventory(tx);
  });

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
  });

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
        include: { gun: { include: { pump: true } } },
      },
      assignments: { include: { staff: true, pump: true, gun: true } },
      oilSales: { include: { enteredBy: true, product: true } },
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
      meterReadings: { include: { gun: { include: { pump: true } } } },
      oilSales: { include: { enteredBy: true, product: true } },
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

export async function getStaffPerformanceReport() {
  const assignments = await db.dutyAssignment.findMany({
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

export async function getStaticData() {
  // Fetch lists needed for drop-downs
  const pumps = await db.pump.findMany({ where: { active: true }, include: { guns: true } });
  const guns = await db.gun.findMany({ where: { active: true }, include: { pump: true }, orderBy: { name: 'asc' } });
  const staff = await db.staff.findMany({ where: { active: true } });
  const categories = await db.expenseCategory.findMany();
  const customers = await db.customer.findMany({ where: { active: true } });

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
    guns,
    staff,
    products,
    categories,
    customers,
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
