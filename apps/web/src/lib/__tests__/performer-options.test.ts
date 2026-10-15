import { describe, expect, it } from "vitest";

import { performerOptions } from "@/lib/performer-options";

describe("performer options", () => {
  it("keeps unique names uncluttered and preserves order and IDs", () => {
    expect(performerOptions([{ id: "a", name: "Ava", email: "ava@example.test" }])).toEqual([
      { value: "a", label: "Ava" },
    ]);
    expect(performerOptions([])).toEqual([]);
  });

  it("offers the same account only once without modifying the source", () => {
    const person = { id: "a", name: "Ava", email: "ava@example.test" };
    const people = [person, person];
    expect(performerOptions(people)).toEqual([{ value: "a", label: "Ava" }]);
    expect(people).toEqual([person, person]);
  });

  it("distinguishes same-name accounts by email, not by merging them", () => {
    expect(
      performerOptions([
        { id: "a", name: "Sam Lee", email: "sam.a@example.test" },
        { id: "b", name: "Sam Lee", email: "sam.b@example.test" },
      ]),
    ).toEqual([
      { value: "a", label: "Sam Lee (sam.a@example.test)" },
      { value: "b", label: "Sam Lee (sam.b@example.test)" },
    ]);
  });

  it("recognises case/spacing collisions and falls back to the full ID without email", () => {
    expect(
      performerOptions([
        { id: "a", name: "Sam Lee", email: " " },
        { id: "b", name: " sam   LEE " },
      ]),
    ).toEqual([
      { value: "a", label: "Sam Lee (a)" },
      { value: "b", label: " sam   LEE  (b)" },
    ]);
  });
});
