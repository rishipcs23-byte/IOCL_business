const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function main() {
  console.log('Seeding database...');

  // Create roles
  const ownerRole = await prisma.role.upsert({
    where: { name: 'OWNER' },
    update: {},
    create: { name: 'OWNER' },
  });

  const managerRole = await prisma.role.upsert({
    where: { name: 'MANAGER' },
    update: {},
    create: { name: 'MANAGER' },
  });

  // Create default users
  const ownerUser = await prisma.user.upsert({
    where: { username: 'owner' },
    update: {},
    create: {
      username: 'owner',
      passwordHash: hashPassword('owner123'),
      roleId: ownerRole.id,
    },
  });

  const managerUser = await prisma.user.upsert({
    where: { username: 'manager' },
    update: {},
    create: {
      username: 'manager',
      passwordHash: hashPassword('manager123'),
      roleId: managerRole.id,
    },
  });

  // Create default staff members
  const staffNames = ['Ramesh', 'Suresh', 'Kumar', 'Manjunath', 'Nihal', 'Noordesh', 'Aray', 'Kiran'];
  const staffList = [];
  for (const name of staffNames) {
    const s = await prisma.staff.create({
      data: { name, active: true },
    });
    staffList.push(s);
  }

  // Create pumps
  const pump1 = await prisma.pump.upsert({
    where: { name: 'Pump 1' },
    update: {},
    create: { name: 'Pump 1' },
  });

  const pump2 = await prisma.pump.upsert({
    where: { name: 'Pump 2' },
    update: {},
    create: { name: 'Pump 2' },
  });

  // Create guns
  const gunsData = [
    { name: 'MS-1', pumpId: pump1.id, fuelType: 'MS' },
    { name: 'HSD-1', pumpId: pump1.id, fuelType: 'HSD' },
    { name: 'MS-2', pumpId: pump1.id, fuelType: 'MS' },
    { name: 'HSD-2', pumpId: pump1.id, fuelType: 'HSD' },
    { name: 'MS-3', pumpId: pump2.id, fuelType: 'MS' },
    { name: 'HSD-3', pumpId: pump2.id, fuelType: 'HSD' },
    { name: 'MS-4', pumpId: pump2.id, fuelType: 'MS' },
    { name: 'HSD-4', pumpId: pump2.id, fuelType: 'HSD' },
  ];

  const gunsMap = {};
  for (const gun of gunsData) {
    const g = await prisma.gun.upsert({
      where: { name: gun.name },
      update: { pumpId: gun.pumpId, fuelType: gun.fuelType },
      create: gun,
    });
    gunsMap[gun.name] = g.id;
  }

  // Create oil products
  const oilProducts = [
    { name: '4T', price: 350.0 },
    { name: '2T', price: 150.0 },
  ];

  for (const prod of oilProducts) {
    const createdProd = await prisma.oilProduct.upsert({
      where: { name: prod.name },
      update: { price: prod.price },
      create: prod,
    });

    // Seed price history
    await prisma.oilPriceHistory.create({
      data: {
        productId: createdProd.id,
        price: prod.price,
        effectiveFrom: new Date(),
      },
    });
  }

  // Create expense categories
  const categories = [
    'Maintenance',
    'Electricity',
    'Cleaning',
    'Salary',
    'Transport',
    'Stationery',
    'Bank charges',
    'Miscellaneous',
  ];

  for (const cat of categories) {
    await prisma.expenseCategory.upsert({
      where: { name: cat },
      update: {},
      create: { name: cat },
    });
  }

  // Create initial fuel price
  const initialPrices = [
    { fuelType: 'MS', price: 112.15 },
    { fuelType: 'HSD', price: 100.08 },
  ];

  for (const ip of initialPrices) {
    await prisma.fuelPrice.create({
      data: {
        fuelType: ip.fuelType,
        price: ip.price,
        effectiveFrom: new Date('2026-07-20T06:00:00Z'),
      },
    });
  }

  // Seed default customers for credit
  const defaultCustomers = [
    { name: 'ABC Transport', contactDetails: '9876543210', address: 'Main Road', balance: 15000.0 },
    { name: 'TMC KUL', contactDetails: '9988776655', address: 'Town Square', balance: 0.0 },
    { name: 'Hotel Mayura', contactDetails: '9123456789', address: 'Highway 4', balance: 0.0 },
  ];

  for (const cust of defaultCustomers) {
    await prisma.customer.upsert({
      where: { name: cust.name },
      update: {},
      create: cust,
    });
  }

  // Seed Tank Stock initial levels
  const initialStock = [
    { fuelType: 'MS', openingStock: 7504.0, expectedClosing: 7504.0, physicalDip: 7504.0, variance: 0.0 },
    { fuelType: 'HSD', openingStock: 12741.0, expectedClosing: 12741.0, physicalDip: 12741.0, variance: 0.0 },
  ];

  for (const stock of initialStock) {
    await prisma.tankStock.create({
      data: stock,
    });
  }

  // Seed a CLOSED duty session (Duty 99) so that Duty 100 starts with its closing readings
  // The closing readings of Duty 99 will be the opening readings of the 23/07/2026 sheet.
  const dutyStart = new Date('2026-07-22T09:30:00Z');
  const dutyEnd = new Date('2026-07-23T09:30:00Z');

  const prevSession = await prisma.dutySession.create({
    data: {
      dutyNumber: 99,
      startTime: dutyStart,
      endTime: dutyEnd,
      managerId: managerUser.id,
      status: 'CLOSED',
      expectedCash: 0.0,
      actualCash: 0.0,
      cashDifference: 0.0,
    },
  });

  // Create readings for Duty 99 with initial 0.0 values
  const closingReadings = {
    'MS-1': 0.0,
    'HSD-1': 0.0,
    'MS-2': 0.0,
    'HSD-2': 0.0,
    'MS-3': 0.0,
    'HSD-3': 0.0,
    'MS-4': 0.0,
    'HSD-4': 0.0,
  };

  for (const [gunName, closingVal] of Object.entries(closingReadings)) {
    const gunId = gunsMap[gunName];
    await prisma.meterReading.create({
      data: {
        dutySessionId: prevSession.id,
        gunId: gunId,
        previousReading: 0.0,
        currentReading: 0.0,
        litresSold: 0.0,
        priceUsed: gunName.startsWith('MS') ? 112.15 : 100.08,
        salesAmount: 0.0,
      },
    });
  }

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
