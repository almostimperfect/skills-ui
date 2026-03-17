import { Command } from 'commander'
import { DEFAULT_PORT } from '../../core/constants.js'

export function serveCommand(): Command {
  return new Command('serve')
    .option('--port <port>', 'Port to listen on', String(DEFAULT_PORT))
    .description('Start the Web UI')
    .action(async (opts: { port: string }) => {
      const port = parseInt(opts.port, 10)
      // Dynamic import to avoid loading Express until needed
      const { startServer } = await import('../../server/index.js')
      startServer(port)
    })
}
