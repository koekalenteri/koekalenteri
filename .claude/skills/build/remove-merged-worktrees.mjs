#!/usr/bin/env node
// Lists, and with --apply removes, the worktrees under .claude/worktrees/ whose work has landed,
// only those named on the command line when any are. A worktree goes when
//   - its tracked files are unchanged and it has no untracked files (`git status --porcelain`),
//   - a merged PR's head is its HEAD or descends from it (by its branch, or by HEAD when detached),
//   - no process has its working directory inside it (lsof; without lsof nothing is removed).
// Its local branch is deleted too when it points at that HEAD. Everything else stays, with the
// reason. `git worktree remove` runs without --force, so git refuses anything not clean.
// lsof cannot see a subagent that waits for its next message, so name the worktrees whose agents
// are done rather than sweep a checkout other sessions work in.
//
//   node .claude/skills/build/remove-merged-worktrees.mjs [<worktree>...]          what would go
//   node .claude/skills/build/remove-merged-worktrees.mjs --apply [<worktree>...]  remove it
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const named = args.filter((arg) => !arg.startsWith('--')).map((arg) => path.resolve(arg))

const run = (cmd, args, cwd) => {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
  return { ok: result.status === 0, out: (result.stdout ?? '').trim(), err: (result.stderr ?? '').trim() }
}
const git = (cwd, ...args) => run('git', args, cwd)

const mainCheckout = path.dirname(
  path.resolve(git(process.cwd(), 'rev-parse', '--path-format=absolute', '--git-common-dir').out)
)
const worktreesDir = path.join(mainCheckout, '.claude', 'worktrees') + path.sep

const worktrees = []
for (const block of git(mainCheckout, 'worktree', 'list', '--porcelain').out.split('\n\n')) {
  const fields = Object.fromEntries(
    block.split('\n').map((line) => [line.split(' ')[0], line.slice(line.indexOf(' ') + 1)])
  )
  if (!fields.worktree?.startsWith(worktreesDir)) continue
  if (named.length > 0 && !named.includes(fields.worktree)) continue
  worktrees.push({
    branch: fields.branch?.replace('refs/heads/', ''),
    head: fields.HEAD,
    path: fields.worktree,
  })
}

const lsof = run('lsof', ['-a', '-d', 'cwd', '-Fn'])
const cwds = lsof.ok
  ? lsof.out
      .split('\n')
      .filter((line) => line.startsWith('n'))
      .map((line) => line.slice(1))
  : undefined

const mergedPr = ({ branch, head }) => {
  const args = ['pr', 'list', '--state', 'merged', '--json', 'number,headRefOid', '--limit', '1']
  const query = branch ? ['--head', branch] : ['--search', head]
  const result = run('gh', [...args, ...query])
  return result.ok ? JSON.parse(result.out)[0] : undefined
}

const landed = (wt, pr) => {
  if (pr.headRefOid === wt.head) return true
  git(mainCheckout, 'fetch', '--quiet', 'origin', `pull/${pr.number}/head`)
  return git(mainCheckout, 'merge-base', '--is-ancestor', wt.head, pr.headRefOid).ok
}

const reasonToKeep = (wt) => {
  if (!cwds) return 'lsof is not available, so it may be in use'
  if (cwds.some((cwd) => cwd === wt.path || cwd.startsWith(wt.path + path.sep))) return 'in use'
  const status = git(wt.path, 'status', '--porcelain')
  if (!status.ok) return `git status failed: ${status.err}`
  if (status.out) return 'has uncommitted or untracked files'
  const pr = mergedPr(wt)
  if (!pr) return 'no merged PR'
  if (!landed(wt, pr)) return `has commits after #${pr.number}`
  wt.pr = pr.number
  return undefined
}

let removed = 0
for (const wt of worktrees) {
  const name = path.relative(mainCheckout, wt.path)
  const reason = reasonToKeep(wt)
  if (reason) {
    console.log(`keep    ${name}: ${reason}`)
    continue
  }
  if (!apply) {
    console.log(`remove  ${name} (#${wt.pr})`)
    continue
  }
  const result = git(mainCheckout, 'worktree', 'remove', wt.path)
  if (!result.ok) {
    console.log(`keep    ${name}: ${result.err}`)
    continue
  }
  removed++
  console.log(`removed ${name} (#${wt.pr})`)
  if (wt.branch && git(mainCheckout, 'rev-parse', `refs/heads/${wt.branch}`).out === wt.head) {
    git(mainCheckout, 'branch', '-D', wt.branch)
  }
}
if (apply) console.log(`${removed} removed`)
