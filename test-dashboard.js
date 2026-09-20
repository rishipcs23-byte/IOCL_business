const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function testAllDashboardQueries() {
  console.log('Testing dashboard query logic...');
  try {
    const users = await db.user.findMany();
    console.log('✓ Users count:', users.length);

    const staff = await db.staff.findMany();
    console.log('✓ Staff count:', staff.length);

    const pumps = await db.pump.findMany({ include: { guns: true } });
    console.log('✓ Pumps count:', pumps.length);

    const tanks = await db.tank.findMany();
    console.log('✓ Tanks count:', tanks.length);

    const activeDuty = await db.dutySession.findFirst({
      where: { status: 'OPEN' },
      include: {
        staffDuties: { include: { staff: true } },
        gunReadings: { include: { gun: { include: { pump: true } }, staff: true } },
        dipReadings: { include: { tank: true } },
      },
    });
    console.log('✓ Active Duty:', activeDuty ? activeDuty.id : 'None');

    const totalDuties = await db.dutySession.count();
    console.log('✓ Total Duties count:', totalDuties);

    const historicalDuties = await db.dutySession.findMany({
      take: 10,
      orderBy: { dutyNumber: 'desc' },
      include: {
        staffDuties: { include: { staff: true } },
        gunReadings: { include: { gun: true, staff: true } },
        dipReadings: { include: { tank: true } },
      }
    });
    console.log('✓ Historical duties fetched:', historicalDuties.length);

    const fuelPrices = await db.fuelPrice.findMany({ orderBy: { effectiveFrom: 'desc' }, take: 2 });
    console.log('✓ Fuel prices count:', fuelPrices.length);

    // Test reports query
    const creditLedger = await db.creditParty.findMany({
      include: {
        transactions: { orderBy: { date: 'desc' }, take: 5 },
      },
    });
    console.log('✓ Credit Parties count:', creditLedger.length);

    const expenses = await db.expense.findMany({ orderBy: { date: 'desc' }, take: 20 });
    console.log('✓ Expenses count:', expenses.length);

    const oilSales = await db.lubricantSale.findMany({ orderBy: { date: 'desc' }, take: 20 });
    console.log('✓ Oil Sales count:', oilSales.length);

    const oilPurchases = await db.lubricantPurchase.findMany({ orderBy: { date: 'desc' }, take: 20 });
    console.log('✓ Oil Purchases count:', oilPurchases.length);

    const stockHistory = await db.stockLog.findMany({ orderBy: { timestamp: 'desc' }, take: 20 });
    console.log('✓ Stock Logs count:', stockHistory.length);

    const auditLogs = await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
    console.log('✓ Audit Logs count:', auditLogs.length);

    console.log('\n🎉 ALL DASHBOARD QUERY TESTS PASSED CLEANLY!');
  } catch (err) {
    console.error('❌ ERROR EXECUTING DASHBOARD QUERIES:', err);
  } finally {
    await db.$disconnect();
  }
}

testAllDashboardQueries();
