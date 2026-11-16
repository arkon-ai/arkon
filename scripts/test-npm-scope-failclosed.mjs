#!/usr/bin/env node
// scripts/test-npm-scope-failclosed.mjs: the fail-closed proof for the private scope @arkon-ai
// (transformate WI-4683). Zero dependency: node built-ins only.
//
// usage: node scripts/test-npm-scope-failclosed.mjs <repo-root> <scratch-root>
//   Run it ONLY inside a network namespace with loopback alone (for example
//   `bwrap --dev-bind / / --unshare-net ...`); it refuses to run (exit 2) when any
//   interface other than lo exists. <scratch-root> must be absent or empty.
//
// What it does: it starts PUB, a fake public registry on 127.0.0.1 that logs every
// request path and answers 404 (it stands for registry.npmjs.org). PRIV is the lock's
// own host, npm.pkg.github.com, which cannot resolve inside the namespace. For every
// npm install site of the repo (the Dockerfile RUN lines, the workflow run: lines and
// the scripts/*.sh lines) it copies only the files that site has (package.json, the
// lock, the repo .npmrc where the site copies it) into a scratch dir and runs that
// site's npm command with --registry=<PUB>, --loglevel http, --fetch-retries=0 and two
// different empty user/global config files. The default replace-registry-host stays
// (never "always"). A site PASSES when npm FAILS (rc not 0) and PUB saw zero request
// naming @arkon-ai, zero auth header, and npm's own http log names no @arkon-ai URL on
// a host other than npm.pkg.github.com. A control (npm view pg) proves PUB logs.
// Where the site's road provides the token, a fixture token made here at run time is
// set; it is never printed (its length only), and every log is scanned for it (a count).
// Exit 0 when every site passes and the control is present, 1 otherwise, 2 on a refusal.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, copyFileSync, openSync, closeSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const [rootArg, scratchArg] = process.argv.slice(2);
if (!rootArg || !scratchArg) {
  console.error("usage: node scripts/test-npm-scope-failclosed.mjs <repo-root> <scratch-root>");
  process.exit(2);
}
const root = resolve(rootArg);
const scratch = resolve(scratchArg);
const ifaces = Object.keys(networkInterfaces()).filter((n) => n !== "lo");
if (ifaces.length) {
  console.error(`REFUSE: network interfaces other than lo exist (${ifaces.length}); run inside --unshare-net`);
  process.exit(2);
}
if (existsSync(scratch) && readdirSync(scratch).length) {
  console.error(`REFUSE: scratch root ${scratch} is not empty; give a new name`);
  process.exit(2);
}
mkdirSync(scratch, { recursive: true });

const PRIVATE_HOST = "npm.pkg.github.com";
const TOKEN_VAR = "ARKON_NPM_TOKEN";
const CAP_MS = 120000;
const fixture = randomBytes(24).toString("hex");
console.log(`FIXTURE token: made at run time, length ${fixture.length}, never printed`);

// ---------- the sites ----------
const CI = new Set(["ci", "clean-install", "ic", "install-clean", "isntall-clean", "cit", "install-ci-test"]);
const INSTALL = new Set(["install", "i", "in", "ins", "inst", "insta", "instal", "isnt", "isnta", "isntal", "isntall", "add", "update", "up", "upgrade", "udpate"]);
function npmSegments(cmd) {
  return cmd.split(/&&|\|\||;|\|/).map((s) => s.trim().replace(/^\(\s*/, "").replace(/\s*\)$/, "").replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, ""))
    .filter((s) => {
      const m = s.match(/^npm\s+(\S+)/);
      return m && (CI.has(m[1]) || INSTALL.has(m[1]));
    });
}
const sites = [];
const has = (f) => existsSync(join(root, f));

function dockerSites() {
  if (!has("Dockerfile")) return;
  const raw = readFileSync(join(root, "Dockerfile"), "utf8").split(/\r?\n/);
  const ins = [];
  let cur = null;
  raw.forEach((l, i) => {
    const t = l.trim();
    if (cur === null) {
      if (t === "" || t.startsWith("#")) return;
      cur = { line: i + 1, text: "" };
    } else if (t.startsWith("#")) return;
    const cont = /\\\s*$/.test(l);
    cur.text += (cur.text ? " " : "") + l.replace(/\\\s*$/, "").trim();
    if (!cont) {
      ins.push(cur);
      cur = null;
    }
  });
  let stage = null;
  let files = null;
  for (const x of ins) {
    const m = x.text.match(/^(\S+)\s*(.*)$/);
    const op = m[1].toUpperCase();
    let rest = m[2];
    if (op === "FROM") {
      const a = rest.match(/\s+AS\s+(\S+)\s*$/i);
      stage = a ? a[1] : "?";
      files = new Set();
      continue;
    }
    const flags = [];
    let f;
    while ((f = rest.match(/^(--[\w-]+(?:=\S+)?)\s*/)) !== null) {
      flags.push(f[1]);
      rest = rest.slice(f[0].length);
    }
    if (op === "COPY" || op === "ADD") {
      if (flags.some((g) => g.startsWith("--from="))) continue;
      const srcs = rest.split(/\s+/).slice(0, -1);
      for (const s of srcs) {
        const b = s.replace(/^\.\//, "");
        if (b === "." || b === "" || b === "*") ["package.json", "package-lock.json", ".npmrc"].forEach((n) => files.add(n));
        if (["package.json", "package-lock.json", ".npmrc"].includes(b)) files.add(b);
      }
    }
    if (op === "RUN") {
      const secret = flags.some((g) => /^--mount=.*type=secret/.test(g) && g.includes(`env=${TOKEN_VAR}`));
      for (const seg of npmSegments(rest)) {
        sites.push({ id: `Dockerfile:${x.line}`, stage, cmd: seg, files: [...files].filter(has), token: secret });
      }
    }
  }
}

function workflowSites() {
  const dir = join(root, ".github", "workflows");
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n)).sort()) {
    const lines = readFileSync(join(dir, f), "utf8").split(/\r?\n/);
    let block = -1;
    lines.forEach((l, i) => {
      const col = l.search(/\S/);
      if (block >= 0 && l.trim() !== "" && col <= block) block = -1;
      let text = null;
      const m = l.match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
      if (m) {
        if (/^[|>][-+]?\s*$/.test(m[2])) {
          block = m[1].length;
          return;
        }
        text = m[2];
      } else if (block >= 0) {
        text = l.trim();
      }
      if (!text || text.startsWith("#")) return;
      for (const seg of npmSegments(text)) {
        sites.push({ id: `.github/workflows/${f}:${i + 1}`, stage: "ci", cmd: seg, files: ["package.json", "package-lock.json", ".npmrc"].filter(has), token: true });
      }
    });
  }
}

function scriptSites(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      scriptSites(p);
      continue;
    }
    if (!/\.(sh|bash)$/.test(e.name)) continue;
    const text = readFileSync(p, "utf8");
    const rel = p.slice(root.length + 1);
    const copiesNpmrc = /\.npmrc/.test(text) || !/\bcd\s/.test(text);
    text.split(/\r?\n/).forEach((l, i) => {
      if (/^\s*#/.test(l)) return;
      for (const seg of npmSegments(l)) {
        sites.push({ id: `${rel}:${i + 1}`, stage: "script", cmd: seg, files: ["package.json", "package-lock.json"].concat(copiesNpmrc ? [".npmrc"] : []).filter(has), token: true });
      }
    });
  }
}
dockerSites();
workflowSites();
scriptSites(join(root, "scripts"));

// ---------- PUB ----------
let pubLog = [];
const pub = createServer((req, res) => {
  pubLog.push({ method: req.method, path: req.url, auth: !!req.headers.authorization });
  res.writeHead(404, { "content-type": "application/json" });
  res.end('{"error":"Not found"}');
});
await new Promise((r) => pub.listen(0, "127.0.0.1", r));
const PUB = `http://127.0.0.1:${pub.address().port}/`;
console.log(`PUB listening on ${PUB} (answers 404 to every request); PRIV = ${PRIVATE_HOST} (the lock's host; no route inside the namespace)`);
console.log(`SITES found: ${sites.length}`);

function cleanEnv(withToken) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^npm_config_/i.test(k)) continue;
    if (["NPM_TOKEN", "NODE_AUTH_TOKEN", "GITHUB_TOKEN", "GH_TOKEN", TOKEN_VAR].includes(k)) continue;
    env[k] = v;
  }
  if (withToken) env[TOKEN_VAR] = fixture;
  env.NO_UPDATE_NOTIFIER = "1";
  return env;
}

function runNpm(args, cwd, logFile, withToken) {
  return new Promise((done) => {
    const fd = openSync(logFile, "w");
    const child = spawn("npm", args, { cwd, env: cleanEnv(withToken), stdio: ["ignore", fd, fd] });
    const pid = child.pid;
    let capped = false;
    const timer = setTimeout(() => {
      capped = true;
      process.kill(pid, "SIGTERM"); // our own child only, by the pid we recorded
    }, CAP_MS);
    child.on("close", (code, sig) => {
      clearTimeout(timer);
      closeSync(fd);
      done({ rc: code === null ? `signal ${sig}` : code, capped });
    });
  });
}

function decode(p) {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}
function scanDir(dir) {
  let n = 0;
  if (!existsSync(dir)) return 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) n += scanDir(p);
    else if (e.isFile() && statSync(p).size < 50 * 1024 * 1024) n += readFileSync(p, "latin1").split(fixture).length - 1;
  }
  return n;
}

const baseArgs = (cache, cfg) => [
  `--registry=${PUB}`, "--loglevel", "http", "--fetch-retries=0", "--no-audit", "--no-fund", "--no-update-notifier",
  "--cache", cache, "--userconfig", join(cfg, "user-empty.npmrc"), "--globalconfig", join(cfg, "global-empty.npmrc"),
];

let allPass = true;
let n = 0;
const lsLines = [];
for (const s of sites) {
  n++;
  const dir = join(scratch, `site${n}`);
  const proj = join(dir, "proj");
  const cfg = join(dir, "cfg");
  const cache = join(dir, "cache");
  mkdirSync(proj, { recursive: true });
  mkdirSync(cfg, { recursive: true });
  writeFileSync(join(cfg, "user-empty.npmrc"), "");
  writeFileSync(join(cfg, "global-empty.npmrc"), "");
  for (const f of s.files) copyFileSync(join(root, f), join(proj, f));
  const words = s.cmd.split(/\s+/).slice(1);
  pubLog = [];
  const log = join(dir, "npm.log");
  const { rc, capped } = await runNpm([...words, ...baseArgs(cache, cfg)], proj, log, s.token);
  const out = readFileSync(log, "utf8");
  const pubTotal = pubLog.length;
  const pubArkon = pubLog.filter((r) => decode(r.path).toLowerCase().includes("@arkon-ai")).length;
  const pubArkonPaths = [...new Set(pubLog.filter((r) => decode(r.path).toLowerCase().includes("@arkon-ai")).map((r) => r.path))];
  const pubAuth = pubLog.filter((r) => r.auth).length;
  const pubPublic = [...new Set(pubLog.map((r) => decode(r.path).split("/-/")[0]).filter((p) => !p.toLowerCase().includes("@arkon-ai")))].length;
  // npm's own http log: every URL naming @arkon-ai, with its host and path
  const urls = [...out.matchAll(/https?:\/\/[^\s'"),]+/g)].map((m) => m[0]).filter((u) => decode(u).toLowerCase().includes("@arkon-ai"));
  const attempts = [...new Set(urls.map((u) => {
    const x = new URL(u);
    return `${x.host}${x.pathname}`;
  }))];
  const reasons = [...new Set([...out.matchAll(/\b(EAI_AGAIN|ENOTFOUND|ECONNREFUSED|E404|E401|ETIMEDOUT)\b/g)].map((m) => m[1]))];
  const offHost = attempts.filter((a) => !a.startsWith(PRIVATE_HOST + "/"));
  const leak = out.split(fixture).length - 1 + scanDir(cache) + scanDir(proj);
  const failed = rc !== 0;
  const pass = failed && !capped && pubArkon === 0 && pubAuth === 0 && offHost.length === 0 && leak === 0;
  if (!pass) allPass = false;
  console.log(`SITE ${s.id} stage=${s.stage} cmd="${s.cmd}" files=${s.files.join(",") || "none"} token_road=${s.token ? "fixture" : "none"} npm_rc=${rc}${capped ? " CAPPED" : ""} pub_total=${pubTotal} pub_public_names=${pubPublic} pub_arkon=${pubArkon} pub_auth=${pubAuth} fixture_in_logs=${leak} -> ${pass ? "FAILED-CLOSED" : "RED"}`);
  for (const a of attempts.slice(0, 4)) console.log(`  npm http log @arkon-ai attempt: host=${a.split("/")[0]} path=/${a.split("/").slice(1).join("/")}`);
  if (attempts.length > 4) console.log(`  (${attempts.length - 4} more @arkon-ai URLs in npm's log)`);
  for (const p of pubArkonPaths.slice(0, 4)) console.log(`  PUB got @arkon-ai: ${p}`);
  console.log(`  npm error codes seen: ${reasons.join(",") || "none"}`);
  const httpRows = out.split(/\r?\n/).filter((l) => /npm http fetch/.test(l));
  const arkonRow = httpRows.find((l) => l.toLowerCase().includes("@arkon-ai"));
  if (arkonRow) console.log(`  npm http row: ${arkonRow.trim().slice(0, 220)}`);
  const errRow = out.split(/\r?\n/).find((l) => /@arkon-ai/i.test(decode(l)) && /(failed|E404|EAI_AGAIN|ENOTFOUND)/.test(l));
  if (errRow) console.log(`  npm error row: ${errRow.trim().slice(0, 220)}`);
  lsLines.push(`  ls -a site${n}: ${readdirSync(dir).sort().join(" ")} | proj: ${readdirSync(proj).sort().join(" ")} | cfg: ${readdirSync(cfg).sort().join(" ")}`);
}

// ---------- the control: PUB logs a public package name ----------
const cdir = join(scratch, "control");
mkdirSync(join(cdir, "proj"), { recursive: true });
mkdirSync(join(cdir, "cfg"), { recursive: true });
writeFileSync(join(cdir, "cfg", "user-empty.npmrc"), "");
writeFileSync(join(cdir, "cfg", "global-empty.npmrc"), "");
pubLog = [];
const c = await runNpm(["view", "pg", "version", ...baseArgs(join(cdir, "cache"), join(cdir, "cfg"))], join(cdir, "proj"), join(cdir, "npm.log"), false);
const control = pubLog.some((r) => r.path === "/pg");
console.log(`CONTROL npm view pg: npm_rc=${c.rc} PUB paths=${pubLog.map((r) => r.path).join(",") || "none"} -> ${control ? "PRESENT (PUB logs a public name)" : "MISSING"}`);
pub.close();

console.log("SCRATCH listing (ls -a of each site dir):");
for (const l of lsLines) console.log(l);
const ok = allPass && control && sites.length > 0;
console.log(`T2 RESULT: ${ok ? "PASS" : "FAIL"} (sites ${sites.length}; every site failed closed: ${allPass ? "yes" : "no"}; control: ${control ? "present" : "missing"})`);
process.exit(ok ? 0 : 1);
