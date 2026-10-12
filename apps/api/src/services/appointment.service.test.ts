/**
 * The appointment service's clash rule, against the real database (ADR 0014).
 *
 * The rule is "one person cannot be in two places at once", and the interesting
 * part of it is not the obvious overlap — it is the edges around it: two windows
 * that merely touch, a cancelled booking that freed its slot, a no-show that did
 * not, an unassigned booking with nobody to clash with, a patch that changes
 * nothing, and another tenant's stylist whose identical time must not block this
 * one. Each is a case where a naive
 * `where: { staffId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }`
 * either over- or under-refuses, so each is asserted against the real store.
 *
 * Skipped with a clear message when `DATABASE_URL` is absent, so `npm run verify`
 * still passes on a machine with no database running — the same rule every other
 * service suite here follows.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { runAsPlatform, runAsTenant } from "../lib/tenant-context.js";
import { createAppointment, updateAppointment } from "./appointment.service.js";

const databaseUrl = process.env["DATABASE_URL"];

const TENANT_A = "appointment-clash-a";
const TENANT_B = "appointment-clash-b";

/** A fixed Wednesday, so no assertion depends on which day the suite runs. */
const DAY = new Date("2026-10-14T00:00:00.000Z");

/** An instant on that day at `hour`:`minute`, which every block below starts on. */
function at(hour: number, minute = 0): Date {
  return new Date(DAY.getTime() + (hour * 60 + minute) * 60_000);
}

interface Seeded {
  serviceId: string;
  customerId: string;
  /** `Kana` — the stylist the suite books, in the branch, so ADR 0013 never refuses her. */
  kanaId: string;
  /** `Ryo` — holds the 14:00 slot the "moved onto another performer" case takes. */
  ryoId: string;
  /** The id of Ryo's seeded booking, so the "within its own window" case can target it. */
  ryoSlotId: string;
  /** `Fenn` — tenant B's stylist, whose 08:00 must not block Kana's 08:00. */
  foreignStaffId: string;
  /** Tenant B's own service, so a foreign booking has a service to hang on. */
  foreignServiceId: string;
}

let seeded: Seeded | undefined;

/** A tenant-A stylist's id, read unscoped. */
function staffIdOf(email: string): Promise<string> {
  return runAsPlatform(() =>
    prisma.user
      .findFirstOrThrow({ where: { email }, select: { id: true } })
      .then((user) => user.id),
  );
}

async function purge(): Promise<void> {
  await runAsPlatform(async () => {
    const ids = [TENANT_A, TENANT_B];
    await prisma.appointment.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.service.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.staffDepartment.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.department.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { email: { contains: "@appointment-clash.test" } } });
  });
}

/** A branch per tenant, and a 45-minute service hanging off A's branch. */
async function seed(): Promise<void> {
  await purge();

  await runAsPlatform(async () => {
    await prisma.tenant.create({
      data: { id: TENANT_A, name: `Salon ${TENANT_A}`, slug: TENANT_A },
    });
    await prisma.tenant.create({
      data: { id: TENANT_B, name: `Salon ${TENANT_B}`, slug: TENANT_B },
    });

    for (const id of [TENANT_A, TENANT_B]) {
      const owner = await prisma.user.create({
        data: {
          tenantId: id,
          email: `owner-${id}@appointment-clash.test`,
          name: `Owner ${id}`,
          passwordHash: "not-a-real-hash",
        },
      });
      await prisma.tenant.update({ where: { id }, data: { ownerUserId: owner.id } });
    }

    const branch = await prisma.department.create({ data: { tenantId: TENANT_A, name: "Hair" } });

    for (const [name, email] of [
      ["Kana Kelsey", "kana@appointment-clash.test"],
      ["Ryo Rivas", "ryo@appointment-clash.test"],
    ] as const) {
      const staff = await prisma.user.create({
        data: { tenantId: TENANT_A, email, name, passwordHash: "not-a-real-hash" },
      });
      await prisma.staffDepartment.create({
        data: { tenantId: TENANT_A, userId: staff.id, departmentId: branch.id },
      });
    }

    const service = await prisma.service.create({
      data: {
        tenantId: TENANT_A,
        departmentId: branch.id,
        name: "Cut and finish",
        memberPrice: "35.00",
        nonmemberPrice: "40.00",
        durationMinutes: 45,
      },
    });

    const customer = await prisma.customer.create({
      data: { tenantId: TENANT_A, name: "Casey Client" },
    });

    // Ryo holds the afternoon slot the "moved onto another performer" case
    // tries to take, so the merge is what is being judged rather than the read.
    const ryoId = await staffIdOf("ryo@appointment-clash.test");
    const kanaId = await staffIdOf("kana@appointment-clash.test");
    const ryoSlot = await prisma.appointment.create({
      data: {
        tenantId: TENANT_A,
        staffId: ryoId,
        serviceId: service.id,
        startsAt: at(14),
        endsAt: at(14, 45),
        durationMinutes: 45,
      },
      select: { id: true },
    });

    // The other salon's stylist, booked at the very instant Kana takes — the
    // identical time that must not block her.
    const foreignBranch = await prisma.department.create({
      data: { tenantId: TENANT_B, name: "Hair" },
    });
    const foreignService = await prisma.service.create({
      data: {
        tenantId: TENANT_B,
        departmentId: foreignBranch.id,
        name: "Cut and finish",
        memberPrice: "35.00",
        nonmemberPrice: "40.00",
        durationMinutes: 45,
      },
    });
    const foreignStaff = await prisma.user.create({
      data: {
        tenantId: TENANT_B,
        email: "foreign@appointment-clash.test",
        name: "Fenn Foreign",
        passwordHash: "not-a-real-hash",
      },
    });
    await prisma.staffDepartment.create({
      data: { tenantId: TENANT_B, userId: foreignStaff.id, departmentId: foreignBranch.id },
    });
    await prisma.appointment.create({
      data: {
        tenantId: TENANT_B,
        staffId: foreignStaff.id,
        serviceId: foreignService.id,
        startsAt: at(9),
        endsAt: at(9, 45),
        durationMinutes: 45,
      },
    });

    seeded = {
      serviceId: service.id,
      customerId: customer.id,
      kanaId,
      ryoId,
      ryoSlotId: ryoSlot.id,
      foreignStaffId: foreignStaff.id,
      foreignServiceId: foreignService.id,
    };
  });
}

/** The suite's shared seed, or a loud failure rather than a silent `undefined`. */
function requireSeeded(): Seeded {
  if (!seeded) throw new Error("the suite's `before(seed)` did not run");
  return seeded;
}

describe(
  "appointment.service's clash rule, against the database",
  { skip: databaseUrl ? false : "DATABASE_URL is not set" },
  () => {
    before(seed);
    after(purge);

    /** Every write below runs inside tenant A's scope, as a real handler would. */
    function asTenantA<T>(fn: () => Promise<T>): Promise<T> {
      return runAsTenant(TENANT_A, fn);
    }

    /** Reads a row unscoped, so a refused write can be proved to have written nothing. */
    function readUnscoped(id: string) {
      return runAsPlatform(() =>
        prisma.appointment.findUniqueOrThrow({
          where: { id },
          select: { id: true, staffId: true, startsAt: true, endsAt: true },
        }),
      );
    }

    it("refuses a booking that overlaps the same stylist, naming the clash", async () => {
      const s = requireSeeded();

      // Kana's 09:00 is free in tenant A — Fenn's identical window belongs to
      // tenant B — so the blocker this case judges is booked right here.
      await asTenantA(() =>
        createAppointment({
          staffId: s.kanaId,
          serviceId: s.serviceId,
          startsAt: at(9).toISOString(),
        }),
      );

      await assert.rejects(
        asTenantA(() =>
          createAppointment({
            customerId: s.customerId,
            staffId: s.kanaId,
            serviceId: s.serviceId,
            // 09:30 is inside the block just made, not merely touching it.
            startsAt: at(9, 30).toISOString(),
          }),
        ),
        (error: unknown) => {
          assert.ok(error instanceof HttpError, "expected an HttpError");
          assert.equal(error.statusCode, 409);
          assert.equal(error.code, "APPOINTMENT_CLASH");
          assert.match(error.message, /already taken/i);
          return true;
        },
      );
    });

    it("allows back-to-back edges, because a 45-minute day is contiguous", async () => {
      const s = requireSeeded();

      // 09:45 is the instant Kana's first block ends, not an overlap of it.
      const created = await asTenantA(() =>
        createAppointment({
          staffId: s.kanaId,
          serviceId: s.serviceId,
          startsAt: at(9, 45).toISOString(),
        }),
      );

      assert.equal(created.startsAt, at(9, 45).toISOString());
      assert.equal(created.endsAt, at(10, 30).toISOString());
    });

    it("refuses moving a booking onto another stylist who is already taken", async () => {
      const s = requireSeeded();

      // Drag Ryo's 14:00 block onto Kana's busy morning: the performer changed
      // as well as the time, and the merge is what the rule has to judge.
      await assert.rejects(
        asTenantA(() =>
          updateAppointment(s.ryoSlotId, { staffId: s.kanaId, startsAt: at(9).toISOString() }),
        ),
        (error: unknown) => {
          assert.ok(error instanceof HttpError);
          assert.equal(error.statusCode, 409);
          assert.equal(error.code, "APPOINTMENT_CLASH");
          return true;
        },
      );

      const untouched = await readUnscoped(s.ryoSlotId);
      assert.equal(untouched.staffId, s.ryoId, "the refused move wrote nothing");
      assert.equal(untouched.startsAt.toISOString(), at(14).toISOString());
    });

    it("refuses moving a booking onto a slot its own stylist already holds", async () => {
      const s = requireSeeded();

      // Ryo's own late slot. The performer does not change in this move — only
      // the time does — so what is judged is Ryo clashing with Ryo, and the
      // self-exclusion in `assertNoClash` must not be loose enough to hide it.
      await asTenantA(() =>
        createAppointment({
          staffId: s.ryoId,
          serviceId: s.serviceId,
          startsAt: at(16).toISOString(),
        }),
      );

      await assert.rejects(
        asTenantA(() => updateAppointment(s.ryoSlotId, { startsAt: at(16).toISOString() })),
        (error: unknown) => {
          assert.ok(error instanceof HttpError);
          assert.equal(error.statusCode, 409);
          assert.equal(error.code, "APPOINTMENT_CLASH");
          return true;
        },
      );

      const untouched = await readUnscoped(s.ryoSlotId);
      assert.equal(untouched.startsAt.toISOString(), at(14).toISOString());
    });

    it("lets a cancelled blocker free its slot", async () => {
      const s = requireSeeded();

      const blocker = await asTenantA(() =>
        createAppointment({
          staffId: s.kanaId,
          serviceId: s.serviceId,
          startsAt: at(11).toISOString(),
        }),
      );
      await asTenantA(() => updateAppointment(blocker.id, { status: "CANCELLED" }));

      const created = await asTenantA(() =>
        createAppointment({
          customerId: s.customerId,
          staffId: s.kanaId,
          serviceId: s.serviceId,
          startsAt: at(11).toISOString(),
        }),
      );

      assert.equal(created.startsAt, at(11).toISOString());
    });

    it("keeps a no-show occupying its slot, because the time was still held", async () => {
      const s = requireSeeded();

      const blocker = await asTenantA(() =>
        createAppointment({
          staffId: s.kanaId,
          serviceId: s.serviceId,
          startsAt: at(13).toISOString(),
        }),
      );
      await asTenantA(() => updateAppointment(blocker.id, { status: "NO_SHOW" }));

      await assert.rejects(
        asTenantA(() =>
          createAppointment({
            staffId: s.kanaId,
            serviceId: s.serviceId,
            startsAt: at(13).toISOString(),
          }),
        ),
        (error: unknown) => {
          assert.ok(error instanceof HttpError);
          assert.equal(error.code, "APPOINTMENT_CLASH");
          return true;
        },
      );
    });

    it("never checks an unassigned booking, because nobody named is nobody double-booked", async () => {
      const s = requireSeeded();

      const walkIn = await asTenantA(() =>
        createAppointment({
          customerId: s.customerId,
          serviceId: s.serviceId,
          startsAt: at(16).toISOString(),
        }),
      );
      assert.equal(walkIn.staffId, null);

      // A second booking at the very same instant, still unassigned, is fine.
      const second = await asTenantA(() =>
        createAppointment({
          serviceId: s.serviceId,
          startsAt: at(16).toISOString(),
        }),
      );
      assert.equal(second.startsAt, walkIn.startsAt);
    });

    it("treats a reschedule within the booking's own window as a no-op", async () => {
      const s = requireSeeded();

      const moved = await asTenantA(() =>
        updateAppointment(s.ryoSlotId, { startsAt: at(14).toISOString() }),
      );

      assert.equal(moved.startsAt, at(14).toISOString());
      assert.equal(moved.endsAt, at(14, 45).toISOString());
    });

    it("does not let another tenant's stylist block this one", async () => {
      const s = requireSeeded();

      // Fenn holds 09:00–09:45 in tenant B. Tenant A's Kana takes the identical
      // window, and the assertion is that the other salon's booking is invisible
      // to her — the scope, not the clock, is what decides.
      const created = await asTenantA(() =>
        createAppointment({
          staffId: s.kanaId,
          serviceId: s.serviceId,
          startsAt: at(20).toISOString(),
        }),
      );

      assert.equal(created.staffId, s.kanaId);
      assert.equal(created.startsAt, at(20).toISOString());
    });

    it("moves a booking freely when nothing occupies the target", async () => {
      const s = requireSeeded();

      const moved = await asTenantA(() =>
        updateAppointment(s.ryoSlotId, { staffId: s.kanaId, startsAt: at(21).toISOString() }),
      );

      assert.equal(moved.staffId, s.kanaId);
      assert.equal(moved.startsAt, at(21).toISOString());
      assert.equal(moved.endsAt, at(21, 45).toISOString(), "the slot resizes from the service");
    });
  },
);
