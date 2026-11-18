// scripts/test/check-npm-install-sites.test.mjs: node:test cases of the npm install site check
// (transformate WI-4774). Zero dependency: node built-ins only. Run: node --test scripts/test/
//
// Each case builds its own fixture root at run time under a fresh dir of os.tmpdir(), runs
// `node scripts/check-npm-install-sites.mjs <that root>` and asserts the exit code and the
// FAIL line naming its row. Every fixture is synthetic: no real package, person or token.
// The fixtures live only in this file, so the check never reads them as sites of this repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe } from "node:test";

const CHECK = resolve(dirname(fileURLToPath(import.meta.url)), "..", "check-npm-install-sites.mjs");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const MOUNT = "--mount=type=secret,id=arkon_npm_token,env=ARKON_NPM_TOKEN";

const dockerfile = (extra = []) => [
  "# QZX4774MARK synthetic fixture",
  "FROM node:20-alpine AS deps",
  "WORKDIR /app",
  "COPY package.json package-lock.json .npmrc ./",
  `RUN ${MOUNT} npm ci --omit=dev`,
  ...extra,
  "FROM node:20-alpine AS runtime",
  "WORKDIR /app",
  "COPY --from=deps /app/node_modules ./node_modules",
  "",
].join("\n");

// the safe PR image job, in the form the check models
const IMAGE_BUILD = `# QZX4774MARK synthetic fixture
name: image-build
on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
permissions:
  contents: read
jobs:
  image-stages:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${SHA}
      - name: Check every npm install site
        run: node scripts/check-npm-install-sites.mjs .
      - name: Fork pull request, no registry token
        if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name != github.repository
        run: echo "fork, the token stage is skipped"
      - name: Build the deps stage
        if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository
        env:
          ARKON_NPM_TOKEN: \${{ secrets.ARKON_NPM_TOKEN }}
        run: |
          docker buildx build --secret id=arkon_npm_token,env=ARKON_NPM_TOKEN --target deps .
`;

const BASE = {
  "package.json": JSON.stringify({ name: "qzx4774mark-fixture", version: "0.0.0", private: true, description: "QZX4774MARK synthetic fixture" }, null, 2) + "\n",
  "package-lock.json": JSON.stringify({ name: "qzx4774mark-fixture", version: "0.0.0", lockfileVersion: 3, requires: true, packages: { "": { name: "qzx4774mark-fixture", version: "0.0.0" } } }, null, 2) + "\n",
  ".npmrc": "# QZX4774MARK synthetic fixture\n@arkon-ai:registry=https://npm.pkg.github.com\n",
  "Dockerfile": dockerfile(),
  ".github/workflows/image-build.yml": IMAGE_BUILD,
};

// a workflow with one job; `steps` are the step lines, indented by 6
const workflow = (steps, { top = [], job = [] } = {}) => [
  "# QZX4774MARK synthetic fixture",
  "name: fixture",
  "on:",
  "  pull_request:",
  ...top,
  "jobs:",
  "  test:",
  "    runs-on: ubuntu-latest",
  ...job,
  "    steps:",
  `      - uses: actions/checkout@${SHA}`,
  ...steps,
  "",
].join("\n");

function run(files) {
  const root = mkdtempSync(join(tmpdir(), "wi4774-check-"));
  for (const [rel, text] of Object.entries({ ...BASE, ...files })) {
    if (text === null) continue;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  const r = spawnSync(process.execPath, [CHECK, root], { encoding: "utf8" });
  const out = r.stdout || "";
  // only verdict lines go into an assert message: never a whole fixture
  const brief = out.split("\n").filter((l) => / FAIL|^T1 RESULT/.test(l)).join("\n") + (r.stderr ? `\nstderr bytes ${r.stderr.length}` : "");
  return { rc: r.status, out, brief };
}
const failLine = (out, re) => out.split("\n").some((l) => /^(SITE|CHECK) .* FAIL: /.test(l) && re.test(l));
function expectFail(files, re) {
  const r = run(files);
  assert.equal(r.rc, 1, `want rc 1, got ${r.rc}\n${r.brief}`);
  assert.ok(failLine(r.out, re), `no FAIL line matching ${re}\n${r.brief}`);
  return r;
}
function expectPass(files) {
  const r = run(files);
  assert.equal(r.rc, 0, `want rc 0, got ${r.rc}\n${r.brief}`);
  assert.match(r.out, /^T1 RESULT: PASS /m);
  return r;
}

test("CONTROL-OK: one safe site in each modelled form reads OK", () => {
  const r = expectPass({
    ".github/workflows/ci.yml": workflow([
      "      - run: npm ci",
      "      - name: block form",
      "        run: |",
      "          npm ci",
      "          npm test",
    ]),
    "scripts/ci.sh": "#!/bin/sh\n# QZX4774MARK synthetic fixture\nnpm ci\n",
  });
  assert.match(r.out, /^SITE Dockerfile:5 OK: /m);
  assert.match(r.out, /^SITE \.github\/workflows\/ci\.yml:\d+ OK: /m);
  assert.match(r.out, /^SITE scripts\/ci\.sh:3 OK: /m);
});

test("F1 YAML anchor: an anchored run block FAILs", () => {
  expectFail({
    ".github/workflows/f1.yml": workflow([
      "      - name: anchored",
      "        run: &install |",
      "          npm install qzx4774mark-pkg",
    ]),
  }, /^CHECK \.github\/workflows\/f1\.yml:11 .*F1 YAML anchor/);
});

test("F2 YAML alias or merge key: a run by alias FAILs", () => {
  expectFail({
    ".github/workflows/f2.yml": workflow([
      "      - name: &cmd npm install qzx4774mark-pkg",
      "        run: echo first",
      "      - run: *cmd",
    ]),
  }, /^CHECK \.github\/workflows\/f2\.yml:12 .*F2 YAML alias or merge key/);
});

test("F3 workflow env: the registry token in a workflow-level env FAILs", () => {
  expectFail({
    ".github/workflows/f3.yml": workflow(["      - run: npm ci"], {
      top: ["env:", "  ARKON_NPM_TOKEN: ${{ secrets.ARKON_NPM_TOKEN }}"],
    }),
  }, /^CHECK \.github\/workflows\/f3\.yml:\d+ .*F3 workflow env/);
});

test("F3 SAFE twin: a plain workflow-level env reads OK", () => {
  expectPass({
    ".github/workflows/f3.yml": workflow(["      - run: npm ci"], { top: ["env:", "  QZX_LEVEL: plain"] }),
  });
});

test("F4 job env: the registry token in a job-level env FAILs", () => {
  expectFail({
    ".github/workflows/f4.yml": workflow(["      - run: npm ci"], {
      job: ["    env:", "      ARKON_NPM_TOKEN: ${{ secrets.ARKON_NPM_TOKEN }}"],
    }),
  }, /^CHECK \.github\/workflows\/f4\.yml:\d+ .*F4 job env/);
});

test("F4 SAFE twin: a plain job-level env reads OK", () => {
  expectPass({
    ".github/workflows/f4.yml": workflow(["      - run: npm ci"], {
      job: ["    env:", "      PG_BASE_URL: postgresql://127.0.0.1:5432"],
    }),
  });
});

test("F5 multi-line flow scalar: a run split over two lines FAILs", () => {
  expectFail({
    ".github/workflows/f5.yml": workflow([
      "      - name: folded",
      "        run: npm",
      "          install qzx4774mark-pkg",
    ]),
  }, /^CHECK \.github\/workflows\/f5\.yml:12 .*F5 multi-line flow scalar/);
});

test("F6 exec-form JSON RUN: npm install in exec form FAILs", () => {
  expectFail({ Dockerfile: dockerfile(['RUN ["npm", "install", "qzx4774mark-pkg"]']) },
    /^SITE Dockerfile:6 FAIL: .*F6 exec-form JSON RUN/);
});

test("F6 SAFE twin: an exec-form RUN with no npm reads OK", () => {
  expectPass({ Dockerfile: dockerfile(['RUN ["node", "--version"]']) });
});

test("F7 RUN heredoc: npm install in a RUN heredoc FAILs", () => {
  expectFail({ Dockerfile: dockerfile(["RUN <<EOF", "npm install qzx4774mark-pkg", "EOF"]) },
    /^SITE Dockerfile:6 FAIL: .*F7 RUN heredoc/);
});

test("F7 SAFE twin: a RUN heredoc with no npm reads OK", () => {
  expectPass({ Dockerfile: dockerfile(["RUN <<EOF", "echo built", "EOF"]) });
});

test("F8 npm by path: /usr/local/bin/npm install FAILs", () => {
  expectFail({ Dockerfile: dockerfile(["RUN /usr/local/bin/npm install qzx4774mark-pkg"]) },
    /^SITE Dockerfile:6 FAIL: .*F8 npm by path/);
});

test("F8 SAFE twin: npm ci by path in a workflow reads OK", () => {
  expectPass({ ".github/workflows/f8.yml": workflow(["      - run: ./node_modules/.bin/npm ci"]) });
});

test("UNREADABLE: an unclosed flow collection FAILs", () => {
  expectFail({
    ".github/workflows/u.yml": workflow([
      "      - name: flow",
      "        with: [{run: npm install qzx4774mark-pkg,",
      "          name: unclosed}]",
    ]),
  }, /^CHECK \.github\/workflows\/u\.yml:11 .*UNREADABLE/);
});

test("UNREADABLE: a tab-indented line FAILs", () => {
  expectFail({
    ".github/workflows/t.yml": workflow(["      - name: tab", "\t\trun: npm install qzx4774mark-pkg"]),
  }, /^CHECK \.github\/workflows\/t\.yml:11 .*UNREADABLE/);
});

// ---------- F1 fix round (transformate WI-4774, the U1 review pair's findings) ----------
// Each case is one finding of the two reads: Opus M1, m1 to m6; OpenAI R1 (= m3), R2.
// A PIN case already holds at 98c4c8a7 and pins it against a mutant; every other case is
// RED there by its own assert. A SAFE twin asserts rc 0 AND the row the check prints for it.
describe("F1 fix round", () => {
  const P = "qzx4774mark-pkg";
  const rows = (r, re) => r.out.split("\n").filter((l) => re.test(l));
  const hasRow = (r, re) => assert.ok(rows(r, re).length > 0, `no row matching ${re}\n${r.brief}`);
  const noRow = (r, re) => assert.equal(rows(r, re).length, 0, `a row matching ${re}\n${r.brief}`);
  // the base Dockerfile with lines appended to its runtime stage (line 9 on)
  const dockerRt = (extra = []) => [
    "# QZX4774MARK synthetic fixture",
    "FROM node:20-alpine AS deps",
    "WORKDIR /app",
    "COPY package.json package-lock.json .npmrc ./",
    `RUN ${MOUNT} npm ci --omit=dev`,
    "FROM node:20-alpine AS runtime",
    "WORKDIR /app",
    "COPY --from=deps /app/node_modules ./node_modules",
    ...extra,
    "",
  ].join("\n");
  const sh = (lines) => ["#!/bin/sh", "# QZX4774MARK synthetic fixture", ...lines, ""].join("\n");
  // the two FAIL rows THE BASE dbeceb8e prints on the D08 root (Opus M1)
  const D08_ROWS = [
    "CHECK Dockerfile:11 FAIL: ARG names a token (ARG NPM_TOKEN): a token in a build arg or env lands in the image history",
    "CHECK Dockerfile:10 FAIL: stage runtime (runtime) copies .npmrc",
  ];
  const d08 = (opener) => ({ Dockerfile: dockerRt([opener, "COPY .npmrc ./", "ARG NPM_TOKEN", "RUN cat <<EOF", "built", "EOF"]) });

  // X-M1 (Opus M1): a heredoc opens only on an unquoted shell word '<<WORD', as BuildKit splits words
  test('M1-a D08: a double-quoted "<<EOF" opens no heredoc; both base FAIL rows stay', () => {
    const r = expectFail(d08('RUN echo "<<EOF"'), /^CHECK Dockerfile:11 FAIL: ARG names a token/);
    assert.deepEqual(rows(r, / FAIL: /), D08_ROWS);
  });
  test("M1-b D08: a single-quoted '<<EOF' opens no heredoc; both base FAIL rows stay", () => {
    const r = expectFail(d08("RUN echo '<<EOF'"), /^CHECK Dockerfile:11 FAIL: ARG names a token/);
    assert.deepEqual(rows(r, / FAIL: /), D08_ROWS);
  });
  test("M1-c D08c: a quoted <<EOF before FROM: the runtime stage keeps its own FAIL row", () => {
    const r = expectFail({ Dockerfile: [
      "# QZX4774MARK synthetic fixture",
      "FROM node:20-alpine AS deps",
      "WORKDIR /app",
      "COPY package.json package-lock.json .npmrc ./",
      `RUN ${MOUNT} npm ci --omit=dev`,
      'RUN echo "<<EOF"',
      "FROM node:20-alpine AS runtime",
      "WORKDIR /app",
      `RUN npm install ${P}`,
      "RUN cat <<EOF",
      "built",
      "EOF",
      "",
    ].join("\n") }, /^SITE Dockerfile:9 FAIL: stage=runtime "npm install qzx4774mark-pkg": a registry install in the runtime stage/);
    noRow(r, /^SITE Dockerfile:6 /);
    hasRow(r, /^SITE Dockerfile:5 OK: /);
  });
  test("M1-d PIN D08b: the same root with no quoted opener keeps both base FAIL rows", () => {
    const r = expectFail({ Dockerfile: dockerRt(["COPY .npmrc ./", "ARG NPM_TOKEN", "RUN cat <<EOF", "built", "EOF"]) }, /^CHECK Dockerfile:10 FAIL: ARG names a token/);
    assert.deepEqual(rows(r, / FAIL: /), [
      "CHECK Dockerfile:10 FAIL: ARG names a token (ARG NPM_TOKEN): a token in a build arg or env lands in the image history",
      "CHECK Dockerfile:9 FAIL: stage runtime (runtime) copies .npmrc",
    ]);
  });
  test("M1-e a <<EOF after a shell comment opens nothing: both base FAIL rows stay, the comment opener FAILs closed", () => {
    const r = expectFail(d08("RUN echo hi # <<EOF"), /^CHECK Dockerfile:9 FAIL: F7 RUN heredoc: .*comment/);
    for (const want of D08_ROWS) assert.ok(rows(r, / FAIL: /).includes(want), `lost base row: ${want}\n${r.brief}`);
  });
  test("M1-f PIN: a quoted word before a real <<EOF on the same RUN still opens the heredoc", () => {
    expectFail({ Dockerfile: dockerfile(['RUN echo "start" && sh <<EOF', `npm install ${P}`, "EOF"]) },
      /^SITE Dockerfile:6 FAIL: .*F7 RUN heredoc/);
  });
  test("M1-g PIN: a quoted delimiter word <<'EOF' opens a heredoc", () => {
    expectFail({ Dockerfile: dockerfile(["RUN <<'EOF'", `npm install ${P}`, "EOF"]) },
      /^SITE Dockerfile:6 FAIL: .*F7 RUN heredoc/);
  });
  test("M1-h: a '<<EOF' glued inside a word (cat<<EOF) is no BuildKit heredoc word: it FAILs closed", () => {
    expectFail({ Dockerfile: dockerfile(["RUN cat<<EOF", `npm install ${P}`, "EOF"]) },
      /^CHECK Dockerfile:6 FAIL: F7 RUN heredoc: a '<<' in the word 'cat<<EOF'/);
  });

  // X-m1 (Opus m1): npx (or any tool) whose word is itself npm/npx/yarn/pnpm is scanned again from that word
  test("m1-a: /usr/bin/npx npm install FAILs with the row THE BASE prints", () => {
    expectFail({ ".github/workflows/m1.yml": workflow([`      - run: /usr/bin/npx npm install ${P}`]) },
      /^SITE \.github\/workflows\/m1\.yml:10 FAIL: "\/usr\/bin\/npx npm install qzx4774mark-pkg": 'npm install' can fetch a package by name \(not from the lock\)$/);
  });
  test("m1-b: npx npm install FAILs", () => {
    expectFail({ ".github/workflows/m1.yml": workflow([`      - run: npx npm install ${P}`]) },
      /^SITE \.github\/workflows\/m1\.yml:10 FAIL: .*'npm install' can fetch a package by name/);
  });
  test("m1 SAFE twin: npx of a tool reads as its NOTE, no SITE", () => {
    const r = expectPass({ ".github/workflows/m1.yml": workflow(["      - run: npx qzx4774mark-tool --help"]) });
    hasRow(r, /^NOTE \.github\/workflows\/m1\.yml:10: "npx qzx4774mark-tool --help": npx qzx4774mark-tool is NOT in the lock/);
    noRow(r, /^SITE \.github\/workflows\/m1\.yml/);
  });

  // X-m2 (Opus m2): a merge key written '<< :' is F2 like '<<:'
  test("m2-a Y03b: a step env merged by '<< :' holding the token FAILs as F2", () => {
    expectFail({ ".github/workflows/m2.yml": workflow(["      - run: npm ci", "        env:", "          << :", "            ARKON_NPM_TOKEN: ${{ secrets.ARKON_NPM_TOKEN }}"]) },
      /^CHECK \.github\/workflows\/m2\.yml:12 yaml FAIL: F2 YAML alias or merge key: a merge key/);
  });
  test("m2-b: a job env merged by '<< : *x' names the merge key as F2", () => {
    expectFail({ ".github/workflows/m2.yml": workflow(["      - run: npm ci"], { job: ["    env:", "      << : *x"] }) },
      /^CHECK \.github\/workflows\/m2\.yml:9 yaml FAIL: F2 YAML alias or merge key: a merge key/);
  });

  // X-m3 (Opus m3 = OpenAI R1): a folded block scalar is read as YAML folds it
  test("m3-a Y04: run: > over 'npm' / 'install <pkg>' FAILs at the run's first line", () => {
    expectFail({ ".github/workflows/m3.yml": workflow(["      - run: >", "          npm", `          install ${P}`]) },
      /^SITE \.github\/workflows\/m3\.yml:11 FAIL: "npm install qzx4774mark-pkg": 'npm install' can fetch/);
  });
  test("m3-b Y04b (OpenAI R1): run: >- over 'npm' / 'install <pkg>' FAILs at the run's first line", () => {
    expectFail({ ".github/workflows/m3.yml": workflow(["      - run: >-", "          npm", `          install ${P}`]) },
      /^SITE \.github\/workflows\/m3\.yml:11 FAIL: "npm install qzx4774mark-pkg": 'npm install' can fetch/);
  });
  test("m3-c PIN: the folded direct control (the whole command on one line) FAILs", () => {
    expectFail({ ".github/workflows/m3.yml": workflow(["      - run: >-", `          npm install ${P}`]) },
      /^SITE \.github\/workflows\/m3\.yml:11 FAIL: /);
  });
  test("m3-d: a more-indented line of a folded scalar keeps its newline; the line after it is folded alone", () => {
    expectFail({ ".github/workflows/m3.yml": workflow(["      - run: >", "          echo start", "            ls", "          npm", `          install ${P}`]) },
      /^SITE \.github\/workflows\/m3\.yml:13 FAIL: "npm install qzx4774mark-pkg"/);
  });
  test("m3 SAFE twin: a folded echo reads no SITE", () => {
    const r = expectPass({ ".github/workflows/m3.yml": workflow(["      - run: >", "          echo", "          built"]) });
    noRow(r, /^SITE \.github\/workflows\/m3\.yml/);
  });
  test("m3 SAFE twin: a folded 'npm' / 'ci' prints its SITE OK row", () => {
    const r = expectPass({ ".github/workflows/m3.yml": workflow(["      - run: >", "          npm", "          ci"]) });
    hasRow(r, /^SITE \.github\/workflows\/m3\.yml:11 OK: "npm ci": npm ci from the lock/);
  });

  // X-m4 (Opus m4): a quote or a backtick is a left boundary; a quoted YAML scalar is matched unquoted
  const unquotedRow = /^SITE \.github\/workflows\/m4\.yml:10 FAIL: "npm install qzx4774mark-pkg": 'npm install' can fetch a package by name \(not from the lock\)$/;
  test('m4-a Y06: run: "npm install <pkg>" FAILs with the unquoted row', () => {
    expectFail({ ".github/workflows/m4.yml": workflow([`      - run: "npm install ${P}"`]) }, unquotedRow);
  });
  test("m4-b Y07: run: 'npm install <pkg>' FAILs with the unquoted row", () => {
    expectFail({ ".github/workflows/m4.yml": workflow([`      - run: 'npm install ${P}'`]) }, unquotedRow);
  });
  test('m4-c D04: RUN sh -c "npm install <pkg>" FAILs', () => {
    expectFail({ Dockerfile: dockerfile([`RUN sh -c "npm install ${P}"`]) },
      /^SITE Dockerfile:6 FAIL: stage=deps .*'npm install' can fetch a package by name/);
  });
  test('m4-d S02: sh -c "npm install <pkg>" in scripts/*.sh FAILs', () => {
    expectFail({ "scripts/m4.sh": sh([`sh -c "npm install ${P}"`]) },
      /^SITE scripts\/m4\.sh:3 FAIL: .*'npm install' can fetch a package by name/);
  });
  test("m4-e: a backtick command substitution holding npm install FAILs", () => {
    expectFail({ ".github/workflows/m4.yml": workflow([`      - run: echo \`npm install ${P}\``]) },
      /^SITE \.github\/workflows\/m4\.yml:10 FAIL: .*'npm install' can fetch/);
  });
  test('m4 SAFE twin: echo "npm is a tool" reads no SITE', () => {
    const r = expectPass({ ".github/workflows/m4.yml": workflow(['      - run: echo "npm is a tool"']) });
    noRow(r, /^SITE \.github\/workflows\/m4\.yml/);
  });

  // X-m5 (Opus m5): the open forms, one case each
  test("m5-a Y05: a line continuation splitting npm and install in a run block FAILs", () => {
    expectFail({ ".github/workflows/m5.yml": workflow(["      - run: |", "          npm \\", `            install ${P}`]) },
      /^SITE \.github\/workflows\/m5\.yml:11 FAIL: .*'npm install' can fetch/);
  });
  test("m5-a S01: a line continuation splitting npm and install in scripts/*.sh FAILs", () => {
    expectFail({ "scripts/m5.sh": sh(["npm \\", `  install ${P}`]) },
      /^SITE scripts\/m5\.sh:3 FAIL: .*'npm install' can fetch/);
  });
  test("m5-b Y19: npm --prefix /app install in a workflow FAILs", () => {
    expectFail({ ".github/workflows/m5.yml": workflow([`      - run: npm --prefix /app install ${P}`]) },
      /^SITE \.github\/workflows\/m5\.yml:10 FAIL: .*'npm install' can fetch/);
  });
  test("m5-b D12: npm --prefix /app install in a RUN FAILs", () => {
    expectFail({ Dockerfile: dockerfile([`RUN npm --prefix /app install ${P}`]) },
      /^SITE Dockerfile:6 FAIL: .*'npm install' can fetch/);
  });
  test("m5-c Y13: $(which npm) install in a workflow FAILs", () => {
    expectFail({ ".github/workflows/m5.yml": workflow([`      - run: $(which npm) install ${P}`]) },
      /^SITE \.github\/workflows\/m5\.yml:10 FAIL: .*'npm install' can fetch/);
  });
  test("m5-c D05: $(which npm) install in a RUN FAILs", () => {
    expectFail({ Dockerfile: dockerfile([`RUN $(which npm) install ${P}`]) },
      /^SITE Dockerfile:6 FAIL: .*'npm install' can fetch/);
  });
  test("m5-d Y14: $NPM_BIN install in a workflow FAILs closed as UNREADABLE", () => {
    expectFail({ ".github/workflows/m5.yml": workflow(["      - env:", "          NPM_BIN: npm", `        run: $NPM_BIN install ${P}`]) },
      /^SITE \.github\/workflows\/m5\.yml:12 FAIL: .*UNREADABLE/);
  });
  test("m5-d D06: ENV NPM_BIN=npm then RUN $NPM_BIN install FAILs closed as UNREADABLE", () => {
    expectFail({ Dockerfile: dockerfile(["ENV NPM_BIN=npm", `RUN $NPM_BIN install ${P}`]) },
      /^SITE Dockerfile:7 FAIL: .*UNREADABLE/);
  });
  test("m5-d: RUN ${NPM} ci FAILs closed as UNREADABLE", () => {
    expectFail({ Dockerfile: dockerfile(["RUN ${NPM} ci"]) }, /^SITE Dockerfile:6 FAIL: .*UNREADABLE/);
  });
  test("m5-d SAFE twin: $PY install (a name with no npm or npx) reads no SITE", () => {
    const r = expectPass({ ".github/workflows/m5.yml": workflow(["      - run: $PY install qzx4774mark-x"]) });
    noRow(r, /^SITE \.github\/workflows\/m5\.yml/);
  });
  const escapeDf = (esc, extra) => [
    `# escape=${esc}`,
    "# QZX4774MARK synthetic fixture",
    "FROM node:20-alpine AS deps",
    "WORKDIR /app",
    "COPY package.json package-lock.json .npmrc ./",
    `RUN ${MOUNT} npm ci --omit=dev`,
    ...extra,
    "FROM node:20-alpine AS runtime",
    "WORKDIR /app",
    "COPY --from=deps /app/node_modules ./node_modules",
    "",
  ].join("\n");
  test("m5-e D09: a '# escape=`' parser directive FAILs closed naming the directive", () => {
    expectFail({ Dockerfile: escapeDf("`", ["RUN npm `", `    install ${P}`]) }, /^CHECK Dockerfile:1 FAIL: .*# escape=/);
  });
  test("m5-e SAFE twin: '# escape=\\' (the backslash) reads OK with its SITE row", () => {
    const r = expectPass({ Dockerfile: escapeDf("\\", []) });
    hasRow(r, /^SITE Dockerfile:6 OK: /);
  });
  test("m5-f D10: CMD exec form holding npm install FAILs", () => {
    expectFail({ Dockerfile: dockerRt([`CMD ["npm", "install", "${P}"]`]) }, /^SITE Dockerfile:9 FAIL: .*CMD/);
  });
  test("m5-f: CMD shell form holding npm install FAILs", () => {
    expectFail({ Dockerfile: dockerRt([`CMD npm install ${P}`]) }, /^SITE Dockerfile:9 FAIL: .*CMD/);
  });
  test("m5-f: ENTRYPOINT exec form holding npx FAILs", () => {
    expectFail({ Dockerfile: dockerRt([`ENTRYPOINT ["npx", "${P}"]`]) }, /^SITE Dockerfile:9 FAIL: .*ENTRYPOINT/);
  });
  test("m5-f SAFE twin: CMD [node, server.js] reads no SITE", () => {
    const r = expectPass({ Dockerfile: dockerRt(['CMD ["node", "server.js"]']) });
    noRow(r, /^SITE Dockerfile:9 /);
  });
  const action = (run) => [
    "# QZX4774MARK synthetic fixture",
    "name: a",
    "description: QZX4774MARK synthetic composite action",
    "runs:",
    "  using: composite",
    "  steps:",
    `    - run: ${run}`,
    "      shell: bash",
    "",
  ].join("\n");
  test("m5-g Y21: a composite action's run: npm install FAILs", () => {
    expectFail({ ".github/actions/a/action.yml": action(`npm install ${P}`) },
      /^SITE \.github\/actions\/a\/action\.yml:7 FAIL: .*'npm install' can fetch/);
  });
  test("m5-g SAFE twin: a composite action's run: npm ci prints its SITE OK row", () => {
    const r = expectPass({ ".github/actions/a/action.yml": action("npm ci") });
    hasRow(r, /^SITE \.github\/actions\/a\/action\.yml:7 OK: "npm ci"/);
  });
  test("m5-h Y11: the token in jobs.<id>.container.env FAILs as F4", () => {
    expectFail({ ".github/workflows/m5.yml": workflow(["      - run: npm ci"], { job: ["    container:", "      image: node:20-alpine", "      env:", "        ARKON_NPM_TOKEN: ${{ secrets.ARKON_NPM_TOKEN }}"] }) },
      /^CHECK \.github\/workflows\/m5\.yml:10 F4 FAIL: F4 job env .*ARKON_NPM_TOKEN takes a secrets/);
  });
  test("m5-h SAFE twin: a plain container env reads OK with the run's SITE row", () => {
    const r = expectPass({ ".github/workflows/m5.yml": workflow(["      - run: npm ci"], { job: ["    container:", "      image: node:20-alpine", "      env:", "        QZX_LEVEL: plain"] }) });
    hasRow(r, /^SITE \.github\/workflows\/m5\.yml:14 OK: "npm ci"/);
  });

  // X-m6 (Opus m6): one PIN per sub-rule the U1 cases did not pin (the D08 root is M1-a)
  test("m6 PIN: a merge key '<<:' FAILs as F2", () => {
    expectFail({ ".github/workflows/m6.yml": workflow(["      - run: npm ci", "        env:", "          <<:", "            QZX_LEVEL: plain"]) },
      /^CHECK \.github\/workflows\/m6\.yml:12 yaml FAIL: F2 YAML alias or merge key: a merge key/);
  });
  test("m6 PIN: a tag on a run FAILs as UNREADABLE", () => {
    expectFail({ ".github/workflows/m6.yml": workflow(["      - run: !!str echo built"]) },
      /^CHECK \.github\/workflows\/m6\.yml:10 yaml FAIL: UNREADABLE: a tag/);
  });
  test("m6 PIN: a job env row named for npm FAILs as F4", () => {
    expectFail({ ".github/workflows/m6.yml": workflow(["      - run: npm ci"], { job: ["    env:", "      NODE_AUTH_TOKEN: plain"] }) },
      /^CHECK \.github\/workflows\/m6\.yml:8 F4 FAIL: .*NODE_AUTH_TOKEN is a name npm reads/);
  });
  test("m6 PIN: a COPY heredoc FAILs as F7", () => {
    expectFail({ Dockerfile: dockerfile(["COPY <<EOF /app/qzx4774mark.txt", "built", "EOF"]) },
      /^CHECK Dockerfile:6 FAIL: F7 RUN heredoc: a heredoc on COPY/);
  });
  test("m6 PIN: an unterminated heredoc FAILs as F7", () => {
    expectFail({ Dockerfile: dockerRt(["RUN cat <<EOF", "built"]) },
      /^CHECK Dockerfile:9 FAIL: F7 RUN heredoc: a heredoc with no end line/);
  });
  test("m6 PIN: npm-cli.js by path FAILs as F8", () => {
    expectFail({ Dockerfile: dockerfile([`RUN node /usr/local/lib/node_modules/npm/bin/npm-cli.js install ${P}`]) },
      /^SITE Dockerfile:6 FAIL: .*npm-cli\.js install \(F8 npm by path\)/);
  });
  test("m6 PIN: /run/secrets in an exec-form RUN FAILs", () => {
    expectFail({ Dockerfile: dockerfile(['RUN ["sh", "-c", "cat /run/secrets/qzx4774mark"]']) },
      /^CHECK Dockerfile:6 FAIL: a RUN reads \/run\/secrets/);
  });
  test("m6 PIN: /run/secrets in a heredoc RUN FAILs", () => {
    expectFail({ Dockerfile: dockerfile(["RUN <<EOF", "cat /run/secrets/qzx4774mark", "EOF"]) },
      /^CHECK Dockerfile:6 FAIL: a RUN reads \/run\/secrets/);
  });
  test("m6 PIN: an anchor in a flow sequence FAILs as F1", () => {
    expectFail({ ".github/workflows/m6.yml": workflow(["      - run: echo built", "        with: [a, &q b]"]) },
      /^CHECK \.github\/workflows\/m6\.yml:11 yaml FAIL: F1 YAML anchor: an anchor '&q' in a flow sequence/);
  });
  test("m6 PIN: a workflow env that is no block map FAILs as F3", () => {
    expectFail({ ".github/workflows/m6.yml": workflow(["      - run: npm ci"], { top: ["env: ${{ fromJSON(vars.QZX) }}"] }) },
      /^CHECK \.github\/workflows\/m6\.yml:5 F3 FAIL: .*not a block map/);
  });
  test("m6 PIN: a job env row that is no one NAME: value FAILs as F4", () => {
    expectFail({ ".github/workflows/m6.yml": workflow(["      - run: npm ci"], { job: ["    env:", "      QZX_A:", "        QZX_B: plain"] }) },
      /^CHECK \.github\/workflows\/m6\.yml:8 F4 FAIL: .*the row at :9 is not one NAME: value/);
  });
  test("m6 PIN: a YAML directive FAILs as UNREADABLE", () => {
    expectFail({ ".github/workflows/m6.yml": "%YAML 1.2\n" + workflow(["      - run: npm ci"]) },
      /^CHECK \.github\/workflows\/m6\.yml:1 yaml FAIL: UNREADABLE: a directive/);
  });
  test("m6 PIN: a block scalar header it does not read FAILs as UNREADABLE", () => {
    expectFail({ ".github/workflows/m6.yml": workflow(["      - run: |2", "          echo built"]) },
      /^CHECK \.github\/workflows\/m6\.yml:10 yaml FAIL: UNREADABLE: a block scalar header/);
  });
  test("m6 PIN: a second document FAILs as UNREADABLE", () => {
    expectFail({ ".github/workflows/m6.yml": workflow(["      - run: npm ci"]) + "---\nname: second\n" },
      /^CHECK \.github\/workflows\/m6\.yml:11 yaml FAIL: UNREADABLE: a second document/);
  });

  // X-R2 (OpenAI R2): a quoted literal executable path is npm by path (F8)
  test('R2-a: RUN "/usr/bin/npm" install FAILs as F8', () => {
    expectFail({ Dockerfile: dockerfile([`RUN "/usr/bin/npm" install ${P}`]) },
      /^SITE Dockerfile:6 FAIL: .*'\/usr\/bin\/npm install \(F8 npm by path\)' can fetch/);
  });
  test("R2-a: RUN '/usr/bin/npm' install FAILs as F8", () => {
    expectFail({ Dockerfile: dockerfile([`RUN '/usr/bin/npm' install ${P}`]) },
      /^SITE Dockerfile:6 FAIL: .*'\/usr\/bin\/npm install \(F8 npm by path\)' can fetch/);
  });
  test("R2-b PIN: RUN ./node_modules/.bin/npm install FAILs as F8", () => {
    expectFail({ Dockerfile: dockerfile([`RUN ./node_modules/.bin/npm install ${P}`]) },
      /^SITE Dockerfile:6 FAIL: .*'\.\/node_modules\/\.bin\/npm install \(F8 npm by path\)' can fetch/);
  });
  test('R2-c: RUN "./node_modules/.bin/npm" install FAILs as F8', () => {
    expectFail({ Dockerfile: dockerfile([`RUN "./node_modules/.bin/npm" install ${P}`]) },
      /^SITE Dockerfile:6 FAIL: .*'\.\/node_modules\/\.bin\/npm install \(F8 npm by path\)' can fetch/);
  });
  test('R2-d: a workflow run line "/usr/bin/npm" install FAILs as F8', () => {
    expectFail({ ".github/workflows/r2.yml": workflow(["      - run: |", `          "/usr/bin/npm" install ${P}`]) },
      /^SITE \.github\/workflows\/r2\.yml:11 FAIL: .*'\/usr\/bin\/npm install \(F8 npm by path\)'/);
  });
  test("R2-e: a scripts/*.sh line './node_modules/.bin/npm' install FAILs as F8", () => {
    expectFail({ "scripts/r2.sh": sh([`'./node_modules/.bin/npm' install ${P}`]) },
      /^SITE scripts\/r2\.sh:3 FAIL: .*'\.\/node_modules\/\.bin\/npm install \(F8 npm by path\)'/);
  });
  test('R2 SAFE twin: "./node_modules/.bin/npm" ci in a workflow prints its SITE OK row', () => {
    const r = expectPass({ ".github/workflows/r2.yml": workflow(["      - run: |", '          "./node_modules/.bin/npm" ci']) });
    hasRow(r, /^SITE \.github\/workflows\/r2\.yml:11 OK: /);
  });

  // X-NW (this unit's own NEVER WEAKEN sweep): the U1 tab root lost the SITE row THE BASE prints
  test("NW-a: a tab-indented run keeps THE BASE's SITE FAIL row beside its UNREADABLE row", () => {
    const r = expectFail({
      ".github/workflows/t.yml": workflow(["      - name: tab", "\t\trun: npm install qzx4774mark-pkg"]),
    }, /^CHECK \.github\/workflows\/t\.yml:11 .*UNREADABLE/);
    hasRow(r, /^SITE \.github\/workflows\/t\.yml:11 FAIL: "npm install qzx4774mark-pkg": 'npm install' can fetch a package by name \(not from the lock\)$/);
  });

  // X-R2: each U1 SAFE twin again (the U1 case stays byte-equal), now asserting its own row
  test("U1 F3 SAFE twin + row: a plain workflow env, the run's SITE OK row", () => {
    const r = expectPass({ ".github/workflows/f3.yml": workflow(["      - run: npm ci"], { top: ["env:", "  QZX_LEVEL: plain"] }) });
    hasRow(r, /^SITE \.github\/workflows\/f3\.yml:12 OK: "npm ci"/);
  });
  test("U1 F4 SAFE twin + row: a plain job env, the run's SITE OK row", () => {
    const r = expectPass({ ".github/workflows/f4.yml": workflow(["      - run: npm ci"], { job: ["    env:", "      PG_BASE_URL: postgresql://127.0.0.1:5432"] }) });
    hasRow(r, /^SITE \.github\/workflows\/f4\.yml:12 OK: "npm ci"/);
  });
  test("U1 F6 SAFE twin + row: the exec-form RUN reads no SITE, the deps install keeps its OK row", () => {
    const r = expectPass({ Dockerfile: dockerfile(['RUN ["node", "--version"]']) });
    hasRow(r, /^SITE Dockerfile:5 OK: /);
    noRow(r, /^SITE Dockerfile:6 /);
  });
  test("U1 F7 SAFE twin + row: the heredoc RUN reads no SITE, the deps install keeps its OK row", () => {
    const r = expectPass({ Dockerfile: dockerfile(["RUN <<EOF", "echo built", "EOF"]) });
    hasRow(r, /^SITE Dockerfile:5 OK: /);
    noRow(r, /^SITE Dockerfile:6 /);
  });
  test("U1 F8 SAFE twin + row: ./node_modules/.bin/npm ci prints its SITE OK row", () => {
    const r = expectPass({ ".github/workflows/f8.yml": workflow(["      - run: ./node_modules/.bin/npm ci"]) });
    hasRow(r, /^SITE \.github\/workflows\/f8\.yml:10 OK: "\.\/node_modules\/\.bin\/npm ci"/);
  });
});

// WI-4774 F2 (N1, the Opus confirm of F1): a comment line in a workflow or composite action
// `run: |` block that ends in `\` continues nothing in sh or bash (a comment ends at the
// newline), so the next line still runs. Each want row is the row THE U1 TIP prints for the root.
describe("F2 fix round", () => {
  const P = "qzx4774mark-pkg";
  const WF = ".github/workflows/probe.yml";
  const AC = ".github/actions/qzx4774mark/action.yml";
  const why = `"npm install ${P}": 'npm install' can fetch a package by name (not from the lock)`;
  const rows = (r, re) => r.out.split("\n").filter((l) => re.test(l));
  // the F1 block's composite action helper, the same lines (that helper is scoped to its block)
  const action = (run) => [
    "# QZX4774MARK synthetic fixture",
    "name: a",
    "description: QZX4774MARK synthetic composite action",
    "runs:",
    "  using: composite",
    "  steps:",
    `    - run: ${run}`,
    "      shell: bash",
    "",
  ].join("\n");
  const expectRow = (files, row) => {
    const r = run(files);
    assert.equal(r.rc, 1, `want rc 1, got ${r.rc}\n${r.brief}`);
    assert.ok(r.out.split("\n").includes(row), `no row ${row}\n${r.brief}`);
    return r;
  };
  test("N1-a NG_wf_comment_cont: a comment ending in \\ then npm install FAILs at the install line", () => {
    expectRow({ [WF]: workflow(["      - run: |", "          # install deps \\", `          npm install ${P}`]) },
      `SITE ${WF}:12 FAIL: ${why}`);
  });
  test("N1-b NG_wf_comment_cont_mid: echo, a comment ending in \\, then npm install FAILs at the install line", () => {
    expectRow({ [WF]: workflow(["      - run: |", "          echo start", "          # install deps \\", `          npm install ${P}`]) },
      `SITE ${WF}:13 FAIL: ${why}`);
  });
  test("N1-c the action form: a composite action's comment ending in \\ then npm install FAILs at the install line", () => {
    expectRow({ [AC]: action(["|", "        # install deps \\", `        npm install ${P}`].join("\n")) },
      `SITE ${AC}:9 FAIL: ${why}`);
  });
  test("PIN-N1-ctl: a comment with no \\ then npm install FAILs at the install line", () => {
    expectRow({ [WF]: workflow(["      - run: |", "          # install deps", `          npm install ${P}`]) },
      `SITE ${WF}:12 FAIL: ${why}`);
  });
  test("PIN-N1-cont: a real continuation npm \\ then install joins: ONE SITE FAIL row at the first line", () => {
    const r = run({ [WF]: workflow(["      - run: |", "          npm \\", `          install ${P}`]) });
    assert.equal(r.rc, 1, `want rc 1, got ${r.rc}\n${r.brief}`);
    const fails = rows(r, /^SITE \.github\/workflows\/probe\.yml:\d+ FAIL: /);
    assert.equal(fails.length, 1, `want ONE SITE FAIL row of probe.yml, got ${fails.length}\n${r.brief}`);
    assert.match(fails[0], /^SITE \.github\/workflows\/probe\.yml:11 FAIL: .*'npm install' can fetch/);
  });
  test("SAFE-N1: a comment that names an install and ends in \\ then echo runs nothing: rc 0", () => {
    const r = expectPass({ [WF]: workflow(["      - run: |", `          # npm install ${P} \\`, "          echo done"]) });
    assert.equal(rows(r, /^(SITE|CHECK) \.github\/workflows\/probe\.yml.* FAIL: /).length, 0, `a probe.yml FAIL row\n${r.brief}`);
  });
});
