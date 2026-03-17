import { readFile } from 'fs/promises'
import { join } from 'path'
import matter from 'gray-matter'
import type { Skill } from './types.js'

export async function parseSkillMetadata(skillDir: string, dirName: string): Promise<Skill> {
  const skillMdPath = join(skillDir, 'SKILL.md')
  try {
    const raw = await readFile(skillMdPath, 'utf-8')
    const { data } = matter(raw)
    return {
      name: (data.name as string) || dirName,
      description: (data.description as string) || '',
      source: (data.source as string) || '',
    }
  } catch {
    return { name: dirName, description: '', source: '' }
  }
}
