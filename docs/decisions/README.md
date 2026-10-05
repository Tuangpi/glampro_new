# Decisions (ADRs)

Every decision that is expensive to reverse, or that a future reader is likely to
question, gets one numbered file here. [`../../AGENTS.md`](../../AGENTS.md) points
at this directory; [`.clinerules/02-workflow.md`](../../.clinerules/02-workflow.md)
defines when a file has to be written.

## Index

| #    | Decision                                                                                                    | Status   |
| ---- | ----------------------------------------------------------------------------------------------------------- | -------- |
| 0001 | _unallocated_                                                                                               | —        |
| 0002 | [A migrated tenant keeps the owner's legacy `users.id`](0002-tenant-id-equals-owner-id.md)                  | Accepted |
| 0003 | [Customer email is unique per tenant, not globally](0003-tenant-scoped-customer-email.md)                   | Accepted |
| 0004 | [The platform console is its own app](0004-platform-console-is-its-own-app.md)                              | Accepted |
| 0005 | [The rail has no Services destination](0005-rail-has-no-services-destination.md)                            | Accepted |
| 0006 | [Snap handoff values to tokens; record the delta](0006-snap-handoff-values-to-tokens.md)                    | Accepted |
| 0007 | [Logout revokes the refresh token, not the user](0007-logout-revokes-the-refresh-token-not-the-user.md)     | Accepted |
| 0008 | [The sign-in screen is composed from the delivered system](0008-login-screen-shape.md)                      | Accepted |
| 0009 | [The amber badge tone joins the handoff token file](0009-amber-joins-the-handoff-token-file.md)             | Accepted |
| 0010 | [The low-stock threshold is a per-tenant column, not a constant](0010-low-stock-threshold-is-per-tenant.md) | Accepted |

`0001` is unallocated: `0002` is referenced by name from
[`../saas/TENANCY.md`](../saas/TENANCY.md) and
[`../legacy/LEGACY-MAP.md`](../legacy/LEGACY-MAP.md), and renumbering a referenced
decision is worse than leaving the first slot empty. The next new decision is
`0011`.

## Rules

- **Filename:** `NNNN-short-title-in-kebab-case.md`, zero-padded to four digits,
  numbered from the highest existing file. Never reuse a number.
- **Language:** decisions are stated in the present tense, as rules ("migrated
  tenants keep…"), not as intentions ("we plan to…").
- **One decision per file.** If a change needs two unrelated decisions, write two
  files and reference them from each other.
- **Statuses:** `Proposed`, `Accepted`, `Superseded by NNNN`, `Rejected`. A
  superseded file keeps its text and gains a pointer to its replacement; it is
  never edited to look like the new decision.
- **Link it from the code.** Where the decision constrains code, reference the ADR
  in the file or comment that depends on it.
- **The ADR wins.** If a document and an ADR disagree, the ADR is correct and the
  document is fixed in the same commit.

## Template

```markdown
# NNNN — <decision in one line, as a rule>

- **Status:** Proposed | Accepted | Superseded by NNNN
- **Date:** YYYY-MM-DD
- **Deciders:** <who>
- **Related:** <links to docs, other ADRs, issues>

## Context

What made this a decision rather than an obvious step: the forces, the
constraints, the legacy behaviour that has to be respected.

## Decision

The rule, stated so that a reader can tell whether a given piece of code obeys it.
Numbered sub-rules are fine when the decision has parts.

## Why not the alternatives

| Alternative | Why it was rejected |
| ----------- | ------------------- |

## Consequences

Positive, negative/accepted and neutral. Be explicit about what this makes harder
— an ADR that lists only benefits is not a decision record.

## Enforcement

What actually keeps this true: the constraint, the test, the review step, or an
honest "nothing enforces this yet".
```
