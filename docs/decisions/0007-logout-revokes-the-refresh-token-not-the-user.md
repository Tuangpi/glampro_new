# 0007 — Logout revokes the refresh token, not the user

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** Engineering (session semantics)
- **Related:** the tenant-isolation rule,
  [`architecture.md`](../architecture.md) §6, [`roadmap.md`](../roadmap.md) Phase 3,
  [`saas/TENANCY.md`](../saas/TENANCY.md) §6, [`STATE.md`](../STATE.md) §3

## Evidence review — 2026-10-15

The missing architecture, roadmap and tenancy documents and old STATE section are
historical references; see the [ADR index](README.md#historical-references-and-current-scope).
Current evidence and limits are:

- [`auth.service.ts`](../../apps/api/src/services/auth.service.ts) implements logout
  by revoking the presented token hash without changing `tokenVersion`. Password
  change increments that version and then revokes the user's active refresh rows.
  [`auth.ts`](../../apps/api/src/middleware/auth.ts) checks the version on requests;
  [`constants.ts`](../../packages/shared/src/constants.ts) sets the access TTL to
  15 minutes. The password update and refresh-row revocation are separate writes,
  not one transaction; this review does not establish failure/race safety.
- The same service's refresh-replay handling revokes all active refresh rows for
  a user when any already-revoked token is presented. It does not distinguish a
  rotated token from one revoked by logout. Thus logout itself leaves other rows
  alone, but a subsequent refresh attempt with the logged-out token can revoke
  other sessions' refresh rows. This qualifies the broad other-session guarantee
  below and needs security-policy review, not a silent documentation-driven fix.
- [`AuthContext.tsx`](../../apps/web/src/contexts/AuthContext.tsx) clears browser
  credentials and cached queries before a best-effort logout request. Local
  sign-out therefore does not prove server revocation if that request fails; the
  15-minute bound below assumes successful server revocation of the refresh token.
- Platform-console forced sign-out remains an architectural requirement, not an
  implemented endpoint in the inspected API. Password change is implemented;
  this review does not claim full security-hardening acceptance.
- [`auth.routes.test.ts`](../../apps/api/src/routes/auth.routes.test.ts) contains
  database-backed logout/password-change assertions, inspected but not executed
  pending confirmation of a disposable test database. The mocked browser suite
  [`AuthContext.test.tsx`](../../apps/web/src/contexts/__tests__/AuthContext.test.tsx)
  checks the logout request and local session clearing, not database revocation.

## Context

Two mechanisms can end a Glampro session, and they are not the same size:

- **`tokenVersion`** on `users`, compared against the access token's claim on every
  request by `middleware/auth.ts`. Incrementing it invalidates **every** access token
  ever issued to that user, on every device, at the next request.
- **`refresh_tokens` rows**, revoked by setting `revokedAt`. Revoking one row ends one
  session's ability to renew; every other row is untouched.

`architecture.md` §6 said "logout, password change or a forced sign-out increments
`tokenVersion` and invalidates all outstanding access tokens immediately", which
conflates the two. Taken literally, signing out of the web portal on one machine would
sign the same user out everywhere — the POS till, a second browser, a phone. That is not
what "log out" means to a salon, and it is not what the legacy product did.

The session model already makes the cheaper answer available. The access token lives
15 minutes (`ACCESS_TOKEN_TTL_SECONDS`, the same 15 minutes §6 documents), and the
refresh token is the only thing that can extend it. Revoking the refresh row therefore
ends the session from the client's point of view while leaving the user's other sessions
intact.

## Decision

**Logout revokes the refresh token that was presented. It does not touch
`tokenVersion`.**

- `POST /api/auth/logout` takes the presented refresh token and revokes that row only.
  It is idempotent: revoking an already-revoked or unknown token answers `200`, because
  a client that has already lost the session is not making an error.
- The access token is left valid until it expires. The web client discards it on logout
  and nothing can renew it, so the exposure is bounded by the 15-minute TTL.
- **`tokenVersion` moves for the two cases that must end every session at once:** a
  password change, and a forced sign-out issued from the platform console. Both are
  defensive actions — the point is to evict a session the user no longer controls — so
  "every device" is the requirement rather than a side effect.
- Two sessions for one user may therefore hold different refresh tokens and the same
  `tokenVersion`. That is intended.
- `code: "SESSION_INVALIDATED"` is the single code for a token that no longer works,
  whichever of the two mechanisms made it stop working.

## Why not the alternatives

| Alternative                                                     | Why it was rejected                                                                                                                           |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Logout increments `tokenVersion`                                | Ends one browser session by signing the user out of the POS till and every other device — `architecture.md` would have been describing itself |
| Keep every refresh row and add a denylist for access tokens     | A second, unbounded store to expire, to buy back minutes a 15-minute TTL already bounds                                                       |
| Shorten the access token TTL to about a minute                  | Turns every screen into a refresh round-trip and puts the API in the path of the POS item grid for no security the TTL does not already give  |
| Require the access token on logout as well as the refresh token | A client whose access token has expired could no longer end its session — which is the case logout exists for                                 |

## Consequences

- **Positive.** Logging out of the web portal leaves the user's other sessions alone,
  which is what the word means, and one session can be ended without disturbing the rest.
- **Positive.** `refresh_tokens` stays the single place session lifetime is decided, so
  revocation is one `updateMany` and there is no second store to keep in step.
- **Negative / accepted.** A copied access token stays usable for up to 15 minutes after
  logout. It is bounded by the TTL; ending it sooner would cost every other session.
- **Negative / accepted.** Two sessions on one user are indistinguishable by
  `tokenVersion`, so a support request reads the refresh rows rather than the user row.

## Enforcement

- `apps/api/src/routes/auth.routes.test.ts` pins both halves. Logout revokes the
  presented token (a later `POST /api/auth/refresh` with it answers `401
SESSION_INVALIDATED`), is idempotent, and **leaves the access token working** —
  `GET /api/auth/me` still answers `200` immediately afterwards, so a change that made
  logout bump `tokenVersion` turns that test red.
- The same file pins the other side of the line: change-password answers `200`, then the
  access token that called it is dead (`401 SESSION_INVALIDATED`) and its refresh row
  cannot be exchanged.
- The historical architecture/roadmap updates referenced when this ADR was written
  are no longer available in this checkout and are not current enforcement evidence.
