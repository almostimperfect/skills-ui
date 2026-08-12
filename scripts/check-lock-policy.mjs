#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SEMVER_CORE = '(?:0|[1-9]\\d*)';
const SEMVER_PRERELEASE_IDENTIFIER =
  '(?:0|[1-9]\\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)';
const EXACT_VERSION = new RegExp(
  `^${SEMVER_CORE}\\.${SEMVER_CORE}\\.${SEMVER_CORE}` +
  `(?:-${SEMVER_PRERELEASE_IDENTIFIER}(?:\\.${SEMVER_PRERELEASE_IDENTIFIER})*)?` +
  '(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$',
);
const NPM_NAME_PART = /^[a-z0-9][a-z0-9._~-]*$/;
const SHA512_INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const UNSUPPORTED_ROOT_DEPENDENCY_SECTIONS = [
  'bundleDependencies',
  'bundledDependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'workspaces',
];
const BUNDLED_METADATA_FIELDS = [
  'bundleDependencies',
  'bundledDependencies',
  'bundled',
  'inBundle',
];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonFile(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot parse ${label}: ${error.message}`);
  }
}

function parseNpmConfig(path) {
  const config = {};
  const errors = [];
  let contents;

  try {
    contents = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read .npmrc: ${error.message}`);
  }

  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const separator = line.indexOf('=');
    if (separator <= 0) {
      errors.push(`.npmrc:${index + 1} must use key=value syntax`);
      continue;
    }

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (Object.hasOwn(config, key)) {
      errors.push(`.npmrc:${index + 1} duplicates ${key}`);
      continue;
    }
    config[key] = value;
  }

  return { config, errors };
}

function packageNameFromPath(lockPath) {
  return lockPath.match(/node_modules\/((?:@[^/]+\/)?[^/]+)$/)?.[1] ?? null;
}

function isExactNpmPackageName(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > 214) return false;
  if (name === 'node_modules' || name === 'favicon.ico') return false;

  if (!name.startsWith('@')) return NPM_NAME_PART.test(name);
  const separator = name.indexOf('/');
  return (
    separator > 1 &&
    separator === name.lastIndexOf('/') &&
    NPM_NAME_PART.test(name.slice(1, separator)) &&
    NPM_NAME_PART.test(name.slice(separator + 1))
  );
}

function canonicalRegistryTarballPath(name, version) {
  const basename = name.slice(name.lastIndexOf('/') + 1);
  return `/${name}/-/${basename}-${version}.tgz`;
}

function normalizedObject(value) {
  return isObject(value) ? value : {};
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function normalizeRootField(value, field) {
  if (field !== 'bin' || !isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([name, path]) => [
      name,
      typeof path === 'string' ? path.replace(/^\.\//, '') : path,
    ]),
  );
}

function compareRootField(errors, manifest, lockRoot, field) {
  const manifestValue = canonicalize(normalizeRootField(manifest[field], field));
  const lockValue = canonicalize(normalizeRootField(lockRoot[field], field));
  if (JSON.stringify(manifestValue) !== JSON.stringify(lockValue)) {
    errors.push(`package.json ${field} does not match package-lock root ${field}`);
  }
}

function compareDependencySection(errors, manifest, lockRoot, section) {
  const manifestDependencies = normalizedObject(manifest[section]);
  const lockDependencies = normalizedObject(lockRoot[section]);
  const names = new Set([
    ...Object.keys(manifestDependencies),
    ...Object.keys(lockDependencies),
  ]);

  for (const name of [...names].sort()) {
    if (!isExactNpmPackageName(name)) {
      errors.push(`${section}.${name} is not an exact lowercase npm package name`);
    }
    if (!Object.hasOwn(manifestDependencies, name)) {
      errors.push(`package-lock root ${section}.${name} is absent from package.json`);
    } else if (!Object.hasOwn(lockDependencies, name)) {
      errors.push(`package.json ${section}.${name} is absent from package-lock root`);
    } else if (manifestDependencies[name] !== lockDependencies[name]) {
      errors.push(
        `${section}.${name} differs: package.json=${manifestDependencies[name]} lock=${lockDependencies[name]}`,
      );
    }

    const requested = manifestDependencies[name];
    if (requested !== undefined && !EXACT_VERSION.test(requested)) {
      errors.push(`${section}.${name} must be an exact version, found ${requested}`);
    }
  }

  return manifestDependencies;
}

function inspectSnapshot(errors, warnings, policy) {
  const snapshot = policy.maliciousPackageSnapshot;
  const maliciousVersions = policy.maliciousVersions;
  const nonNpmSection = policy.nonNpmIndicators;

  if (!isObject(snapshot)) {
    errors.push('policy maliciousPackageSnapshot must be an object');
  }
  if (!isObject(maliciousVersions)) {
    errors.push('policy maliciousVersions must be an object');
    return {
      maliciousVersions: {},
      packageCount: 0,
      versionCount: 0,
      nonNpmIndicatorCount: 0,
      nonNpmVersionCount: 0,
      stale: true,
    };
  }

  let versionCount = 0;
  for (const [name, versions] of Object.entries(maliciousVersions)) {
    if (!isExactNpmPackageName(name)) {
      errors.push(`policy maliciousVersions.${name} is not an exact lowercase npm package name`);
    }
    if (!Array.isArray(versions) || versions.length === 0) {
      errors.push(`policy maliciousVersions.${name} must be a non-empty array`);
      continue;
    }

    const unique = new Set();
    for (const version of versions) {
      if (typeof version !== 'string' || !EXACT_VERSION.test(version)) {
        errors.push(`policy maliciousVersions.${name} contains non-exact version ${String(version)}`);
      }
      if (unique.has(version)) {
        errors.push(`policy maliciousVersions.${name} repeats ${version}`);
      }
      unique.add(version);
      versionCount += 1;
    }
  }

  const packageCount = Object.keys(maliciousVersions).length;
  const nonNpmIndicators = isObject(nonNpmSection?.indicators)
    ? nonNpmSection.indicators
    : {};
  let nonNpmVersionCount = 0;
  if (!isObject(nonNpmSection)) {
    errors.push('policy nonNpmIndicators must be an object');
  } else {
    if (nonNpmSection.ecosystem !== 'go-modules') {
      errors.push('policy nonNpmIndicators.ecosystem must be go-modules');
    }
    if (!isObject(nonNpmSection.indicators)) {
      errors.push('policy nonNpmIndicators.indicators must be an object');
    }
    if (!SHA256.test(nonNpmSection.embedded_data_sha256 ?? '')) {
      errors.push('policy nonNpmIndicators.embedded_data_sha256 must be a lowercase SHA-256 hash');
    } else {
      const embeddedHash = createHash('sha256')
        .update(JSON.stringify(nonNpmIndicators))
        .digest('hex');
      if (embeddedHash !== nonNpmSection.embedded_data_sha256) {
        errors.push('policy nonNpmIndicators content does not match embedded_data_sha256');
      }
    }
  }

  for (const [name, versions] of Object.entries(nonNpmIndicators)) {
    if (!name.startsWith('github.com/') || /\s/.test(name)) {
      errors.push(`policy nonNpmIndicators.indicators.${name} is not a recognized Go module path`);
    }
    if (!Array.isArray(versions) || versions.length === 0) {
      errors.push(`policy nonNpmIndicators.indicators.${name} must be a non-empty array`);
      continue;
    }
    const unique = new Set();
    for (const version of versions) {
      if (typeof version !== 'string' || !version.startsWith('v') || !EXACT_VERSION.test(version.slice(1))) {
        errors.push(
          `policy nonNpmIndicators.indicators.${name} contains non-exact Go module version ${String(version)}`,
        );
      }
      if (unique.has(version)) {
        errors.push(`policy nonNpmIndicators.indicators.${name} repeats ${version}`);
      }
      unique.add(version);
      nonNpmVersionCount += 1;
    }
  }
  const nonNpmIndicatorCount = Object.keys(nonNpmIndicators).length;
  if (isObject(snapshot)) {
    let source;
    try {
      source = new URL(snapshot.source);
    } catch {
      errors.push('policy maliciousPackageSnapshot.source must be an HTTPS URL');
    }
    if (source && source.protocol !== 'https:') {
      errors.push('policy maliciousPackageSnapshot.source must be an HTTPS URL');
    }
    if (!SHA256.test(snapshot.sha256 ?? '')) {
      errors.push('policy maliciousPackageSnapshot.sha256 must be a lowercase SHA-256 hash');
    }
    if (!SHA256.test(snapshot.npm_embedded_data_sha256 ?? '')) {
      errors.push('policy maliciousPackageSnapshot.npm_embedded_data_sha256 must be a lowercase SHA-256 hash');
    } else {
      const embeddedHash = createHash('sha256')
        .update(JSON.stringify(maliciousVersions))
        .digest('hex');
      if (embeddedHash !== snapshot.npm_embedded_data_sha256) {
        errors.push('policy maliciousVersions content does not match npm_embedded_data_sha256');
      }
    }
    if (snapshot.raw_indicator_count !== packageCount + nonNpmIndicatorCount) {
      errors.push(
        `policy snapshot raw_indicator_count=${snapshot.raw_indicator_count} but contains ` +
        `${packageCount + nonNpmIndicatorCount} total names`,
      );
    }
    if (snapshot.raw_malicious_version_count !== versionCount + nonNpmVersionCount) {
      errors.push(
        `policy snapshot raw_malicious_version_count=${snapshot.raw_malicious_version_count} but contains ` +
        `${versionCount + nonNpmVersionCount} total versions`,
      );
    }
    if (snapshot.npm_package_count !== packageCount) {
      errors.push(`policy snapshot npm_package_count=${snapshot.npm_package_count} but contains ${packageCount}`);
    }
    if (snapshot.npm_malicious_version_count !== versionCount) {
      errors.push(
        `policy snapshot npm_malicious_version_count=${snapshot.npm_malicious_version_count} but contains ${versionCount}`,
      );
    }
    if (snapshot.non_npm_indicator_count !== nonNpmIndicatorCount) {
      errors.push(
        `policy snapshot non_npm_indicator_count=${snapshot.non_npm_indicator_count} but contains ${nonNpmIndicatorCount}`,
      );
    }
    if (snapshot.non_npm_malicious_version_count !== nonNpmVersionCount) {
      errors.push(
        `policy snapshot non_npm_malicious_version_count=${snapshot.non_npm_malicious_version_count} but contains ` +
        `${nonNpmVersionCount}`,
      );
    }
    if (typeof snapshot.staleness_note !== 'string' || snapshot.staleness_note.length < 20) {
      errors.push('policy snapshot must explain that offline threat intelligence becomes stale');
    }
  }

  const retrievedAtText = snapshot?.retrieved_at ?? '';
  const retrievedAt = /^\d{4}-\d{2}-\d{2}$/.test(retrievedAtText)
    ? Date.parse(`${retrievedAtText}T00:00:00Z`)
    : Number.NaN;
  const staleAfterDays = snapshot?.stale_after_days;
  let stale = true;
  if (!Number.isFinite(retrievedAt)) {
    errors.push('policy maliciousPackageSnapshot.retrieved_at must be YYYY-MM-DD');
  } else if (!Number.isInteger(staleAfterDays) || staleAfterDays <= 0) {
    errors.push('policy maliciousPackageSnapshot.stale_after_days must be a positive integer');
  } else {
    const ageDays = Math.floor((Date.now() - retrievedAt) / DAY_MS);
    if (ageDays < 0) {
      errors.push('policy maliciousPackageSnapshot.retrieved_at is in the future');
    } else {
      stale = ageDays > staleAfterDays;
      if (stale) {
        warnings.push(
          `malicious-version snapshot is ${ageDays} days old (limit ${staleAfterDays}); refresh it before making a current-safety claim`,
        );
      }
    }
  }

  return {
    maliciousVersions,
    packageCount,
    versionCount,
    nonNpmIndicatorCount,
    nonNpmVersionCount,
    stale,
  };
}

function validateBundle(bundle) {
  const { manifest, lock, policy, npmConfig, npmConfigErrors = [] } = bundle;
  const errors = [...npmConfigErrors];
  const warnings = [];
  const packages = normalizedObject(lock.packages);
  const lockRoot = normalizedObject(packages['']);

  if (policy.schemaVersion !== 1) {
    errors.push(`unsupported policy schemaVersion ${String(policy.schemaVersion)}`);
  }
  if (lock.lockfileVersion !== policy.lockfileVersion || lock.lockfileVersion !== 3) {
    errors.push(`package-lock lockfileVersion must be 3, found ${String(lock.lockfileVersion)}`);
  }
  if (lock.requires !== true) {
    errors.push('package-lock requires must be true');
  }
  if (!Object.hasOwn(packages, '')) {
    errors.push('package-lock packages must contain the root entry');
  }
  if (manifest.packageManager !== policy.packageManager) {
    errors.push(
      `packageManager must be ${policy.packageManager}, found ${String(manifest.packageManager)}`,
    );
  }
  if (lock.name !== manifest.name || lock.version !== manifest.version) {
    errors.push('package-lock top-level name/version must match package.json');
  }
  if (!isExactNpmPackageName(manifest.name)) {
    errors.push(`package.json name is not an exact lowercase npm package name: ${String(manifest.name)}`);
  }

  for (const field of ['name', 'version', 'license', 'bin', 'engines']) {
    compareRootField(errors, manifest, lockRoot, field);
  }

  const dependencies = compareDependencySection(errors, manifest, lockRoot, 'dependencies');
  const devDependencies = compareDependencySection(errors, manifest, lockRoot, 'devDependencies');
  for (const section of UNSUPPORTED_ROOT_DEPENDENCY_SECTIONS) {
    if (Object.hasOwn(manifest, section)) {
      errors.push(`package.json contains unsupported root dependency section ${section}`);
    }
    if (Object.hasOwn(lockRoot, section)) {
      errors.push(`package-lock root contains unsupported root dependency section ${section}`);
    }
  }
  for (const field of ['bundled', 'inBundle']) {
    if (Object.hasOwn(lockRoot, field)) {
      errors.push(`package-lock root contains unsupported bundled metadata ${field}`);
    }
  }
  for (const name of Object.keys(dependencies)) {
    if (Object.hasOwn(devDependencies, name)) {
      errors.push(`${name} must not appear in both dependencies and devDependencies`);
    }
  }

  const directDependencies = { ...dependencies, ...devDependencies };
  for (const [name, version] of Object.entries(directDependencies)) {
    const directEntry = packages[`node_modules/${name}`];
    if (!isObject(directEntry)) {
      errors.push(`direct dependency ${name}@${version} has no root node_modules lock entry`);
    } else if (directEntry.version !== version) {
      errors.push(
        `direct dependency ${name} requests ${version} but root lock entry is ${String(directEntry.version)}`,
      );
    }
  }

  if (!isObject(policy.requiredNpmConfig)) {
    errors.push('policy requiredNpmConfig must be an object');
  }
  const requiredNpmConfig = normalizedObject(policy.requiredNpmConfig);
  for (const [key, expected] of Object.entries(requiredNpmConfig)) {
    if (npmConfig[key] !== expected) {
      errors.push(`.npmrc ${key} must be ${expected}, found ${String(npmConfig[key])}`);
    }
  }
  for (const key of Object.keys(npmConfig)) {
    if (!Object.hasOwn(requiredNpmConfig, key)) {
      errors.push(`.npmrc contains unreviewed setting ${key}`);
    }
  }

  let registryOrigin = null;
  try {
    registryOrigin = new URL(policy.registryOrigin).origin;
  } catch {
    errors.push('policy registryOrigin must be a valid HTTPS origin');
  }
  if (registryOrigin !== policy.registryOrigin || !registryOrigin?.startsWith('https://')) {
    errors.push('policy registryOrigin must be a canonical HTTPS origin without a trailing slash');
  }

  const snapshot = inspectSnapshot(errors, warnings, policy);
  const actualInstallScripts = [];
  let maliciousMatches = 0;
  let lockedPackageCount = 0;

  for (const [lockPath, entry] of Object.entries(packages)) {
    if (lockPath === '') continue;
    lockedPackageCount += 1;

    if (!isObject(entry)) {
      errors.push(`${lockPath} lock entry must be an object`);
      continue;
    }

    const name = packageNameFromPath(lockPath);
    if (!name) {
      errors.push(`${lockPath} is not a recognized node_modules lock path`);
      continue;
    }
    if (!isExactNpmPackageName(name)) {
      errors.push(`${lockPath} does not end in an exact lowercase npm package name`);
    }
    if (!EXACT_VERSION.test(entry.version ?? '')) {
      errors.push(`${lockPath} must have an exact package version`);
    }
    if (entry.link === true || Object.hasOwn(entry, 'link')) {
      errors.push(`${lockPath} must not be a link entry`);
    }
    if (Object.hasOwn(entry, 'name') && entry.name !== name) {
      errors.push(`${lockPath} package name ${String(entry.name)} does not match lock path name ${name}`);
    }
    for (const field of BUNDLED_METADATA_FIELDS) {
      if (Object.hasOwn(entry, field)) {
        errors.push(`${lockPath} contains unsupported bundled metadata ${field}`);
      }
    }
    if (typeof entry.resolved !== 'string') {
      errors.push(`${lockPath} is missing resolved tarball URL`);
    } else {
      try {
        const resolved = new URL(entry.resolved);
        if (
          resolved.origin !== registryOrigin ||
          resolved.protocol !== 'https:' ||
          resolved.username ||
          resolved.password ||
          resolved.port ||
          resolved.search ||
          resolved.hash ||
          resolved.pathname !== canonicalRegistryTarballPath(name, entry.version)
        ) {
          errors.push(`${lockPath} must use its canonical npmjs registry tarball path, found ${entry.resolved}`);
        }
      } catch {
        errors.push(`${lockPath} has invalid resolved URL ${entry.resolved}`);
      }
    }
    if (!SHA512_INTEGRITY.test(entry.integrity ?? '')) {
      errors.push(`${lockPath} must have SHA-512 integrity`);
    }

    if (snapshot.maliciousVersions[name]?.includes(entry.version)) {
      maliciousMatches += 1;
      errors.push(`${lockPath} matches denied malicious version ${name}@${entry.version}`);
    }
    if (entry.hasInstallScript === true) {
      actualInstallScripts.push({ path: lockPath, name, version: entry.version });
    }
  }

  const installPolicy = normalizedObject(policy.installScriptPolicy);
  if (installPolicy.executionDefault !== 'disabled' || installPolicy.doesNotAuthorizeExecution !== true) {
    errors.push('policy install scripts must default to disabled and the lock review must not authorize execution');
  }
  const knownInstallScripts = Array.isArray(installPolicy.knownLockEntries)
    ? installPolicy.knownLockEntries
    : [];
  if (!Array.isArray(installPolicy.knownLockEntries)) {
    errors.push('policy installScriptPolicy.knownLockEntries must be an array');
  }

  const expectedByPath = new Map();
  for (const entry of knownInstallScripts) {
    if (!isObject(entry) || typeof entry.path !== 'string') {
      errors.push('each known install-script entry must include a path');
      continue;
    }
    if (expectedByPath.has(entry.path)) {
      errors.push(`policy repeats install-script path ${entry.path}`);
    }
    expectedByPath.set(entry.path, entry);
    if (
      entry.name !== packageNameFromPath(entry.path) ||
      !isExactNpmPackageName(entry.name) ||
      !EXACT_VERSION.test(entry.version ?? '') ||
      typeof entry.reason !== 'string' ||
      entry.reason.length < 20
    ) {
      errors.push(`policy install-script entry ${entry.path} must have exact name, version, and review reason`);
    }
  }

  for (const actual of actualInstallScripts) {
    const expected = expectedByPath.get(actual.path);
    if (!expected) {
      errors.push(`unreviewed hasInstallScript entry ${actual.path} (${actual.name}@${actual.version})`);
    } else if (expected.name !== actual.name || expected.version !== actual.version) {
      errors.push(
        `hasInstallScript entry ${actual.path} changed from ${expected.name}@${expected.version} to ${actual.name}@${actual.version}`,
      );
    }
  }
  const actualPaths = new Set(actualInstallScripts.map((entry) => entry.path));
  for (const expected of knownInstallScripts) {
    if (isObject(expected) && typeof expected.path === 'string' && !actualPaths.has(expected.path)) {
      errors.push(`reviewed hasInstallScript entry ${expected.path} is absent or no longer marked hasInstallScript`);
    }
  }

  return {
    errors,
    warnings,
    stats: {
      directDependencyCount: Object.keys(directDependencies).length,
      lockedPackageCount,
      installScriptCount: actualInstallScripts.length,
      maliciousMatches,
      maliciousPackageCount: snapshot.packageCount,
      maliciousVersionCount: snapshot.versionCount,
      nonNpmIndicatorCount: snapshot.nonNpmIndicatorCount,
      nonNpmVersionCount: snapshot.nonNpmVersionCount,
      snapshotRetrievedAt: policy.maliciousPackageSnapshot?.retrieved_at,
      snapshotStale: snapshot.stale,
    },
  };
}

function loadBundle(root = process.cwd()) {
  const npmConfigResult = parseNpmConfig(resolve(root, '.npmrc'));
  return {
    manifest: parseJsonFile(resolve(root, 'package.json'), 'package.json'),
    lock: parseJsonFile(resolve(root, 'package-lock.json'), 'package-lock.json'),
    policy: parseJsonFile(resolve(root, 'security/npm-policy.json'), 'security/npm-policy.json'),
    npmConfig: npmConfigResult.config,
    npmConfigErrors: npmConfigResult.errors,
  };
}

function cloneBundle(bundle) {
  return JSON.parse(JSON.stringify(bundle));
}

function runSelfTest(baseline) {
  const baselineResult = validateBundle(baseline);
  if (baselineResult.errors.length > 0) {
    throw new Error(`baseline policy is invalid:\n${baselineResult.errors.join('\n')}`);
  }

  const cases = [
    {
      name: 'lockfile version drift',
      expected: 'lockfileVersion must be 3',
      mutate: (bundle) => { bundle.lock.lockfileVersion = 2; },
    },
    {
      name: 'non-exact direct dependency',
      expected: 'must be an exact version',
      mutate: (bundle) => { bundle.manifest.dependencies.commander = '^12.1.0'; },
    },
    {
      name: 'manifest and root lock drift',
      expected: 'dependencies.commander differs',
      mutate: (bundle) => { bundle.lock.packages[''].dependencies.commander = '12.1.1'; },
    },
    {
      name: 'non-registry source',
      expected: 'must use its canonical npmjs registry tarball path',
      mutate: (bundle) => { bundle.lock.packages['node_modules/commander'].resolved = 'git+https://example.invalid/repo.git'; },
    },
    {
      name: 'npm alias tarball name mismatch',
      expected: 'must use its canonical npmjs registry tarball path',
      mutate: (bundle) => {
        const entry = bundle.lock.packages['node_modules/commander'];
        entry.name = 'kleur';
        entry.resolved = `https://registry.npmjs.org/kleur/-/kleur-${entry.version}.tgz`;
      },
    },
    {
      name: 'missing SHA-512 integrity',
      expected: 'must have SHA-512 integrity',
      mutate: (bundle) => { bundle.lock.packages['node_modules/commander'].integrity = 'sha1-AAAA'; },
    },
    {
      name: 'link entry',
      expected: 'must not be a link entry',
      mutate: (bundle) => { bundle.lock.packages['node_modules/commander'].link = true; },
    },
    {
      name: 'bundled lock metadata',
      expected: 'contains unsupported bundled metadata inBundle',
      mutate: (bundle) => { bundle.lock.packages['node_modules/commander'].inBundle = true; },
    },
    {
      name: 'unsupported root dependency section',
      expected: 'contains unsupported root dependency section optionalDependencies',
      mutate: (bundle) => {
        bundle.manifest.optionalDependencies = { commander: '12.1.0' };
        bundle.lock.packages[''].optionalDependencies = { commander: '12.1.0' };
      },
    },
    {
      name: 'unsupported workspace links',
      expected: 'contains unsupported root dependency section workspaces',
      mutate: (bundle) => {
        bundle.manifest.workspaces = ['packages/*'];
        bundle.lock.packages[''].workspaces = ['packages/*'];
      },
    },
    {
      name: 'unreviewed lifecycle script',
      expected: 'unreviewed hasInstallScript entry',
      mutate: (bundle) => { bundle.lock.packages['node_modules/commander'].hasInstallScript = true; },
    },
    {
      name: 'stale lifecycle review entry',
      expected: 'is absent or no longer marked hasInstallScript',
      mutate: (bundle) => { delete bundle.lock.packages['node_modules/esbuild'].hasInstallScript; },
    },
    {
      name: 'known malicious exact version',
      expected: 'matches denied malicious version keyv@6.0.0',
      mutate: (bundle) => {
        bundle.lock.packages['node_modules/keyv'] = {
          version: '6.0.0',
          resolved: 'https://registry.npmjs.org/keyv/-/keyv-6.0.0.tgz',
          integrity: `sha512-${'A'.repeat(86)}==`,
        };
      },
    },
    {
      name: 'package manager drift',
      expected: 'packageManager must be npm@10.8.2',
      mutate: (bundle) => { bundle.manifest.packageManager = 'npm@11.0.0'; },
    },
    {
      name: 'unsafe npm lifecycle setting',
      expected: '.npmrc ignore-scripts must be true',
      mutate: (bundle) => { bundle.npmConfig['ignore-scripts'] = 'false'; },
    },
    {
      name: 'tampered embedded denylist',
      expected: 'does not match npm_embedded_data_sha256',
      mutate: (bundle) => { bundle.policy.maliciousVersions.keyv.push('6.0.1'); },
    },
    {
      name: 'tampered embedded non-npm indicators',
      expected: 'nonNpmIndicators content does not match embedded_data_sha256',
      mutate: (bundle) => {
        bundle.policy.nonNpmIndicators.indicators['github.com/adieuu-llc/adieuu-2026'].push('v0.4.13');
      },
    },
  ];

  for (const testCase of cases) {
    const candidate = cloneBundle(baseline);
    testCase.mutate(candidate);
    const result = validateBundle(candidate);
    if (!result.errors.some((error) => error.includes(testCase.expected))) {
      throw new Error(
        `negative case "${testCase.name}" did not produce "${testCase.expected}"; got:\n${result.errors.join('\n')}`,
      );
    }
  }

  console.log(`LOCK POLICY SELF-TEST OK: baseline + ${cases.length} in-memory negative cases`);
}

function printResult(result) {
  for (const warning of result.warnings) {
    console.warn(`LOCK POLICY WARNING: ${warning}`);
  }
  if (result.errors.length > 0) {
    console.error(`LOCK POLICY FAILED: ${result.errors.length} violation(s)`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  const stats = result.stats;
  const freshness = stats.snapshotStale ? 'stale' : 'within declared freshness window';
  console.log(
    `LOCK POLICY OK: ${stats.lockedPackageCount} locked packages; ` +
    `${stats.directDependencyCount} exact direct dependencies; ` +
    `${stats.installScriptCount} reviewed lifecycle declarations (execution disabled); ` +
    `${stats.maliciousMatches} matches against ${stats.maliciousVersionCount} exact denied versions ` +
    `across ${stats.maliciousPackageCount} npm package names; ` +
    `${stats.nonNpmVersionCount} versions across ${stats.nonNpmIndicatorCount} non-npm indicators retained separately; ` +
    `snapshot ${stats.snapshotRetrievedAt} (${freshness})`,
  );
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--self-test')) {
    throw new Error('Usage: node scripts/check-lock-policy.mjs [--self-test]');
  }

  const bundle = loadBundle();
  if (args[0] === '--self-test') {
    runSelfTest(bundle);
  } else {
    printResult(validateBundle(bundle));
  }
}

try {
  main();
} catch (error) {
  console.error(`LOCK POLICY ERROR: ${error.message}`);
  process.exitCode = 1;
}
