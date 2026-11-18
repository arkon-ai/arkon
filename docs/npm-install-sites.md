# npm install sites (transformate WI-4683)

Every place in this repo that installs npm packages, and how each one keeps the
private scope `@arkon-ai` on `npm.pkg.github.com`.

An install with no lock AND no scope pin (the old runtime stage) resolves @arkon-ai/* publicly; both defences stay required.
Until 2026-11-16 the runtime stage ran `npm install --no-save tsx pg web-push`
beside `package.json` with no lock and no `.npmrc`.

Two checks guard this table:

- `node scripts/check-npm-install-sites.mjs .` (T1, static; runs in CI in
  `.github/workflows/image-build.yml`). Exit 0 only when every row below holds.
- `node scripts/test-npm-scope-failclosed.mjs <repo> <empty-scratch-dir>` (T2).
  Run it only inside a network namespace with loopback alone (for example
  `bwrap --dev-bind / / --unshare-net --proc /proc ...`). It runs each site's npm
  command with only that site's files against a fake public registry on
  127.0.0.1, while `npm.pkg.github.com` cannot resolve. A row passes when npm
  FAILS and the fake public registry saw zero request naming `@arkon-ai`.

The scope pin is the committed `.npmrc`: the line
`@arkon-ai:registry=https://npm.pkg.github.com` and an auth line for that host
that reads the variable `ARKON_NPM_TOKEN` (a reference; the file holds no value).

## Sites

| Site (file:line) | Command | Lock | Scope pin | Token road | Fail-closed (T2 line) |
|---|---|---|---|---|---|
| Dockerfile:6 (stage `deps`) | `npm ci --omit=dev` | yes | `.npmrc` copied at :5 | BuildKit secret mount on that RUN only: `--mount=type=secret,id=arkon_npm_token,env=ARKON_NPM_TOKEN` | `SITE Dockerfile:6 stage=deps ... pub_arkon=0 ... -> FAILED-CLOSED` |
| Dockerfile:13 (stage `build`) | `npm ci` | yes | `.npmrc` copied at :12 | the same secret mount | `SITE Dockerfile:13 stage=build ... pub_arkon=0 ... -> FAILED-CLOSED` |
| Dockerfile:26 (stage `build`) | `node_modules/.bin/tsc ... scripts/migrate.ts` (compiles the migration runner) | n/a (no install) | n/a | none | no npm call |
| Dockerfile runtime stage (was :52) | none: zero registry install. `pg` and `web-push` come from `COPY --from=deps /app/node_modules ./node_modules` (:56) | n/a | no `.npmrc` in this stage | none | no site (T1: zero npm call in the runtime stage) |
| docker-entrypoint.sh:24 | `node scripts/migrate.js` (was `npx tsx scripts/migrate.ts`) | n/a | n/a | none | no npm or npx call at container start |
| .github/workflows/playwright.yml:27 (job `prod-sharp`) runs scripts/check-prod-sharp.sh:19 | `npm ci --omit=dev --no-audit --no-fund` | yes | the script copies the repo `.npmrc` (:17) | step env `ARKON_NPM_TOKEN` from the repo secret | `SITE scripts/check-prod-sharp.sh:19 ... pub_arkon=0 ... -> FAILED-CLOSED` |
| .github/workflows/playwright.yml:73 | `npm ci` | yes | the checked-out repo `.npmrc` | step env `ARKON_NPM_TOKEN` from the repo secret | `SITE .github/workflows/playwright.yml:73 ... pub_arkon=0 ... -> FAILED-CLOSED` |
| .github/workflows/migration-dryrun.yml:152 | `npm ci` | yes | the checked-out repo `.npmrc` | step env `ARKON_NPM_TOKEN` from the repo secret | `SITE .github/workflows/migration-dryrun.yml:152 ... pub_arkon=0 ... -> FAILED-CLOSED` |
| .github/workflows/image-build.yml:33-34 | `docker buildx build --secret id=arkon_npm_token,env=ARKON_NPM_TOKEN --target deps .` and `--target build .` (runs Dockerfile:6 and :13) | yes (Dockerfile) | yes (Dockerfile) | the env of that ONE step, `if:` true only for a push to master or a pull request from this repo; a fork pull request gets no token and skips the step | through the Dockerfile rows |
| docker-compose.yml:3 | `build: .` (runs the Dockerfile) | yes (Dockerfile) | yes (Dockerfile) | none wired: the secret mount gets no value, so the `@arkon-ai` fetch fails with no token (it never falls back to the public registry). A compose build needs a build `secrets:` entry first. | through the Dockerfile rows |

## The lock's @arkon-ai rows

| Lock entry | Version | resolved host | integrity | dev/prod |
|---|---|---|---|---|
| node_modules/@arkon-ai/ui | 0.3.0 | npm.pkg.github.com | sha512 (yes) | prod |

## Not install sites, noted

`npx tsx` runs in CI at .github/workflows/playwright.yml:78 and :81 and at
scripts/ci/migration-dryrun.sh:94 and :110. `tsx` is not in the lock, so npx
fetches it by name from the default registry. That is a public name, not
`@arkon-ai`. T1 prints these as NOTE lines. They do not fail it.
