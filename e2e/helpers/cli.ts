/**
 * Spawn the BUILT skills-ui binary (dist/cli/index.js) with an injected $HOME.
 *
 * Each spawn is a fresh Node process, so src/core/constants.ts re-computes
 * ~/.skills-ui and ~/.agents from the injected HOME at import time — true
 * per-invocation isolation, exactly like a real user shell.
 */
import { execFile } from 'child_process'
import { CLI_ENTRY } from './env.js'

export interface CliResult {
  stdout: string
  stderr: string
  code: number
}

export function runCli(
  home: string,
  args: string[],
  opts: { timeoutMs?: number; cwd?: string } = {}
): Promise<CliResult> {
  return new Promise(resolvePromise => {
    execFile(
      'node',
      [CLI_ENTRY, ...args],
      {
        env: { ...process.env, HOME: home },
        timeout: opts.timeoutMs ?? 60_000,
        cwd: opts.cwd,
      },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: number | string }) | null
        const code =
          e == null ? 0 : typeof e.code === 'number' ? e.code : e.killed ? 124 : 1
        resolvePromise({ stdout: String(stdout), stderr: String(stderr), code })
      }
    )
  })
}
