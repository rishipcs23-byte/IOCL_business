import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_LTpckuJ2mV8r@ep-red-wave-aey0bzx6.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';

export const db =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: connectionString,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['error'] : [],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;


