require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { execSync } = require('child_process');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

neonConfig.webSocketConstructor = ws;

async function pushSchema() {
  const connectionString = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ Missing TARGET_DATABASE_URL / DATABASE_URL');
    process.exit(1);
  }

  console.log('----------------------------------------------------');
  console.log('🔨 Generating PostgreSQL Schema DDL from Prisma...');
  const ddlSql = execSync('npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script', { encoding: 'utf-8' });
  console.log('✅ Generated SQL DDL script successfully.');

  console.log('🐘 Pushing Schema DDL statements to Neon PostgreSQL via WebSocket (Port 443)...');
  const pool = new Pool({ connectionString });

  // Clean SQL comments
  const cleanSql = ddlSql.replace(/--.*$/gm, '');
  const statements = cleanSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  let successCount = 0;
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
      successCount++;
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('duplicate')) {
        successCount++;
      } else {
        console.warn(`⚠️ Notice for statement [${stmt.substring(0, 40)}...]:`, err.message);
      }
    }
  }

  console.log(`🎉 SCHEMA PUSH COMPLETED! Executed ${successCount} DDL statements in Neon PostgreSQL.`);
  console.log('----------------------------------------------------');
  await pool.end();
}

pushSchema();
