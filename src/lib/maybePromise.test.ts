import { allMaybe, mapMaybe, trackSettled } from './maybePromise'

describe('maybePromise', () => {
  describe('mapMaybe', () => {
    it('applies the function synchronously to a settled value', () => {
      expect(mapMaybe(2, (value) => value * 2)).toBe(4)
    })

    it('chains the function onto a Promise', async () => {
      const result = mapMaybe(Promise.resolve(2), (value) => value * 2)
      expect(result).toBeInstanceOf(Promise)
      await expect(result).resolves.toBe(4)
    })
  })

  describe('allMaybe', () => {
    it('returns the values as they are when none is a Promise', () => {
      expect(allMaybe([1, 'a'])).toEqual([1, 'a'])
    })

    it('waits for all of them when any is a Promise', async () => {
      const result = allMaybe([1, Promise.resolve('a')])
      expect(result).toBeInstanceOf(Promise)
      await expect(result).resolves.toEqual([1, 'a'])
    })
  })

  describe('settled registry', () => {
    it('reads a tracked Promise synchronously once it has settled', async () => {
      const promise = trackSettled(Promise.resolve(2))
      expect(mapMaybe(promise, (value) => value * 2)).toBeInstanceOf(Promise)
      await promise
      expect(mapMaybe(promise, (value) => value * 2)).toBe(4)
    })

    it('tracks the Promise a mapping returns, so a chain settles as a whole', async () => {
      const mapped = mapMaybe(trackSettled(Promise.resolve(1)), (value) => value + 1)
      await mapped
      expect(allMaybe([mapped, 'a'])).toEqual([2, 'a'])
    })
  })
})
