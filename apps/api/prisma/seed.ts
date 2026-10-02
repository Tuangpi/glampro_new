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
import { CORE_MODULE_CODES, MODULE_CODES } from "@glampro/shared";

import { prisma } from "../src/lib/prisma.js";
import { runAsPlatform } from "../src/lib/tenant-context.js";

type SeedRole = "SUPER_ADMIN" | "MANAGER" | "STAFF" | "CASHIER";

/** Display names for the seeded module catalogue, keyed by `Module.code`. */
const MODULE_NAMES: Record<(typeof MODULE_CODES)[number], string> = {
  dashboard: "Dashboard",
  appointments: "Appointments",
  customers: "Customers",
  catalogue: "Catalogue",
  staff: "Staff",
  packages: "Packages",
  giftCards: "Gift cards",
  memberships: "Memberships",
  inventory: "Inventory",
  reports: "Reports",
  employeeCommission: "Employee commission",
  sales: "Sales",
  expenses: "Expenses",
  stock: "Stock",
};

const MODULE_CATEGORIES: Record<(typeof MODULE_CODES)[number], string> = {
  dashboard: "Core",
  appointments: "Core",
  customers: "Core",
  catalogue: "Core",
  staff: "Core",
  packages: "Add-on",
  giftCards: "Add-on",
  memberships: "Add-on",
  inventory: "Add-on",
  reports: "Add-on",
  employeeCommission: "Add-on",
  sales: "Core",
  expenses: "Add-on",
  stock: "Add-on",
};

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

/**
 * `CORE_MODULE_CODES` is a literal tuple, so its `includes` only accepts its own
 * members. Widening to `string` here is what lets any `ModuleCode` be tested
 * against it.
 */
function isCore(code: string): boolean {
  return (CORE_MODULE_CODES as readonly string[]).includes(code);
}

/**
 * The module catalogue is platform data, not tenant data, so it is seeded in both
 * modes and written with an unscoped client. `isCore` is derived from
 * `CORE_MODULE_CODES` so the two lists cannot disagree.
 */
async function seedModules(): Promise<void> {
  for (const [index, code] of MODULE_CODES.entries()) {
    await prisma.module.upsert({
      where: { code },
      update: {
        name: MODULE_NAMES[code],
        category: MODULE_CATEGORIES[code],
        isCore: isCore(code),
        sortOrder: index,
      },
      create: {
        code,
        name: MODULE_NAMES[code],
        category: MODULE_CATEGORIES[code],
        isCore: isCore(code),
        sortOrder: index,
      },
    });
  }

  const coreCount = MODULE_CODES.filter(isCore).length;
  console.log(`  ✔ ${MODULE_CODES.length} modules (${coreCount} core)`);
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

  await runAsPlatform(seedModules);

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
