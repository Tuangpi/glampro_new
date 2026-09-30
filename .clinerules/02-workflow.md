# glampro_new — workflow rules

## Phase discipline

Work proceeds one **phase** at a time (`docs/roadmap.md`). A phase ends with:

1. `npm run verify` green.
2. The relevant `docs/` files updated (at minimum `docs/STATE.md`).
3. A commit whose message names the phase.

Do not start the next phase's work in the same commit. Do not claim a phase is
done without running the verification command.

## Investigating instead of guessing

- Unanswered questions about the old product are answered by reading the legacy
  Laravel codebase (path in `docs/legacy/LEGACY-MAP.md`) and writing the answer
  into `docs/legacy/` — never by assuming.
- Unanswered questions about scope or product intent are **asked**, not decided
  unilaterally. Record the answer as a numbered file in `docs/decisions/`.
- Open questions that block a future phase belong in `docs/STATE.md` under
  **Open questions**, with what unblocks them.

## Verifying

`npm run verify` is the gate. Where a change cannot be validated by the unit
suites, say exactly how it was validated (running stack, manual call, `make
smoke`) and what remains unverified. Never report success you did not observe.

## Docker

The host has other stacks on 9000 and 8080, so this project uses **API 9100,
web 5173, PostgreSQL 5433**. Rebuild with `make rebuild` after any
`package.json` change — `node_modules` lives in named volumes seeded from the
image. When posting a curl or a URL in documentation, use the host port.
