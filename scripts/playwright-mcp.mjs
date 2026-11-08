#!/usr/bin/env node
// Starts Claude's browser on dev, the `playwright` server in .mcp.json (e2e/README.md, "Claude's
// browser on dev"), with the dev test accounts as Playwright MCP secrets. The model then types
// a variable's name, such as E2E_DEV_SIHTEERI_PASSWORD, into `browser_type` or
// `browser_fill_form`, the server fills in the value, and the value never reaches the transcript.
//
// The accounts are the E2E_DEV_* keys of the checkout's .env, or of the main checkout's for a
// worktree without one (dotenvFile). Only those keys are handed over: the server replaces every secret value it
// finds in a tool response with the secret's name, and fills any secret whose name is typed, so
// the rest of .env (the Jira token, REACT_APP_REGION=eu-north-1) would both garble the page
// snapshots and be one typed name away from a dev form field. Without a .env, or without E2E_DEV_*
// keys in it, the server starts without secrets.
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
 * `secrets` as dotenv text that parses back to exactly them, and the names of any that no quoting
 * writes so. Each line is checked together with the lines before it, because a quoted value may
 * run on into the next line.
 */
export const toDotenv = (secrets) => {
  let text = ''
  const written = {}
  const skipped = []
  for (const [name, value] of Object.entries(secrets)) {
    const expected = { ...written, [name]: value }
    const line = QUOTES.map((quote) => `${name}=${quote}${value}${quote}\n`).find((candidate) =>
      isDeepStrictEqual(parse(text + candidate), expected)
    )
    if (line === undefined) {
      skipped.push(name)
    } else {
      text += line
      written[name] = value
    }
  }
  return { text, skipped }
}

/** The server's command line: `args` as given, plus the secrets file when there is one. */
export const serverArgs = (args, secretsFile) => (secretsFile ? [...args, '--secrets', secretsFile] : [...args])

/** The dotenv text of the test accounts in the .env that `dotenvFile` finds, or undefined when there are none. */
const accountSecrets = () => {
  const envFile = dotenvFile(REPO)
  if (!existsSync(envFile)) {
    console.error(`playwright-mcp: no ${envFile}; the browser cannot sign in to dev`)
    return undefined
  }
  const { text, skipped } = toDotenv(devSecrets(parse(readFileSync(envFile, 'utf8'))))
  if (skipped.length > 0) {
    console.error(`playwright-mcp: cannot hand over ${skipped.join(', ')}; check their quoting in ${envFile}`)
  }
  if (text === '') {
    console.error(`playwright-mcp: no ${SECRET_PREFIX}* keys in ${envFile}; the browser cannot sign in to dev`)
    return undefined
  }
  return text
}

/** Loads the server's CLI with `args`; its option parsing reads the secrets file before this returns. */
const runServer = (args) => {
  const require = createRequire(import.meta.url)
  const cli = path.join(path.dirname(require.resolve('@playwright/mcp/package.json')), 'cli.js')
  const secrets = accountSecrets()
  if (secrets === undefined) {
    process.argv = [process.argv[0], cli, ...serverArgs(args)]
    require(cli)
    return
  }
  const outputDir = path.join(REPO, '.playwright-mcp')
  mkdirSync(outputDir, { recursive: true })
  const dir = mkdtempSync(path.join(outputDir, 'secrets-'))
  try {
    const file = path.join(dir, 'secrets.env')
    writeFileSync(file, secrets, { mode: 0o600 })
    process.argv = [process.argv[0], cli, ...serverArgs(args, file)]
    require(cli)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) runServer(process.argv.slice(2))
