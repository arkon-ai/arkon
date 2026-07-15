# CLAUDE.md

Project-level context for Claude Code sessions in this repo.

## Coding Doctrine v2

Canonical: `warden-memory/docs/coding-doctrine-v2.md`. Inlined here so it
loads even when warden-memory isn't on the host.

These rules apply to every task in this repo unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

### Rule 1 — Think before coding
State assumptions explicitly. If uncertain, ask rather than guess.
Present multiple interpretations when ambiguity exists.
Push back when a simpler approach exists.
Stop when confused. Name what's unclear.

### Rule 2 — Simplicity first
Minimum code that solves the problem. Nothing speculative.
No features beyond what was asked. No abstractions for single-use code.
Test: would a senior engineer say this is overcomplicated? If yes, simplify.

### Rule 3 — Surgical changes
Touch only what you must. Clean up only your own mess.
Don't "improve" adjacent code, comments, or formatting.
Don't refactor what isn't broken. Match existing style.

### Rule 4 — Goal-driven execution
Define success criteria up front. Loop until verified.
Don't follow steps — define success and iterate.
Strong success criteria let you loop independently.

### Rule 5 — Use the model only for judgment calls
Use me for: classification, drafting, summarization, extraction.
Do NOT use me for: routing, retries, deterministic transforms.
If code can answer, code answers.

### Rule 6 — Fetch current docs before touching external code
Before writing or editing code that calls any external library, SDK, CLI, or
cloud service: fetch current docs (Context7, official site, or library README).
Your training data is frozen; the library is not.
Skip only for: refactors within established patterns, internal APIs, code
review, general programming concepts.

### Rule 7 — Surface conflicts, don't average them
If two patterns contradict, pick one (more recent / more tested).
Explain why. Flag the other for cleanup.
Don't blend conflicting patterns to "feel safe."

### Rule 8 — Read before you write
Before adding code, read exports, immediate callers, shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.

### Rule 9 — Tests verify intent, not just behavior
Tests must encode WHY behavior matters, not just WHAT it does.
If a test still passes after you flip a key business rule, the test is wrong.

### Rule 10 — Checkpoint after every significant step
Summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back.
If you lose track, stop and restate.

### Rule 11 — Match the codebase's conventions, even if you disagree
Conformance > taste inside the codebase.
If you genuinely think a convention is harmful, surface it. Don't fork silently.

### Rule 12 — Fail loud
"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.

### Rule 13 — No drive-by dependencies
Don't add a package for a 10-line utility.
A new dependency needs a one-line justification: why this, why not vendor, why not stdlib.
Audit transitive cost: every new dep ships its own deps.

### Rule 14 — Absolute dates only
No "today", "tomorrow", "last week" in code, comments, commit messages, or task descriptions.
They rot. Write ISO-8601 (`2026-05-11`) and let future-you read it cold.

## Arkon Design System (canonical — read before ANY UI work)

This repo is **Arkon** — the **master / parent** of the design system (operator
command center). **One Arkon design system; three surfaces (Arkon · ArkonOS ·
ArkonHelm) inherit it wholesale; the only per-product variation is identity
(wordmark + glyph + switcher chip).** This app additionally hosts the **product
switcher** (Arkon `Cmd` · ArkonOS `Chat` · ArkonHelm `Tasks`) and the four-pillar
sidebar IA (Provision · Govern · Observe · Kill).

Brand v4 (ION, P6, transformate WI-1901/1904): **Hull** `#070A0E` (background) +
**Ion** `#2BD9FF` (sole accent; light `#8FECFF` / deep `#0F7E9E`) + **info**
`#4D8DFF`. Type: **Archivo** (display/wordmark) + **General Sans** (UI) +
**JetBrains Mono** (code/numerals), all self-hosted — no CDN/Google Fonts —
via `@arkon-ai/ui/fonts.css`. Identity is the stroked A-letterform mark.

- **Canonical contract:** `warden-memory/docs/arkon-design-system.md`. Identity
  authority: `ARKON-BRAND-IDENTITY-v4.md` (arkon-rebrand/battle, off-repo).
  Invoke the **`arkon-ui`** skill on any UI / styling / component / redesign
  task — it loads the contract and runs the build→verify loop before
  `pr-review-loop`.
- **Build to the kit:** the `.ak-*` component kit now ships from the package —
  `@arkon-ai/ui/kit.css` (published as `css/arkon-kit.css`), imported in
  `src/app/globals.css` alongside `tokens.css`/`fonts.css`. Compose from it
  (MetricCard / StatusPill / PageHeader / EmptyState / KillModal live as
  `.ak-*` primitives); reference `var(--*)` tokens — never hardcode hex/px.
  Older components that still hand-roll token usage should migrate onto the
  `.ak-*` classes as they're touched, not perpetuate new one-offs.
- **Design laws:** numerals in JetBrains Mono (`tabular-nums`); Ion does ONE job
  per region (H1 never Ion; active-nav = Ion-text-on-quiet-fill, not
  Ion-fill); depth + borders carry state, plus ONE sanctioned `--quarn-glow`
  per card on hover/active (WI-994 amendment, 2026-06-08 — was "no glows");
  `--quarn-glow` / `--shadow-quarn-glow` / `--quarn-bar-glow` are the ONE
  deliberately-kept legacy name — the package ships no `--ion-glow`
  equivalent, so these three re-derive Ion's rgb through `--quarn-rgb` one hop
  down and must NOT be renamed (P6, transformate WI-1901); no *legacy
  decorative* glows, no purple; status colour semantic only; sentence case
  headings/buttons; dark-first / Hull; kill = `octagon-x` in Danger + a 350ms
  deliberate confirm modal; no emoji (Lucide only).
- **NEVER resurrect** old/redundant/historic styles — retired language ("Arkon
  Workspace" / "AI Control Plane" / "AI Governance Platform" → "Arkon" / "AI
  Workforce Platform"), the stale `Inter` fallback (Archivo/General Sans are
  primary now, not Geist either), *legacy decorative* glows (`.glow-*`,
  `glowing-effect` — NOT the sanctioned premium `--quarn-glow`/`--depth-*`
  primitives), purple, `--cyan/--purple/--green/--amber` aliases, and the
  killed **Quarn**/**Void** brand names — `--quarn*`/`--void` now resolve as
  one-hop `var()` aliases of `--ion*`/`--hull` for back-compat only (P6,
  transformate WI-1901); new code references `--ion`/`--hull` directly except
  for the three glow tokens above. Migrate off legacy names as files are
  touched (backlog in the canonical doc §9), don't copy them into new code.
- **Identity:** shipped (transformate WI-1904) — `arkon-glyph.svg` is wired
  into the sidebar brand mark (`src/components/mission-control/app-shell.tsx`)
  and page metadata (`src/app/layout.tsx`), alongside the A-letterform icon
  set (`icon-192.svg`, `icon-maskable.svg`), wordmark, and `og-image.png`.
- **Verify** UI visually (headless screenshot) before opening the PR.
