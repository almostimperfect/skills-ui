# Self-Contained Release Requirements

Version: 1.0
Status: Accepted distribution direction
Updated: 2026-09-04

## Purpose

`skills-ui` is a desktop-browser manager for Agent Skills and registered projects
on one computer. Its development and validation process must limit the impact of
untrusted Node dependencies, while its normal user experience must remain honest
about the native filesystem authority required to manage real local assets.

This document fixes the distribution model. The exact supported operating
systems, Node LTS line, and desktop browser matrix remain release-contract
decisions that must be completed and tested before publication.

## Development and Validation Contract

- Editing, Git operations, and static source inspection may occur in the host
  workspace without installing or executing Node dependencies.
- The host does not need a global Node.js or npm installation and must not need a
  repository-level `node_modules` tree for the supported contributor workflow.
- Dependency acquisition, compilation, automated tests, and browser tests run in
  disposable Docker environments with explicit build inputs.
- Dependency acquisition is separated from source and dependency execution.
  Lifecycle scripts remain disabled unless a future exception is separately
  reviewed, documented, and tested.
- Deterministic execution uses no host mounts, credentials, Docker socket, real
  Skill directories, or runtime network access.
- Registry advisory queries and real-source Skill tests remain separate,
  explicitly authorized network tiers with narrow destinations and disposable
  homes. Downloaded Skills are treated as data and are not executed.
- Docker is a blast-radius reduction boundary, not a claim of protection from a
  compromised Docker daemon, VM, kernel, base image, or container escape.

## User Distribution Contract

- Docker is not the default product runtime. Managing real local Skills and
  projects would require broad writable mounts and complicated path mapping that
  could create a misleading impression of isolation.
- Each supported platform receives a self-contained native release artifact.
- The artifact contains the reviewed Node runtime, built server and Web assets,
  exact production dependencies, the compatible bundled `skills` CLI, and only
  the runtime files needed by the product.
- A user does not install Node.js or npm, run `npm install` or `npm ci`, resolve a
  dependency graph, or execute dependency-install lifecycle scripts to use the
  released product.
- npm is a controlled build-time tool, not a user-runtime prerequisite.
- Installation and update replace a complete versioned artifact. The release
  process must support integrity verification and a documented rollback to a
  prior complete artifact rather than mutating packages in place.
- Release artifacts must have checksums, a software bill of materials, and the
  strongest practical platform signing or attestation supported by the chosen
  distribution channels.

## Runtime Security Contract

A self-contained artifact freezes an inspected dependency graph and removes
user-side installation drift; it does not make included dependency code benign
or sandbox the native process.

The native product and its bundled CLI run with the user's filesystem authority.
Release readiness therefore also requires:

- loopback-only browser access with the verified local-session boundary;
- operation-specific child-process environments without ambient credentials;
- explicit managed roots and registered-project scope;
- identifier, traversal, and symlink containment before filesystem mutation;
- collision-aware, transactional writes with recovery and rollback behavior;
- owner-only permissions for private product state and archives;
- clear disclosure of automatic and user-initiated network activity.

## Build and Artifact Requirements

- Build inputs are explicit, auditable, and exclude private development controls,
  credentials, local test data, Git metadata, and unrelated workspace content.
- The release graph uses exact versions and lock integrity. A fresh advisory
  result, known-malicious-version checks, provenance review, lifecycle review,
  and compatibility evidence are distinct gates; none alone proves package
  health.
- A reported patched or newest version is only a candidate. Remediation selects
  the smallest compatible version that has been reviewed as known-good and then
  validates the complete locked graph in isolation.
- The final artifact excludes source-only development inputs, tests, fixtures,
  package-manager caches, development dependencies, and private control files.
- The artifact is smoke-tested in a clean environment without a host Node/npm
  installation and without contacting npm at runtime.
- CI reproduces the supported platform/runtime matrix, artifact-content checks,
  deterministic tests, and all release gates that do not require an explicitly
  approved mutable external source.

## Planned Delivery Sequence

1. Complete the current registry-only advisory assessment without changing the
   lockfile or applying an automatic fix.
2. Resolve filesystem containment, collision, rollback, Agent-target, and
   concurrent-mutation blockers.
3. Choose and document the supported operating systems, bundled Node LTS line,
   npm build version, and desktop browser matrix.
4. Define the minimal runtime file set and produce platform-specific,
   self-contained artifacts.
5. Add clean-machine install, launch, update, rollback, artifact-content, and
   no-runtime-registry smoke tests.
6. Add CI, checksums, SBOM generation, signing or attestation, and the final
   deterministic, isolated, approved-network, human-product, and supply-chain
   release gate.

## Release Acceptance

The distribution requirement is satisfied only when a supported-platform user
can install and run a versioned artifact without Node/npm, the artifact contains
only reviewed runtime inputs, no npm registry access occurs during normal launch
or local management, update and rollback operate on complete artifacts, and all
applicable project quality dimensions have the required evidence at R3 or
higher.
