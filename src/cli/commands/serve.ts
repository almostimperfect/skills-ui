import { Command } from 'commander'
import { DEFAULT_PORT } from '../../core/constants.js'

export function serveCommand(): Command {
  return new Command('serve')
    .option('--port <port>', 'Port to listen on', String(DEFAULT_PORT))
    .description('Start the Web UI')
    .action(async (opts: { port: string }) => {
      const port = parseInt(opts.port, 10)
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        console.error(`Error: invalid port "${opts.port}" — must be an integer between 1 and 65535`)
        process.exit(1)
      }
      // Dynamic import to avoid loading Express until needed
      const { startServer } = await import('../../server/index.js')
      startServer(port)
    })
}
