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
