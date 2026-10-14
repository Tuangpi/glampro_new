/**
 * The grid's maths, tested on its own.
 *
 * These are the numbers the whole calendar rests on — where a block sits and how
 * tall it is, where "now" sits, and the slot a drop lands on. They are pure
 * functions of a `Date`, so they are pinned here without rendering a single
 * block: a block drawn at the wrong `top` is a booking shown at the wrong time,
 * which is the one thing a calendar must never do.
 */
import { describe, expect, it } from "vitest";

import {
  DAY_START_HOUR,
  HOUR_HEIGHT,
  MIN_BLOCK_PX,
  PX_PER_MINUTE,
  WEEK_STARTS_ON,
  addDays,
  blockBox,
  blockMinutes,
  bookingsByDay,
  buildCalendarColumns,
  dayKey,
  dayWindow,
  endOfMonth,
  instantFromOffset,
  isSameDay,
  minutesIntoDay,
  monthGridDays,
  monthWindow,
  nowLineTop,
  packLanes,
  rescheduleFields,
  shiftMonth,
  snapToSlot,
  weekDays,
  weekWindow,
} from "../calendar-geometry";

/** Local-time helper: the geometry reads local hours, so the fixtures must too. */
function at(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 9, day, hour, minute, 0, 0);
}

describe("blockBox", () => {
  /** The day every fixture below is on — a box is drawn on a day, not "somewhere". */
  const DAY = at(9, 0);

  it("places a block by its real start and duration", () => {
    // 09:00 for 60 minutes → one hour below the 08:00 top, one hour tall.
    const box = blockBox(
      {
        startsAt: at(9, DAY_START_HOUR + 1).toISOString(),
        endsAt: at(9, DAY_START_HOUR + 2).toISOString(),
      },
      DAY,
    );
    expect(box).toEqual({ top: HOUR_HEIGHT, height: HOUR_HEIGHT });
  });

  it("scales honestly: a 30-minute fill is half as tall as an hour", () => {
    const box = blockBox(
      { startsAt: at(9, 10, 0).toISOString(), endsAt: at(9, 10, 30).toISOString() },
      DAY,
    );
    expect(box?.height).toBe(30 * PX_PER_MINUTE);
  });

  it("falls back to durationMinutes when endsAt is absent", () => {
    const box = blockBox({ startsAt: at(9, 10).toISOString(), durationMinutes: 45 }, DAY);
    expect(box?.height).toBe(45 * PX_PER_MINUTE);
  });

  it("falls back to durationMinutes when endsAt is unparseable", () => {
    const box = blockBox(
      { startsAt: at(9, 10).toISOString(), endsAt: "not-a-date", durationMinutes: 45 },
      DAY,
    );
    // The contract allows an absent end, so a bad one must not collapse the block.
    expect(box?.height).toBe(45 * PX_PER_MINUTE);
  });

  it("clamps a block that starts before the window to the top edge", () => {
    // A 06:00–09:00 block is drawn from the top, not hung off above it.
    const box = blockBox(
      {
        startsAt: at(9, DAY_START_HOUR - 2).toISOString(),
        endsAt: at(9, DAY_START_HOUR + 1).toISOString(),
      },
      DAY,
    );
    expect(box?.top).toBe(0);
  });

  it("gives a very short booking the minimum clickable height", () => {
    const box = blockBox(
      { startsAt: at(9, 10).toISOString(), endsAt: at(9, 10, 5).toISOString() },
      DAY,
    );
    expect(box?.height).toBe(MIN_BLOCK_PX);
  });

  it("returns null for a booking wholly outside the day", () => {
    // 22:00–23:00 is past the 20:00 track end, so it never renders.
    const box = blockBox(
      { startsAt: at(9, 22).toISOString(), endsAt: at(9, 23).toISOString() },
      DAY,
    );
    expect(box).toBeNull();
  });

  it("returns null when the day asked about is not the booking's own day", () => {
    // The date-aware half of the signature: a 10:00 booking is a block on the 9th and
    // nothing at all on the 8th or the 10th (ADR 0018, decision 2).
    const booking = { startsAt: at(9, 10).toISOString(), endsAt: at(9, 11).toISOString() };
    expect(blockBox(booking, at(8, 0))).toBeNull();
    expect(blockBox(booking, at(10, 0))).toBeNull();
  });

  it("returns null for an unparseable instant", () => {
    expect(blockBox({ startsAt: "not-a-date", endsAt: "not-a-date" }, DAY)).toBeNull();
  });
});

describe("blockMinutes", () => {
  it("measures from the top of the visible window, not from midnight", () => {
    // 10:00–11:00 is two hours past the 08:00 top, one hour long.
    const span = blockMinutes(
      { startsAt: at(9, 10).toISOString(), endsAt: at(9, 11).toISOString() },
      at(9, 0),
    );
    expect(span).toEqual({ start: 2 * 60, end: 3 * 60 });
  });

  it("is null when the booking is not on that day at all", () => {
    const booking = { startsAt: at(9, 14).toISOString(), endsAt: at(9, 15).toISOString() };
    expect(blockMinutes(booking, at(10, 0))).toBeNull();
  });

  it("is null on both days of a booking that crosses midnight", () => {
    // 23:00 → 01:00. The gutter is 08:00–20:00, so the start day clamps to nothing (its
    // start is past 20:00) and the end day clamps to nothing (its end is before 08:00).
    // ADR 0018, decision 2: the booking is drawn in no view, and the straddle-aware read
    // this replaces would have changed no pixel.
    const overnight = { startsAt: at(9, 23).toISOString(), endsAt: at(10, 1).toISOString() };
    expect(blockMinutes(overnight, at(9, 0))).toBeNull();
    expect(blockMinutes(overnight, at(10, 0))).toBeNull();
    // It is still on the 9th in every list-shaped sense — the day it *starts*.
    expect(dayKey(new Date(overnight.startsAt))).toBe(dayKey(at(9, 0)));
  });
});

describe("calendar windows", () => {
  it("reads one local day, midnight to its last millisecond", () => {
    const range = dayWindow(at(9, 13));
    const from = new Date(range.from);
    const to = new Date(range.to);
    expect([from.getDate(), from.getHours(), from.getMinutes()]).toEqual([9, 0, 0]);
    expect([to.getDate(), to.getHours(), to.getMinutes(), to.getMilliseconds()]).toEqual([
      9, 23, 59, 999,
    ]);
  });

  it("reads the whole Monday-first week", () => {
    // 9 October 2026 is a Friday, so its week runs Monday the 5th to Sunday the 11th.
    const range = weekWindow(at(9, 13));
    const from = new Date(range.from);
    const to = new Date(range.to);
    expect([from.getDate(), from.getHours()]).toEqual([5, 0]);
    expect([to.getDate(), to.getHours()]).toEqual([11, 23]);
  });

  it("reads the calendar month, not the drawn grid", () => {
    // October 2026 starts on a Thursday and ends on a Saturday, so its *grid* is padded
    // with September and November days — none of which is fetched (ADR 0018, decision 6).
    const range = monthWindow(at(9, 13));
    const from = new Date(range.from);
    const to = new Date(range.to);
    expect([from.getMonth(), from.getDate()]).toEqual([9, 1]);
    expect([to.getMonth(), to.getDate()]).toEqual([9, 31]);
  });
});

describe("the week and the month", () => {
  it("returns seven days from the Monday of the anchor's week", () => {
    const days = weekDays(at(9, 13));
    expect(days).toHaveLength(7);
    expect(days[0]?.getDay()).toBe(WEEK_STARTS_ON);
    expect(days[0]?.getDate()).toBe(5); // Monday 5 October 2026
    expect(days[6]?.getDate()).toBe(11); // Sunday 11 October
    // Every one at local midnight, so a column never opens on yesterday's 23:00.
    expect(days.every((day) => day.getHours() === 0 && day.getMinutes() === 0)).toBe(true);
  });

  it("draws whole Monday-first weeks, padded at both ends", () => {
    const days = monthGridDays(at(9, 13));
    // 28 September — the Monday of the week that holds 1 October — to 1 November.
    expect(days).toHaveLength(35);
    expect([days[0]?.getMonth(), days[0]?.getDate()]).toEqual([8, 28]);
    const last = days.at(-1);
    expect([last?.getMonth(), last?.getDate()]).toEqual([10, 1]);
    expect(days[0]?.getDay()).toBe(WEEK_STARTS_ON);
    // Whole weeks, so the grid is never a ragged 30-cell row.
    expect(days.length % 7).toBe(0);
  });

  it("holds the day of the month where it exists, instead of skipping a month", () => {
    const january31 = new Date(2026, 0, 31, 12, 0, 0, 0);
    expect(endOfMonth(january31).getDate()).toBe(31);
    // 31 January + a month is 28 February — never 3 March, which would skip February.
    const february = shiftMonth(january31, 1);
    expect([february.getMonth(), february.getDate()]).toEqual([1, 28]);
    // The clamp is not remembered as the new day of the month, so the next step is March.
    const march = shiftMonth(february, 1);
    expect([march.getMonth(), march.getDate()]).toEqual([2, 28]);
    // And back is the plain inverse for a day both months have.
    const back = shiftMonth(february, -1);
    expect([back.getMonth(), back.getDate()]).toEqual([0, 28]);
  });

  it("holds the wall clock at midnight when the day steps", () => {
    // Calendar-field arithmetic, so a DST night cannot drag the grid's day boundary.
    expect(addDays(at(9, 23, 30), 1).getHours()).toBe(0);
    expect(addDays(at(9, 0), 1).getDate()).toBe(10);
    expect(addDays(at(9, 0), -9).getDate()).toBe(30);
    expect(addDays(at(9, 0), -9).getMonth()).toBe(8);
  });

  it("names a day by its local fields, never by UTC's", () => {
    expect(dayKey(at(9, 23, 59))).toBe("2026-10-09");
    expect(dayKey(at(9, 0))).toBe("2026-10-09");
    expect(isSameDay(at(9, 0), at(9, 23, 59))).toBe(true);
    expect(isSameDay(at(9, 23, 59), at(10, 0))).toBe(false);
  });
});

describe("bookingsByDay", () => {
  it("buckets a booking under the day it starts on, not the day it ends on", () => {
    const byDay = bookingsByDay([
      { id: "a", startsAt: at(9, 10).toISOString() },
      { id: "b", startsAt: at(9, 15).toISOString() },
      { id: "c", startsAt: at(10, 9).toISOString() },
    ]);

    expect(byDay.get("2026-10-09")?.map((booking) => booking.id)).toEqual(["a", "b"]);
    expect(byDay.get("2026-10-10")?.map((booking) => booking.id)).toEqual(["c"]);
  });

  it("puts an overnight booking on the day it started, where no view can draw it", () => {
    const byDay = bookingsByDay([{ id: "overnight", startsAt: at(9, 23).toISOString() }]);
    // The bucket follows the start day; `blockMinutes` is what then refuses to draw it.
    expect(byDay.get("2026-10-09")).toHaveLength(1);
    expect(byDay.get("2026-10-10")).toBeUndefined();
  });

  it("ignores a booking whose instant cannot be read", () => {
    expect(bookingsByDay([{ id: "broken", startsAt: "not-a-date" }]).size).toBe(0);
  });
});

describe("packLanes", () => {
  it("gives a booking nobody shares time with the whole column", () => {
    expect(packLanes([{ id: "a", start: 0, end: 60 }]).get("a")).toEqual({ lane: 0, lanes: 1 });
  });

  it("splits a column between two bookings that really overlap", () => {
    const lanes = packLanes([
      { id: "a", start: 0, end: 60 },
      { id: "b", start: 30, end: 90 },
    ]);
    expect(lanes.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get("b")).toEqual({ lane: 1, lanes: 2 });
  });

  it("shares a lane when one booking starts exactly as the other ends", () => {
    // Half-open, the comparison ADR 0014 already uses to refuse a clash: touching is not
    // overlapping, so a 09:00 booking is not squeezed by an 08:00 one.
    const lanes = packLanes([
      { id: "a", start: 0, end: 60 },
      { id: "b", start: 60, end: 120 },
    ]);
    expect(lanes.get("a")).toEqual({ lane: 0, lanes: 1 });
    expect(lanes.get("b")).toEqual({ lane: 0, lanes: 1 });
  });

  it("stacks three deep and reuses a lane that has come free", () => {
    const lanes = packLanes([
      { id: "a", start: 0, end: 60 },
      { id: "b", start: 10, end: 40 },
      { id: "c", start: 20, end: 50 },
      // Starts after `b` freed lane 1, while `a` and `c` still hold theirs.
      { id: "d", start: 45, end: 70 },
    ]);
    expect(lanes.get("a")).toEqual({ lane: 0, lanes: 3 });
    expect(lanes.get("b")).toEqual({ lane: 1, lanes: 3 });
    expect(lanes.get("c")).toEqual({ lane: 2, lanes: 3 });
    expect(lanes.get("d")?.lane).toBe(1);
  });

  it("sizes lanes to the overlapping cluster, not to the whole day", () => {
    // A morning with two overlaps must not squeeze an afternoon booking into a third of
    // its column: the two clusters are eight hours apart.
    const lanes = packLanes([
      { id: "a", start: 0, end: 60 },
      { id: "b", start: 30, end: 90 },
      { id: "c", start: 480, end: 540 },
    ]);
    expect(lanes.get("a")?.lanes).toBe(2);
    expect(lanes.get("b")?.lanes).toBe(2);
    expect(lanes.get("c")).toEqual({ lane: 0, lanes: 1 });
  });

  it("compares the span the day actually draws, so clamping decides overlap", () => {
    // A 07:00 booking and an 08:00 one are both drawn from the 08:00 top, so they must
    // divide the column rather than hide each other behind the clamp.
    const early = blockMinutes(
      { startsAt: at(9, 7).toISOString(), endsAt: at(9, 9).toISOString() },
      at(9, 0),
    );
    const onTime = blockMinutes(
      { startsAt: at(9, 8).toISOString(), endsAt: at(9, 9).toISOString() },
      at(9, 0),
    );
    if (!early || !onTime) throw new Error("Both bookings belong to the day being drawn.");

    const lanes = packLanes([
      { id: "early", ...early },
      { id: "on-time", ...onTime },
    ]);
    expect(lanes.get("early")?.lanes).toBe(2);
    expect(lanes.get("on-time")?.lanes).toBe(2);
  });
});

describe("nowLineTop", () => {
  it("sits at the hour mark for a time on the grid", () => {
    expect(nowLineTop(at(9, 10))).toBe(2 * HOUR_HEIGHT);
  });

  it("is null before the day opens and after it closes", () => {
    expect(nowLineTop(at(9, 3))).toBeNull();
    expect(nowLineTop(at(9, 23))).toBeNull();
  });
});

describe("minutesIntoDay", () => {
  it("counts local minutes since midnight", () => {
    expect(minutesIntoDay(at(9, 13, 45))).toBe(13 * 60 + 45);
  });
});

describe("snapToSlot", () => {
  it("rounds to the nearest quarter hour", () => {
    expect(snapToSlot(97)).toBe(90);
    expect(snapToSlot(98)).toBe(105);
    expect(snapToSlot(0)).toBe(0);
  });

  it("honours a custom slot", () => {
    expect(snapToSlot(20, 30)).toBe(30);
  });
});

describe("instantFromOffset", () => {
  it("turns a minute offset into a real instant on the day", () => {
    // Two hours past the 08:00 top is 10:00 local.
    const instant = instantFromOffset(at(9, 0), 2 * 60);
    expect(instant.getHours()).toBe(10);
    expect(instant.getMinutes()).toBe(0);
  });

  it("snaps a raw drop offset to the slot", () => {
    const instant = instantFromOffset(at(9, 0), 2 * 60 + 7);
    expect(instant.getHours()).toBe(10);
    expect(instant.getMinutes()).toBe(0);
  });

  it("clamps a drop below or above the track", () => {
    expect(instantFromOffset(at(9, 0), -30).getHours()).toBe(DAY_START_HOUR);
    // Past the day's end clamps to the last instant, never off-grid.
    expect(instantFromOffset(at(9, 0), 99 * 60).getHours()).toBe(20);
  });
});

describe("buildCalendarColumns", () => {
  const booking = {
    id: "a",
    startsAt: "2026-10-09T09:00:00.000Z",
    endsAt: "2026-10-09T10:00:00.000Z",
    status: "SCHEDULED" as const,
    durationMinutes: 60,
    comment: null,
    customerId: null,
    customerName: null,
    staffId: "staff-1",
    staffName: "Stella Stylist",
    serviceId: null,
    serviceName: null,
    serviceDepartmentId: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };

  it("gives every roster member a column, then always an Unassigned one", () => {
    const columns = buildCalendarColumns([], [{ id: "staff-1", name: "Stella" }]);
    expect(columns).toEqual([
      { id: "staff-1", name: "Stella", role: undefined },
      { id: null, name: "Unassigned" },
    ]);
  });

  it("adds a column for a booking whose performer is not on the roster", () => {
    const columns = buildCalendarColumns(
      [{ ...booking, staffId: "staff-gone", staffName: "Former Staff" }],
      [],
    );
    expect(columns[0]).toEqual({ id: "staff-gone", name: "Former Staff" });
    expect(columns.at(-1)?.id).toBeNull();
  });

  it("does not duplicate a column when the booking's performer is rostered", () => {
    const columns = buildCalendarColumns([booking], [{ id: "staff-1", name: "Stella" }]);
    // One staff column + Unassigned — the booking folds into the roster column.
    expect(columns).toHaveLength(2);
  });
});

describe("rescheduleFields", () => {
  const DAY = at(9, 0);
  const base = {
    id: "appt-1",
    startsAt: at(9, 10, 0).toISOString(), // 10:00 local
    endsAt: at(9, 11, 0).toISOString(),
    status: "SCHEDULED" as const,
    durationMinutes: 60,
    comment: null,
    customerId: null,
    customerName: "Mina Customer",
    staffId: "staff-1",
    staffName: "Stella Stylist",
    serviceId: null,
    serviceName: null,
    serviceDepartmentId: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };

  it("moves the start when dropped at a new time", () => {
    // Drop two hours below the 08:00 top → 10:00; three hours → 11:00.
    const fields = rescheduleFields(base, { day: DAY, offsetMinutes: 3 * 60, staffId: "staff-1" });
    expect(new Date(fields.startsAt as string).getHours()).toBe(11);
    expect(fields.staffId).toBeUndefined();
  });

  it("reassigns the performer when dropped in another column", () => {
    const fields = rescheduleFields(base, {
      day: DAY,
      offsetMinutes: 2 * 60, // same 10:00 it already starts at
      staffId: "staff-2",
    });
    expect(fields.startsAt).toBeUndefined();
    expect(fields.staffId).toBe("staff-2");
  });

  it("clears the performer when dropped into the Unassigned column", () => {
    const fields = rescheduleFields(base, { day: DAY, offsetMinutes: 2 * 60, staffId: null });
    expect(fields.staffId).toBeNull();
  });

  it("posts nothing when the block is dropped back where it was", () => {
    const fields = rescheduleFields(base, { day: DAY, offsetMinutes: 2 * 60, staffId: "staff-1" });
    expect(fields).toEqual({});
  });

  it("combines a time move and a reassignment in one PATCH", () => {
    const fields = rescheduleFields(base, { day: DAY, offsetMinutes: 4 * 60, staffId: "staff-2" });
    expect(new Date(fields.startsAt as string).getHours()).toBe(12);
    expect(fields.staffId).toBe("staff-2");
  });
});
