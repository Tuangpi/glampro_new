import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { salonLocaleSchema, salonTimeZoneSchema, updateSalonProfileSchema } from "./settings.js";

describe("salon localisation contracts", () => {
  it("accepts supported locales and named timezones, including DST zones", () => {
    for (const value of ["Asia/Singapore", "America/New_York", "Europe/London", "UTC"]) {
      assert.equal(salonTimeZoneSchema.parse(value), value);
    }
    for (const value of ["en-SG", "en-GB", "fr-FR"]) {
      assert.equal(salonLocaleSchema.parse(value), value);
    }
  });

  it("rejects empty, malformed, unsupported and offset-only preferences", () => {
    for (const value of ["", "Mars/Olympus", "+08:00", "-05:00", "a".repeat(101)]) {
      assert.equal(salonTimeZoneSchema.safeParse(value).success, false, value);
    }
    for (const value of ["", "en_SG", "zz-ZZ", "a".repeat(101)]) {
      assert.equal(salonLocaleSchema.safeParse(value).success, false, value);
    }
  });

  it("trims preferences and preserves older profile requests without injecting defaults", () => {
    const legacy = { name: "Salon", lowStockThreshold: 5 };
    assert.deepEqual(updateSalonProfileSchema.parse(legacy), legacy);
    assert.deepEqual(
      updateSalonProfileSchema.parse({
        ...legacy,
        timeZone: " Asia/Singapore ",
        locale: " en-SG ",
      }),
      { ...legacy, timeZone: "Asia/Singapore", locale: "en-SG" },
    );
  });

  it("retains the required existing fields and refuses platform-owned fields", () => {
    assert.equal(updateSalonProfileSchema.safeParse({ locale: "en-SG" }).success, false);
    assert.equal(
      updateSalonProfileSchema.safeParse({ name: "Salon", lowStockThreshold: 5, slug: "forged" })
        .success,
      false,
    );
  });
});
