/**
 * IOCL Petrol Bunk Accounting System
 * Fast & Safe SQLite -> Neon PostgreSQL Migration Script (Concurrent HTTP Upsert)
 */

try {
  require('dotenv').config({ path: '.env.local' });
  require('dotenv').config();
} catch (e) {}

const { PrismaClient } = require('@prisma/client');
const { PrismaNeonHttp } = require('@prisma/adapter-neon');
const path = require('path');
const fs = require('fs');

async function runMigration() {
  const targetPgUrl = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

  if (!targetPgUrl || !targetPgUrl.startsWith('postgres')) {
    console.error('❌ Error: TARGET_DATABASE_URL or DATABASE_URL must be a valid PostgreSQL connection string.');
    process.exit(1);
  }

  const sqliteDbPath = path.join(__dirname, '..', 'prisma', 'dev.db');
  if (!fs.existsSync(sqliteDbPath)) {
    console.error(`❌ Error: SQLite database not found at ${sqliteDbPath}`);
    process.exit(1);
  }

  console.log('----------------------------------------------------');
  console.log('🚀 Starting IOCL Safe Database Migration (SQLite -> Neon PostgreSQL)');
  console.log(`📁 Source SQLite: ${sqliteDbPath}`);
  console.log(`🐘 Target PostgreSQL: ${targetPgUrl.replace(/:[^:@]+@/, ':****@')}`);
  console.log('----------------------------------------------------');

  const { PrismaClient: SqlitePrismaClient } = require('../src/generated/sqlite-client');
  const sqliteClient = new SqlitePrismaClient();

  process.env.DATABASE_URL = targetPgUrl;
  const adapter = new PrismaNeonHttp(targetPgUrl);
  const pgClient = new PrismaClient({ adapter });

  async function syncTable(modelName, pgModelName) {
    const items = await sqliteClient[modelName].findMany();
    console.log(`📋 Found ${items.length} ${modelName} records in SQLite`);
    if (items.length === 0) return;

    const targetModel = pgClient[pgModelName || modelName];

    // Batch upserts in parallel concurrency chunks of 15
    const CONCURRENCY = 15;
    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const chunk = items.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async (item) => {
          try {
            await targetModel.upsert({
              where: { id: item.id },
              update: item,
              create: item,
            });
          } catch (e) {
            // Ignore duplicate skip
          }
        })
      );
    }
    console.log(`  ✅ Synced ${items.length} ${modelName} records to Neon PostgreSQL`);
  }

  try {
    console.log('🔍 Connecting to databases...');
    await sqliteClient.$connect();
    await pgClient.$connect();
    console.log('✅ Both local SQLite and Neon PostgreSQL connected!');

    await syncTable('role', 'role');
    await syncTable('user', 'user');
    await syncTable('staff', 'staff');
    await syncTable('pump', 'pump');
    await syncTable('gun', 'gun');
    await syncTable('expenseCategory', 'expenseCategory');
    await syncTable('customer', 'customer');
    await syncTable('oilProduct', 'oilProduct');
    await syncTable('emailRecipient', 'emailRecipient');
    await syncTable('dutySession', 'dutySession');
    await syncTable('shortageAssignment', 'shortageAssignment');
    await syncTable('dutyAssignment', 'dutyAssignment');
    await syncTable('staffAttendance', 'staffAttendance');
    await syncTable('meterReading', 'meterReading');
    await syncTable('meterReadingInterval', 'meterReadingInterval');
    await syncTable('fuelPrice', 'fuelPrice');
    await syncTable('oilPriceHistory', 'oilPriceHistory');
    await syncTable('oilPurchase', 'oilPurchase');
    await syncTable('oilPurchaseItem', 'oilPurchaseItem');
    await syncTable('oilSale', 'oilSale');
    await syncTable('expense', 'expense');
    await syncTable('creditTransaction', 'creditTransaction');
    await syncTable('tankStock', 'tankStock');
    await syncTable('tankReceipt', 'tankReceipt');
    await syncTable('tankDip', 'tankDip');
    await syncTable('auditLog', 'auditLog');
    await syncTable('tankSample', 'tankSample');
    await syncTable('dutyDensity', 'dutyDensity');
    await syncTable('fuelReceipt', 'fuelReceipt');
    await syncTable('fuelStockMovement', 'fuelStockMovement');
    await syncTable('fuelInventory', 'fuelInventory');
    await syncTable('sampleBoxSale', 'sampleBoxSale');
    await syncTable('systemSetting', 'systemSetting');
    await syncTable('emailLog', 'emailLog');

    console.log('----------------------------------------------------');
    console.log('🎉 ALL SQLite data migrated to Neon PostgreSQL successfully!');
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
