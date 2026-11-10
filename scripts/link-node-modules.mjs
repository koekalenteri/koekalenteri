#!/usr/bin/env node
// Gives a worktree its node_modules without installing them again: every worktree whose
// package-lock.json is the same links one shared, write-protected install in the main checkout,
// under .node_modules-store/<lock hash>/node_modules. The first worktree with a new lock installs
// it there with `npm ci`. Stores no worktree links any more are removed on each run.
//
//   npm run link-node-modules           link the store for this lock, installing it if missing
//   npm run link-node-modules -- --own  replace the link with this worktree's own install, before
//                                       changing dependencies (the store is read-only)
//
// The main checkout keeps its own node_modules. On Windows the link is a directory junction,
// which needs no administrator rights. Messages go to stderr, so a hook can keep stdout.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const STORE_DIR = '.node_modules-store'
const PENDING_PREFIX = 'pending-'
// A pending install younger than this may still be running in another worktree.
const PENDING_MAX_AGE_MS = 60 * 60 * 1000

const log = (message) => process.stderr.write(`link-node-modules: ${message}\n`)

const git = (cwd, ...args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`)
  return result.stdout.trim()
}

const npmCi = (cwd) => {
  const result = spawnSync('npm', ['ci', '--prefer-offline', '--no-audit', '--no-fund'], {
    cwd,
    shell: process.platform === 'win32',
    stdio: ['ignore', process.stderr, process.stderr],
  })
  if (result.status !== 0) throw new Error(`npm ci failed in ${cwd}`)
}

const lockKey = (worktree) =>
  createHash('sha256')
    .update(fs.readFileSync(path.join(worktree, 'package-lock.json')))
    .digest('hex')
    .slice(0, 16)

/** Clears (or restores) the write bits of a tree; links are left alone, chmod would follow them. */
const setWritable = (dir, writable) => {
  const chmod = (p) => {
    const { mode } = fs.statSync(p)
    fs.chmodSync(p, writable ? mode | 0o200 : mode & ~0o222)
  }
  if (writable) chmod(dir)
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) setWritable(p, writable)
    else chmod(p)
  }
  if (!writable) chmod(dir)
}

const removeTree = (dir) => {
  setWritable(dir, true)
  fs.rmSync(dir, { force: true, recursive: true })
}

const isLink = (p) => {
  try {
    return fs.lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

const linkTarget = (p) => (isLink(p) ? path.resolve(path.dirname(p), fs.readlinkSync(p)) : undefined)

const link = (target, nodeModules) =>
  fs.symlinkSync(target, nodeModules, process.platform === 'win32' ? 'junction' : 'dir')

/** Installs the lock into the store through this worktree, so `npm ci` sees its package files. */
const createStore = (worktree, stores, key) => {
  const nodeModules = path.join(worktree, 'node_modules')
  log(`installing ${key} into ${STORE_DIR}`)
  npmCi(worktree)
  const pending = path.join(stores, `${PENDING_PREFIX}${key}-${process.pid}`)
  fs.mkdirSync(pending, { recursive: true })
  try {
    fs.renameSync(nodeModules, path.join(pending, 'node_modules'))
  } catch (error) {
    // A worktree on another volume (a scratchpad) cannot move its install into the store.
    fs.rmSync(pending, { force: true, recursive: true })
    if (error.code !== 'EXDEV') throw error
    log('the store is on another volume; this worktree keeps its own node_modules')
    return false
  }
  setWritable(pending, false)
  try {
    fs.renameSync(pending, path.join(stores, key))
  } catch (error) {
    // Another worktree finished the same lock first; its store is as good as this one.
    if (!fs.existsSync(path.join(stores, key))) throw error
    removeTree(pending)
  }
  return true
}

const linkedStores = (main, stores) => {
  const linked = new Set()
  for (const line of git(main, 'worktree', 'list', '--porcelain').split('\n')) {
    if (!line.startsWith('worktree ')) continue
    const target = linkTarget(path.join(line.slice('worktree '.length), 'node_modules'))
    if (target) linked.add(path.relative(stores, path.dirname(target)))
  }
  return linked
}

const prune = (main, stores) => {
  if (!fs.existsSync(stores)) return
  const linked = linkedStores(main, stores)
  for (const name of fs.readdirSync(stores)) {
    const dir = path.join(stores, name)
    if (linked.has(name)) continue
    if (name.startsWith(PENDING_PREFIX) && Date.now() - fs.statSync(dir).mtimeMs < PENDING_MAX_AGE_MS) continue
    log(`removing unused store ${name}`)
    removeTree(dir)
  }
}

const main = () => {
  const worktree = path.resolve(git(process.cwd(), 'rev-parse', '--show-toplevel'))
  const mainCheckout = path.dirname(path.resolve(git(worktree, 'rev-parse', '--path-format=absolute', '--git-common-dir')))
  const nodeModules = path.join(worktree, 'node_modules')
  const stores = path.join(mainCheckout, STORE_DIR)

  if (worktree === mainCheckout) {
    log('the main checkout keeps its own node_modules')
    return
  }

  if (process.argv.includes('--own')) {
    if (isLink(nodeModules)) fs.unlinkSync(nodeModules)
    if (!fs.existsSync(nodeModules)) npmCi(worktree)
    log('this worktree has its own node_modules')
    return
  }

  const key = lockKey(worktree)
  const target = path.join(stores, key, 'node_modules')
  if (linkTarget(nodeModules) === target) {
    log(`node_modules already links ${key}`)
  } else if (fs.existsSync(nodeModules) && !isLink(nodeModules)) {
    log('node_modules is this worktree’s own install; remove it to link the store')
  } else {
    if (isLink(nodeModules)) fs.unlinkSync(nodeModules)
    if (fs.existsSync(target) || createStore(worktree, stores, key)) {
      link(target, nodeModules)
      log(`node_modules links ${key}`)
    }
  }
  prune(mainCheckout, stores)
}

main()
