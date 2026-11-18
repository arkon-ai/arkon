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

// npm/npx/yarn/pnpm calls in one shell command string. F8 (WI-4774): a call by a path
// (/usr/bin/npm, ./node_modules/.bin/npm) or by npm's own npm-cli.js / npx-cli.js is a call too.
function npmCalls(cmd) {
  const out = [];
  const re = /(?:^|[\s;&|(])((?:[\w.~${}@+-]*\/)+)?(npm|npx|yarn|pnpm|npm-cli\.js|npx-cli\.js)(?=\s|$)((?:\s+-{1,2}[\w-]+(?:=\S+)?)*)\s*([\w@./:-]*)/g;
  let m;
  while ((m = re.exec(cmd)) !== null) {
    const byPath = !!m[1] || m[2].endsWith(".js");
    const tool = m[2].replace(/-cli\.js$/, "");
    const tag = byPath ? " (F8 npm by path)" : "";
    const name = byPath ? `${m[1] || ""}${m[2]}` : tool;
    const sub = m[4] || "";
    if (tool === "npm") {
      if (CI_CMDS.has(sub)) out.push({ kind: "ci", text: `${name} ${sub}${tag}` });
      else if (FETCH_CMDS.has(sub)) out.push({ kind: "fetch", text: `${name} ${sub}${tag}` });
    } else {
      out.push({ kind: "fetch", text: `${name} ${sub}`.trim() + tag, tool, pkg: sub });
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
// F7 (WI-4774 F1): an instruction's shell words as BuildKit splits them (on whitespace, raw
// quotes kept). Only a whole word '<<WORD' or '<<-WORD' outside quotes (fd digits first, the
// WORD itself may be quoted) opens a heredoc: a '<<WORD' inside quotes opens nothing. `bare`
// is a word's text outside quotes; `comment` is the text from an unquoted word-start '#' on.
const HEREDOC_WORD = /^\d*<<(-?)(["']?)([A-Za-z_][\w.-]*)\2$/;
function shellWords(text) {
  const words = [];
  let raw = "";
  let bare = "";
  let inWord = false;
  let q = "";
  let comment = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      raw += ch;
      if (ch === "\\" && q === '"' && i + 1 < text.length) raw += text[++i];
      else if (ch === q) q = "";
      continue;
    }
    if (/\s/.test(ch)) {
      if (inWord) words.push({ raw, bare });
      raw = "";
      bare = "";
      inWord = false;
      continue;
    }
    if (ch === "#" && !inWord) {
      comment = text.slice(i);
      break;
    }
    inWord = true;
    raw += ch;
    if (ch === "'" || ch === '"') q = ch;
    else if (ch === "\\" && i + 1 < text.length) raw += text[++i];
    else bare += ch;
  }
  if (inWord) words.push({ raw, bare });
  return { words, comment };
}
function dockerInstructions(text) {
  const raw = text.split(/\r?\n/);
  const ins = [];
  let cur = null;
  let here = null; // F7 (WI-4774): an open heredoc; its lines belong to the instruction, not new ones
  raw.forEach((l, i) => {
    if (here) {
      const w = here.words[0];
      if ((w.strip ? l.replace(/^\t+/, "") : l) === w.word) here.words.shift();
      else here.x.heredoc.push(l);
      if (here.words.length === 0) {
        here.x.unterminated = false;
        here = null;
      }
      return;
    }
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
      const x = { line: cur.line, op: m[1].toUpperCase(), rest: m[2] };
      const sw = shellWords(m[2]);
      const words = [];
      for (const w of sw.words) {
        const h = w.raw.match(HEREDOC_WORD);
        if (h) words.push({ strip: h[1] === "-", word: h[3] });
        else if (/(?<!<)<<(?!<)/.test(w.bare)) x.heredocOdd = `a '<<' in the word '${w.raw}' that is no '<<WORD'`;
      }
      if (/(?<!<)<<(?!<)/.test(sw.comment)) x.heredocOdd = "a '<<' after a shell comment '#' (BuildKit's word split may open a heredoc there)";
      if (words.length) {
        x.heredoc = [];
        x.unterminated = true;
        here = { x, words };
      }
      ins.push(x);
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
    if (x.heredoc && (x.op !== "RUN" || x.unterminated)) {
      line("CHECK", `Dockerfile:${x.line}`, false, `F7 RUN heredoc: ${x.unterminated ? "a heredoc with no end line" : `a heredoc on ${x.op}`} is not modelled (fail closed)`);
    }
    if (x.heredocOdd) {
      line("CHECK", `Dockerfile:${x.line}`, false, `F7 RUN heredoc: ${x.heredocOdd} is not modelled (fail closed)`);
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
      const { flags, body } = splitFlags(x.rest);
      const mounts = flags.filter((f) => f.startsWith("--mount=")).map(parseMount);
      const secretMounts = mounts.filter((m) => m.type === "secret");
      // F6 exec-form JSON RUN, F7 RUN heredoc (WI-4774): the command is the JSON array's words
      // or the heredoc's lines, and the matcher reads that. The secret mount row keeps its rule.
      let cmd = body;
      const forms = [];
      if (body.startsWith("[")) {
        let a = null;
        try {
          a = JSON.parse(body);
        } catch {
          a = null; // not JSON: Docker runs it in the shell form
        }
        if (Array.isArray(a)) {
          cmd = a.map(String).join(" ");
          forms.push("F6 exec-form JSON RUN");
        }
      }
      if (x.heredoc) {
        cmd = `${cmd}\n${x.heredoc.join("\n")}`;
        forms.push("F7 RUN heredoc");
      }
      const shown = forms.length ? `${cmd.replace(/\n/g, " \\n ")}" [${forms.join(", ")}]` : `${body}"`;
      if (/\/run\/secrets/.test(cmd)) {
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
      for (const c of npmCalls(cmd)) {
        const where = `Dockerfile:${x.line}`;
        const head = `stage=${st.name} "${shown}`;
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
if (entry !== null) {
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
// It models block mappings, block sequences, one-line scalars, one-line flow sequences and
// '|' or '>' block scalars. Each other construct is a FAIL row, never a silent skip
// (transformate WI-4774): F1 an anchor, F2 an alias or a merge key, F5 a multi-line flow
// scalar, UNREADABLE (a tab in the indent, a flow mapping or an unclosed flow sequence, a
// tag, a directive, a complex key, a second document, a block scalar header it does not
// read, or a line that is no key, item or block scalar).
const F1 = "F1 YAML anchor";
const F2 = "F2 YAML alias or merge key";
const F5 = "F5 multi-line flow scalar";
const UNREADABLE = "UNREADABLE";
function yamlTree(text) {
  const lines = text.split(/\r?\n/);
  const rootNode = { col: -1, key: "(root)", children: [], line: 0 };
  const stack = [rootNode];
  const all = [];
  const bad = [];
  const flag = (form, line, what) => bad.push({ form, line, what });
  const stripComment = (s) => s.replace(/(^|\s)#.*$/, "");
  // node properties in front of a node: '&a' (F1), '*a' (F2), '!tag' (UNREADABLE)
  const props = (s, line) => {
    let p;
    while ((p = s.match(/^([&*!])(\S*)\s*/)) !== null) {
      if (p[1] === "&") flag(F1, line, `an anchor '&${p[2]}'`);
      else if (p[1] === "*") flag(F2, line, `an alias '*${p[2]}'`);
      else flag(UNREADABLE, line, `a tag '!${p[2]}'`);
      s = s.slice(p[0].length);
    }
    return s;
  };
  // a one-line flow sequence is read as text; a flow mapping or an unclosed flow is not
  const flow = (s, line) => {
    if (!/^[[{]/.test(s)) return;
    const opens = (s.match(/\[/g) || []).length;
    const closes = (s.match(/\]/g) || []).length;
    if (s.startsWith("{") || /\{/.test(s) || opens !== closes || !s.endsWith("]")) {
      flag(UNREADABLE, line, "a flow mapping or an unclosed flow collection");
    }
    for (const a of s.matchAll(/[[,]\s*([&*])([^\s,\]]*)/g)) {
      if (a[1] === "&") flag(F1, line, `an anchor '&${a[2]}' in a flow sequence`);
      else flag(F2, line, `an alias '*${a[2]}' in a flow sequence`);
    }
  };
  let seen = false;
  let last = null; // the last node that holds a one-line scalar: a deeper line after it continues it (F5)
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const content = stripComment(rawLine).replace(/\s+$/, "");
    if (content.trim() === "") continue;
    if (/^ *\t/.test(rawLine)) {
      flag(UNREADABLE, i + 1, "a tab in the indent");
      continue;
    }
    if (content.trim() === "---" || content.trim() === "...") {
      if (seen || content.trim() === "...") flag(UNREADABLE, i + 1, "a second document or a document end");
      continue;
    }
    if (content.startsWith("%")) {
      flag(UNREADABLE, i + 1, "a directive");
      continue;
    }
    seen = true;
    let col = content.search(/\S/);
    let rest = content.slice(col);
    if (last && col > last.col) {
      flag(F5, i + 1, `the scalar of :${last.line} goes on over this line`);
      continue;
    }
    last = null;
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
    rest = props(rest, i + 1);
    if (rest === "") continue;
    if (rest === "?" || rest.startsWith("? ")) {
      flag(UNREADABLE, i + 1, "a complex key '?'");
      continue;
    }
    const m = /^[[{|>]/.test(rest) ? null : rest.match(/^("[^"]*"|'[^']*'|[^\s:][^:]*?):(?:\s+(.*))?$/);
    if (!m) {
      if (item && /^[[{]/.test(rest)) flow(rest, i + 1);
      else if (item && /^[|>]/.test(rest)) flag(UNREADABLE, i + 1, "a block scalar as a sequence item");
      else if (!item) flag(UNREADABLE, i + 1, "a line that is no key, item or block scalar");
      if (item) item.value = rest;
      if (item) last = item;
      continue;
    }
    if (m[1] === "<<") flag(F2, i + 1, "a merge key '<<'");
    const value = props((m[2] || "").trim(), i + 1);
    flow(value, i + 1);
    const node = { col, isItem: false, key: m[1].replace(/^["']|["']$/g, ""), value, children: [], line: i + 1, parent: stack[stack.length - 1] };
    node.parent.children.push(node);
    all.push(node);
    stack.push(node);
    if (/^[|>]/.test(node.value) && !/^[|>][-+]?$/.test(node.value)) {
      flag(UNREADABLE, i + 1, `a block scalar header '${node.value}' it does not read`);
    }
    if (node.value !== "" && !/^[|>]/.test(node.value)) last = node;
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
  return { root: rootNode, all, bad };
}
const kid = (n, k) => (n ? n.children.find((c) => !c.isItem && c.key === k) : undefined);
const runLines = (n) => (n.body ? n.body.filter((b) => b.text.trim() !== "") : [{ line: n.line, text: n.value }]);
const expr = (v) => v.replace(/^\$\{\{\s*/, "").replace(/\s*\}\}$/, "").replace(/^["']|["']$/g, "").replace(/\s+/g, "");

// ---------- workflows ----------
const wfDir = join(root, ".github", "workflows");
const wfFiles = existsSync(wfDir) ? readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)).sort() : [];
for (const f of wfFiles) {
  const rel = `.github/workflows/${f}`;
  const text = read(rel);
  const ptt = (text.match(/pull_request_target/g) || []).length;
  line("CHECK", `${rel} pull_request_target`, ptt === 0, `count ${ptt}`);
  const rrh = (text.match(/replace-registry-host/g) || []).length;
  if (rrh) line("CHECK", `${rel} replace-registry-host`, false, `count ${rrh}`);
  const { root: wf, all, bad } = yamlTree(text);
  for (const b of bad) line("CHECK", `${rel}:${b.line} yaml`, false, `${b.form}: ${b.what} (the reader does not model it: fail closed)`);
  // F3 workflow env, F4 job env (WI-4774): such an env reaches every step under it. The reader
  // models it as a block map of plain NAME: text rows only. It FAILs on an env that is no block
  // map, a row that is no one NAME: value, a secrets or ${{ }} value, or a name npm reads.
  const envs = [];
  if (kid(wf, "env")) envs.push(["F3 workflow env", kid(wf, "env")]);
  for (const j of (kid(wf, "jobs") || { children: [] }).children) if (kid(j, "env")) envs.push(["F4 job env", kid(j, "env")]);
  for (const [form, e] of envs) {
    const why = [];
    if (e.value !== "") why.push("not a block map of NAME: value rows");
    for (const r of e.children) {
      if (r.isItem || r.children.length || r.body) why.push(`the row at :${r.line} is not one NAME: value`);
      else if (/secrets\.|\$\{\{/.test(r.value)) why.push(`${r.key} takes a secrets or \${{ }} value`);
      else if (/^(npm_config_|NODE_AUTH_TOKEN$|NPM_TOKEN$)/i.test(r.key) || r.key === TOKEN_VAR) why.push(`${r.key} is a name npm reads`);
    }
    const reasons = why.join("; ");
    if (why.length) line("CHECK", `${rel}:${e.line} ${form.slice(0, 2)}`, false, `${form}: ${reasons} (it reaches every step under it: fail closed)`);
  }
  for (const n of all.filter((x) => x.key === "run")) {
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
