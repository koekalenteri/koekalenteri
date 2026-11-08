import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'dotenv'
import { devSecrets, serverArgs, toDotenv } from './playwright-mcp.mjs'

// Claude's browser on dev gets the dev test accounts as Playwright MCP secrets, so the model types
// a variable's name and the server fills in the value. Only the E2E_DEV_* keys of .env are handed
// over, written so that the server's dotenv parser reads back exactly what .env holds.

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
    const { text, skipped } = toDotenv({ E2E_DEV_X_PASSWORD: value })

    expect(skipped).toEqual([])
    expect(parse(text)).toEqual({ E2E_DEV_X_PASSWORD: value })
  })

  it('names a value that no quoting reads back, and writes the rest', () => {
    const { text, skipped } = toDotenv({ E2E_DEV_A_PASSWORD: `'a"\`\n`, E2E_DEV_B_PASSWORD: 'pw' })

    expect(skipped).toEqual(['E2E_DEV_A_PASSWORD'])
    expect(parse(text)).toEqual({ E2E_DEV_B_PASSWORD: 'pw' })
  })

  it('keeps several values apart, also ones with every quote in them', () => {
    const secrets = { E2E_DEV_A_EMAIL: `a'b"c\`d`, E2E_DEV_A_PASSWORD: 'ends\\', E2E_DEV_B_PASSWORD: 'pw' }
    const { text, skipped } = toDotenv(secrets)

    expect(skipped).toEqual([])
    expect(parse(text)).toEqual(secrets)
  })

  it('writes nothing for no secrets', () => {
    expect(toDotenv({})).toEqual({ text: '', skipped: [] })
  })
})

describe('serverArgs', () => {
  const args = ['--config', '.claude/playwright-mcp.json']

  it('adds the secrets file', () => {
    expect(serverArgs(args, '/x/secrets.env')).toEqual([...args, '--secrets', '/x/secrets.env'])
  })

  it('starts without secrets when there is no file', () => {
    expect(serverArgs(args, undefined)).toEqual(args)
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
