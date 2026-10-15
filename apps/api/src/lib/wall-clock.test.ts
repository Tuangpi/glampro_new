import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatMinuteOfDay, formatShiftTime, wallClockAt } from "./wall-clock.js";

/**
 * The bridge between a shift (minutes past local midnight) and a booking (a UTC
 * instant). Every case below exists because of a way this could be wrong in
 * production while still passing a naive fixture:
 *
 * - a **non-UTC zone**, because a UTC-pinned test cannot see a server-clock bug;
 * - a **day rollover**, because 08:00 UTC on Saturday is already Sunday 01:00 in
 *   Bangkok and the rota row for Sunday is the one that must match;
 * - **DST**, because a fixed offset reads winter hours into summer;
 * - **midnight itself**, because some ICU versions render `hour12: false` as
 *   `24` and `24:05` would be 1445 minutes into a day that has 1440.
 */
describe("wallClockAt", () => {
  it("reads the wall clock in a non-UTC zone, not the server's", () => {
    // 01:00 UTC is 08:00 in Bangkok — the start of a normal working day there.
    const { dayOfWeek, minutes } = wallClockAt(
      new Date("2026-10-14T01:00:00.000Z"),
      "Asia/Bangkok",
    );

    assert.equal(dayOfWeek, 3); // 2026-10-14 is a Wednesday in Bangkok too.
    assert.equal(minutes, 8 * 60);
  });

  it("rolls to the next day when the zone is already past midnight", () => {
    // 18:00 UTC Saturday is 01:00 Sunday in Bangkok.
    const { dayOfWeek, minutes } = wallClockAt(
      new Date("2026-10-17T18:00:00.000Z"),
      "Asia/Bangkok",
    );

    assert.equal(dayOfWeek, 0); // Sunday — 0, matching Date#getDay().
    assert.equal(minutes, 60);
  });

  it("applies the zone's own DST rules rather than a fixed offset", () => {
    // New York is UTC−04:00 in July and UTC−05:00 in January for the same instant hour.
    const summer = wallClockAt(new Date("2026-07-04T16:00:00.000Z"), "America/New_York");
    const winter = wallClockAt(new Date("2026-01-04T16:00:00.000Z"), "America/New_York");

    assert.equal(summer.minutes, 12 * 60); // 12:00 EDT
    assert.equal(winter.minutes, 11 * 60); // 11:00 EST
    assert.equal(summer.dayOfWeek, 6); // Saturday
    assert.equal(winter.dayOfWeek, 0); // Sunday
  });

  it("reads local midnight as minute 0 even when ICU renders the hour as 24", () => {
    // 15:00 UTC is exactly 00:00 the next day in Tokyo.
    const { dayOfWeek, minutes } = wallClockAt(new Date("2026-01-14T15:00:00.000Z"), "Asia/Tokyo");

    assert.equal(minutes, 0);
    assert.equal(dayOfWeek, 4); // Thursday, 2026-01-15.
  });
});

describe("formatMinuteOfDay", () => {
  it("pads both fields, so a form round-trips 09:05", () => {
    assert.equal(formatMinuteOfDay(545), "09:05");
    assert.equal(formatMinuteOfDay(0), "00:00");
    assert.equal(formatMinuteOfDay(24 * 60), "24:00");
  });
});

describe("formatShiftTime", () => {
  it("renders the chip's shape at the boundaries", () => {
    assert.equal(formatShiftTime(540), "9:00 AM");
    assert.equal(formatShiftTime(18 * 60), "6:00 PM");
    assert.equal(formatShiftTime(12 * 60), "12:00 PM");
    assert.equal(formatShiftTime(0), "12:00 AM");
    // A shift ending at midnight is 1440; it reads as midnight, not as 14:40.
    assert.equal(formatShiftTime(1440), "12:00 AM");
    assert.equal(formatShiftTime(13 * 60 + 5), "1:05 PM");
  });
});
