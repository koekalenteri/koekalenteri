import { createHash } from 'node:crypto'
import { sha256Hex } from './sha256'

const nodeSha256 = (text: string) => createHash('sha256').update(text).digest('hex')

describe('sha256Hex', () => {
  it('gives the digests of the standard test vectors', () => {
    expect(sha256Hex('')).toEqual('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toEqual('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toEqual(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    )
  })

  it.each([
    ['letters outside ASCII', 'päivä hylätty ÄÖÅ äöå'],
    ['a character outside the basic plane', 'koira 🐕'],
    ['a Kennelliitto body', JSON.stringify({ hylätty: false, nimi: 'Häkkinen', päivä: '2026-09-26', tulos: 'A1' })],
  ])('gives what node:crypto gives for %s', (_name, text) => {
    expect(sha256Hex(text)).toEqual(nodeSha256(text))
  })

  // 55 bytes is the most one block can pad, 56 needs a second one; 64 is a whole block and 119/120 the same edge in two.
  it.each([1, 55, 56, 57, 63, 64, 65, 119, 120, 1000])('gives what node:crypto gives for %i bytes', (length) => {
    const text = 'ä'.repeat(Math.floor(length / 2)) + 'x'.repeat(length % 2)
    expect(sha256Hex(text)).toEqual(nodeSha256(text))
  })
})
