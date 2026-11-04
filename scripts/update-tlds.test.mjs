import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseTldList, renderTldModule, TLD_LIST_URL, TLD_MODULE, updateTlds } from './update-tlds.mjs'

const HEADER = '# Version 2026110300, Last Updated Tue Nov  3 07:07:01 2026 UTC'
const TLDS = Array.from({ length: 1000 }, (_, index) => `XN--${index}`)
const BODY = [HEADER, 'AAA', ...TLDS, 'ZW', ''].join('\n')
const answering = (body, status = 200) => vi.fn(async () => new Response(body, { status }))

describe('update-tlds', () => {
  describe('parseTldList', () => {
    it("reads the version line and the endings in the file's order", () => {
      expect(parseTldList(BODY)).toEqual({ header: HEADER, tlds: ['AAA', ...TLDS, 'ZW'] })
    })

    it.each([
      ['an empty body', '', /version line/],
      ['an error page', '<html><body>Bad gateway</body></html>', /version line/],
      ['a line that is not an ending', [HEADER, 'AAA', '<html>', ''].join('\n'), /not a top-level domain: <html>/],
      ['a lower-case line', [HEADER, 'aaa', ''].join('\n'), /not a top-level domain: aaa/],
      ['a truncated list', [HEADER, 'AAA', 'ABB', ''].join('\n'), /only 2 top-level domains/],
    ])('refuses %s', (_name, body, message) => {
      expect(() => parseTldList(body)).toThrow(message)
    })
  })

  describe('renderTldModule', () => {
    it('gives the committed module back from its own list', () => {
      const source = readFileSync(TLD_MODULE, 'utf8')
      const header = /# Version [^\n]+/.exec(source)?.[0]
      const tlds = [...source.matchAll(/^ {2}'([^']+)',$/gm)].map(([, tld]) => tld)

      expect(tlds.length).toBeGreaterThan(1000)
      expect(renderTldModule({ header, tlds })).toBe(source)
    })
  })

  describe('updateTlds', () => {
    let dir
    let file

    beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'update-tlds-'))
      file = path.join(dir, 'topLevelDomains.ts')
      writeFileSync(file, 'the old list\n')
    })

    afterEach(() => {
      rmSync(dir, { force: true, recursive: true })
    })

    it("writes the module from IANA's file", async () => {
      const fetch = answering(BODY)

      await expect(updateTlds({ fetch, file })).resolves.toEqual({ changed: true, count: 1002, header: HEADER })

      expect(fetch).toHaveBeenCalledWith(TLD_LIST_URL, expect.anything())
      expect(readFileSync(file, 'utf8')).toBe(renderTldModule(parseTldList(BODY)))
    })

    it('reports no change on a rerun with the same list', async () => {
      await updateTlds({ fetch: answering(BODY), file })
      const written = readFileSync(file, 'utf8')

      await expect(updateTlds({ fetch: answering(BODY), file })).resolves.toEqual(
        expect.objectContaining({ changed: false })
      )

      expect(readFileSync(file, 'utf8')).toBe(written)
    })

    it.each([
      ['a non-200 answer, whatever its body', answering(BODY, 503), /answered 503/],
      ['a body that is not the list', answering('<html></html>'), /version line/],
    ])('leaves the file alone on %s', async (_name, fetch, message) => {
      await expect(updateTlds({ fetch, file })).rejects.toThrow(message)

      expect(readFileSync(file, 'utf8')).toBe('the old list\n')
    })

    it('leaves the file alone when the fetch itself fails', async () => {
      const fetch = vi.fn(async () => {
        throw new Error('network down')
      })

      await expect(updateTlds({ fetch, file })).rejects.toThrow('network down')

      expect(readFileSync(file, 'utf8')).toBe('the old list\n')
    })
  })
})
