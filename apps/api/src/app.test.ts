import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

// `lib/env.ts` fails fast on missing configuration, so the required variables
// are provided before the app is imported. The database is never contacted by
// these assertions — the readiness probe is allowed to report "down".
process.env.DATABASE_URL ??= "postgresql://glampro:glampro@127.0.0.1:5432/glampro_test";
process.env.JWT_SECRET ??= "integration-test-secret";
process.env.NODE_ENV = "test";

const { createApp } = await import("./app.js");

let server: Server;
let baseUrl: string;

before(async () => {
  const app = createApp();

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });

  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("GET /health", () => {
  it("answers the liveness contract without touching the database", async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });
});

describe("GET /api/health", () => {
  it("reports readiness with a database status", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.ok([200, 503].includes(response.status), `unexpected status ${response.status}`);

    const body = (await response.json()) as { status: string; database: string };
    assert.ok(["up", "down"].includes(body.database));
    assert.equal(body.status, body.database === "up" ? "ok" : "degraded");
  });
});

describe("error contract", () => {
  it("answers unknown routes with a JSON 404", async () => {
    const response = await fetch(`${baseUrl}/api/definitely-not-a-route`);
    assert.equal(response.status, 404);
    assert.equal(((await response.json()) as { code: string }).code, "NOT_FOUND");
  });

  it("rejects a protected route without a bearer token", async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(response.status, 401);
    assert.equal(((await response.json()) as { statusCode: number }).statusCode, 401);
  });

  it("rejects a protected route with a malformed bearer token", async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: "Bearer not-a-real-token" },
    });
    assert.equal(response.status, 401);
  });
});
