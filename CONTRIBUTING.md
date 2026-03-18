# Contributing to Arkon

Thanks for considering a contribution. Arkon is the AI governance platform — built for small teams and agency owners who run real agents in production.

## How to contribute

### Reporting bugs

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, Docker version, browser)

### Suggesting features

Open an issue with the `feature-request` label. Explain the problem you're solving, not just the feature you want. "I need a way to stop an agent mid-run from my phone" is better than "add a mobile kill switch."

### Submitting code

1. Fork the repo
2. Create a branch: `git checkout -b fix/your-fix-name`
3. Make your changes
4. Test locally with `docker compose up`
5. Commit with a clear message: `fix: prevent duplicate threat alerts within cooldown window`
6. Open a PR against `main`

### Commit messages

Use conventional commits:
- `fix:` — bug fixes
- `feat:` — new features
- `docs:` — documentation changes
- `refactor:` — code changes that don't fix bugs or add features
- `chore:` — maintenance, dependencies, tooling

### Code style

- TypeScript for all new code
- Follow existing patterns in the codebase
- Keep components focused — one responsibility per file
- API routes go in `src/app/api/`
- Shared logic goes in `src/lib/`

## What we're looking for

Check the [issues](../../issues) for things tagged `good-first-issue` or `help-wanted`. High-impact areas:

- **SDK development** — Node.js and Python client libraries
- **Threat detection patterns** — new ThreatGuard regex patterns for emerging attack types
- **Workflow templates** — pre-built automation templates for common scenarios
- **Documentation** — guides, examples, translations
- **NemoClaw/OpenClaw integration** — deeper framework-specific features

## Code of conduct

Be direct, be helpful, be respectful. We're building tools for people who run AI agents in production — the stakes are real. Treat every contributor's time as valuable.

## Questions?

Open a discussion in the [Q&A category](../../discussions) or reach out on [Discord](https://discord.gg/arkon).
