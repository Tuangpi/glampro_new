/**
 * Salon-local time conversions, host-timezone independent.
 *
 * `Intl.DateTimeFormat(timeZone)` is ICU-backed, so these assertions hold no
 * matter what timezone the test process itself runs in (Los Angeles, Auckland,
 * Singapore, …). A round-trip through `toSalonDate` then `instantFromSalonDate`
 * must land back on the same instant.
 */

import { describe, expect, it } from "vitest";

import {
  instantFromSalonDate,
  salonAddDays,
  salonDayKey,
  salonEndOfDay,
  salonIsSameDay,
  salonMinutesIntoDay,
  salonStartOfDay,
  salonWallClock,
  toSalonDate,
} from "./salon-time";

const SINGAPORE = "Asia/Singapore";
const LOS_ANGELES = "America/Los_Angeles";
const AUCKLAND = "Pacific/Auckland";

// 2026-10-09T01:00:00Z is 09:00 on 9 October in Singapore (UTC+8),
// 18:00 on 8 October in Los Angeles (UTC-7), 14:00 on 9 October in Auckland (UTC+13).
const INSTANT = new Date("2026-10-09T01:00:00.000Z");

describe("salonWallClock", () => {
  it("reads the salon wall clock of an instant regardless of host timezone", () => {
    expect(salonWallClock(INSTANT, SINGAPORE)).toEqual({
      year: 2026,
      month: 10,
      day: 9,
      hour: 9,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    expect(salonWallClock(INSTANT, LOS_ANGELES)).toEqual({
      year: 2026,
      month: 10,
      day: 8,
      hour: 18,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    expect(salonWallClock(INSTANT, AUCKLAND)).toEqual({
      year: 2026,
      month: 10,
      day: 9,
      hour: 14,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
  });

  it("returns null for an invalid instant", () => {
    expect(salonWallClock(new Date("not-a-date"), SINGAPORE)).toBeNull();
  });
});

describe("toSalonDate / instantFromSalonDate round-trip", () => {
  it("round-trips an instant through its salon wall clock", () => {
    const salon = toSalonDate(INSTANT, SINGAPORE);
    expect(salon).not.toBeNull();
    // Host-local getters read Singapore wall clock: 9 October, 09:00.
    expect(salon!.getFullYear()).toBe(2026);
    expect(salon!.getMonth()).toBe(9);
    expect(salon!.getDate()).toBe(9);
    expect(salon!.getHours()).toBe(9);
    expect(salon!.getMinutes()).toBe(0);

    expect(instantFromSalonDate(salon!, SINGAPORE).getTime()).toBe(INSTANT.getTime());
  });

  it("round-trips a DST-affected instant (Los Angeles spring forward)", () => {
    // 2026-03-08T08:30:00Z is 00:30 PST on 8 March (LA springs forward at 10:00Z that day).
    const instant = new Date("2026-03-08T08:30:00.000Z");
    const salon = toSalonDate(instant, LOS_ANGELES);
    expect(salon!.getHours()).toBe(0);
    expect(salon!.getMinutes()).toBe(30);
    expect(salon!.getDate()).toBe(8);
    expect(instantFromSalonDate(salon!, LOS_ANGELES).getTime()).toBe(instant.getTime());
  });
});

describe("salonDayKey", () => {
  it("is the salon-local calendar date, not the UTC date", () => {
    expect(salonDayKey(INSTANT, SINGAPORE)).toBe("2026-10-09");
    expect(salonDayKey(INSTANT, LOS_ANGELES)).toBe("2026-10-08");
    expect(salonDayKey(new Date("not-a-date"), SINGAPORE)).toBeNull();
  });
});

describe("salonMinutesIntoDay", () => {
  it("is minutes into the salon-local day", () => {
    expect(salonMinutesIntoDay(INSTANT, SINGAPORE)).toBe(9 * 60);
    expect(salonMinutesIntoDay(INSTANT, LOS_ANGELES)).toBe(18 * 60);
    expect(salonMinutesIntoDay(new Date("not-a-date"), SINGAPORE)).toBeNull();
  });
});

describe("salonStartOfDay / salonEndOfDay", () => {
  it("are salon-local day boundaries as salon-local dates", () => {
    const start = salonStartOfDay(INSTANT, SINGAPORE)!;
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(9);
    expect(start.getDate()).toBe(9);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);

    const end = salonEndOfDay(INSTANT, SINGAPORE)!;
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });
});

describe("salonAddDays", () => {
  it("walks calendar days in salon-local time, DST-safe", () => {
    const start = new Date(2026, 9, 31); // salon-local 31 October
    const next = salonAddDays(start, 1);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(10);
    expect(next.getDate()).toBe(1);
  });
});

describe("salonIsSameDay", () => {
  const oct9MorningSG = new Date("2026-10-09T01:00:00.000Z"); // 09:00 on 9 Oct in Singapore
  const oct9EveningSG = new Date("2026-10-09T10:00:00.000Z"); // 18:00 on 9 Oct in Singapore

  it("compares salon-local days", () => {
    // Both are 9 October in Singapore.
    expect(salonIsSameDay(oct9MorningSG, oct9EveningSG, SINGAPORE)).toBe(true);
    // In Los Angeles the first is 8 October and the second is 9 October.
    expect(salonIsSameDay(oct9MorningSG, oct9EveningSG, LOS_ANGELES)).toBe(false);
  });
});
