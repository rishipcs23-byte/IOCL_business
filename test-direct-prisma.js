const { PrismaClient } = require('@prisma/client');

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_LTpckuJ2mV8r@ep-red-wave-aey0bzx6.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

const prisma = new PrismaClient({
  datasources: { db: { url: connectionString } },
});

async function main() {
  console.log('Testing direct PrismaClient connection...');
  const users = await prisma.user.findMany({ include: { role: true } });
  console.log('✓ Users found:', users.length);
  const staff = await prisma.staff.findMany();
  console.log('✓ Staff found:', staff.length);
  console.log('✓ Direct PrismaClient works 100% successfully!');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Direct PrismaClient failed:', err);
  prisma.$disconnect();
});
