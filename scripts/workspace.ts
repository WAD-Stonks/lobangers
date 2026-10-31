import { join } from 'node:path'
import { loadEnvironment, repositoryRoot } from '@scripts/environment'
import { runCommands } from '@scripts/processes'

const [workspace, ...args] = process.argv.slice(2)
if (!workspace || args.length === 0) throw new Error('Usage: workspace.ts <workspace> <script>')
const env = loadEnvironment()
// Disposable integration fixtures must choose their own datasource, even when
// the root .env or invoking shell supplies one. Preserve every other command.
if (workspace === 'apps/api' && args[0] === 'test:integration') delete env.DATABASE_URL
process.exitCode = await runCommands([
  {
    command: 'pnpm',
    args: ['run', ...args],
    cwd: join(repositoryRoot, workspace),
    env,
  },
])
