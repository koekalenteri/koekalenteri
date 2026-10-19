import { foldedFrom, jitteredWait, retryOnConditionFailure } from './conditionalWrite'

const conflict = () =>
  Object.assign(new Error('The conditional request failed'), { name: 'ConditionalCheckFailedException' })

describe('foldedFrom', () => {
  it('holds the write to the value read, on a row that still exists', () => {
    expect(foldedFrom('#flag.#entry', { '#entry': 'ALO', '#flag': 'resultsPublished' }, ['2026-09-12'])).toEqual({
      expression: 'attribute_exists(#id) AND #flag.#entry = :foldedFrom',
      names: { '#entry': 'ALO', '#flag': 'resultsPublished', '#id': 'id' },
      values: { ':foldedFrom': ['2026-09-12'] },
    })
  })

  it('holds a value read as absent to still being absent', () => {
    expect(foldedFrom('#updatedAt', { '#updatedAt': 'updatedAt' }, undefined)).toEqual({
      expression: 'attribute_exists(#id) AND attribute_not_exists(#updatedAt)',
      names: { '#id': 'id', '#updatedAt': 'updatedAt' },
    })
  })

  it('compares a value read as false, which is not absent', () => {
    expect(foldedFrom('#flag', { '#flag': 'resultsPublished' }, false)).toMatchObject({
      expression: 'attribute_exists(#id) AND #flag = :foldedFrom',
      values: { ':foldedFrom': false },
    })
  })
})

describe('retryOnConditionFailure', () => {
  const exhausted = () => new Error('kept changing')

  it('works from the reading of the caller first, and from the row read afresh after a conflict', async () => {
    const reread = vi.fn().mockResolvedValueOnce('second reading')
    const work = vi.fn().mockRejectedValueOnce(conflict()).mockResolvedValueOnce('written')

    await expect(
      retryOnConditionFailure({ exhausted, initial: 'first reading', maxAttempts: 3, reread, work })
    ).resolves.toBe('written')
    expect(work).toHaveBeenNthCalledWith(1, 'first reading')
    expect(work).toHaveBeenNthCalledWith(2, 'second reading')
    expect(reread).toHaveBeenCalledTimes(1)
  })

  it('reads nothing again when the first write lands', async () => {
    const reread = vi.fn()

    await expect(
      retryOnConditionFailure({ exhausted, initial: 1, maxAttempts: 3, reread, work: async (n: number) => n + 1 })
    ).resolves.toBe(2)
    expect(reread).not.toHaveBeenCalled()
  })

  it('gives up with the conflict the caller names after the last attempt', async () => {
    const reread = vi.fn().mockResolvedValue('again')
    const work = vi.fn().mockRejectedValue(conflict())

    await expect(
      retryOnConditionFailure({ exhausted, initial: 'first', maxAttempts: 3, reread, work })
    ).rejects.toThrow('kept changing')
    expect(work).toHaveBeenCalledTimes(3)
    expect(reread).toHaveBeenCalledTimes(2)
  })

  it('lets any other failure through at once', async () => {
    const reread = vi.fn()
    const work = vi.fn().mockRejectedValue(new Error('throttled'))

    await expect(
      retryOnConditionFailure({ exhausted, initial: 'first', maxAttempts: 3, reread, work })
    ).rejects.toThrow('throttled')
    expect(work).toHaveBeenCalledTimes(1)
    expect(reread).not.toHaveBeenCalled()
  })

  it('retries on the conflict the caller names, a cancelled transaction say', async () => {
    const canceled = Object.assign(new Error('cancelled'), { name: 'TransactionCanceledException' })
    const reread = vi.fn().mockResolvedValueOnce('second reading')
    const work = vi.fn().mockRejectedValueOnce(canceled).mockResolvedValueOnce('written')
    const isConflict = (error: unknown) => error === canceled

    await expect(
      retryOnConditionFailure({ exhausted, initial: 'first', isConflict, maxAttempts: 3, reread, work })
    ).resolves.toBe('written')
    expect(work).toHaveBeenNthCalledWith(2, 'second reading')
  })

  it('waits after each conflict, before the row is read again, and not after the last attempt', async () => {
    const order: string[] = []
    const wait = vi.fn(async (attempt: number) => {
      order.push(`wait ${attempt}`)
      await Promise.resolve()
      order.push(`waited ${attempt}`)
    })
    const reread = vi.fn(async () => {
      order.push('reread')
      return 'again'
    })
    const work = vi.fn(async () => {
      order.push('work')
      throw conflict()
    })

    await expect(
      retryOnConditionFailure({ exhausted, initial: 'first', maxAttempts: 3, reread, wait, work })
    ).rejects.toThrow('kept changing')
    expect(order).toEqual(['work', 'wait 1', 'waited 1', 'reread', 'work', 'wait 2', 'waited 2', 'reread', 'work'])
  })

  it('hands the last conflict to exhausted', async () => {
    const last = conflict()
    const work = vi.fn().mockRejectedValueOnce(conflict()).mockRejectedValueOnce(last)

    await expect(
      retryOnConditionFailure({
        exhausted: (lastConflict) => lastConflict,
        initial: 'first',
        maxAttempts: 2,
        reread: async () => 'again',
        work,
      })
    ).rejects.toBe(last)
  })
})

describe('jitteredWait', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** The milliseconds the wait takes: it is still pending one millisecond before. */
  const waitedFor = async (wait: (attempt: number) => Promise<void>, attempt: number, ms: number) => {
    let done = false
    const waiting = wait(attempt).then(() => {
      done = true
    })
    await vi.advanceTimersByTimeAsync(ms - 1)
    const before = done
    await vi.advanceTimersByTimeAsync(1)
    await waiting
    return { before, done }
  }

  it.each([
    // Half of 10 ms, of 20 ms after doubling, and of the 500 ms cap the seventh attempt reaches.
    [1, 5],
    [2, 10],
    [7, 250],
  ])('waits a random part of the base doubled per attempt and capped: attempt %i takes %i ms', async (attempt, ms) => {
    const wait = jitteredWait(10, 500, () => 0.5)

    await expect(waitedFor(wait, attempt, ms)).resolves.toEqual({ before: false, done: true })
  })
})
