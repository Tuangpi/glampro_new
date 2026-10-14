/**
 * Pure helpers the demo seed and its dataset test share.
 *
 * No I/O, no Prisma, no clock: every function takes the instant it should treat
 * as "now" as an argument, which is what lets `seed-data.test.ts` assert the
 * dataset over several instants without waiting for real time to pass.
 *
 * Three jobs, all of them decisions the dataset implies but cannot execute:
 *
 * 1. **Time** — a dataset row's `dayOffset` + `time` is a local wall clock, and
 *    `offsetHours` / `offsetMinutes` are offsets from the seeding moment. Which
 *    one applies, and how either becomes an instant, is a rule; it lives here so
 *    the seed writes and the test asserts the same windows.
 * 2. **Money** — the seed rings its sales through the real `createSale`, which
 *    prices from the catalogue and replies with its own numbers. The dataset
 *    needs the totals it *expects* in order to build the remainder tender and to
 *    fail loudly when the server's arithmetic and the dataset's disagree;
 *    `demoSaleTotalCents` is that expectation, mirroring `priceLine`'s rule.
 * 3. **Clashes** — the calendar grid's rule (ADR 0014): the same performer's
 *    windows may not overlap, half-open, and a `CANCELLED` booking holds
 *    nothing. The seed writes appointments directly by fixed id, so it never
 *    passes through `assertNoClash`; the test is where the dataset proves it
 *    would have been refused nothing.
 */
import {
  DEMO_CUSTOMERS,
  DEMO_GIFT_CARDS,
  DEMO_PACKAGES,
  DEMO_PRODUCTS,
  DEMO_SERVICES,
  type SeedAppointment,
  type SeedSale,
  type SeedSaleLine,
  type SeedTender,
} from "./seed-data.js";

/**
 * Minutes a demo booking lasts when its service has no duration.
 *
 * The same fallback `appointment.service.ts` applies (`FALLBACK_DURATION_MINUTES`
 * there): `Service.durationMinutes` is nullable in the schema, and an invented
 * hour is at least visible as the default rather than a zero-length block.
 */
export const FALLBACK_DURATION_MINUTES = 60;

/**
 * `"HH:MM"` → minutes since local midnight.
 *
 * The dataset writes wall-clock times, and the seed turns them into instants
 * with local date components — so a malformed time is a broken dataset, not a
 * booking at midnight by accident.
 */
export function parseTimeOfDay(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) {
    throw new Error(`Expected a wall-clock time as HH:MM, got "${time}".`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Midnight of `now`'s local day, plus `dayOffset` days, plus `minutes`.
 *
 * Built from local components rather than `+24h`, so a day is a day in the
 * clock in front of the salon — DST shifts move the instant, not the wall time
 * the dataset promised. `time` omitted means midnight.
 */
function localWallClock(now: Date, dayOffset: number, time: string | undefined): Date {
  const minutes = time === undefined ? 0 : parseTimeOfDay(time);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, 0, minutes);
}

export interface TimeWindow {
  startsAt: Date;
  endsAt: Date;
}

/**
 * The window one demo booking occupies.
 *
 * `offsetHours` wins over `dayOffset` + `time` — the dataset documents that
 * precedence on the field, and it is what keeps "four hours ago" true whenever
 * the seed runs. The length is the service's own minutes, exactly as
 * `createAppointment` computes it (`docs/mvp.md` M2).
 */
export function appointmentWindow(
  appointment: SeedAppointment,
  durationMinutes: number,
  now: Date,
): TimeWindow {
  const startsAt =
    appointment.offsetHours !== undefined
      ? new Date(now.getTime() + appointment.offsetHours * 3_600_000)
      : localWallClock(now, appointment.dayOffset, appointment.time);

  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
  };
}

/**
 * The instant one demo sale was rung up at.
 *
 * `offsetMinutes` (today's sales, counted back from the seeding moment) wins
 * over `dayOffset` + `time`, exactly as `offsetHours` does for a booking: the
 * sale rung up "ten minutes ago" stays ten minutes ago whenever the seed runs,
 * while the older ones stay on the day the dataset names.
 */
export function saleMoment(sale: SeedSale, now: Date): Date {
  if (sale.offsetMinutes !== undefined) {
    return new Date(now.getTime() + sale.offsetMinutes * 60_000);
  }
  return localWallClock(now, sale.dayOffset, sale.time);
}

/**
 * A `Decimal(12,2)` money string → whole cents.
 *
 * Cent-safe on purpose: `"198.00"` through a float loses nothing here because
 * the split is by the decimal point, never through floating-point arithmetic.
 */
export function toCents(money: string): number {
  const [whole, fraction = ""] = money.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
}

/** Whole cents → the money string the server's reply carries, for error messages. */
export function centsToMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Is this demo customer a member? Legacy's rule, kept: a membership **reference**
 * on the row, and nothing more (`customers.member_id` is free text — there is no
 * tier table to join).
 */
export function demoIsMember(customerEmail: string): boolean {
  const customer = DEMO_CUSTOMERS.find((row) => row.email === customerEmail);
  if (!customer) {
    throw new Error(`No demo customer with email "${customerEmail}".`);
  }
  return customer.memberId !== undefined;
}

/**
 * The unit price of one demo line, in cents — the dataset-side mirror of
 * `sale.service.ts`'s `priceLine`.
 *
 * Deliberately a *check*, not the implementation: the server still prices every
 * line from the catalogue when the seed rings the sale up, and the seed throws
 * if its own total and the server's disagree. A one-sided change to the member
 * rule would otherwise reprice the demo silently.
 */
export function demoUnitPriceCents(
  kind: SeedSaleLine["kind"],
  name: string,
  isMember: boolean,
): number {
  switch (kind) {
    case "SERVICE": {
      const row = DEMO_SERVICES.find((service) => service.name === name);
      if (!row) throw new Error(`No demo service named "${name}".`);
      return toCents(isMember ? row.memberPrice : row.nonmemberPrice);
    }
    case "PRODUCT": {
      const row = DEMO_PRODUCTS.find((product) => product.name === name);
      if (!row) throw new Error(`No demo product named "${name}".`);
      return toCents(isMember ? row.memberPrice : row.nonmemberPrice);
    }
    case "PACKAGE": {
      const row = DEMO_PACKAGES.find((pack) => pack.name === name);
      if (!row) throw new Error(`No demo package named "${name}".`);
      return toCents(isMember ? row.memberPrice : row.nonmemberPrice);
    }
    case "GIFT_CARD": {
      const row = DEMO_GIFT_CARDS.find((card) => card.name === name);
      if (!row) throw new Error(`No demo gift card named "${name}".`);
      // One money column: the face value is both the price and the grant.
      return toCents(row.value);
    }
  }
}

/** What one demo sale's cart should cost, in cents, under the member rule above. */
export function demoSaleTotalCents(sale: SeedSale, isMember: boolean): number {
  return sale.lines.reduce(
    (sum, line) => sum + demoUnitPriceCents(line.kind, line.name, isMember) * line.quantity,
    0,
  );
}

/**
 * The amount each tender takes, in cents.
 *
 * A tender states its own amount or — exactly one, and it must be the last —
 * takes whatever the stated ones leave. Anything else is a dataset that would
 * over- or under-pay the receipt, so it throws rather than seeding a till whose
 * numbers do not add up.
 */
export function tenderAmountsCents(totalCents: number, tenders: readonly SeedTender[]): number[] {
  let assigned = 0;
  let remainderIndex = -1;

  const amounts = tenders.map((tender, index) => {
    if (tender.cents === undefined) {
      if (remainderIndex !== -1) {
        throw new Error("At most one tender may take the remainder.");
      }
      if (index !== tenders.length - 1) {
        throw new Error("Only the last tender may omit its amount.");
      }
      remainderIndex = index;
      return 0;
    }
    assigned += tender.cents;
    return tender.cents;
  });

  if (remainderIndex !== -1) {
    const remainder = totalCents - assigned;
    if (remainder < 0) {
      throw new Error(`Stated tenders add to ${centsToMoney(totalCents)}, more than the cart.`);
    }
    amounts[remainderIndex] = remainder;
  }

  return amounts;
}

/** One booking, as the clash rule judges it. */
export interface ClashWindow extends TimeWindow {
  id: string;
  staffEmail: string;
  status: SeedAppointment["status"];
}

/**
 * Throws when the same performer's occupying windows overlap (ADR 0014).
 *
 * Half-open, so back-to-back bookings touch without clashing — the same
 * comparison `assertNoClash` runs against the database, here run over the
 * dataset before a single row is written.
 */
export function assertNoAppointmentClash(windows: readonly ClashWindow[]): void {
  const occupying = windows.filter((window) => window.status !== "CANCELLED");

  for (let i = 0; i < occupying.length; i += 1) {
    for (let j = i + 1; j < occupying.length; j += 1) {
      const a = occupying[i] as ClashWindow;
      const b = occupying[j] as ClashWindow;
      if (a.staffEmail !== b.staffEmail) continue;
      if (a.startsAt < b.endsAt && a.endsAt > b.startsAt) {
        throw new Error(
          `Demo bookings clash: ${a.id} and ${b.id} overlap for ${a.staffEmail} ` +
            `(${a.startsAt.toISOString()}–${a.endsAt.toISOString()} vs ` +
            `${b.startsAt.toISOString()}–${b.endsAt.toISOString()}).`,
        );
      }
    }
  }
}
