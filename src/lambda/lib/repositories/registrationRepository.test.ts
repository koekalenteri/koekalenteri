import { vi } from 'vitest'

const mockRead = vi.fn()
const mockReadAll = vi.fn()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { registrationTable: 'registration-table' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    constructor(table: string) {
      mockConstructor(table)
    }
    read = (...args: unknown[]) => mockRead(...args)
    readAll = (...args: unknown[]) => mockReadAll(...args)
  },
}))

const { readRegistrationConsistently, readRegistrationsForStats } = await import('./registrationRepository')

describe('registrationRepository', () => {
  beforeEach(() => {
    mockRead.mockReset()
    mockReadAll.mockReset()
  })

  it('opens its client on the registration table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('registration-table')
  })

  describe('readRegistrationsForStats', () => {
    it('reads every registration with only the fields the stats count from', async () => {
      const rows = [{ eventId: 'e1', id: 'r1' }]
      mockReadAll.mockResolvedValueOnce(rows)

      await expect(readRegistrationsForStats()).resolves.toBe(rows)
      expect(mockReadAll).toHaveBeenCalledWith({
        names: { '#class': 'class', '#group': 'group', '#handler': 'handler', '#key': 'key', '#owner': 'owner' },
        projection:
          'eventId, id, cancelled, paidAmount, refundAmount, eventType, dog.regNo, dog.breedCode, #handler.email, #handler.membership, #owner.membership, owners, ownerHandles, #class, #group.#key',
        table: 'registration-table',
      })
    })

    it('reads an empty table as no registrations', async () => {
      mockReadAll.mockResolvedValueOnce(undefined)

      await expect(readRegistrationsForStats()).resolves.toEqual([])
    })
  })

  describe('readRegistrationConsistently', () => {
    it('reads the registration by event and id, strongly consistent', async () => {
      const registration = { eventId: 'e1', id: 'r1' }
      mockRead.mockResolvedValueOnce(registration)

      await expect(readRegistrationConsistently('e1', 'r1')).resolves.toBe(registration)
      expect(mockRead).toHaveBeenCalledWith({ eventId: 'e1', id: 'r1' }, 'registration-table', true)
    })

    it('reads a missing registration as undefined', async () => {
      mockRead.mockResolvedValueOnce(undefined)

      await expect(readRegistrationConsistently('e1', 'missing')).resolves.toBeUndefined()
    })
  })
})
