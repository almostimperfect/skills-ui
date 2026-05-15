import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const skillsBin = join(repoRoot, 'node_modules', '.bin', 'skills')
const sourceDir = join(repoRoot, 'fixtures', 'xtest-skills')
const configPath = join(homedir(), '.skills-ui', 'config.json')
const inventoryPath = join(homedir(), '.skills-ui', 'inventory.json')
const projectRoot = join(repoRoot, '.xtest', 'projects')

const skillNames = [
  'xtest-global-release',
  'xtest-long-description',
  'xtest-project-builder',
  'xtest-shared-config',
  'xtest-drift-copy',
]

const projects = [
  {
    path: join(projectRoot, 'xtest-project-alpha'),
    agents: ['codex', 'gemini-cli', 'claude-code'],
  },
  {
    path: join(projectRoot, 'xtest-project-beta'),
    agents: ['codex', 'gemini-cli'],
  },
]

function run(args, options = {}) {
  execFileSync(skillsBin, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? 'inherit',
  })
}

function runOptional(args, options = {}) {
  try {
    run(args, options)
  } catch {
    // Cleanup should be idempotent; missing test data is fine.
  }
}

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function removeXtestGlobalSkills() {
  for (const name of skillNames) {
    runOptional(['remove', name, '-g', '-y'])
  }
}

function removeXtestInventoryEntries() {
  const inventory = readJson(inventoryPath, { version: 2, skills: {} })
  if (!inventory.skills || typeof inventory.skills !== 'object') return

  inventory.skills = Object.fromEntries(
    Object.entries(inventory.skills).filter(([, skill]) => !String(skill?.name ?? '').startsWith('xtest-'))
  )
  writeJson(inventoryPath, inventory)
}

function installGlobalSkills() {
  run([
    'add',
    sourceDir,
    '-g',
    '--copy',
    '--skill',
    'xtest-global-release',
    '--skill',
    'xtest-long-description',
    '--agent',
    'codex',
    '-y',
  ])
}

function installProjectSkills() {
  rmSync(projectRoot, { recursive: true, force: true })

  for (const project of projects) {
    mkdirSync(project.path, { recursive: true })
  }

  run([
    'add',
    sourceDir,
    '--copy',
    '--skill',
    'xtest-project-builder',
    '--skill',
    'xtest-shared-config',
    '--agent',
    'codex',
    '--agent',
    'gemini-cli',
    '-y',
  ], { cwd: projects[0].path })

  run([
    'add',
    sourceDir,
    '--copy',
    '--skill',
    'xtest-drift-copy',
    '--agent',
    'codex',
    '--agent',
    'gemini-cli',
    '-y',
  ], { cwd: projects[1].path })

  const driftSkill = join(projects[1].path, '.agents', 'skills', 'xtest-drift-copy', 'SKILL.md')
  writeFileSync(
    driftSkill,
    `${readFileSync(driftSkill, 'utf8')}\nLocal QA edit: this line is added by seed-xtest-data to trigger drift detection.\n`,
    'utf8'
  )
}

function registerProjects() {
  const config = readJson(configPath, { projects: [] })
  const existing = Array.isArray(config.projects) ? config.projects : []
  const withoutXtest = existing.filter(project => !project.name?.startsWith('xtest-'))
  config.projects = [
    ...withoutXtest,
    ...projects.map(project => ({
      path: project.path,
      name: basename(project.path),
      agents: project.agents,
    })),
  ]
  writeJson(configPath, config)
}

function cleanup() {
  removeXtestGlobalSkills()
  removeXtestInventoryEntries()
  const config = readJson(configPath, { projects: [] })
  if (Array.isArray(config.projects)) {
    config.projects = config.projects.filter(project => !project.name?.startsWith('xtest-'))
    writeJson(configPath, config)
  }
  rmSync(projectRoot, { recursive: true, force: true })
}

const mode = process.argv[2] ?? 'seed'

if (mode === 'cleanup') {
  cleanup()
  console.log('Removed xtest skills and test projects.')
} else if (mode === 'seed') {
  removeXtestGlobalSkills()
  removeXtestInventoryEntries()
  installGlobalSkills()
  installProjectSkills()
  registerProjects()
  console.log(`Seeded xtest skills and registered projects under ${projectRoot}`)
} else {
  console.error('Usage: node scripts/seed-xtest-data.mjs [seed|cleanup]')
  process.exit(1)
}
