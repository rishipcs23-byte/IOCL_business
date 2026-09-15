/**
 * IOCL Petrol Bunk Accounting System
 * Database Migration Audit & Verification Script (PrismaNeonHttp)
 */

try {
  require('dotenv').config({ path: '.env.local' });
  require('dotenv').config();
} catch (e) {}

const { PrismaClient } = require('@prisma/client');
const { PrismaNeonHttp } = require('@prisma/adapter-neon');
const path = require('path');

async function runVerification() {
  const targetPgUrl = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

  if (!targetPgUrl || !targetPgUrl.startsWith('postgres')) {
    console.error('❌ Error: Please specify TARGET_DATABASE_URL or DATABASE_URL with a valid PostgreSQL string.');
    process.exit(1);
  }

  const { PrismaClient: SqlitePrismaClient } = require('../src/generated/sqlite-client');
  const sqliteClient = new SqlitePrismaClient();

  process.env.DATABASE_URL = targetPgUrl;
  const adapter = new PrismaNeonHttp(targetPgUrl);
  const pgClient = new PrismaClient({ adapter });

  try {
    console.log('----------------------------------------------------');
    console.log('📊 AUDITING REPLICATION: SQLite vs Neon PostgreSQL');
    console.log('----------------------------------------------------');

    const models = [
      'user', 'role', 'staff', 'pump', 'gun',
      'dutySession', 'dutyAssignment', 'staffAttendance',
      'meterReading', 'meterReadingInterval', 'fuelPrice',
      'oilProduct', 'oilPurchase', 'oilSale',
      'expenseCategory', 'expense', 'customer', 'creditTransaction',
      'tankDip', 'tankStock', 'tankReceipt', 'fuelReceipt', 'fuelStockMovement',
      'auditLog', 'systemSetting', 'emailLog', 'emailRecipient'
    ];

    let allMatched = true;

    for (const model of models) {
      const sqliteCount = await sqliteClient[model].count();
      const pgCount = await pgClient[model].count();
      const match = sqliteCount === pgCount;

      if (!match) allMatched = false;

      console.log(
        `${match ? '✅' : '❌'} Model: ${model.padEnd(20)} | SQLite: ${String(sqliteCount).padStart(5)} | Neon PostgreSQL: ${String(pgCount).padStart(5)}`
      );
    }

    console.log('----------------------------------------------------');
    if (allMatched) {
      console.log('🎉 AUDIT PASSED 100%: Every table & record count matches perfectly!');
    } else {
      console.log('⚠️ AUDIT WARNING: Record count mismatch detected in some models. Review logs above.');
    }
    console.log('----------------------------------------------------');
  } catch (err) {
    console.error('❌ Verification Error:', err);
  } finally {
    await sqliteClient.$disconnect();
    await pgClient.$disconnect();
  }
}

runVerification();
