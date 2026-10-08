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

import {
  DEMO_CUSTOMERS,
  DEMO_DEPARTMENTS,
  DEMO_GIFT_CARDS,
  DEMO_PACKAGES,
  DEMO_PRODUCTS,
  DEMO_SERVICES,
  DEMO_STAFF,
  DEMO_VALUE_PACKAGES,
  STAFF_DEPARTMENTS,
} from "./seed-data.js";

import { prisma } from "../src/lib/prisma.js";
import { runAsPlatform, runAsTenant } from "../src/lib/tenant-context.js";

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

/**
 * Creates the demo tenant that the seeded users belong to.
 *
 * `users.tenantId` points at `tenants` and `tenants.ownerUserId` points back at
 * `users`, so neither row can be inserted first. The tenant is created first with
 * no owner and claimed in the next statement, which is the only place in the
 * codebase that writes ownership in two steps.
 */
const DEMO_TENANT = {
  slug: "glampro-demo",
  name: "Glampro Demo Salon",
};

async function seedTenant(): Promise<string> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEMO_TENANT.slug },
    update: { name: DEMO_TENANT.name },
    create: { name: DEMO_TENANT.name, slug: DEMO_TENANT.slug },
  });

  console.log(`  ✔ tenant ${tenant.slug} (${tenant.id})`);
  return tenant.id;
}

async function upsertUser(user: SeedUser, tenantId: string): Promise<string> {
  const passwordHash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);

  const row = await prisma.user.upsert({
    where: { email: user.email },
    update: {
      name: user.name,
      passwordHash,
      globalRole: user.globalRole,
      tenantId,
      // Re-enable an account that was locked or disabled during testing.
      disabled: false,
      disabledAt: null,
    },
    create: {
      email: user.email,
      name: user.name,
      passwordHash,
      globalRole: user.globalRole,
      tenantId,
    },
  });

  console.log(`  ✔ ${user.globalRole.padEnd(11)} ${user.email}`);
  return row.id;
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

/**
 * Grants the demo salon the add-ons screen 08's last two tabs need.
 *
 * A `TenantModule` row is how entitlement is recorded, and **nothing creates one
 * yet** — the platform console does that, and it has no phase (see `docs/roadmap.md`
 * → Not scheduled yet). Seeding them keeps a fresh `db:reset` showing the Packages
 * and Gift cards tabs rather than a 403 that reads as "this feature is broken" when
 * the truth is "this salon has not bought it".
 *
 * Development only: `SEED_MODE=production` seeds the module catalogue and one
 * administrator, and grants nobody anything.
 */
async function seedEntitlements(tenantId: string): Promise<void> {
  for (const code of ["packages", "giftCards"] as const) {
    // `seedModules()` has already created the row; this upsert is here so the
    // function is correct on its own rather than depending on call order.
    const module = await prisma.module.upsert({
      where: { code },
      update: {},
      create: { code, name: MODULE_NAMES[code], category: "Add-on", isCore: false },
    });

    await prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId: module.id } },
      update: { expiresAt: null },
      create: { tenantId, moduleId: module.id },
    });
  }

  console.log("  ✔ entitlements — packages, giftCards (demo salon)");
}

/*
 * The demo catalogue and the demo customers — development only.
 *
 * Every function below is **idempotent**: a department is found by its natural
 * key (`@@unique([tenantId, name])`), a service, product, package, gift card or
 * value package by `(tenantId, name)` — none of those models has a unique
 * constraint on the name, so the seed looks one up rather than upserting — and a
 * customer by its per-tenant email (`@@unique([tenantId, email])`, ADR 0003).
 * `npm run db:seed` on an existing demo database therefore refreshes the demo
 * rather than duplicating it, which is what `seed-data.ts`'s header promises.
 *
 * Appointments and sales are **not** seeded yet: `DEMO_APPOINTMENTS` and
 * `DEMO_SALES` exist in `seed-data.ts`, but writing a sale means running the real
 * write (prices, ledgers, receipt number), which M3's dashboard slice does — so
 * the dashboard still reads zeros until then rather than inventing rows.
 */

/** The salon's branches, keyed by name for everything that refers to one. */
async function seedDepartments(tenantId: string): Promise<Map<string, string>> {
  const byName = new Map<string, string>();

  for (const name of DEMO_DEPARTMENTS) {
    const row = await prisma.department.upsert({
      where: { tenantId_name: { tenantId, name } },
      update: {},
      create: { tenantId, name },
      select: { id: true },
    });
    byName.set(name, row.id);
  }

  console.log(`  ✔ ${byName.size} department(s)`);
  return byName;
}

/**
 * Puts each performer in their branches.
 *
 * This is what the till's per-line picker and the booking flow filter on
 * ([ADR 0013](../docs/decisions/0013-appointment-performers-come-from-the-service.md)):
 * a service in Hair offers the staff who are in Hair. The owner and the cashier
 * are deliberately in none, so they can never be offered as a performer.
 */
async function seedStaffDepartments(
  tenantId: string,
  departments: Map<string, string>,
): Promise<void> {
  let links = 0;

  for (const [email, names] of Object.entries(STAFF_DEPARTMENTS)) {
    const user = await prisma.user.findFirst({
      where: { email, tenantId },
      select: { id: true },
    });
    // A production seed has no demo crew, and a renamed developer account simply
    // has nothing to link — neither is an error worth failing the seed over.
    if (!user) continue;

    for (const name of names) {
      const departmentId = departments.get(name);
      if (departmentId === undefined) continue;

      await prisma.staffDepartment.upsert({
        where: { userId_departmentId: { userId: user.id, departmentId } },
        update: {},
        create: { tenantId, userId: user.id, departmentId },
      });
      links += 1;
    }
  }

  console.log(`  ✔ ${links} staff↔department link(s)`);
}

/** The bookable services, keyed by name so the packages can link to them. */
async function seedServices(
  tenantId: string,
  departments: Map<string, string>,
): Promise<Map<string, string>> {
  const byName = new Map<string, string>();

  for (const service of DEMO_SERVICES) {
    const data = {
      tenantId,
      name: service.name,
      departmentId: departments.get(service.department) ?? null,
      status: "ACTIVE" as const,
      memberPrice: service.memberPrice,
      nonmemberPrice: service.nonmemberPrice,
      points: service.points,
      description: service.description,
      durationMinutes: service.durationMinutes,
    };

    const existing = await prisma.service.findFirst({
      where: { tenantId, name: service.name },
      select: { id: true },
    });
    const row = existing
      ? await prisma.service.update({ where: { id: existing.id }, data, select: { id: true } })
      : await prisma.service.create({ data, select: { id: true } });

    byName.set(service.name, row.id);
  }

  console.log(`  ✔ ${byName.size} service(s)`);
  return byName;
}

/** The retail shelf. Same natural key as a service, plus stock on hand. */
async function seedProducts(tenantId: string, departments: Map<string, string>): Promise<void> {
  for (const product of DEMO_PRODUCTS) {
    const data = {
      tenantId,
      name: product.name,
      departmentId: departments.get(product.department) ?? null,
      status: "ACTIVE" as const,
      memberPrice: product.memberPrice,
      nonmemberPrice: product.nonmemberPrice,
      quantity: product.quantity,
      points: product.points,
      description: product.description,
    };

    const existing = await prisma.product.findFirst({
      where: { tenantId, name: product.name },
      select: { id: true },
    });
    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data });
    } else {
      await prisma.product.create({ data });
    }
  }

  console.log(`  ✔ ${DEMO_PRODUCTS.length} product(s)`);
}

/**
 * The bundles, with the services each one covers.
 *
 * The links are **replaced** rather than merged, so editing the seed's own list
 * is what the database ends up holding — a service removed from a package in
 * `seed-data.ts` really is removed from it on the next seed.
 */
async function seedPackages(tenantId: string, services: Map<string, string>): Promise<void> {
  for (const pack of DEMO_PACKAGES) {
    const data = {
      tenantId,
      name: pack.name,
      status: "ACTIVE" as const,
      sessionCount: pack.sessionCount,
      memberPrice: pack.memberPrice,
      nonmemberPrice: pack.nonmemberPrice,
      description: pack.description,
    };

    const existing = await prisma.package.findFirst({
      where: { tenantId, name: pack.name },
      select: { id: true },
    });
    const row = existing
      ? await prisma.package.update({ where: { id: existing.id }, data, select: { id: true } })
      : await prisma.package.create({ data, select: { id: true } });

    await prisma.packageService.deleteMany({ where: { packageId: row.id } });
    const serviceIds = pack.services
      .map((name) => services.get(name))
      .filter((id): id is string => id !== undefined);
    if (serviceIds.length > 0) {
      await prisma.packageService.createMany({
        data: serviceIds.map((serviceId) => ({ tenantId, packageId: row.id, serviceId })),
      });
    }
  }

  console.log(`  ✔ ${DEMO_PACKAGES.length} package(s)`);
}

/** Prepaid credit: what the customer pays, and what they get to spend. */
async function seedValuePackages(tenantId: string, services: Map<string, string>): Promise<void> {
  for (const pack of DEMO_VALUE_PACKAGES) {
    const data = {
      tenantId,
      name: pack.name,
      status: "ACTIVE" as const,
      price: pack.price,
      credit: pack.credit,
      description: pack.description,
    };

    const existing = await prisma.valuePackage.findFirst({
      where: { tenantId, name: pack.name },
      select: { id: true },
    });
    const row = existing
      ? await prisma.valuePackage.update({ where: { id: existing.id }, data, select: { id: true } })
      : await prisma.valuePackage.create({ data, select: { id: true } });

    await prisma.valuePackageService.deleteMany({ where: { valuePackageId: row.id } });
    const serviceIds = pack.services
      .map((name) => services.get(name))
      .filter((id): id is string => id !== undefined);
    if (serviceIds.length > 0) {
      await prisma.valuePackageService.createMany({
        data: serviceIds.map((serviceId) => ({ tenantId, valuePackageId: row.id, serviceId })),
      });
    }
  }

  console.log(`  ✔ ${DEMO_VALUE_PACKAGES.length} value package(s)`);
}

/** The card templates the salon sells. `GiftCard` has no status column. */
async function seedGiftCards(tenantId: string): Promise<void> {
  for (const card of DEMO_GIFT_CARDS) {
    const data = {
      tenantId,
      name: card.name,
      value: card.value,
      remark: card.remark,
      // Null is "never expires", which is what a template means — the expiry a
      // sold card inherits is decided when one is issued.
      expiresAt: null,
    };

    const existing = await prisma.giftCard.findFirst({
      where: { tenantId, name: card.name },
      select: { id: true },
    });
    if (existing) {
      await prisma.giftCard.update({ where: { id: existing.id }, data });
    } else {
      await prisma.giftCard.create({ data });
    }
  }

  console.log(`  ✔ ${DEMO_GIFT_CARDS.length} gift card(s)`);
}

/**
 * The customer book, keyed by the per-tenant email ([ADR 0003]).
 *
 * `createdAt` is backdated from `createdDaysAgo` so a "new customers this week"
 * figure has something honest to count once reports are built (M3) — a salon
 * whose whole book was created in the same second reads as a bug.
 */
async function seedCustomers(tenantId: string): Promise<void> {
  const now = Date.now();

  for (const customer of DEMO_CUSTOMERS) {
    const data = {
      tenantId,
      name: customer.name,
      code: customer.code,
      memberId: customer.memberId ?? null,
      email: customer.email,
      phone: customer.phone,
      gender: customer.gender,
      createdAt: new Date(now - customer.createdDaysAgo * 24 * 60 * 60 * 1000),
    };

    await prisma.customer.upsert({
      where: { tenantId_email: { tenantId, email: customer.email } },
      update: data,
      create: data,
    });
  }

  console.log(`  ✔ ${DEMO_CUSTOMERS.length} customer(s)`);
}

async function main(): Promise<void> {
  const users = SEED_MODE === "production" ? [resolveAdmin()] : [resolveAdmin(), ...DEMO_USERS];

  if (SEED_MODE === "production" && !process.env.ADMIN_PASSWORD) {
    console.warn(
      "  ! ADMIN_PASSWORD was not set — the default development password was used. Change it immediately.",
    );
  }

  const tenantId = await seedTenant();

  for (const staff of DEMO_STAFF) {
    // A staff member *is* a `User` row — creating staff creates a login, which
    // is why every row carries a password here. The update branch deliberately
    // does **not** touch `passwordHash`: re-seeding refreshes the crew, not the
    // credentials a developer may have changed since.
    await prisma.user.upsert({
      where: { email: staff.email },
      update: {
        name: staff.name,
        globalRole: staff.globalRole,
        tenantId,
        disabled: false,
        disabledAt: null,
      },
      create: {
        email: staff.email,
        name: staff.name,
        passwordHash: await bcrypt.hash(staff.password, BCRYPT_ROUNDS),
        globalRole: staff.globalRole,
        tenantId,
      },
    });
  }

  console.log(`Seeding ${users.length} user(s) in ${SEED_MODE} mode…`);

  const ownerUserId = await upsertUser(users[0] as SeedUser, tenantId);

  // Claim ownership now that the owner exists. The administrator owns the tenant.
  await prisma.tenant.update({ where: { id: tenantId }, data: { ownerUserId } });

  for (const user of users.slice(1)) {
    await upsertUser(user, tenantId);
  }

  await runAsPlatform(seedModules);

  if (SEED_MODE === "development") {
    await runAsPlatform(() => seedEntitlements(tenantId));

    // The demo catalogue and the customer book. Development only, and idempotent
    // (see the block above `main`), so re-seeding refreshes the demo rather than
    // duplicating it. Run inside the tenant scope so the Prisma extension scopes
    // every write the same way a request would.
    await runAsTenant(tenantId, async () => {
      const departments = await seedDepartments(tenantId);
      await seedStaffDepartments(tenantId, departments);
      const services = await seedServices(tenantId, departments);
      await seedProducts(tenantId, departments);
      await seedPackages(tenantId, services);
      await seedValuePackages(tenantId, services);
      await seedGiftCards(tenantId);
      await seedCustomers(tenantId);
    });
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
