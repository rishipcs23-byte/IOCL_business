require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
neonConfig.webSocketConstructor = ws;

async function testNeonServerless() {
  const connectionString = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;
  console.log('Testing Neon Serverless WebSocket over port 443...');
  console.log('URL:', connectionString.replace(/:[^:@]+@/, ':****@'));

  const pool = new Pool({ connectionString });
  
  try {
    const res = await pool.query('SELECT 1 as connected, NOW() as server_time;');
    console.log('✅ NEON SERVERLESS CONNECTED SUCCESSFULLY OVER PORT 443!');
    console.log('Query Result:', res.rows);
  } catch (err) {
    console.error('❌ Neon Serverless Error:', err);
  } finally {
    await pool.end();
  }
}

testNeonServerless();
