const { spawnSync } = require('node:child_process')

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...options.env },
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run(npmCommand, ['run', 'lint-biome'])

run(npmCommand, ['test', '--', '--onlyChanged'], {
  env: { CI: '1' },
})
