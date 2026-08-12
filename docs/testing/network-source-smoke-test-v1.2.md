# Real Network Source Smoke Test v1.2

- Version: 1.2
- Updated: 2026-08-12
- Supersedes: [v1.1](./network-source-smoke-test-v1.1.md)

## Purpose

This tier verifies that `skills-ui` and its bundled `skills` CLI can download
the project's recorded public test Skills. It is deliberately separate from
the deterministic regression suites because network availability, GitHub, and
upstream repository contents can change independently of this project.

The design limits what a compromised dependency or downloaded repository can
reach. It does not claim that Docker is an absolute security boundary or that
the downloaded content is trustworthy.

## Authorization and commands

Run the deterministic tiers for routine development:

```sh
sh scripts/run-docker-tests.sh
sh e2e/scripts/run-e2e.sh
```

Their test containers have runtime networking disabled. The real-source tier
requires explicit owner approval for the recorded sources and the intended run:

```sh
sh e2e/scripts/run-e2e.sh --network
```

When Node.js/npm is intentionally available on the invoking host, the package
aliases are:

```sh
npm run test:docker
npm run test:e2e
npm run test:e2e:network
```

`--network` and the test's `E2E_NETWORK=1` assertion prevent the network cases
from joining the default tier. They are an opt-in mechanism, not a substitute
for the required human authorization. Changing or adding a remote source needs
new approval and a reviewed change to both the test and proxy policy.

## Recorded acceptance cases

| Case | Source or action | Contract checked |
| --- | --- | --- |
| Opt-in and environment guard | `E2E_NETWORK=1` and a disposable container `HOME` | Network cases cannot enter the deterministic tier, and host credential variables are absent |
| Egress boundary | Direct `1.1.1.1:443`; CONNECT requests for `example.com`, `registry.npmjs.org`, and `add-skill.vercel.sh` | Direct public access fails and non-allowlisted hosts are rejected |
| Git and Node proxy path | `https://github.com/op7418/Humanizer-zh.git` and its GitHub API repository record | Both Git HTTPS and Node's built-in `fetch` use the controlled proxy |
| Git URL | `https://github.com/op7418/Humanizer-zh.git` | A single-Skill repository installs through `skills-ui add` |
| Shorthand | `op7418/Humanizer-zh` | `owner/repository` syntax remains supported |
| Selection | `https://github.com/anthropics/skills`, selecting `skill-creator` | The bundled `skills` CLI selects one Skill from a multi-Skill repository |
| HTTP API | `POST /api/skills` with the Humanizer-zh Git URL | The product server performs a real install and keeps paths inside the container-only home |
| Expected failure | `this-org-does-not-exist-9x9x9/nope` | A missing repository exits with an actionable error and no stack trace |

These public sources are test fixtures, not endorsements and not a general
authorization to download arbitrary repositories.

## Dependency-acquisition boundary

The image build and the test runtime have different network boundaries:

1. Docker may pull the digest-pinned base images.
2. Before application source is copied, digest-pinned
   `node:20.20.2-slim` with npm 10.8.2 validates the lock policy and runs
   `npm ci --ignore-scripts --no-audit --no-fund` against the configured npm
   registry.
3. Application source is copied only after dependency acquisition. Compilation
   then runs with build networking disabled.
4. The network-capable final image receives built output, locked dependencies,
   public package metadata, E2E specifications, and the reviewed proxy script.
   It does not receive the application source tree, Git metadata, private
   development records, host configuration, or the build configuration.

The browser image is pinned as
`mcr.microsoft.com/playwright:v1.49.1-jammy` by digest. Its effective Node.js
runtime is 22.23.1, copied from digest-pinned `node:22.23.1-bookworm-slim` so
Node can apply the explicit environment proxy to built-in `fetch`. These
assertions are checked during the image build.

Node.js 20 satisfies the repository's current `>=20` package metadata but is
end-of-life. Its build-image pin is a reproducibility fact, not a recommendation
for new host environments; direct host development should use a currently
supported LTS line. Moving the build image to a supported line remains separate
from changing the locked application dependency graph.

The Dockerfile-specific context rules admit only required inputs. The runners
also create a unique non-secret canary file in an otherwise allowed source
directory and fail the build if its value reaches the image. This tests the
deny rules for unlisted nested files; it cannot prove that every future filename
is harmless.

Before building, each runner requires the project `.npmrc` to be a regular file
and rejects credential-like fields or environment interpolation. Explicit empty
proxy build arguments prevent host proxy URLs or embedded proxy credentials from
being forwarded into the build.

## Lock and known-indicator policy

Before npm receives network access, the offline policy gate checks:

- exact direct dependency versions and the declared npm 10.8.2 package manager;
- agreement between `package.json` and the lockfile root;
- npm lockfile version 3 entries, canonical HTTPS npm registry tarball paths,
  and SHA-512 integrity metadata;
- the exact reviewed set of lock entries that declare lifecycle scripts, while
  lifecycle execution remains disabled;
- exact package/version matches against the embedded malicious-package data.

The current snapshot was retrieved on 2026-08-10. It contains 443 npm package
names and 2,235 exact npm versions; three non-npm Go module indicators are kept
separately so they cannot be mistaken for npm lock entries. The policy records
content hashes and a staleness threshold.

This is a dated copy of known indicators, not a live threat-intelligence feed.
It cannot detect a newly compromised version, malicious behavior absent from
the source list, a compromised registry response that still satisfies expected
metadata, or unsafe behavior in a package that was never reported. SHA-512
integrity proves byte consistency with the lockfile, not publisher intent.
`npm audit` is disabled during deterministic acquisition and this exact-version
check is not a replacement for a separately reviewed advisory assessment.

## Runtime filesystem and process boundary

The deterministic unit, deterministic E2E, real-source test, and egress-proxy
containers share these controls:

- explicit non-root users;
- read-only image filesystems;
- no host bind mounts, Docker volumes, host home, real Skill directories,
  credentials, browser profiles, Git/SSH agent sockets, or Docker socket;
- all Linux capabilities dropped and `no-new-privileges` enabled;
- process, memory, and CPU limits plus an init process;
- unique, disposable `HOME`, `TMPDIR`, and XDG paths on size-limited
  `nosuid,nodev,noexec` temporary filesystems;
- a minimal fixed `PATH`, telemetry opt-out variables, and checks that common
  host credential variables are absent.

The application image is addressed by its immutable image ID for the run.
Per-run labels and names prevent cleanup from deleting unrelated containers,
images, or networks. Test-created home directories disappear with their tmpfs
and container. Docker's shared build cache and previously pulled base layers may
remain in daemon storage after cleanup. A force-kill that cannot run shell traps
can also leave clearly labeled per-run resources for explicit later cleanup.

## Real-network egress boundary

The test runner creates two per-run networks:

- an internal network joined by the test container and proxy;
- a separate routed network joined only by the proxy.

The test container cannot route directly to the public internet. Git and Node
receive explicit HTTP(S) proxy settings. Git is additionally restricted to
HTTPS, interactive prompts and credential helpers are disabled, system/global
Git configuration is ignored, and hooks are redirected to `/dev/null`.

The proxy accepts only port-443 CONNECT tunnels to these exact hostnames:

- `api.github.com`
- `codeload.github.com`
- `github.com`
- `objects.githubusercontent.com`
- `raw.githubusercontent.com`

This is a hostname allowlist, not a repository-owner, repository-name, or URL
path allowlist. Any HTTPS path reachable on one of those hosts is inside the
network boundary. The fixed source assertions are therefore an acceptance
contract, not an egress enforcement rule at repository granularity.

For an allowed hostname, the proxy accepts ordinary public DNS results and
Docker Desktop's synthetic `198.18.0.0/15` answers only after a standard
CA-backed TLS handshake validates the certificate for the exact allowlisted
hostname. Successful hostname-and-address checks are cached for five minutes;
failed checks are retried only a bounded number of times. The proxy then opens
a raw tunnel, and the Git or Node client performs its own end-to-end TLS
validation. Private, loopback, link-local, multicast, and documentation-only
addresses are rejected.

At runtime the npm registry, `add-skill.vercel.sh`, and every other
non-allowlisted hostname are denied by the proxy. Telemetry opt-out variables
are also set. Registry access during the earlier dependency-install build step
is a separate, explicitly documented boundary.

## Downloaded Skill handling

Downloaded Skills are treated as data. The acceptance flow asks `skills` to
clone, parse, select, and copy a Skill into the disposable container home.
Neither `skills-ui` nor the test invokes scripts, binaries, or other executable
content from the downloaded Skill. Git hooks are disabled, and the writable
temporary filesystem is mounted `noexec`.

The downloaded repository is still untrusted data processed by Git, Node,
`skills`, and filesystem parsers. `noexec` does not prevent an interpreter from
reading a file, so these measures constrain the intended workflow and impact
surface; they do not prove that exploitation is impossible.

## Residual risks and interpretation

The real-network tier is intentionally more exposed than `--network=none`:

- the test container can reach Docker DNS, its internal network gateway, and
  the named proxy;
- the proxy has public routing and relies on its hostname, DNS, IP, and TLS
  checks;
- Node.js 22's environment-proxy agent is still marked active development by
  Node.js, so the tier verifies its real GitHub API path on every authorized
  run rather than treating the setting alone as proof;
- Docker daemon, VM, kernel, network implementation, image store, and build
  cache remain shared infrastructure;
- allowed GitHub hostnames expose more paths than the recorded repositories;
- upstream contents, rate limits, Git behavior, DNS, certificates, and service
  availability can change;
- container isolation reduces host impact but cannot eliminate runtime or
  container-escape vulnerabilities.

A failure in this tier does not automatically mean the product regressed.
Distinguish boundary-test failure, DNS/TLS/proxy failure, upstream layout or
naming change, rate limiting, and a product/CLI contract failure. The
deterministic tiers remain the repeatable regression gate; this tier is an
explicit human-authorized integration acceptance gate.
