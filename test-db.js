const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function test() {
  const users = await db.user.findMany({ include: { role: true } });
  console.log('=== USERS ===');
  users.forEach(u => console.log(` - ${u.username} [${u.role.name}]`));

  const staff = await db.staff.findMany();
  console.log('\n=== STAFF ===');
  staff.forEach(s => console.log(` - ${s.name} (active: ${s.active})`));

  const guns = await db.gun.findMany({ include: { pump: true } });
  console.log('\n=== GUNS ===');
  guns.forEach(g => console.log(` - ${g.name} [${g.fuelType}] on ${g.pump.name}`));

  const duties = await db.dutySession.findMany({ orderBy: { dutyNumber: 'desc' }, take: 3 });
  console.log('\n=== RECENT DUTIES ===');
  duties.forEach(d => console.log(` - Duty #${d.dutyNumber} [${d.status}]`));

  const prices = await db.fuelPrice.findMany({ orderBy: { effectiveFrom: 'desc' }, take: 4 });
  console.log('\n=== FUEL PRICES ===');
  prices.forEach(p => console.log(` - ${p.fuelType}: Rs.${p.price} (from ${p.effectiveFrom})`));

  await db.$disconnect();
  console.log('\n✓ Database verification complete.');
}

test().catch(e => { console.error(e); db.$disconnect(); });
