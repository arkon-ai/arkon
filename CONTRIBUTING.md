# Contributing to Arkon

Thanks for your interest in contributing to Arkon. This guide covers everything you need to get started.

---

## Where We Want Contributions

- **Integrations & SDK adapters** — CrewAI, AutoGen, LangChain, LangGraph
- **ThreatGuard detection patterns** — new regex patterns for threat classes
- **Workflow node types** — expand what workflows can do
- **Documentation & tutorials** — guides, examples, walkthroughs
- **Bug reports & testing** — across environments and edge cases
- **UI improvements** — accessibility, mobile, polish

## Where We Maintain Control

These areas require maintainer approval before work begins:

- Core governance engine (`src/lib/threat-scanner.ts`, `src/lib/workflow-engine.ts`)
- Authentication and multi-tenant architecture
- Security-critical code paths
- Database schema changes
- Billing and pricing logic

Open an issue to discuss before submitting PRs in these areas.

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- Git

### Setup

```bash
# Clone the repo
git clone https://github.com/arkon-ai/arkon.git
cd arkon

# Copy environment config
cp .env.example .env
# Edit .env — at minimum set MC_ADMIN_TOKEN

# Start the database
docker compose up db -d

# Install dependencies
npm install

# Run migrations
npm run migrate

# Start dev server
npm run dev
```

Open `http://localhost:3000` — the setup wizard will walk you through initial configuration.

### Project Structure

```
src/
├── app/                    # Next.js app router (pages + API routes)
│   ├── (app)/              # Authenticated app pages
│   ├── (client)/           # Client portal pages
│   └── api/                # API endpoints
├── components/
│   └── mission-control/    # All UI components
├── lib/                    # Core libraries
│   ├── threat-scanner.ts   # ThreatGuard detection engine
│   ├── workflow-engine.ts  # Workflow execution engine
│   ├── workflow-scheduler.ts # Cron-based workflow scheduler
│   ├── notifications.ts    # Multi-channel notification dispatch
│   ├── anomaly-detector.ts # Anomaly detection
│   ├── health-score.ts     # Health score calculation
│   └── alert-fire.ts       # Alert dispatch wrapper
├── hooks/                  # React hooks
└── types/                  # TypeScript type definitions
migrations/                 # Database migrations (000–005)
tests/                      # Playwright tests
```

---

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

Use prefixes:
- `feature/` — new functionality
- `fix/` — bug fixes
- `docs/` — documentation
- `refactor/` — code cleanup without behavior change

### 2. Make Your Changes

- Follow existing code patterns and naming conventions
- Keep PRs focused — one feature or fix per PR
- Add or update types in `src/types/` when changing data structures

### 3. Test Your Changes

```bash
# Run the dev server and verify manually
npm run dev

# Run Playwright tests
npx playwright test

# Type check
npx tsc --noEmit
```

### 4. Submit a Pull Request

```bash
git push -u origin feature/your-feature-name
```

Then open a PR against `master` with:
- A clear title (under 70 characters)
- Description of what changed and why
- Screenshots for UI changes
- Any migration steps if you changed the schema

---

## Code Conventions

### TypeScript
- Strict mode — no `any` unless absolutely necessary
- Use interfaces for API responses and component props
- Export types from `src/types/` for shared use

### React Components
- Functional components with hooks
- Components go in `src/components/mission-control/`
- Use Tailwind CSS for styling (no CSS modules)
- Shadcn/ui components from `src/components/ui/`

### API Routes
- Next.js app router handlers in `src/app/api/`
- Always validate auth via `MC_ADMIN_TOKEN` or agent token
- Return consistent JSON shapes: `{ data }` or `{ error }`
- Use parameterized SQL queries — never interpolate user input

### Database
- Migrations go in `migrations/` with sequential numbering (e.g., `006_your_feature.sql`)
- Always include `IF NOT EXISTS` / `IF EXISTS` guards
- Add `tenant_id` to any new table that holds tenant-scoped data
- Use TimescaleDB hypertables for time-series data

---

## Adding a ThreatGuard Pattern

To add a new detection pattern:

1. Open `src/lib/threat-scanner.ts`
2. Add your regex pattern to the appropriate threat class array
3. Test against real-world examples (both true positives and false positives)
4. Submit a PR with example matches in the description

---

## Adding a Workflow Node Type

1. Define the node type in `src/lib/workflow-engine.ts`
2. Add the node to the palette in the workflow builder UI
3. Add tooltip and help text for the new node
4. Add a template that uses the node (optional but appreciated)
5. Test execution with at least one workflow

---

## Adding an Integration / SDK Adapter

We're actively looking for community-built adapters for:
- CrewAI
- AutoGen
- LangChain / LangGraph
- Haystack
- Semantic Kernel

An adapter should:
1. Capture events from the framework (messages, tool calls, errors)
2. POST them to `/api/ingest` with the correct schema
3. Include a README with setup instructions
4. Live in a separate package (e.g., `arkon-crewai`, `@arkon/langchain`)

Open an issue to coordinate before starting work on an adapter.

---

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Docker version, browser)
- Relevant logs or screenshots

---

## Feature Requests

Open an issue tagged `enhancement` with:
- The problem you're trying to solve
- Your proposed solution (if you have one)
- Whether you'd be willing to implement it

---

## License

By contributing to Arkon, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

<p align="center">
  <a href="README.md">Back to README</a> · <a href="FEATURES.md">Features</a> · <a href="API.md">API Docs</a>
</p>
