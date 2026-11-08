#!/usr/bin/env node
// Starts Claude's browser on dev, the `playwright` server in .mcp.json (e2e/README.md, "Claude's
// browser on dev"), with the dev test accounts as Playwright MCP secrets. The model then types
// a variable's name, such as E2E_DEV_SIHTEERI_PASSWORD, into `browser_type` or
// `browser_fill_form`, the server fills in the value, and the value never reaches the transcript.
//
// The accounts are the E2E_DEV_* keys of the checkout's .env, or of the main checkout's for a
// worktree without one (dotenvFile). Only those keys are handed over: the server replaces every
// secret value it finds in a tool response with the secret's name, and fills any secret whose
// name is typed, so the rest of .env (the Jira token, REACT_APP_REGION=eu-north-1) would both
// garble the page snapshots and be one typed name away from a dev form field. Without a .env, or
// without E2E_DEV_* keys in it, the server starts without secrets. A key whose value cannot be
// written so that it reads back the same stops the launcher before anything is written.
//
// The server takes secrets only as a dotenv file. It is written next to the server's other
// output (.playwright-mcp/, which git ignores) and removed as soon as the server has parsed its
// options, which it does synchronously when its CLI is loaded.
//
// Usage: node scripts/playwright-mcp.mjs [playwright-mcp options], e.g. --config .claude/playwright-mcp.json
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { parse } from 'dotenv'
import { dotenvFile } from './lib/git.mjs'

const SECRET_PREFIX = 'E2E_DEV_'
const QUOTES = ["'", '"', '`']
const REPO = path.join(import.meta.dirname, '..')

/** The entries of a parsed .env that the browser gets: the dev test accounts, empty ones left out. */
export const devSecrets = (env) =>
  Object.fromEntries(Object.entries(env).filter(([name, value]) => name.startsWith(SECRET_PREFIX) && value !== ''))

/**
 * `secrets` as dotenv text that parses back to exactly them. Throws, naming the key, when no
 * quoting writes a value so. Each line is checked together with the lines before it, because a
 * quoted value may run on into the next line.
 *
 * The check parses with the repository's `dotenv`; the server parses with the copy bundled in
 * playwright-core (`require('playwright-core/lib/utilsBundle').dotenv`). The two read the same
 * quoting today, but a @playwright/mcp bump should check that they still do.
 */
export const toDotenv = (secrets) => {
  let text = ''
  for (const [name, value] of Object.entries(secrets)) {
    const expected = { ...parse(text), [name]: value }
    const line = QUOTES.map((quote) => `${name}=${quote}${value}${quote}\n`).find((candidate) =>
      isDeepStrictEqual(parse(text + candidate), expected)
    )
    if (line === undefined) throw new Error(`no quoting writes the value of ${name} so that it reads back the same`)
    text += line
  }
  return text
}

/**
 * What `envFile` holds for the browser: `{ text }`, the dotenv text of the test accounts, or
 * `{ problem }` when there are none to hand over. Throws when a value cannot be written (toDotenv).
 */
export const accountSecrets = (envFile) => {
  if (!existsSync(envFile)) return { problem: `no ${envFile}` }
  const text = toDotenv(devSecrets(parse(readFileSync(envFile, 'utf8'))))
  if (text === '') return { problem: `no ${SECRET_PREFIX}* keys in ${envFile}` }
  return { text }
}

/**
 * Runs `fn` with the path of a file that holds `text` and only its owner may read, in a fresh
 * folder under `dir`, and removes the folder afterwards, also when `fn` throws.
 */
export const withSecretsFile = (text, dir, fn) => {
  mkdirSync(dir, { recursive: true })
  const folder = mkdtempSync(path.join(dir, 'secrets-'))
  try {
    const file = path.join(folder, 'secrets.env')
    writeFileSync(file, text, { mode: 0o600 })
    return fn(file)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

/** Loads the server's CLI with `args`; its option parsing reads the secrets file before this returns. */
const startServer = (args) => {
  const require = createRequire(import.meta.url)
  const cli = path.join(path.dirname(require.resolve('@playwright/mcp/package.json')), 'cli.js')
  process.argv = [process.argv[0], cli, ...args]
  require(cli)
}

const main = (args) => {
  let found
  try {
    found = accountSecrets(dotenvFile(REPO))
  } catch (error) {
    console.error(`playwright-mcp: ${error.message}`)
    process.exit(1)
  }
  if (found.text === undefined) {
    console.error(`playwright-mcp: ${found.problem}; the browser cannot sign in to dev`)
    startServer(args)
    return
  }
  withSecretsFile(found.text, path.join(REPO, '.playwright-mcp'), (file) => startServer([...args, '--secrets', file]))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2))
