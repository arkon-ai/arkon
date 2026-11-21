#!/usr/bin/env node
// scripts/check-npm-install-sites.mjs: static check of every npm install site in this repo
// (transformate WI-4683). Zero dependency: node built-ins only.
//
// usage: node scripts/check-npm-install-sites.mjs <repo-root>
//
// Why: the private scope @arkon-ai lives on npm.pkg.github.com. An install that runs
// without the scope pin (.npmrc) or without the lock resolves @arkon-ai/* on the
// PUBLIC registry, where anyone can publish that name (dependency confusion). The
// registry token must reach npm only by an ephemeral BuildKit secret mount.
//
// It prints one line per site (SITE), one per repo-wide check (CHECK), notes that do
// not fail (NOTE), then "T1 RESULT: ...". Exit 0 when every SITE and CHECK is OK,
// 1 when any FAILs, 2 on a usage error. It never prints a line of any .npmrc (counts only).
//
// THE STRICT CHECK (transformate WI-4821): two stages.
// STAGE 1 reads the preserved bytes of every container and decides SUPPORTED or UNSUPPORTED
// before any install matching; STAGE 2 is the readers and policy below, run only on SUPPORTED
// containers. A container it cannot read in the supported forms is refused with one row,
// "UNSUPPORTED <file>:<line> FAIL: <kind> at :<line>", and rc 1; that row never claims an install.
// The containers (the manifest): docker-entrypoint.sh and scripts/**/*.sh|*.bash (one file each);
// each step's run value in .github/workflows/*.yml|*.yaml and .github/actions/<name>/action.yml|
// action.yaml; each RUN of the root Dockerfile; each scripts value of the root package.json.
// The supported forms: G1, one line at a time, every line starting and ending with no open quote
// and no continuation (no CR or control byte; outside quotes no #, \, `, non-ASCII byte or <<, a
// # only as a line's first non-blank byte; quotes open and close on one line, at word edges; in
// "..." no `, $(, escaping \ or ' inside ${...}; no ${{ in a run value); G1-PM on a line with npm, npx, pnpm, yarn
// or corepack (the plain lower-case word where npmCalls reads it, its sub-command one plain word,
// no ${ or $( on the line); Y1, the YAML subset (block style under jobs: or runs:, no anchor,
// alias, tag or merge key, a run value plain on one line or a | or |- block, shell: bash or sh);
// D1, the Dockerfile (no parser directive, SHELL, ONBUILD or exec-form RUN, no package-manager
// word in CMD, ENTRYPOINT or HEALTHCHECK). docs/npm-install-sites.md lists them with each reason.
// A build-shaped file outside the manifest gives "CHECK <path> FAIL: UNLISTED: ...".
// NAMED EXCLUSIONS (not read, each with its reason): lefthook.yml and .lefthook/** (developer-
// machine git hooks, not CI and not the image); docker-compose.yml (the self-host runtime of the
// built image; a CHECK row FAILs if it holds a package-manager word); .github/ISSUE_TEMPLATE/** and
// .github/dependabot.yml (never executed); program files (*.mjs, *.js, *.ts, *.py and their kin);
// INSTALL.md and docs/** (text a human reads).
// NOT GUARANTEED (the honest limits): a command name built at run time (from a variable, a $(...)
// result, eval, an sh -c argument held in a variable); a program file that spawns a package
// manager; a third-party action's insides (a remote uses:, pinned by SHA where image-build.yml says
// so); a command name made by glob or brace expansion (/usr/bin/np[m]); a package manager outside
// the words above (bun, bunx, deno); everything in the named exclusions.
// This check is a lint against honest mistakes by the repo's own authors, not a sandbox against an attacker.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename, relative } from "node:path";

const root = process.argv[2];
if (!root || !existsSync(root) || !statSync(root).isDirectory()) {
  console.error("usage: node scripts/check-npm-install-sites.mjs <repo-root>");
  process.exit(2);
}

const SECRET_ID = "arkon_npm_token";
const TOKEN_VAR = "ARKON_NPM_TOKEN";
const PRIVATE_HOST = "npm.pkg.github.com";
const SCOPE_LINE = "@arkon-ai:registry=https://npm.pkg.github.com";
const SAME_REPO = "github.event.pull_request.head.repo.full_name == github.repository";
const FORK = "github.event.pull_request.head.repo.full_name != github.repository";
// the step `if:` forms (whitespace removed) that are true only for push or a same-repo PR
const SECRET_STEP_IFS = new Set([
  SAME_REPO,
  "github.event_name == 'push' || " + SAME_REPO,
].map((s) => s.replace(/\s+/g, "")));
const SELF = new Set(["scripts/check-npm-install-sites.mjs", "scripts/test-npm-scope-failclosed.mjs"]);

// npm sub-commands: lock-based (ci) and ones that can fetch a package by name
const CI_CMDS = new Set(["ci", "clean-install", "ic", "install-clean", "isntall-clean", "cit", "install-ci-test"]);
const FETCH_CMDS = new Set([
  "install", "i", "in", "ins", "inst", "insta", "instal", "isnt", "isnta", "isntal", "isntall", "add",
  "update", "up", "upgrade", "udpate", "exec", "x", "it", "install-test", "init", "create",
]);

let fails = 0;
let oks = 0;
function line(kind, where, ok, text) {
  if (kind !== "NOTE") {
    if (ok) oks++;
    else fails++;
  }
  const verdict = kind === "NOTE" ? "" : ok ? " OK" : " FAIL";
  console.log(`${kind} ${where}${verdict}: ${text}`);
}
function read(rel) {
  const p = join(root, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

// ---------- STAGE 1: the supported-form gate (transformate WI-4821) ----------
// It reads the PRESERVED bytes of every container (split on \n only: no comment strip, no
// line join, no blank-line drop, no trim) and decides SUPPORTED or UNSUPPORTED before any
// install matching. It looks for no install: G1-PM only adds misses. An UNSUPPORTED container
// gives ONE row and none of its lines reach STAGE 2 (the readers and policy below).
const refused = new Set();
const supported = (...keys) => keys.every((k) => !refused.has(k));
const PM_WORD = /(?<![A-Za-z0-9_.-])(npm|npx|pnpm|yarn|corepack)(?![A-Za-z0-9_-])/gi;
const PM_READ = new Set(["npm", "npx", "yarn", "pnpm"]);
const OPEN_AFTER = " \t=(;|&<>";
const CLOSE_BEFORE = " \t;|&)<>";
// G1 and G1-PM for one line; the first miss, or null when the line passes
function shellMiss(s, inRun) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 13) return "G1.1 a CR byte";
    if ((c < 32 && c !== 9) || c === 127) return "G1.1 a control byte";
  }
  if (inRun && s.includes("${{")) return "G1.5 a ${{ expression in a run value";
  if (/^[ \t]*(#|$)/.test(s)) return null; // a blank line or a standalone comment line
  const quoted = [];
  let q = "";
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q === "") {
      if (c === "#") return "G1.2 a # that is not the line's first non-blank byte";
      if (c === "\\") return "G1.2 a backslash outside quotes";
      if (c === "`") return "G1.2 a backtick outside quotes";
      if (s.charCodeAt(i) > 127) return "G1.2 a non-ASCII byte outside quotes";
      if (c === "<" && s[i + 1] === "<") return "G1.2 a << (a heredoc or a here-string)";
      if (c === "'" || c === '"') {
        if (i > 0 && !OPEN_AFTER.includes(s[i - 1])) return "G1.6 a quote that opens inside a word";
        q = c;
        depth = 0;
        quoted[i] = true;
      }
      continue;
    }
    quoted[i] = true;
    if (q === "'") {
      if (c === "'") {
        if (i + 1 < s.length && !CLOSE_BEFORE.includes(s[i + 1])) return "G1.6 a quote that closes inside a word";
        q = "";
      }
      continue;
    }
    if (c === "`") return "G1.4 a backtick inside double quotes";
    if (c === "$" && s[i + 1] === "(") return "G1.4 a $( inside double quotes";
    if (c === "\\") {
      if (i + 1 === s.length) return "G1.4 a double quote open at the line end";
      if ("$`\"\\".includes(s[i + 1])) return "G1.4 an escaping backslash inside double quotes";
      continue;
    }
    if (c === "$" && s[i + 1] === "{") {
      depth++;
      quoted[++i] = true;
      continue;
    }
    if (depth > 0 && c === "}") {
      depth--;
      continue;
    }
    if (depth > 0 && c === "'") return "C a ' inside a double-quoted ${...} (a quote boundary the rules cannot establish)";
    if (c === '"') {
      if (i + 1 < s.length && !CLOSE_BEFORE.includes(s[i + 1])) return "G1.6 a quote that closes inside a word";
      q = "";
    }
  }
  if (q === "'") return "G1.3 a single quote open at the line end";
  if (q === '"') return "G1.4 a double quote open at the line end";
  let sub = -1; // where npmCalls captures the sub-command of the PM word before
  for (const m of s.matchAll(PM_WORD)) {
    if (s.includes("${") || s.includes("$(")) return "PM.1 a ${ or $( on a package-manager line";
    const i = m.index;
    const w = m[1];
    if (quoted[i]) return "PM.2 a package-manager word inside quotes";
    const after = s[i + w.length];
    if (!PM_READ.has(w) || i === sub || (i > 0 && !" \t;&|(".includes(s[i - 1])) || (after !== undefined && after !== " " && after !== "\t")) {
      return "PM.3 a package-manager word that npmCalls does not read";
    }
    let j = i + w.length;
    while (s[j] === " " || s[j] === "\t") j++;
    sub = j;
    if (s[j] === "-") return "PM.4 an option right after the package-manager word";
    if (j < s.length && !";&|)".includes(s[j])) {
      let k = j;
      while (k < s.length && /[A-Za-z0-9_@./:-]/.test(s[k])) k++;
      if (k === j || (k < s.length && !CLOSE_BEFORE.slice(0, 6).includes(s[k]))) return "PM.5 a sub-command word that npmCalls does not read whole";
    }
  }
  if (s.includes("${") && /npm|npx|pnpm|yarn|corepack/i.test(s)) return "PM.6 a package-manager name in a line that holds ${";
  return null;
}
// one row per UNSUPPORTED container: its first miss, plus "and <n> more" lines with a miss
const counts = {};
function container(type, ok) {
  counts[type] = counts[type] || { ok: 0, no: 0 };
  counts[type][ok ? "ok" : "no"]++;
}
function refuse(keys, file, at, misses, suffix = "") {
  const ms = [...misses.entries()].sort((a, b) => a[0] - b[0]);
  for (const k of keys) refused.add(k);
  line("UNSUPPORTED", `${file}:${at ?? ms[0][0]}`, false, `${ms[0][1]} at :${ms[0][0]}${ms.length > 1 ? ` and ${ms.length - 1} more` : ""}${suffix}`);
}
function addMiss(misses, ln, kind) {
  if (kind && !misses.has(ln)) misses.set(ln, kind);
}

// B8: the walk of <repo-root> (skips .git and node_modules) and THE UNLISTED GUARD
function walkAll(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name !== ".git" && e.name !== "node_modules") walkAll(join(dir, e.name), out);
    } else out.push(relative(root, join(dir, e.name)).split("\\").join("/"));
  }
  return out;
}
const allFiles = walkAll(root).sort();
const inB1 = (r) => r === "docker-entrypoint.sh" || (r.startsWith("scripts/") && /\.(sh|bash)$/.test(r));
const inB2 = (r) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(r);
const inB3 = (r) => /^\.github\/actions\/[^/]+\/action\.ya?ml$/.test(r);
const inB7 = (r) => r === "lefthook.yml" || r.startsWith(".lefthook/") || r === "docker-compose.yml" || r.startsWith(".github/ISSUE_TEMPLATE/") ||
  r === ".github/dependabot.yml" || r === "INSTALL.md" || r.startsWith("docs/");
for (const r of allFiles) {
  const b = basename(r);
  const build = /\.(sh|bash)$/.test(b) || b.startsWith("Dockerfile") || b.endsWith(".Dockerfile") || b.startsWith("Containerfile") ||
    /compose.*\.ya?ml$/.test(b) || (r.startsWith(".github/") && /\.ya?ml$/.test(b)) || /^action\.ya?ml$/.test(b);
  if (build && !inB1(r) && !inB2(r) && !inB3(r) && r !== "Dockerfile" && !inB7(r)) line("CHECK", r, false, "UNLISTED: a build file outside the manifest");
}
// B7: docker-compose.yml holds no package-manager word
const compose = read("docker-compose.yml");
if (compose !== null) {
  const at = compose.split("\n").map((l, i) => (l.match(PM_WORD) ? i + 1 : 0)).filter(Boolean);
  if (at.length) line("CHECK", "docker-compose.yml", false, `a package-manager word at :${at.join(", :")} (the compose file is outside the manifest, B7)`);
}

// B1: each shell file is ONE container
for (const r of allFiles.filter(inB1)) {
  const misses = new Map();
  readFileSync(join(root, r), "utf8").split("\n").forEach((l, i) => addMiss(misses, i + 1, shellMiss(l, false)));
  container("shell files", misses.size === 0);
  if (misses.size) refuse([r], r, undefined, misses);
}

// B2, B3: Y1 over each file as a whole, C0, then G1 over each step's run value
const acFiles = allFiles.filter(inB3);
for (const r of [...allFiles.filter(inB2), ...acFiles]) {
  const text = readFileSync(join(root, r), "utf8");
  const raw = text.split("\n");
  const { all } = yamlTree(text);
  const top = inB3(r) ? "runs" : "jobs";
  const type = inB3(r) ? "action runs" : "workflow runs";
  const runs = all.filter((n) => !n.isItem && n.key === "run" && !(n.value === "" && n.children.length && n.parent && n.parent.key === "defaults"));
  const fileMiss = new Map();
  const body = new Set();
  for (const n of all) for (const b of n.body || []) body.add(b.line);
  let topKey = "";
  raw.forEach((l, i) => {
    const ln = i + 1;
    if (l.includes("\r")) return addMiss(fileMiss, ln, "Y1.1 a CR byte");
    if (/^[ \t]*/.exec(l)[0].includes("\t")) return addMiss(fileMiss, ln, "Y1.1 a tab in the indentation");
    if (body.has(ln)) return;
    if ((/^(---|\.\.\.)([ \t]|$)/.test(l) && !(ln === 1 && /^---[ \t]*$/.test(l))) || l.startsWith("%")) {
      return addMiss(fileMiss, ln, "Y1.1 a document marker or a directive");
    }
    const content = l.replace(/(^|\s)#.*$/, "").replace(/\s+$/, "");
    if (content.trim() === "") return;
    const col = content.search(/\S/);
    let rest = content.slice(col);
    while (rest === "-" || rest.startsWith("- ")) rest = rest.slice(1).trimStart();
    const km = rest.match(/^("[^"]*"|'[^']*'|[^\s:][^:]*?):(?:\s+(.*))?$/);
    const key = km ? km[1].trim() : null;
    const value = km ? (km[2] || "").trim() : rest;
    if (col === 0 && key) topKey = key;
    if (/^[&*!]/.test(value) || (key !== null && (/^[&*!]/.test(key) || key === "<<"))) addMiss(fileMiss, ln, "Y1.2 an anchor, an alias, a tag or a merge key");
    if (topKey === top && (/^[[{]/.test(value) || /^[[{]/.test(rest) || /^["']/.test(rest) && key !== null || /^\?(\s|$)/.test(rest))) {
      addMiss(fileMiss, ln, `Y1.3 a flow value, a quoted key or a ? key under ${top}:`);
    }
    if (/^[|>]/.test(value) && !/^[|>][-+]?$/.test(value)) addMiss(fileMiss, ln, "Y1.4 a block scalar header the reader does not read");
  });
  for (const n of runs) {
    if (n.value === "") addMiss(fileMiss, n.line, "Y1.4 an empty or a multi-line plain run value");
    else if (/^[|>]/.test(n.value)) {
      if (n.value !== "|" && n.value !== "|-") addMiss(fileMiss, n.line, "Y1.4 a folded, keep or indented block run value");
    } else if (/^['"[{&*!#]/.test(n.value)) addMiss(fileMiss, n.line, "Y1.4 a quoted, flow or tagged run value");
    else {
      const next = raw.slice(n.line).find((t) => t.trim() !== "");
      if (next !== undefined && next.search(/\S/) > n.col) addMiss(fileMiss, n.line, "Y1.4 an empty or a multi-line plain run value");
    }
  }
  for (const n of all.filter((x) => !x.isItem && x.key === "shell")) {
    if (n.value !== "bash" && n.value !== "sh") addMiss(fileMiss, n.line, "Y1.5 a shell: other than bash or sh");
  }
  // C0: every line that names a run key is a run the reader extracted
  const rawRun = raw.map((l, i) => (/^\s*(-\s+)?run\s*:/.test(l) ? i + 1 : 0)).filter(Boolean);
  const treeRun = new Set(all.filter((n) => !n.isItem && n.key === "run").map((n) => n.line));
  for (const ln of [...rawRun.filter((x) => !treeRun.has(x)), ...[...treeRun].filter((x) => !rawRun.includes(x))]) {
    addMiss(fileMiss, ln, "C0 a run line the reader did not extract");
  }
  if (fileMiss.size) {
    for (const n of runs) container(type, false);
    refuse([r], r, undefined, fileMiss, " (the whole file: no step read)");
    continue;
  }
  for (const n of runs) {
    const misses = new Map();
    if (n.body) {
      const lines = n.body.filter((b) => raw[b.line - 1].trim() !== "");
      const ind = lines.length ? raw[lines[0].line - 1].search(/\S/) : 0;
      for (const b of n.body) {
        const l = raw[b.line - 1];
        if (l.trim() !== "" && l.search(/\S/) < ind) addMiss(misses, b.line, "C0 a block line indented less than the block's first line");
        addMiss(misses, b.line, shellMiss(l, true));
      }
    } else {
      // the preserved text after "run:", then the decoded value STAGE 2 reads (runLines, master :331)
      const pm = raw[n.line - 1].match(/^\s*(?:-\s+)*run\s*:(.*)$/);
      if (!pm) addMiss(misses, n.line, "C0 a run line the reader did not extract");
      else if (pm[1].includes("#")) addMiss(misses, n.line, "C0 a # in a plain run value");
      else addMiss(misses, n.line, shellMiss(pm[1].trim(), true));
      addMiss(misses, n.line, shellMiss(n.value, true));
    }
    container(type, misses.size === 0);
    if (misses.size) refuse([`${r}:${n.line}`], r, n.line, misses);
  }
}

// B4: D1 over the Dockerfile at the root; each RUN is ONE container
const dockerText = read("Dockerfile");
if (dockerText !== null) {
  const raw = dockerText.split("\n");
  const spans = [];
  let cur = null;
  raw.forEach((l, i) => {
    const t = l.trim();
    if (cur === null) {
      if (t === "" || t.startsWith("#")) return;
      cur = { line: i + 1, lines: [] };
    }
    cur.lines.push(i + 1);
    if (t.startsWith("#") && cur.lines.length > 1) return;
    if (!/\\\s*$/.test(l)) {
      spans.push(cur);
      cur = null;
    }
  });
  if (cur) spans.push(cur);
  const fileMiss = new Map();
  raw.forEach((l, i) => {
    if (/^\s*#\s*(escape|syntax)\s*=/i.test(l)) addMiss(fileMiss, i + 1, "D1 a parser directive");
  });
  for (const sp of spans) {
    const op = raw[sp.line - 1].trim().split(/\s+/)[0].toUpperCase();
    const text = sp.lines.map((n) => raw[n - 1]).join("\n");
    if (op === "SHELL") addMiss(fileMiss, sp.line, "D1 a SHELL instruction");
    if (op === "ONBUILD") addMiss(fileMiss, sp.line, "D1 an ONBUILD instruction");
    if (["CMD", "ENTRYPOINT", "HEALTHCHECK"].includes(op) && text.match(PM_WORD)) addMiss(fileMiss, sp.line, "D1 a package-manager word in CMD, ENTRYPOINT or HEALTHCHECK");
  }
  const runSpans = spans.filter((sp) => raw[sp.line - 1].trim().split(/\s+/)[0].toUpperCase() === "RUN");
  if (fileMiss.size) {
    for (const sp of runSpans) container("Dockerfile RUNs", false);
    refuse(["Dockerfile"], "Dockerfile", undefined, fileMiss, " (the whole Dockerfile: no RUN read)");
  } else {
    const { ins } = dockerInstructions(dockerText);
    for (const sp of runSpans) {
      const misses = new Map();
      const x = ins.find((y) => y.line === sp.line);
      const { body } = splitFlags(x ? x.rest : "");
      if (body.startsWith("[")) addMiss(misses, sp.line, "D1 an exec-form RUN");
      for (const n of sp.lines) addMiss(misses, n, shellMiss(raw[n - 1], false));
      addMiss(misses, sp.line, shellMiss(body, false));
      container("Dockerfile RUNs", misses.size === 0);
      if (misses.size) refuse([`Dockerfile:${sp.line}`], "Dockerfile", sp.line, misses);
    }
  }
}

// B5: each package.json scripts value is ONE container; its raw JSON string must hold no escape
const pjRaw = read("package.json");
let pjScripts = null;
try {
  pjScripts = pjRaw === null ? null : JSON.parse(pjRaw).scripts || null;
} catch {
  pjScripts = null; // an unreadable package.json fails below, in master's own read
}
if (pjScripts && typeof pjScripts === "object") {
  const entries = Object.entries(pjScripts);
  const raw = pjRaw.split("\n");
  const start = raw.findIndex((l) => /^\s*"scripts"\s*:\s*\{\s*$/.test(l));
  const rows = [];
  let shape = start >= 0;
  for (let i = start + 1; shape && i < raw.length; i++) {
    if (/^\s*\}\s*,?\s*$/.test(raw[i])) break;
    const m = raw[i].match(/^\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$/);
    if (!m) shape = false;
    else rows.push({ line: i + 1, k: m[1], v: m[2] });
  }
  const dec = (s) => {
    try {
      return JSON.parse(`"${s}"`);
    } catch {
      return null;
    }
  };
  shape = shape && rows.length === entries.length && rows.every((x, i) => dec(x.k) === entries[i][0] && dec(x.v) === entries[i][1]);
  if (!shape) {
    for (const e of entries) container("package.json scripts", false);
    const at = start >= 0 ? start + 1 : raw.findIndex((l) => /"scripts"/.test(l)) + 1 || 1;
    refuse(["package.json scripts"], "package.json", at, new Map([[at, "C0 the scripts block is not one \"key\": \"value\" string per line"]]), " (every scripts value: none read)");
  } else {
    for (const x of rows) {
      const misses = new Map();
      if (x.v.includes("\\")) addMiss(misses, x.line, "C0 a backslash escape in the package.json string");
      else addMiss(misses, x.line, shellMiss(x.v, false));
      container("package.json scripts", misses.size === 0);
      if (misses.size) refuse([`package.json scripts.${dec(x.k)}`], "package.json", x.line, misses, ` (scripts.${dec(x.k)})`);
    }
  }
}
// a workflow or action step `uses: ./<path>` names a B3 file, or it is UNLISTED
for (const r of [...allFiles.filter(inB2), ...acFiles]) {
  const { all } = yamlTree(readFileSync(join(root, r), "utf8"));
  for (const n of all.filter((x) => !x.isItem && x.key === "uses")) {
    const v = n.value.replace(/^["']|["']$/g, "");
    if (!v.startsWith("./")) continue;
    const p = v.slice(2).replace(/\/+$/, "");
    if (!acFiles.includes(`${p}/action.yml`) && !acFiles.includes(`${p}/action.yaml`)) {
      line("CHECK", `${r}:${n.line} uses ./${p}`, false, "UNLISTED: a build file outside the manifest");
    }
  }
}
const total = Object.values(counts).reduce((a, c) => a + c.ok + c.no, 0);
line("NOTE", "manifest", true, `${total} containers: ` + ["shell files", "workflow runs", "action runs", "Dockerfile RUNs", "package.json scripts"]
  .map((t) => `${t} ${(counts[t] || { ok: 0 }).ok} SUPPORTED, ${(counts[t] || { no: 0 }).no} UNSUPPORTED`).join("; "));

// npm/npx/yarn/pnpm calls in one shell command string
function npmCalls(cmd) {
  const out = [];
  const re = /(?:^|[\s;&|(])(npm|npx|yarn|pnpm)(?=\s|$)((?:\s+-{1,2}[\w-]+(?:=\S+)?)*)\s*([\w@./:-]*)/g;
  let m;
  while ((m = re.exec(cmd)) !== null) {
    const tool = m[1];
    const sub = m[3] || "";
    if (tool === "npm") {
      if (CI_CMDS.has(sub)) out.push({ kind: "ci", text: `npm ${sub}` });
      else if (FETCH_CMDS.has(sub)) out.push({ kind: "fetch", text: `npm ${sub}` });
    } else {
      out.push({ kind: "fetch", text: `${tool} ${sub}`.trim(), tool, pkg: sub });
    }
  }
  return out;
}

// ---------- the lock ----------
let lock = null;
const lockText = read("package-lock.json");
const lockPkgs = new Set();
if (lockText === null) {
  line("CHECK", "package-lock.json", false, "no committed lock file");
} else {
  lock = JSON.parse(lockText);
  const pk = lock.packages || {};
  for (const k of Object.keys(pk)) lockPkgs.add(k.replace(/^.*node_modules\//, ""));
  const arkon = Object.keys(pk).filter((k) => /(^|\/)node_modules\/@arkon-ai\//.test(k));
  const bad = [];
  for (const k of arkon) {
    const e = pk[k];
    let host = "";
    try {
      const u = new URL(e.resolved || "");
      host = u.protocol === "https:" ? u.host : u.protocol + u.host;
    } catch {
      host = "none";
    }
    const integ = typeof e.integrity === "string" && /^sha512-/.test(e.integrity);
    console.log(`LOCK ${k} ${e.version} resolved_host=${host} integrity=${integ ? "yes" : "no"} ${e.dev ? "dev" : "prod"}`);
    if (host !== PRIVATE_HOST || !integ) bad.push(k);
  }
  const pj = JSON.parse(read("package.json") || "{}");
  const wanted = Object.keys({ ...(pj.dependencies || {}), ...(pj.devDependencies || {}), ...(pj.optionalDependencies || {}) })
    .filter((n) => n.startsWith("@arkon-ai/"));
  const missing = wanted.filter((n) => !pk["node_modules/" + n]);
  line("CHECK", "package-lock.json", bad.length === 0 && missing.length === 0 && (lock.lockfileVersion || 0) >= 2,
    `lockfileVersion ${lock.lockfileVersion}; @arkon-ai entries ${arkon.length}; resolved on ${PRIVATE_HOST} with sha512 integrity: ${arkon.length - bad.length}` +
    (bad.length ? `; NOT pinned: ${bad.join(", ")}` : "") + (missing.length ? `; in package.json, not in the lock: ${missing.join(", ")}` : ""));
}

// ---------- the repo .npmrc (counts only, never a line) ----------
const npmrc = read(".npmrc");
if (npmrc === null) {
  line("CHECK", ".npmrc", false, "no committed .npmrc: the scope is not pinned");
} else {
  const ls = npmrc.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith("#") && !s.startsWith(";"));
  const scope = ls.filter((s) => s.replace(/\/$/, "") === SCOPE_LINE).length;
  const otherScope = ls.filter((s) => /^@arkon-ai:registry\s*=/.test(s) && s.replace(/\/$/, "") !== SCOPE_LINE).length;
  const auth = ls.filter((s) => /_authToken\s*=/.test(s));
  const authRef = auth.filter((s) => /_authToken\s*=\s*\$\{[A-Z_][A-Z0-9_]*\}\s*$/.test(s)).length;
  const literal = ls.filter((s) => /(_auth|_password|_authToken|password)\s*=/.test(s)).length - authRef;
  const rrh = ls.filter((s) => /replace-registry-host/.test(s)).length;
  line("CHECK", ".npmrc", scope === 1 && otherScope === 0 && literal === 0 && rrh === 0,
    `scope pin lines ${scope}; other @arkon-ai registry lines ${otherScope}; token REFERENCE lines ${authRef}; literal credential lines ${literal}; replace-registry-host lines ${rrh}`);
}

// ---------- the Dockerfile ----------
function dockerInstructions(text) {
  const raw = text.split(/\r?\n/);
  const ins = [];
  let cur = null;
  raw.forEach((l, i) => {
    const t = l.trim();
    if (cur === null) {
      if (t === "" || t.startsWith("#")) return;
      cur = { line: i + 1, text: "" };
    } else if (t.startsWith("#")) {
      return; // a comment inside a continued instruction
    }
    const cont = /\\\s*$/.test(l);
    cur.text += (cur.text ? " " : "") + l.replace(/\\\s*$/, "").trim();
    if (!cont) {
      const m = cur.text.match(/^(\S+)\s*(.*)$/);
      ins.push({ line: cur.line, op: m[1].toUpperCase(), rest: m[2] });
      cur = null;
    }
  });
  if (cur) {
    const m = cur.text.match(/^(\S+)\s*(.*)$/);
    ins.push({ line: cur.line, op: m[1].toUpperCase(), rest: m[2] });
  }
  return { raw, ins };
}
function splitFlags(rest) {
  const flags = [];
  let s = rest.trim();
  let m;
  while ((m = s.match(/^(--[\w-]+(?:=(?:"[^"]*"|\S+))?)\s*/)) !== null) {
    flags.push(m[1]);
    s = s.slice(m[0].length);
  }
  return { flags, body: s };
}
function parseMount(flag) {
  const kv = {};
  for (const part of flag.replace(/^--mount=/, "").split(",")) {
    const i = part.indexOf("=");
    if (i < 0) kv[part] = "true";
    else kv[part.slice(0, i)] = part.slice(i + 1);
  }
  return kv;
}

const dockerfile = read("Dockerfile");
if (dockerfile === null) {
  line("CHECK", "Dockerfile", false, "no Dockerfile");
} else {
  const { raw, ins } = dockerInstructions(dockerfile);
  const syntaxLines = raw.map((l, i) => (/^\s*#\s*syntax\s*=/i.test(l) ? i + 1 : 0)).filter(Boolean);
  line("CHECK", "Dockerfile syntax", syntaxLines.length === 0,
    syntaxLines.length ? `a '# syntax=' frontend line at :${syntaxLines.join(", :")} (it pulls a frontend that sees the secret mount)` : "zero '# syntax=' line (the built-in frontend)");
  const rrh = raw.map((l, i) => (/replace-registry-host/.test(l) ? i + 1 : 0)).filter(Boolean);
  line("CHECK", "Dockerfile replace-registry-host", rrh.length === 0, rrh.length ? `at :${rrh.join(", :")}` : "zero");

  const stages = [];
  for (const x of ins) {
    if (x.op === "FROM") {
      const m = x.rest.match(/\s+AS\s+(\S+)\s*$/i);
      stages.push({ name: m ? m[1] : `#${stages.length}`, from: x.line, ins: [] });
    } else if (stages.length) {
      stages[stages.length - 1].ins.push(x);
    }
  }
  const last = stages[stages.length - 1];
  const tokenWord = /(TOKEN|_AUTH|NPM_AUTH|PASSWORD|SECRET)/i;
  for (const x of ins) {
    if ((x.op === "ARG" || x.op === "ENV") && tokenWord.test(x.rest)) {
      line("CHECK", `Dockerfile:${x.line}`, false, `${x.op} names a token (${x.op} ${x.rest.split(/[=\s]/)[0]}): a token in a build arg or env lands in the image history`);
    }
  }
  for (const st of stages) {
    const isRuntime = st === last;
    const copied = { npmrc: 0, lock: 0, pkg: 0 };
    for (const x of st.ins) {
      if (x.op === "COPY" || x.op === "ADD") {
        const { flags, body } = splitFlags(x.rest);
        const fromStage = flags.some((f) => f.startsWith("--from="));
        const parts = body.startsWith("[") ? JSON.parse(body) : body.split(/\s+/);
        const srcs = parts.slice(0, -1);
        const wholeCtx = !fromStage && srcs.some((s) => s === "." || s === "./" || s === "*");
        const hasNpmrc = srcs.some((s) => basename(s) === ".npmrc") || wholeCtx;
        if (!fromStage && hasNpmrc) copied.npmrc = x.line;
        if (!fromStage && (srcs.some((s) => basename(s) === "package-lock.json") || wholeCtx)) copied.lock = x.line;
        if (!fromStage && (srcs.some((s) => basename(s) === "package.json") || wholeCtx)) copied.pkg = x.line;
        if (isRuntime && hasNpmrc) {
          line("CHECK", `Dockerfile:${x.line}`, false, `stage ${st.name} (runtime) copies .npmrc${wholeCtx ? " (a whole-context COPY)" : ""}`);
        }
      }
      if (x.op !== "RUN") continue;
      if (!supported("Dockerfile", `Dockerfile:${x.line}`)) continue; // STAGE 1 refused this RUN
      const { flags, body } = splitFlags(x.rest);
      const mounts = flags.filter((f) => f.startsWith("--mount=")).map(parseMount);
      const secretMounts = mounts.filter((m) => m.type === "secret");
      if (/\/run\/secrets/.test(body)) {
        line("CHECK", `Dockerfile:${x.line}`, false, "a RUN reads /run/secrets (the token must reach npm by the mount's env= only)");
      }
      for (const m of secretMounts) {
        const why = [];
        if (m.id !== SECRET_ID) why.push(`id is not ${SECRET_ID}`);
        if (m.env !== TOKEN_VAR) why.push(`no env=${TOKEN_VAR}`);
        if (m.target || m.dst || m.destination) why.push("a secret FILE target");
        if (!/^npm\s+ci(\s+--[\w-]+(=\S+)?)*\s*$/.test(body)) why.push("the RUN does more than npm ci");
        if (/\bARKON_NPM_TOKEN\b|\bNPM_TOKEN\b|_authToken|\/run\/secrets/.test(body)) why.push("the token name or a secrets path in the command part");
        if (/\bset\s+-[a-z]*x|\becho\b|\bprintenv\b|(^|[\s;&|])env(\s|$)/.test(body)) why.push("set -x, echo, printenv or env in the command part");
        line("CHECK", `Dockerfile:${x.line} secret mount`, why.length === 0, why.length ? why.join("; ") : `type=secret id=${SECRET_ID} env=${TOKEN_VAR}; the command part is '${body}'`);
      }
      for (const c of npmCalls(body)) {
        const where = `Dockerfile:${x.line}`;
        const head = `stage=${st.name} "${body}"`;
        if (isRuntime) {
          line("SITE", where, false, `${head}: a registry install in the runtime stage (${c.text}${copied.lock ? "" : ", no lock"}${copied.npmrc ? "" : ", no .npmrc"})`);
          continue;
        }
        if (c.kind === "fetch") {
          line("SITE", where, false, `${head}: '${c.text}' can fetch a package by name from a registry (not from the lock)`);
          continue;
        }
        const why = [];
        if (!copied.lock || !copied.pkg) why.push("no package.json + package-lock.json COPY before it");
        if (!copied.npmrc) why.push("no .npmrc COPY before it (the @arkon-ai scope is not pinned)");
        const good = secretMounts.filter((m) => m.id === SECRET_ID && m.env === TOKEN_VAR);
        if (good.length === 0) why.push(`no secret mount (type=secret,id=${SECRET_ID},env=${TOKEN_VAR}) on this RUN`);
        line("SITE", where, why.length === 0, `${head}: ` + (why.length ? why.join("; ") : `npm ci from the lock; .npmrc copied at :${copied.npmrc}; token by the secret mount only`));
      }
    }
  }
}

// ---------- docker-entrypoint.sh (runs at container start: zero fetch) ----------
const entry = read("docker-entrypoint.sh");
if (entry !== null && supported("docker-entrypoint.sh")) {
  let n = 0;
  entry.split(/\r?\n/).forEach((l, i) => {
    if (/^\s*#/.test(l)) return;
    for (const c of npmCalls(l)) {
      n++;
      line("SITE", `docker-entrypoint.sh:${i + 1}`, false, `'${c.text}' at container start can fetch from a registry (${l.trim()})`);
    }
  });
  if (n === 0) line("CHECK", "docker-entrypoint.sh", true, "zero npm/npx/yarn/pnpm call");
}

// ---------- a tiny YAML reader (block mappings and sequences, block scalars) ----------
function yamlTree(text) {
  const lines = text.split(/\r?\n/);
  const rootNode = { col: -1, key: "(root)", children: [], line: 0 };
  const stack = [rootNode];
  const all = [];
  const stripComment = (s) => s.replace(/(^|\s)#.*$/, "");
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const content = stripComment(rawLine).replace(/\s+$/, "");
    if (content.trim() === "" || content.trim() === "---") continue;
    let col = content.search(/\S/);
    let rest = content.slice(col);
    let item = null;
    if (rest === "-" || rest.startsWith("- ")) {
      while (stack.length > 1) {
        const top = stack[stack.length - 1];
        if (top.col > col || (top.col === col && (top.isItem || top.value !== ""))) stack.pop();
        else if (top.col === col && !top.isItem && top.value === "") break; // a compact sequence
        else break;
      }
      item = { col, isItem: true, key: "-", value: "", children: [], line: i + 1, parent: stack[stack.length - 1] };
      item.parent.children.push(item);
      stack.push(item);
      all.push(item);
      const off = rest.slice(1).search(/\S/);
      if (off < 0) continue;
      col = col + 1 + off;
      rest = rest.slice(1 + off);
    } else {
      while (stack.length > 1 && stack[stack.length - 1].col >= col) stack.pop();
    }
    const m = rest.match(/^("[^"]*"|'[^']*'|[^\s:][^:]*?):(?:\s+(.*))?$/);
    if (!m) {
      if (item) item.value = rest;
      continue;
    }
    const node = { col, isItem: false, key: m[1].replace(/^["']|["']$/g, ""), value: (m[2] || "").trim(), children: [], line: i + 1, parent: stack[stack.length - 1] };
    node.parent.children.push(node);
    all.push(node);
    stack.push(node);
    if (/^[|>][-+]?$/.test(node.value)) {
      node.body = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (l.trim() === "") {
          node.body.push({ line: j + 1, text: "" });
          continue;
        }
        if (l.search(/\S/) <= node.col) break;
        node.body.push({ line: j + 1, text: l });
      }
      i = j - 1;
    }
  }
  return { root: rootNode, all };
}
const kid = (n, k) => (n ? n.children.find((c) => !c.isItem && c.key === k) : undefined);
const runLines = (n) => (n.body ? n.body.filter((b) => b.text.trim() !== "") : [{ line: n.line, text: n.value }]);
const expr = (v) => v.replace(/^\$\{\{\s*/, "").replace(/\s*\}\}$/, "").replace(/^["']|["']$/g, "").replace(/\s+/g, "");

// ---------- workflows ----------
const wfDir = join(root, ".github", "workflows");
const wfFiles = existsSync(wfDir) ? readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)).sort() : [];
for (const rel of [...wfFiles.map((f) => `.github/workflows/${f}`), ...acFiles]) {
  const text = read(rel);
  const ptt = (text.match(/pull_request_target/g) || []).length;
  line("CHECK", `${rel} pull_request_target`, ptt === 0, `count ${ptt}`);
  const rrh = (text.match(/replace-registry-host/g) || []).length;
  if (rrh) line("CHECK", `${rel} replace-registry-host`, false, `count ${rrh}`);
  const { all } = yamlTree(text);
  for (const n of all.filter((x) => x.key === "run")) {
    if (!supported(rel, `${rel}:${n.line}`)) continue; // STAGE 1 refused this file or this run
    for (const b of runLines(n)) {
      if (/^\s*#/.test(b.text)) continue;
      for (const c of npmCalls(b.text)) {
        if (c.kind === "ci") {
          const ok = npmrc !== null;
          line("SITE", `${rel}:${b.line}`, ok, `"${b.text.trim()}": npm ci from the lock in the checkout; ${ok ? "the checked-out repo .npmrc pins the scope" : "NO repo .npmrc"}`);
        } else if (c.tool === "npx") {
          const inLock = lockPkgs.has(c.pkg);
          line("NOTE", `${rel}:${b.line}`, true, `"${b.text.trim()}": npx ${c.pkg} ${inLock ? "is in the lock (runs the locked copy)" : "is NOT in the lock: npx fetches it by name from the default registry (a public name, not @arkon-ai)"}`);
        } else {
          line("SITE", `${rel}:${b.line}`, false, `"${b.text.trim()}": '${c.text}' can fetch a package by name (not from the lock)`);
        }
      }
    }
  }
}

// ---------- shell scripts under scripts/ ----------
function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
for (const p of walk(join(root, "scripts")).sort()) {
  const rel = relative(root, p).split("\\").join("/");
  if (SELF.has(rel) || !/\.(sh|bash)$/.test(rel)) continue;
  if (!supported(rel)) continue; // STAGE 1 refused this file
  const text = readFileSync(p, "utf8");
  text.split(/\r?\n/).forEach((l, i) => {
    if (/^\s*#/.test(l)) return;
    for (const c of npmCalls(l)) {
      if (c.kind === "ci") {
        const pins = /\.npmrc/.test(text) || !/\bcd\s/.test(text);
        line("SITE", `${rel}:${i + 1}`, pins, `"${l.trim()}": npm ci from the lock; ${pins ? "the repo .npmrc travels with it" : "it changes dir and does not copy the repo .npmrc"}`);
      } else if (c.tool === "npx") {
        const inLock = lockPkgs.has(c.pkg);
        line("NOTE", `${rel}:${i + 1}`, true, `npx ${c.pkg} ${inLock ? "is in the lock" : "is NOT in the lock: npx fetches it by name from the default registry (a public name, not @arkon-ai)"}`);
      } else {
        line("SITE", `${rel}:${i + 1}`, false, `"${l.trim()}": '${c.text}' can fetch a package by name (not from the lock)`);
      }
    }
  });
}

// ---------- package.json scripts ----------
const pjText = read("package.json");
if (pjText !== null) {
  const scripts = JSON.parse(pjText).scripts || {};
  let n = 0;
  for (const [k, v] of Object.entries(scripts)) {
    if (!supported("package.json scripts", `package.json scripts.${k}`)) continue; // STAGE 1 refused it
    for (const c of npmCalls(String(v))) {
      if (c.kind === "fetch" && c.tool !== "npx") {
        n++;
        line("SITE", `package.json scripts.${k}`, false, `'${c.text}' can fetch a package by name`);
      }
    }
  }
  if (n === 0) line("CHECK", "package.json scripts", true, "zero npm install/update/exec, yarn or pnpm call");
}

// ---------- the PR image job: .github/workflows/image-build.yml ----------
const IB = ".github/workflows/image-build.yml";
const ib = read(IB);
if (ib === null) {
  line("CHECK", IB, false, "missing: no PR CI job builds the image stages with the BuildKit secret");
} else {
  const { root: y, all } = yamlTree(ib);
  // on: pull_request and push only
  const on = kid(y, "on") || kid(y, "true");
  const events = on ? (on.value ? on.value.replace(/[[\]\s]/g, "").split(",").filter(Boolean) : on.children.map((c) => c.key)) : [];
  const extra = events.filter((e) => e !== "pull_request" && e !== "push");
  line("CHECK", `${IB} on`, events.includes("pull_request") && extra.length === 0, `events: ${events.join(", ") || "none"}${extra.length ? `; not allowed: ${extra.join(", ")}` : ""}`);
  // permissions: contents: read (top level; every job-level block too)
  const perms = all.filter((n) => !n.isItem && n.key === "permissions");
  const top = kid(y, "permissions");
  const permOk = (n) => n.value === "" && n.children.length === 1 && n.children[0].key === "contents" && n.children[0].value === "read";
  line("CHECK", `${IB} permissions`, !!top && perms.every(permOk), top ? (perms.every(permOk) ? "contents: read (only)" : "a permissions block grants more than contents: read") : "no top-level permissions block");
  // exactly ONE secrets. reference, in the env of the same-repo step that runs buildx
  const refs = (ib.match(/secrets\./g) || []).length;
  const ibLines = ib.split(/\r?\n/);
  const refLine = ibLines.findIndex((l) => /secrets\./.test(l)) + 1;
  const refNode = all.find((n) => n.line === refLine && !n.isItem);
  let why = [];
  let step = null;
  if (refs !== 1) why.push(`${refs} 'secrets.' references (want exactly 1)`);
  if (refs >= 1) {
    if (!refNode || refNode.key !== TOKEN_VAR) why.push(`the reference is not an env row named ${TOKEN_VAR}`);
    else if (refNode.value.replace(/\s+/g, "") !== "${{secrets.ARKON_NPM_TOKEN}}") why.push(`the env row reads more than secrets.${TOKEN_VAR}`);
    const envNode = refNode && refNode.parent;
    if (!envNode || envNode.key !== "env") why.push("the reference is not in an env block");
    else {
      step = envNode.parent;
      if (!step || !step.isItem || !step.parent || step.parent.key !== "steps") {
        why.push("the env block holding the secret is not a step's env (a job or workflow env)");
        step = null;
      }
    }
  }
  if (step) {
    const ifn = kid(step, "if");
    if (!ifn) why.push("the secret step has no if:");
    else if (!SECRET_STEP_IFS.has(expr(ifn.value))) why.push(`the secret step's if: is not the same-repo guard (${SAME_REPO})`);
    const run = kid(step, "run");
    const body = run ? runLines(run).map((b) => b.text).join("\n") : "";
    if (!/docker\s+buildx\s+build/.test(body)) why.push("the secret step does not run docker buildx build");
    if (!/--secret\s+id=arkon_npm_token,env=ARKON_NPM_TOKEN(\s|$)/.test(body)) why.push(`no '--secret id=${SECRET_ID},env=${TOKEN_VAR}' on the build`);
  }
  line("CHECK", `${IB} secret`, why.length === 0, why.length ? why.join("; ") : `exactly 1 'secrets.' reference: ${TOKEN_VAR} in the env of the step at :${step.line}, if: same-repo only`);
  // zero secrets in any run body; zero --push/--cache-to/--output on any buildx build
  const runs = all.filter((n) => !n.isItem && n.key === "run");
  const secInRun = runs.filter((n) => runLines(n).some((b) => /\$\{\{\s*secrets|secrets\./.test(b.text))).map((n) => n.line);
  line("CHECK", `${IB} run bodies`, secInRun.length === 0, secInRun.length ? `'\${{ secrets' in the run at :${secInRun.join(", :")}` : "zero secrets reference in any run: body");
  const exportFlags = [];
  for (const n of runs) {
    for (const b of runLines(n)) {
      if (/(--push|--cache-to|--output)(\s|=|$)|\s-o(\s|=)/.test(b.text)) exportFlags.push(b.line);
    }
  }
  line("CHECK", `${IB} buildx export`, exportFlags.length === 0, exportFlags.length ? `--push, --cache-to or --output at :${exportFlags.join(", :")}` : "zero --push, --cache-to or --output");
  // a fork PR: one step prints that the secret stage is skipped
  const steps = all.filter((n) => n.isItem && n.parent && n.parent.key === "steps");
  const forkStep = steps.find((s) => kid(s, "if") && expr(kid(s, "if").value).includes(FORK.replace(/\s+/g, "")) && kid(s, "run"));
  line("CHECK", `${IB} fork PR`, !!forkStep, forkStep ? `the step at :${forkStep.line} runs only on a fork PR and prints the skip line` : `no step guarded by '${FORK}' that prints the skip`);
  // T1 runs on every run (a step with no if:)
  const t1 = steps.find((s) => !kid(s, "if") && kid(s, "run") && runLines(kid(s, "run")).some((b) => /node\s+scripts\/check-npm-install-sites\.mjs/.test(b.text)));
  line("CHECK", `${IB} T1`, !!t1, t1 ? `the step at :${t1.line} runs this check with no if:` : "no unconditional step runs scripts/check-npm-install-sites.mjs");
  // actions pinned by a full commit SHA only
  const uses = all.filter((n) => !n.isItem && n.key === "uses");
  const unpinned = uses.filter((n) => !/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(n.value)).map((n) => `:${n.line} ${n.value}`);
  line("CHECK", `${IB} uses`, unpinned.length === 0, unpinned.length ? `not pinned by a 40-hex SHA: ${unpinned.join(", ")}` : `${uses.length} action(s), each pinned by a 40-hex SHA`);
}

console.log(`T1 RESULT: ${fails === 0 ? "PASS" : "FAIL"} (${oks} OK, ${fails} FAIL)`);
process.exit(fails === 0 ? 0 : 1);
