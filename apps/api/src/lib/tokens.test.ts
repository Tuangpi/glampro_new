import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://glampro:glampro@127.0.0.1:5432/glampro_test";
process.env.JWT_SECRET ??= "token-test-secret";

const {
  createRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
  verifyAccessToken,
} = await import("./tokens.js");
const { HttpError } = await import("./http-error.js");

const subject = {
  id: "user_123",
  email: "owner@glampro.test",
  globalRole: "MANAGER" as const,
  realm: "web" as const,
  tokenVersion: 4,
};

describe("access tokens", () => {
  it("round-trips the claims", () => {
    const { token, expiresIn } = signAccessToken(subject);
    assert.ok(expiresIn > 0);

    const claims = verifyAccessToken(token);
    assert.equal(claims.sub, subject.id);
    assert.equal(claims.email, subject.email);
    assert.equal(claims.globalRole, subject.globalRole);
    assert.equal(claims.realm, subject.realm);
    assert.equal(claims.tokenVersion, subject.tokenVersion);
  });

  it("rejects a tampered token with a 401", () => {
    const { token } = signAccessToken(subject);
    const tampered = `${token.slice(0, -2)}xx`;

    assert.throws(
      () => verifyAccessToken(tampered),
      (error: unknown) => error instanceof HttpError && error.statusCode === 401,
    );
  });

  // The tenant claim is what lets the middleware enter `runAsTenant` straight from
  // the verified token, so a round-trip regression here would silently fall back to
  // reading the tenant from the user's row on every request.
  it("round-trips the tenant claim", () => {
    const { token } = signAccessToken({ ...subject, tenantId: "tenant_abc" });
    assert.equal(verifyAccessToken(token).tenantId, "tenant_abc");
  });

  it("omits the tenant claim for a platform session", () => {
    const { token } = signAccessToken(subject);
    assert.equal(verifyAccessToken(token).tenantId, undefined);
  });
});

describe("refresh tokens", () => {
  it("never repeats a token", () => {
    assert.notEqual(createRefreshToken().token, createRefreshToken().token);
  });

  it("stores only a deterministic sha-256 hash", () => {
    const { token, tokenHash } = createRefreshToken();

    assert.equal(tokenHash, hashRefreshToken(token));
    assert.equal(tokenHash, crypto.createHash("sha256").update(token).digest("hex"));
    assert.notEqual(tokenHash, token);
  });

  it("expires refresh tokens in the future", () => {
    assert.ok(refreshTokenExpiry().getTime() > Date.now());
  });
});
