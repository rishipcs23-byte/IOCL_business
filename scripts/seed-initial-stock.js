const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  const INITIAL_STOCK_L = 20000;

  // Check existing movements
  const existingMs = await db.fuelStockMovement.findFirst({ where: { fuelType: 'MS', movementType: 'INITIAL_STOCK' } });
  const existingHsd = await db.fuelStockMovement.findFirst({ where: { fuelType: 'HSD', movementType: 'INITIAL_STOCK' } });

  const systemUser = await db.user.findFirst({ select: { id: true } });
  if (!systemUser) { console.error('No user found'); return; }

  // Delete any wrong initial stock movements and reset
  if (!existingMs) {
    await db.fuelStockMovement.create({
      data: { fuelType: 'MS', movementType: 'INITIAL_STOCK', quantityLitres: INITIAL_STOCK_L, balanceAfter: INITIAL_STOCK_L, createdById: systemUser.id }
    });
    console.log('✅ Created MS initial stock movement: 20000 L');
  } else {
    console.log('ℹ️  MS initial stock movement already exists:', existingMs.quantityLitres, 'L');
  }

  if (!existingHsd) {
    await db.fuelStockMovement.create({
      data: { fuelType: 'HSD', movementType: 'INITIAL_STOCK', quantityLitres: INITIAL_STOCK_L, balanceAfter: INITIAL_STOCK_L, createdById: systemUser.id }
    });
    console.log('✅ Created HSD initial stock movement: 20000 L');
  } else {
    console.log('ℹ️  HSD initial stock movement already exists:', existingHsd.quantityLitres, 'L');
  }

  // Update FuelInventory to 20000 for both
  await db.fuelInventory.upsert({ where: { fuelType: 'MS' },  update: { currentStock: INITIAL_STOCK_L }, create: { fuelType: 'MS',  currentStock: INITIAL_STOCK_L } });
  await db.fuelInventory.upsert({ where: { fuelType: 'HSD' }, update: { currentStock: INITIAL_STOCK_L }, create: { fuelType: 'HSD', currentStock: INITIAL_STOCK_L } });
  console.log('✅ FuelInventory updated: MS = 20000 L, HSD = 20000 L');

  // Verify
  const inv = await db.fuelInventory.findMany();
  const movements = await db.fuelStockMovement.findMany({ orderBy: { createdAt: 'asc' } });
  console.log('\n📦 Final Inventory State:');
  inv.forEach(i => console.log(` - ${i.fuelType}: ${i.currentStock} L`));
  console.log('\n📋 Stock Movements:');
  movements.forEach(m => console.log(` - [${m.fuelType}] ${m.movementType}: ${m.quantityLitres} L (balance: ${m.balanceAfter} L)`));
}

main().catch(console.error).finally(() => db.$disconnect());
