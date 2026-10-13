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
  blockBox,
  buildCalendarColumns,
  instantFromOffset,
  minutesIntoDay,
  nowLineTop,
  snapToSlot,
} from "../calendar-geometry";

/** Local-time helper: the geometry reads local hours, so the fixtures must too. */
function at(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 9, day, hour, minute, 0, 0);
}

describe("blockBox", () => {
  it("places a block by its real start and duration", () => {
    // 09:00 for 60 minutes → one hour below the 08:00 top, one hour tall.
    const box = blockBox({
      startsAt: at(9, DAY_START_HOUR + 1).toISOString(),
      endsAt: at(9, DAY_START_HOUR + 2).toISOString(),
    });
    expect(box).toEqual({ top: HOUR_HEIGHT, height: HOUR_HEIGHT });
  });

  it("scales honestly: a 30-minute fill is half as tall as an hour", () => {
    const box = blockBox({
      startsAt: at(9, 10, 0).toISOString(),
      endsAt: at(9, 10, 30).toISOString(),
    });
    expect(box?.height).toBe(30 * PX_PER_MINUTE);
  });

  it("falls back to durationMinutes when endsAt is absent", () => {
    const box = blockBox({ startsAt: at(9, 10).toISOString(), durationMinutes: 45 });
    expect(box?.height).toBe(45 * PX_PER_MINUTE);
  });

  it("clamps a block that starts before the window to the top edge", () => {
    // A 06:00–09:00 block is drawn from the top, not hung off above it.
    const box = blockBox({
      startsAt: at(9, DAY_START_HOUR - 2).toISOString(),
      endsAt: at(9, DAY_START_HOUR + 1).toISOString(),
    });
    expect(box?.top).toBe(0);
  });

  it("gives a very short booking the minimum clickable height", () => {
    const box = blockBox({
      startsAt: at(9, 10).toISOString(),
      endsAt: at(9, 10, 5).toISOString(),
    });
    expect(box?.height).toBe(MIN_BLOCK_PX);
  });

  it("returns null for a booking wholly outside the day", () => {
    // 22:00–23:00 is past the 20:00 track end, so it never renders.
    expect(
      blockBox({ startsAt: at(9, 22).toISOString(), endsAt: at(9, 23).toISOString() }),
    ).toBeNull();
  });

  it("returns null for an unparseable instant", () => {
    expect(blockBox({ startsAt: "not-a-date", endsAt: "not-a-date" })).toBeNull();
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
