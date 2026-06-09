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

- **Canonical contract:** `warden-memory/docs/arkon-design-system.md`. Identity
  authority: `ARKON-BRAND-IDENTITY-v3.md`. Invoke the **`arkon-ui`** skill on any
  UI / styling / component / redesign task — it loads the contract and runs the
  build→verify loop before `pr-review-loop`.
- **Build to the kit:** compose from the 5 primitives (MetricCard / StatusPill /
  PageHeader / EmptyState / KillModal); reference `var(--*)` tokens — never
  hardcode hex/px. This repo has **no component kit yet** (each component
  hand-rolls token usage) — extract an `.ak-*`/kit layer from
  `arkon-os/client/src/styles/arkon-kit.css` rather than perpetuating one-offs.
- **Design laws:** numerals in Geist Mono (`tabular-nums`); Quarn does ONE job
  per region (H1 never emerald; active-nav = emerald-text-on-quiet-fill, not
  emerald-fill); depth + borders carry state, plus ONE sanctioned `--quarn-glow`
  per card on hover/active (WI-994 amendment, 2026-06-08 — was "no glows"); no
  *legacy decorative* glows, no purple; status
  colour semantic only; sentence case headings/buttons; dark-first / Void;
  kill = `octagon-x` in Danger + a 350ms deliberate confirm modal; no emoji
  (Lucide only).
- **NEVER resurrect** old/redundant/historic styles — retired language ("Arkon
  Workspace" / "AI Control Plane" / "AI Governance Platform" → "Arkon" / "AI
  Workforce Platform"), the stale `Inter` fallback (Geist is primary), *legacy
  decorative* glows (`.glow-*`, `glowing-effect` — NOT the sanctioned premium
  `--quarn-glow`/`--depth-*` primitives), purple,
  `--cyan/--purple/--green/--amber` aliases. Migrate off them (backlog
  in the canonical doc §9), don't copy them.
- **Identity gaps to fix when chrome is touched:** the sidebar brand is
  text-only ("Arkon / Workspace") — wire the master `arkon-glyph.svg` and drop
  "Workspace"; `public/icon-192.svg` is a stale pre-rebrand favicon — regenerate
  from the canonical A mark (details in the canonical doc §6).
- **Verify** UI visually (headless screenshot) before opening the PR.
