import { foldedFrom, retryOnConditionFailure } from './conditionalWrite'

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

  it('answers with the first write that lands, telling each attempt its number', async () => {
    const write = vi.fn().mockRejectedValueOnce(conflict()).mockResolvedValueOnce('written')

    await expect(retryOnConditionFailure(write, 3, exhausted)).resolves.toBe('written')
    expect(write).toHaveBeenNthCalledWith(1, 1)
    expect(write).toHaveBeenNthCalledWith(2, 2)
  })

  it('gives up with the conflict the caller names after the last attempt', async () => {
    const write = vi.fn().mockRejectedValue(conflict())

    await expect(retryOnConditionFailure(write, 3, exhausted)).rejects.toThrow('kept changing')
    expect(write).toHaveBeenCalledTimes(3)
  })

  it('lets any other failure through at once', async () => {
    const write = vi.fn().mockRejectedValue(new Error('throttled'))

    await expect(retryOnConditionFailure(write, 3, exhausted)).rejects.toThrow('throttled')
    expect(write).toHaveBeenCalledTimes(1)
  })
})
