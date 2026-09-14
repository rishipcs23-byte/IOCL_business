const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  const movements = await db.fuelStockMovement.findMany({ orderBy: { createdAt: 'asc' }, take: 10 });
  const inventory = await db.fuelInventory.findMany();
  console.log('Stock Movements:', JSON.stringify(movements, null, 2));
  console.log('Inventory:', JSON.stringify(inventory, null, 2));
}

main().finally(() => db.$disconnect());
