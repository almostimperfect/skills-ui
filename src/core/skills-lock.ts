import { homedir } from 'os'
import { join } from 'path'
import { readJson } from './file-store.js'

export interface GlobalSkillLockEntry {
  source?: string
  sourceType?: string
  sourceUrl?: string
  skillPath?: string
  skillFolderHash?: string
  pluginName?: string
  installedAt?: string
  updatedAt?: string
}

export interface GlobalSkillLock {
  version: number
  skills: Record<string, GlobalSkillLockEntry>
}

export interface LocalSkillLockEntry {
  source?: string
  sourceType?: string
  computedHash?: string
}

export interface LocalSkillLock {
  version: number
  skills: Record<string, LocalSkillLockEntry>
}

const GLOBAL_LOCK_FILE = '.skill-lock.json'
const LOCAL_LOCK_FILE = 'skills-lock.json'

export function getGlobalSkillLockPath(): string {
  const xdgStateHome = process.env.XDG_STATE_HOME?.trim()
  if (xdgStateHome) return join(xdgStateHome, 'skills', GLOBAL_LOCK_FILE)
  return join(homedir(), '.agents', GLOBAL_LOCK_FILE)
}

export function getLocalSkillLockPath(cwd: string): string {
  return join(cwd, LOCAL_LOCK_FILE)
}

export async function readGlobalSkillLock(): Promise<GlobalSkillLock> {
  return readJson<GlobalSkillLock>(getGlobalSkillLockPath(), { version: 3, skills: {} })
}

export async function readLocalSkillLock(cwd: string): Promise<LocalSkillLock> {
  return readJson<LocalSkillLock>(getLocalSkillLockPath(cwd), { version: 1, skills: {} })
}
