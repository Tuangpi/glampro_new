import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MODULE_CODES, MODULE_NAMES, moduleName } from "./constants.js";

describe("MODULE_NAMES", () => {
  it("names every code in the catalogue with something other than the key", () => {
    for (const code of MODULE_CODES) {
      const name = MODULE_NAMES[code];
      assert.ok(name, `${code} must have a display name`);
      // `giftCards` and `employeeCommission` are the keys a salon must never read:
      // the name is what the Modules panel and the add-on refusal both render.
      assert.notEqual(name, code, `${code} must not be labelled with its own key`);
    }
  });

  it("resolves a code a caller holds as a plain string", () => {
    assert.equal(moduleName("packages"), "Packages");
    assert.equal(moduleName("giftCards"), "Gift cards");
    assert.equal(moduleName("employeeCommission"), "Employee commission");
  });

  it("falls back to the code for one the catalogue does not hold", () => {
    // `requireModule` takes a `string`, so an unknown code still has to produce a
    // sentence rather than `undefined` in the middle of one.
    assert.equal(moduleName("no-such-module"), "no-such-module");
  });
});
