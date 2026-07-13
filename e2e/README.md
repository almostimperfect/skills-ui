# skills-ui E2E — Dockerized functional & UI automation

Automated implementation of [functional-interaction-test-design v1.1](../docs/testing/functional-interaction-test-design-v1.1.md):
CLI functional tests, API contract tests, and Chromium UI automation — **everything runs inside
Docker**. The host machine needs **Docker only**: no Node, no npm, no browsers, ever.

## Hard isolation contract

These rules are binding for every script and future change (approved plan, 2026-07-09):

1. **Zero `-v`/`--mount` flags** on any `docker run`. No host directory is ever writable (or readable)
   from a test container.
2. **COPY-only build** (`Dockerfile.e2e`): `COPY package*.json` → `npm ci` → `COPY . .` →
   `npm run build`. `node_modules/`, `dist/`, and Playwright browsers live in image layers only.
3. **Artifacts leave the container only via `docker cp` or a port**, only **after the container
   exits**, and only into **`e2e/output/`** (gitignored, local-only; CI publishes it via its own
   artifact mechanism).
4. **npm scripts are convenience wrappers for Node-enabled dev machines.** The canonical entry points
   are the shell commands below — they work on a host that has never installed Node.
5. **Build context is filtered by `.dockerignore`** (`.env*`, `*.pem`, `*.key`, `.git`, … never enter
   the image).
6. **Each Playwright worker gets a unique `$HOME`** (`/tmp/skills-ui-e2e/home-<workerIndex>`, created
   at runtime inside the container). Shared HOME between workers is forbidden.
7. **Network tier fetches skill sources only.** Dependencies are always resolved at image build time
   (`npm ci`); no test ever installs packages.

## Running (host = Docker only)

```bash
# Offline tier (default): CLI + API + Web UI specs, deterministic, no internet needed at test time
sh e2e/scripts/run-e2e.sh

# Include the @network tier (real GitHub sources, container-outbound fetches)
sh e2e/scripts/run-e2e.sh --network

# View the HTML report extracted to e2e/output/ (served from a throwaway nginx container)
sh e2e/scripts/show-report.sh          # → http://localhost:9323

# Expose the Web UI on the host for manual exploration
sh e2e/scripts/serve-docker.sh         # → http://localhost:3456 (empty store)
sh e2e/scripts/serve-docker.sh --demo  # → pre-seeded fixture skills + a sample project
```

Node-enabled machines may use the equivalents: `npm run test:e2e`, `test:e2e:network`,
`test:e2e:report`, `serve:docker`, `serve:docker:demo`.

## Layout

```
e2e/
  playwright.config.ts   Chromium-only; @network excluded unless E2E_NETWORK=1
  helpers/
    env.ts               per-worker server + isolated $HOME + per-test store wipe
    cli.ts               spawn the built binary with an injected $HOME
    skills-store.ts      offline store seeding (see BOUNDARY note in the file header)
  fixtures/
    skills/              hand-crafted SKILL.md shapes (normal / no-frontmatter / bad-yaml /
                         spaced name / multi-file)
    repos/               local repo layouts for real `skills add <path>` installs (offline)
  specs/
    cli/                 add / remove / list / enable / disable / project / serve
    api/                 status-code & validation contracts (incl. PATCH /api/projects)
    web/                 Chromium UI: Dashboard, Skills, Skill Detail, Projects, Project Detail
    scenarios/           store shapes, install methods, post-install edits, versions, dangling links
    network/             @network — the real sources from the test plan
  scripts/               canonical docker-only entry points
  output/                (gitignored) docker cp destination for reports/results
```

## Test tiers & conventions

- **Spec titles carry the case IDs** from the test-design document (`CLI-ADD-01`, `WEB-PROJ-03`, …)
  plus scenario IDs (`SCEN-…`, `NET-…`) added by the automation pass.
- **Registered findings become active desired-behavior tests when fixed.** The 2026-07-13 offline
  baseline has 71 passing tests and no skipped registered findings.
- Historical truth-pins are removed or renamed when a finding is fixed; remaining scenario tests
  describe supported resilience behavior rather than preserving a known defect.
- **Seeding boundary:** direct store seeding validates skills-ui's runtime state handling only;
  installer behavior always goes through a real `skills add` (local fixture repos offline; real
  sources in `@network`).

## Current product gaps

- CLI has no project-unregister command (UX-012).
- Project rename and managed-agent editing have an API but no Web controls (UX-013).
- `skills-ui add` cannot yet pass `--skill` through for one skill in a multi-skill source (UX-014).

The 15 issues that were open or scheduled at the start of the 2026-07-13 pass, plus the earlier
BUG-001 parser fix, are retained as resolved history in `.DEVELOPMENT/ISSUES.md`.
