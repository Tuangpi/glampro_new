import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://glampro:glampro@127.0.0.1:5432/glampro_test";

const { TENANT_SCOPED_MODELS, TENANT_REFERENCE_MODELS, isTenantScoped } =
  await import("./prisma.js");

const SCHEMA_PATH = fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url));

const schema = readFileSync(SCHEMA_PATH, "utf8");

/**
 * Models declared in `schema.prisma` that carry a `tenantId` field.
 *
 * Read from the schema rather than from the Prisma DMMF, because the
 * `prisma-client` generator does not export one. The schema file is exactly what
 * a developer edits when adding a model, so it is the right thing to assert
 * against — a new tenant-scoped model that nobody scoped fails here.
 */
function modelsWithTenantId(): string[] {
  const found: string[] = [];

  for (const [, name, body] of schema.matchAll(/^model\s+(\w+)\s*\{([^}]*)\}/gm)) {
    if (/^\s+tenantId\s+\S/m.test(body ?? "")) {
      found.push(name as string);
    }
  }

  return found.sort();
}

function modelNames(): string[] {
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1] as string).sort();
}

describe("TENANT_SCOPED_MODELS", () => {
  it("plus the named reference models covers every model with a tenantId column", () => {
    const declared = [...TENANT_SCOPED_MODELS, ...TENANT_REFERENCE_MODELS].sort();

    assert.deepEqual(
      declared,
      modelsWithTenantId(),
      "a model has a tenantId but is neither scoped nor listed as a reference — " +
        "add it to TENANT_SCOPED_MODELS or TENANT_REFERENCE_MODELS in prisma.ts",
    );
  });

  it("does not list the same model as both scoped and a reference", () => {
    for (const model of TENANT_REFERENCE_MODELS) {
      assert.equal(
        isTenantScoped(model),
        false,
        `${model} is in both lists; a model is either scoped or a reference`,
      );
    }
  });

  it("lists only models that exist in the schema", () => {
    const names = new Set(modelNames());

    for (const model of [...TENANT_SCOPED_MODELS, ...TENANT_REFERENCE_MODELS]) {
      assert.ok(names.has(model), `${model} is listed in prisma.ts but not in the schema`);
    }
  });

  it("leaves the platform plane unscoped", () => {
    for (const model of ["PlatformAdmin", "Tenant", "Module", "RefreshToken"]) {
      assert.equal(isTenantScoped(model), false, `${model} is above the isolation boundary`);
    }
  });
});
