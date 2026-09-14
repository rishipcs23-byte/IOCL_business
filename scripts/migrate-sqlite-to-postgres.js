/**
 * IOCL Petrol Bunk Accounting System
 * Safe SQLite -> PostgreSQL Migration Script
 * 
 * Usage:
 *   $env:DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=require"
 *   node scripts/migrate-sqlite-to-postgres.js
 */

const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

async function runMigration() {
  const targetPgUrl = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

  if (!targetPgUrl || !targetPgUrl.startsWith('postgres')) {
    console.error('❌ Error: TARGET_DATABASE_URL or DATABASE_URL must be a valid PostgreSQL connection string starting with postgresql://');
    console.error('Example: $env:TARGET_DATABASE_URL="postgresql://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require"');
    process.exit(1);
  }

  const sqliteDbPath = path.join(__dirname, '..', 'prisma', 'dev.db');
  if (!fs.existsSync(sqliteDbPath)) {
    console.error(`❌ Error: SQLite database not found at ${sqliteDbPath}`);
    process.exit(1);
  }

  console.log('----------------------------------------------------');
  console.log('🚀 Starting IOCL Safe Database Migration (SQLite -> PostgreSQL)');
  console.log(`📁 Source SQLite: ${sqliteDbPath}`);
  console.log(`🐘 Target PostgreSQL: ${targetPgUrl.replace(/:[^:@]+@/, ':****@')}`);
  console.log('----------------------------------------------------');

  // Client 1: Local SQLite Reader
  const sqliteClient = new PrismaClient({
    datasources: {
      db: {
        url: `file:${sqliteDbPath}`,
      },
    },
  });

  // Client 2: Target PostgreSQL Writer
  const pgClient = new PrismaClient({
    datasources: {
      db: {
        url: targetPgUrl,
      },
    },
  });

  try {
    console.log('🔍 Connecting to databases...');

    // 1. Role
    const roles = await sqliteClient.role.findMany();
    console.log(`📋 Found ${roles.length} Roles in SQLite`);
    for (const item of roles) {
      await pgClient.role.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 2. User
    const users = await sqliteClient.user.findMany();
    console.log(`📋 Found ${users.length} Users in SQLite`);
    for (const item of users) {
      await pgClient.user.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 3. Staff
    const staff = await sqliteClient.staff.findMany();
    console.log(`📋 Found ${staff.length} Staff in SQLite`);
    for (const item of staff) {
      await pgClient.staff.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 4. Pump
    const pumps = await sqliteClient.pump.findMany();
    console.log(`📋 Found ${pumps.length} Pumps in SQLite`);
    for (const item of pumps) {
      await pgClient.pump.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 5. Gun
    const guns = await sqliteClient.gun.findMany();
    console.log(`📋 Found ${guns.length} Guns in SQLite`);
    for (const item of guns) {
      await pgClient.gun.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 6. ExpenseCategory
    const expenseCategories = await sqliteClient.expenseCategory.findMany();
    console.log(`📋 Found ${expenseCategories.length} Expense Categories in SQLite`);
    for (const item of expenseCategories) {
      await pgClient.expenseCategory.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 7. Customer
    const customers = await sqliteClient.customer.findMany();
    console.log(`📋 Found ${customers.length} Customers in SQLite`);
    for (const item of customers) {
      await pgClient.customer.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 8. OilProduct
    const oilProducts = await sqliteClient.oilProduct.findMany();
    console.log(`📋 Found ${oilProducts.length} Oil Products in SQLite`);
    for (const item of oilProducts) {
      await pgClient.oilProduct.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 9. EmailRecipient
    const emailRecipients = await sqliteClient.emailRecipient.findMany();
    console.log(`📋 Found ${emailRecipients.length} Email Recipients in SQLite`);
    for (const item of emailRecipients) {
      await pgClient.emailRecipient.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 10. DutySession
    const dutySessions = await sqliteClient.dutySession.findMany();
    console.log(`📋 Found ${dutySessions.length} Duty Sessions in SQLite`);
    for (const item of dutySessions) {
      await pgClient.dutySession.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 11. ShortageAssignment
    const shortageAssignments = await sqliteClient.shortageAssignment.findMany();
    console.log(`📋 Found ${shortageAssignments.length} Shortage Assignments in SQLite`);
    for (const item of shortageAssignments) {
      await pgClient.shortageAssignment.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 12. DutyAssignment
    const dutyAssignments = await sqliteClient.dutyAssignment.findMany();
    console.log(`📋 Found ${dutyAssignments.length} Duty Assignments in SQLite`);
    for (const item of dutyAssignments) {
      await pgClient.dutyAssignment.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 13. StaffAttendance
    const staffAttendances = await sqliteClient.staffAttendance.findMany();
    console.log(`📋 Found ${staffAttendances.length} Staff Attendance records in SQLite`);
    for (const item of staffAttendances) {
      await pgClient.staffAttendance.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 14. MeterReading
    const meterReadings = await sqliteClient.meterReading.findMany();
    console.log(`📋 Found ${meterReadings.length} Meter Readings in SQLite`);
    for (const item of meterReadings) {
      await pgClient.meterReading.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 15. MeterReadingInterval
    const intervals = await sqliteClient.meterReadingInterval.findMany();
    console.log(`📋 Found ${intervals.length} Meter Reading Intervals in SQLite`);
    for (const item of intervals) {
      await pgClient.meterReadingInterval.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 16. FuelPrice
    const fuelPrices = await sqliteClient.fuelPrice.findMany();
    console.log(`📋 Found ${fuelPrices.length} Fuel Prices in SQLite`);
    for (const item of fuelPrices) {
      await pgClient.fuelPrice.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 17. OilPriceHistory
    const oilPrices = await sqliteClient.oilPriceHistory.findMany();
    console.log(`📋 Found ${oilPrices.length} Oil Price History records in SQLite`);
    for (const item of oilPrices) {
      await pgClient.oilPriceHistory.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 18. OilPurchase
    const oilPurchases = await sqliteClient.oilPurchase.findMany();
    console.log(`📋 Found ${oilPurchases.length} Oil Purchases in SQLite`);
    for (const item of oilPurchases) {
      await pgClient.oilPurchase.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 19. OilPurchaseItem
    const oilPurchaseItems = await sqliteClient.oilPurchaseItem.findMany();
    console.log(`📋 Found ${oilPurchaseItems.length} Oil Purchase Items in SQLite`);
    for (const item of oilPurchaseItems) {
      await pgClient.oilPurchaseItem.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 20. OilSale
    const oilSales = await sqliteClient.oilSale.findMany();
    console.log(`📋 Found ${oilSales.length} Oil Sales in SQLite`);
    for (const item of oilSales) {
      await pgClient.oilSale.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 21. Expense
    const expenses = await sqliteClient.expense.findMany();
    console.log(`📋 Found ${expenses.length} Expenses in SQLite`);
    for (const item of expenses) {
      await pgClient.expense.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 22. CreditTransaction
    const creditTransactions = await sqliteClient.creditTransaction.findMany();
    console.log(`📋 Found ${creditTransactions.length} Credit Transactions in SQLite`);
    for (const item of creditTransactions) {
      await pgClient.creditTransaction.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 23. TankStock
    const tankStocks = await sqliteClient.tankStock.findMany();
    console.log(`📋 Found ${tankStocks.length} Tank Stock records in SQLite`);
    for (const item of tankStocks) {
      await pgClient.tankStock.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 24. TankReceipt
    const tankReceipts = await sqliteClient.tankReceipt.findMany();
    console.log(`📋 Found ${tankReceipts.length} Tank Receipts in SQLite`);
    for (const item of tankReceipts) {
      await pgClient.tankReceipt.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 25. TankDip
    const tankDips = await sqliteClient.tankDip.findMany();
    console.log(`📋 Found ${tankDips.length} Tank Dips in SQLite`);
    for (const item of tankDips) {
      await pgClient.tankDip.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 26. AuditLog
    const auditLogs = await sqliteClient.auditLog.findMany();
    console.log(`📋 Found ${auditLogs.length} Audit Logs in SQLite`);
    for (const item of auditLogs) {
      await pgClient.auditLog.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 27. TankSample
    const tankSamples = await sqliteClient.tankSample.findMany();
    console.log(`📋 Found ${tankSamples.length} Tank Samples in SQLite`);
    for (const item of tankSamples) {
      await pgClient.tankSample.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 28. DutyDensity
    const dutyDensities = await sqliteClient.dutyDensity.findMany();
    console.log(`📋 Found ${dutyDensities.length} Duty Density records in SQLite`);
    for (const item of dutyDensities) {
      await pgClient.dutyDensity.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 29. FuelReceipt
    const fuelReceipts = await sqliteClient.fuelReceipt.findMany();
    console.log(`📋 Found ${fuelReceipts.length} Fuel Receipts in SQLite`);
    for (const item of fuelReceipts) {
      await pgClient.fuelReceipt.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 30. FuelStockMovement
    const fuelMovements = await sqliteClient.fuelStockMovement.findMany();
    console.log(`📋 Found ${fuelMovements.length} Fuel Stock Movements in SQLite`);
    for (const item of fuelMovements) {
      await pgClient.fuelStockMovement.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 31. FuelInventory
    const fuelInventories = await sqliteClient.fuelInventory.findMany();
    console.log(`📋 Found ${fuelInventories.length} Fuel Inventory records in SQLite`);
    for (const item of fuelInventories) {
      await pgClient.fuelInventory.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 32. SampleBoxSale
    const sampleBoxSales = await sqliteClient.sampleBoxSale.findMany();
    console.log(`📋 Found ${sampleBoxSales.length} Sample Box Sales in SQLite`);
    for (const item of sampleBoxSales) {
      await pgClient.sampleBoxSale.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 33. SystemSetting
    const systemSettings = await sqliteClient.systemSetting.findMany();
    console.log(`📋 Found ${systemSettings.length} System Settings in SQLite`);
    for (const item of systemSettings) {
      await pgClient.systemSetting.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    // 34. EmailLog
    const emailLogs = await sqliteClient.emailLog.findMany();
    console.log(`📋 Found ${emailLogs.length} Email Logs in SQLite`);
    for (const item of emailLogs) {
      await pgClient.emailLog.upsert({
        where: { id: item.id },
        update: item,
        create: item,
      });
    }

    console.log('----------------------------------------------------');
    console.log('✅ ALL SQLite data migrated to PostgreSQL successfully!');
    console.log('----------------------------------------------------');
  } catch (error) {
    console.error('❌ Migration Error:', error);
    process.exit(1);
  } finally {
    await sqliteClient.$disconnect();
    await pgClient.$disconnect();
  }
}

runMigration();
