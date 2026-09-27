import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { loadConfig } from './config/config';
import { PrismaClient } from './generated/prisma/client';

/** Idempotent: creates the single admin from ADMIN_EMAIL/ADMIN_PASSWORD only if no admin exists yet. */
async function seed() {
  const config = loadConfig();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!email || password.length < config.PASSWORD_MIN_LENGTH) {
    throw new Error(`ADMIN_EMAIL and ADMIN_PASSWORD (min. ${config.PASSWORD_MIN_LENGTH} chars) are required`);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DATABASE_URL }) });
  try {
    if (await prisma.admin.count()) {
      console.log('Admin already exists; nothing to do.');
      return;
    }
    await prisma.admin.create({ data: { email, passwordHash: await argon2.hash(password) } });
    console.log(`Admin ${email} created.`);
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
