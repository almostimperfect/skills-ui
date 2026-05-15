# Test Data

This project uses the `xtest-` prefix for disposable manual QA skills. The prefix keeps test data visually separate from normal user skills and makes cleanup safe.

## Seed

```bash
npm run seed:xtest
```

The seed command:

- installs `xtest-global-release` and `xtest-long-description` as global Codex skills
- creates two local ignored projects under `.xtest/projects`
- registers those projects in `~/.skills-ui/config.json`
- installs project-local `xtest-project-builder`, `xtest-shared-config`, and `xtest-drift-copy`
- edits the installed `xtest-drift-copy` copy so drift detection has visible data

## Cleanup

```bash
npm run cleanup:xtest
```

Cleanup removes `xtest-` global skills, unregisters the seeded projects, and deletes the local `.xtest/projects` folders.

## Fixtures

Fixture source lives in `fixtures/xtest-skills/`.

Current fixtures:

- `xtest-global-release`: global install and maintenance state
- `xtest-long-description`: list wrapping and responsive layout stress case
- `xtest-project-builder`: project-local matrix state
- `xtest-shared-config`: shared `.agents/skills` Codex/Gemini state
- `xtest-drift-copy`: project-local drift detection
