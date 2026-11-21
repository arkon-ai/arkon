# npm install sites (transformate WI-4683)

Every place in this repo that installs npm packages, and how each one keeps the
private scope `@arkon-ai` on `npm.pkg.github.com`.

An install with no lock AND no scope pin (the old runtime stage) resolves `@arkon-ai/*` on the public registry, where anyone can publish that name (dependency confusion). The lock, the scope pin and the registry pin are separate defences, and each stays required. `scripts/check-npm-install-sites.mjs` enforces the supported forms named in its header and refuses every other form in the files it reads; it is not a proof that no install anywhere can reach the public registry.
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
| Dockerfile runtime stage (was :52) | none: zero registry install. `pg` and `web-push` come from `COPY --from=deps /app/node_modules ./node_modules` (:55) | n/a | no `.npmrc` in this stage | none | no site (T1: zero npm call in the runtime stage) |
| docker-entrypoint.sh:24 | `node scripts/migrate.js` (was `npx tsx scripts/migrate.ts`) | n/a | n/a | none | no npm or npx call at container start |
| .github/workflows/playwright.yml:27 (job `prod-sharp`) runs scripts/check-prod-sharp.sh:19 | `npm ci --omit=dev --no-audit --no-fund` | yes | the script copies the repo `.npmrc` (:17) | step env `ARKON_NPM_TOKEN` from the repo secret | `SITE scripts/check-prod-sharp.sh:19 ... pub_arkon=0 ... -> FAILED-CLOSED` |
| .github/workflows/playwright.yml:73 | `npm ci` | yes | the checked-out repo `.npmrc` | step env `ARKON_NPM_TOKEN` from the repo secret | `SITE .github/workflows/playwright.yml:73 ... pub_arkon=0 ... -> FAILED-CLOSED` |
| .github/workflows/migration-dryrun.yml:153 | `npm ci` | yes | the checked-out repo `.npmrc` | step env `ARKON_NPM_TOKEN` from the repo secret | `SITE .github/workflows/migration-dryrun.yml:153 ... pub_arkon=0 ... -> FAILED-CLOSED` |
| .github/workflows/image-build.yml:35-36 | `docker buildx build --secret id=arkon_npm_token,env=ARKON_NPM_TOKEN --target deps .` and `--target build .` (runs Dockerfile:6 and :13) | yes (Dockerfile) | yes (Dockerfile) | the env of that ONE step, `if:` true only for a push to master or a pull request from this repo; a fork pull request gets no token and skips the step | through the Dockerfile rows |
| docker-compose.yml:3 | `build: .` (runs the Dockerfile) | yes (Dockerfile) | yes (Dockerfile) | none wired: the secret mount gets no value, so the `@arkon-ai` fetch fails with no token (it never falls back to the public registry). A compose build needs a build `secrets:` entry first. | through the Dockerfile rows |

## The lock's @arkon-ai rows

| Lock entry | Version | resolved host | integrity | dev/prod |
|---|---|---|---|---|
| node_modules/@arkon-ai/ui | 0.3.0 | npm.pkg.github.com | sha512 (yes) | prod |

## Not install sites, noted

`npx tsx` runs in CI at .github/workflows/playwright.yml:78 and :81 and at
scripts/ci/migration-dryrun.sh:88 and :104. `tsx` is not in the lock, so npx
fetches it by name from the default registry. That is a public name, not
`@arkon-ai`. T1 prints these as NOTE lines. They do not fail it.

## What T1 reads, and what it refuses (transformate WI-4821)

T1 runs in two stages. Stage 1 reads the bytes of each file as written and
decides, before any install matching, whether each unit is in the supported
forms. Stage 2 runs the rows above, and only on the supported units. A unit
outside the supported forms gets one row,
`UNSUPPORTED <file>:<line> FAIL: <kind> at :<line>`, and T1 fails. That row
never claims that an install runs. The fix is to write the unit plainly.

- The units: `docker-entrypoint.sh` and every `scripts/**/*.sh` or `*.bash`
  (one file each); each step's `run:` in `.github/workflows/*.yml|*.yaml` and
  in `.github/actions/<name>/action.yml|action.yaml`; each `RUN` of the root
  `Dockerfile`; each `scripts` value of the root `package.json`.
- The supported shell forms, one line at a time: no CR or other control byte;
  outside quotes no `#` (except as a line's first non-blank byte), no `\`, no
  backtick, no non-ASCII byte and no `<<`; each quote opens and closes on one
  line, at a word's edges; inside `"..."` no backtick, no `$(`, no escaping
  `\` and no `'` inside `${...}`; no `${{` in a `run:` value. On a line with
  `npm`, `npx`, `pnpm`, `yarn` or `corepack`: the plain lower-case word where
  the check's reader finds it, its sub-command one plain word, and no `${`
  or `$(` on the line.
- The supported YAML: block style under `jobs:` (and `runs:` in an action);
  no anchor, alias, tag or merge key; a `run:` value plain on one line or a
  `|` or `|-` block; `shell:` absent, `bash` or `sh`.
- The supported Dockerfile: no parser directive, `SHELL`, `ONBUILD` or
  exec-form `RUN`; no package-manager word in `CMD`, `ENTRYPOINT` or
  `HEALTHCHECK`.
- A build-shaped file outside these units and outside the exclusions below
  (a `*.sh` elsewhere, `Dockerfile.*`, `Containerfile`, another compose file,
  any other YAML under `.github/`, an `action.yml` elsewhere, or a
  `uses: ./<path>` that names no action file) fails as `UNLISTED`.

### Named exclusions (T1 does not read these)

- `lefthook.yml` and `.lefthook/**`: developer-machine git hooks, not CI and
  not the image (`lefthook.yml` runs `npx tsc --noEmit` on a developer's
  machine).
- `docker-compose.yml`: the self-host runtime of the built image. It holds no
  package-manager word, and a T1 CHECK row fails if one appears.
- `.github/ISSUE_TEMPLATE/**` and `.github/dependabot.yml`: never executed.
- Program files (`*.mjs`, `*.js`, `*.ts`, `*.py` and their kin): a program
  that spawns a package manager is an indirect form, not guaranteed below.
- `INSTALL.md` and `docs/**`: text a human reads.

### Not guaranteed

T1 enforces the supported forms. It does not promise to find every possible
install. It does not see:

- a command name built at run time (from a variable, a `$(...)` result,
  `eval`, or an `sh -c` argument held in a variable);
- a program file that spawns a package manager;
- a third-party action's insides (a remote `uses:`, pinned by SHA where
  `image-build.yml` says so);
- a command name made by glob or brace expansion (`/usr/bin/np[m]`);
- a package manager outside the words above (`bun`, `bunx`, `deno`);
- everything in the named exclusions.

T1 is a lint against honest mistakes by this repo's own authors, not a
sandbox against an attacker. Its cases run in CI:
`node --test scripts/test/check-npm-install-sites.test.mjs`
(`.github/workflows/image-build.yml`, the step after T1).
