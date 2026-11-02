/**
 * SHA-256 of a text's UTF-8 bytes, as lower-case hex: the digest `createHash('sha256').update(text)` gives in
 * Node, worked out synchronously and in plain code so the browser can make it too. The results page and the
 * sending to Kennelliitto hash a body the same way and compare with the hash stored when it was sent.
 */

/** The first 32 bits of the fractional parts of the cube roots of the first 64 primes (FIPS 180-4, 4.2.2). */
const K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
])

/** The first 32 bits of the fractional parts of the square roots of the first 8 primes (FIPS 180-4, 5.3.3). */
const INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]

const BLOCK_BYTES = 64

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n))

/** The message, a 1 bit, zeros, and its length in bits as 64 bits, to a whole number of blocks. */
const padded = (message: Uint8Array): DataView => {
  const length = Math.ceil((message.length + 9) / BLOCK_BYTES) * BLOCK_BYTES
  const bytes = new Uint8Array(length)
  bytes.set(message)
  bytes[message.length] = 0x80
  const view = new DataView(bytes.buffer)
  const bits = message.length * 8
  view.setUint32(length - 8, Math.floor(bits / 2 ** 32))
  view.setUint32(length - 4, bits >>> 0)
  return view
}

/** The message schedule of the block at `offset`. A `Uint32Array` keeps every sum to 32 bits. */
const schedule = (view: DataView, offset: number): Uint32Array => {
  const w = new Uint32Array(64)
  for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
  for (let i = 16; i < 64; i++) {
    const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
    const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
    w[i] = w[i - 16] + s0 + w[i - 7] + s1
  }
  return w
}

/** Mixes one block into the hash, in place. */
const compress = (hash: Uint32Array, w: Uint32Array): void => {
  const v = Uint32Array.from(hash)
  for (let i = 0; i < 64; i++) {
    const [a, b, c, d, e, f, g, h] = v
    const t1 = h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]
    const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))
    v.set([t1 + t2, a, b, c, d + t1, e, f, g])
  }
  for (let i = 0; i < 8; i++) hash[i] += v[i]
}

export const sha256Hex = (text: string): string => {
  const view = padded(new TextEncoder().encode(text))
  const hash = Uint32Array.from(INITIAL)
  for (let offset = 0; offset < view.byteLength; offset += BLOCK_BYTES) compress(hash, schedule(view, offset))
  return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join('')
}
