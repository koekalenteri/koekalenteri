import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'dotenv'
import { accountSecrets, devSecrets, toDotenv, withSecretsFile } from './playwright-mcp.mjs'

// Claude's browser on dev gets the dev test accounts as Playwright MCP secrets, so the model types
// a variable's name and the server fills in the value. Only the E2E_DEV_* keys of .env are handed
// over, written so that the server's dotenv parser reads back exactly what .env holds.

// A carriage return: a double-quoted `\r` in .env reads as one, but dotenv turns a written one
// into a line feed, whatever the quoting.
const UNWRITABLE = 'pw\r'

let dir
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'playwright-mcp-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('devSecrets', () => {
  it('keeps only the dev test accounts', () => {
    const env = {
      E2E_DEV_SIHTEERI_EMAIL: 'sihteeri@example.com',
      E2E_DEV_SIHTEERI_PASSWORD: 'pw',
      JIRA_API_TOKEN: 'token',
      REACT_APP_REGION: 'eu-north-1',
      XE2E_DEV_OTHER: 'other',
    }

    expect(devSecrets(env)).toEqual({ E2E_DEV_SIHTEERI_EMAIL: 'sihteeri@example.com', E2E_DEV_SIHTEERI_PASSWORD: 'pw' })
  })

  it('leaves out an account left empty, as .env.sample has them', () => {
    expect(devSecrets({ E2E_DEV_ILMOITTAJA_EMAIL: '', E2E_DEV_ILMOITTAJA_PASSWORD: 'pw' })).toEqual({
      E2E_DEV_ILMOITTAJA_PASSWORD: 'pw',
    })
  })
})

describe('toDotenv', () => {
  it.each([
    ['plain', 'Passw0rd'],
    ['a hash', 'pa#ss'],
    ['a single quote', "it's"],
    ['single and double quotes', `it's "x"`],
    ['a dollar and a backslash', String.raw`a$b\c`],
    ['an equals sign and spaces', ' a = b '],
  ])('writes a value with %s so that it reads back the same', (_, value) => {
    expect(parse(toDotenv({ E2E_DEV_X_PASSWORD: value }))).toEqual({ E2E_DEV_X_PASSWORD: value })
  })

  it('keeps several values apart, also ones with every quote in them', () => {
    const secrets = { E2E_DEV_A_EMAIL: `a'b"c\`d`, E2E_DEV_A_PASSWORD: 'ends\\', E2E_DEV_B_PASSWORD: 'pw' }

    expect(parse(toDotenv(secrets))).toEqual(secrets)
  })

  it('refuses a value that no quoting reads back, naming its key', () => {
    expect(() => toDotenv({ E2E_DEV_B_PASSWORD: 'pw', E2E_DEV_A_PASSWORD: UNWRITABLE })).toThrow(
      'no quoting writes the value of E2E_DEV_A_PASSWORD so that it reads back the same'
    )
  })

  it('writes nothing for no secrets', () => {
    expect(toDotenv({})).toBe('')
  })
})

describe('accountSecrets', () => {
  const envFile = () => path.join(dir, '.env')

  it('finds nothing without a .env', () => {
    expect(accountSecrets(envFile())).toEqual({ problem: `no ${envFile()}` })
  })

  it('finds nothing in a .env without the test accounts', () => {
    writeFileSync(envFile(), 'JIRA_API_TOKEN=token\nE2E_DEV_SIHTEERI_PASSWORD=\n')

    expect(accountSecrets(envFile())).toEqual({ problem: `no E2E_DEV_* keys in ${envFile()}` })
  })

  it('hands over the test accounts and nothing else', () => {
    const lines = ['REACT_APP_REGION=eu-north-1', 'E2E_DEV_SIHTEERI_EMAIL=s@example.com', 'JIRA_API_TOKEN=token']
    writeFileSync(envFile(), `${lines.join('\n')}\n`)

    const { text } = accountSecrets(envFile())

    expect(parse(text)).toEqual({ E2E_DEV_SIHTEERI_EMAIL: 's@example.com' })
  })

  it('refuses a value that cannot be handed over as it is', () => {
    writeFileSync(envFile(), String.raw`E2E_DEV_SIHTEERI_PASSWORD="pw\r"` + '\n')
    // The .env itself must hold the value, or this tests nothing.
    expect(parse(readFileSync(envFile(), 'utf8')).E2E_DEV_SIHTEERI_PASSWORD).toBe(UNWRITABLE)

    expect(() => accountSecrets(envFile())).toThrow('E2E_DEV_SIHTEERI_PASSWORD')
  })
})

describe('withSecretsFile', () => {
  const outputDir = () => path.join(dir, '.playwright-mcp')

  it('hands `fn` a file only its owner may read, and removes it afterwards', () => {
    const seen = withSecretsFile('E2E_DEV_X_PASSWORD=pw\n', outputDir(), (file) => ({
      mode: statSync(file).mode & 0o777,
      text: readFileSync(file, 'utf8'),
      folder: path.dirname(file),
    }))

    expect(seen.mode).toBe(0o600)
    expect(seen.text).toBe('E2E_DEV_X_PASSWORD=pw\n')
    expect(path.dirname(seen.folder)).toBe(outputDir())
    expect(existsSync(seen.folder)).toBe(false)
    expect(readdirSync(outputDir())).toEqual([])
  })

  it('removes the file also when `fn` throws', () => {
    let folder
    expect(() =>
      withSecretsFile('E2E_DEV_X_PASSWORD=pw\n', outputDir(), (file) => {
        folder = path.dirname(file)
        throw new Error('server failed')
      })
    ).toThrow('server failed')

    expect(existsSync(folder)).toBe(false)
    expect(readdirSync(outputDir())).toEqual([])
  })
})

describe('.mcp.json', () => {
  it('starts the playwright server through this launcher with the dev config', () => {
    const config = JSON.parse(readFileSync(path.join(import.meta.dirname, '..', '.mcp.json'), 'utf8'))

    expect(config.mcpServers.playwright).toEqual({
      command: 'node',
      args: ['scripts/playwright-mcp.mjs', '--config', '.claude/playwright-mcp.json'],
    })
  })
})
