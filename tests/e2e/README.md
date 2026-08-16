# E2E Testing — Store DZ

Playwright suite that runs real browsers against a real production build
(`next build && next start`), never against mocks or the dev server.

## Test-data isolation — read this first

**There is no separate test database.** Docker wasn't available in the local
dev environment and a second cloud Supabase project wasn't something this
agent could create unilaterally, so the owner explicitly chose: run against
the **same production database**, protected by **strict logical isolation**
instead of physical separation. Concretely, every run:

- tags every row it creates — slugs/names prefixed `e2e-`, phone numbers in
  the reserved `0555xxxxxx` range, `customerLastName`/`Lead.lastName`
  prefixed `E2E-TestRun-{runId}-...` (see `support/testData.ts`)
- sweeps all E2E-tagged rows **before and after** every run
  (`support/testPrisma.ts#sweepAllE2EData`), so a crashed prior run
  self-heals on the next one
- never calls a real external service: Meta CAPI, TikTok Events API,
  registered webhooks, and the DHD courier API are all short-circuited by
  `E2E_TEST_RUN=1` (`src/lib/e2eGuard.ts`), which is set **only** on the
  locally-spawned `next start` process Playwright launches for the test run
  — it is never present in the real deployed environment

This is a real, if imperfect, tradeoff: it is **logical** isolation on a
shared database, not physical isolation. A bug in the tagging/sweep logic
could theoretically leave stray rows in production. Every run prints a loud
banner (`global-setup.ts`) making this explicit — it is not something to
forget.

## Running locally

```bash
npx playwright test                       # full suite, all 3 projects
npx playwright test checkout.spec.ts       # one file
npx playwright test --project=mobile-chrome
npx playwright show-report                 # open the last HTML report

# run last, separately — see "rate-limit-429.spec.ts" below for why
INCLUDE_RATE_LIMIT_TEST=1 npx playwright test tests/e2e/rate-limit-429.spec.ts --project=chromium-desktop
```

Requires `.env.local` with `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` at minimum
(`global-setup.ts` fails fast and lists exactly what's missing).

## CI

`.github/workflows/e2e.yml` runs the same suite on every push/PR against the
same shared database, using the secrets listed in that file. Concurrency is
capped to one run per branch at a time, specifically because two parallel
runs would race on the same production data and on real rate limiters
(login, order-creation, coupon-validation).

## Browser matrix

`chromium-desktop`, `mobile-chrome` (Pixel 5 emulation), `webkit-desktop`.

- **Firefox** is fully excluded (not even in CI) — it fails at a raw
  `browserType.launch()` on the local Windows dev machine (missing
  `msvcp140_1.dll`, a machine-level dependency, not a code issue), and there
  is no evidence either way for Linux.
- **WebKit** is in the matrix but **unverified locally**. Raw
  `webkit.launch()` scripts succeed every time on this machine, but running
  the exact same browser through Playwright's own test-runner worker process
  fails 100% of the time within under a second of launch
  (`browserContext.newPage: Target page, context or browser has been
  closed`), reproduced identically under both Git Bash and native
  PowerShell — ruling out a shell quirk. This looks like a Windows-specific
  IPC/pipe issue in Playwright's worker-process architecture, not an app bug
  or a config issue (bisected by stripping `trace`/`screenshot`/`video` from
  the config — no change). It is left in `playwright.config.ts` because CI
  runs on Linux, where Playwright's WebKit build doesn't share this
  mechanism, and the raw-launch success is a positive signal — but until a
  real CI run confirms it, treat WebKit coverage as **not proven**, not as
  "should be fine."

## `rate-limit-429.spec.ts` runs separately, last

The 429-flood test hits `/api/coupons/validate` 17 times to trip a real
15-per-10-minute, IP-keyed limiter (`src/lib/rateLimit/upstash.ts`). That
limiter is *shared* — any other test that legitimately validates a coupon
(`checkout.spec.ts`, `checkout-negative.spec.ts`, `race-conditions.spec.ts`)
within the following ~10 minutes, on **any** browser project, gets a false
429 that has nothing to do with the app. This was caught for real during
development: the flood test sitting inside `api-status-codes.spec.ts` broke
the coupon test on both `chromium-desktop` and `mobile-chrome` in the same
run. It now lives in its own file, is excluded from the default
`npx playwright test` run via `testIgnore`, and must be run as an explicit,
separate, final step with `INCLUDE_RATE_LIMIT_TEST=1` set (see CI workflow
and the command above) — `testIgnore` excludes a file from test discovery
even when its path is passed explicitly on the command line, so the
exclusion itself has to be made conditional on that env var.

## Known gaps (disclosed, not hidden)

- WebKit coverage is unverified locally — see Browser matrix above.
- Meta CAPI / TikTok Events API guards are verified by code inspection and
  by the same guard pattern proven live for DHD (`integrations.spec.ts`),
  but have no dedicated spec asserting the guard fires — there is no
  Playwright-visible signal to assert against beyond server logs.
- `checkout-negative.spec.ts` skips one case that needs an inactive-wilaya
  fixture not currently seeded.
