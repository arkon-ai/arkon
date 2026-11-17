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
