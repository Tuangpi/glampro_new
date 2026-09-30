/**
 * Development / bootstrap seed.
 *
 * `SEED_MODE=development` (default) creates a demo salon crew.
 * `SEED_MODE=production` creates exactly one administrator from
 * `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` and touches nothing else.
 *
 * Run with `npm run db:seed` (from `apps/api`).
 */
import "dotenv/config";

import bcrypt from "bcrypt";

import { prisma } from "../src/lib/prisma.js";

type SeedRole = "SUPER_ADMIN" | "MANAGER" | "STAFF" | "CASHIER";

interface SeedUser {
  email: string;
  name: string;
  password: string;
  globalRole: SeedRole;
}

const SEED_MODE = process.env.SEED_MODE === "production" ? "production" : "development";
const BCRYPT_ROUNDS = 10;

const DEMO_USERS: SeedUser[] = [
  {
    email: "manager@glampro.test",
    name: "Maya Manager",
    password: "Manager123!",
    globalRole: "MANAGER",
  },
  {
    email: "stylist@glampro.test",
    name: "Rita Stylist",
    password: "Staff123!",
    globalRole: "STAFF",
  },
  {
    email: "cashier@glampro.test",
    name: "Nora Cashier",
    password: "Cashier123!",
    globalRole: "CASHIER",
  },
];

function resolveAdmin(): SeedUser {
  return {
    email: process.env.ADMIN_EMAIL ?? "admin@glampro.test",
    name: process.env.ADMIN_NAME ?? "Glampro Administrator",
    password: process.env.ADMIN_PASSWORD ?? "ChangeMe123!",
    globalRole: "SUPER_ADMIN",
  };
}

async function upsertUser(user: SeedUser): Promise<void> {
  const passwordHash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);

  await prisma.user.upsert({
    where: { email: user.email },
    update: {
      name: user.name,
      passwordHash,
      globalRole: user.globalRole,
      // Re-enable an account that was locked or disabled during testing.
      disabled: false,
      disabledAt: null,
    },
    create: {
      email: user.email,
      name: user.name,
      passwordHash,
      globalRole: user.globalRole,
    },
  });

  console.log(`  ✔ ${user.globalRole.padEnd(11)} ${user.email}`);
}

async function main(): Promise<void> {
  const users = SEED_MODE === "production" ? [resolveAdmin()] : [resolveAdmin(), ...DEMO_USERS];

  if (SEED_MODE === "production" && !process.env.ADMIN_PASSWORD) {
    console.warn(
      "  ! ADMIN_PASSWORD was not set — the default development password was used. Change it immediately.",
    );
  }

  console.log(`Seeding ${users.length} user(s) in ${SEED_MODE} mode…`);

  for (const user of users) {
    await upsertUser(user);
  }

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
