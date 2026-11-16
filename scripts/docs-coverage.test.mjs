import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createThrowawayRepo } from './lib/throwaway-repo.mjs'

const script = fileURLToPath(new URL('./docs-coverage.mjs', import.meta.url))

describe('docs-coverage --since', () => {
  let repo

  beforeAll(() => {
    repo = createThrowawayRepo('docs-coverage-')
    const { dir, git } = repo
    git('commit', '-q', '--allow-empty', '-m', 'first')
    git('checkout', '-q', '-b', 'side')
    writeFileSync(path.join(dir, 'notes.md'), 'side\n')
    git('add', 'notes.md')
    git('commit', '-q', '-m', 'side touches nothing under src')
    git('checkout', '-q', 'main')
    mkdirSync(path.join(dir, 'src'))
    writeFileSync(path.join(dir, 'src', 'app.ts'), 'export {}\n')
    git('add', 'src/app.ts')
    git('commit', '-q', '-m', 'main touches src after the branch point')
    git('checkout', '-q', 'side')
  })

  afterAll(() => {
    repo.remove()
  })

  it('lists only what the branch changed, not what main changed after the branch point', () => {
    const output = execFileSync('node', [script, '--since', 'main'], { cwd: repo.dir, encoding: 'utf8', env: repo.env })
    expect(output.trim()).toBe('docs-coverage: no application code in this change')
  })
})
