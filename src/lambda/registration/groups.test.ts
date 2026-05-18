import type { JsonRegistration, JsonUser } from '../../types'
import { jest } from '@jest/globals'

const mockPatchGroup = jest.fn<any>()
const mockAudit = jest.fn<any>()
const mockGetRegistrationGroupKey = jest.fn<any>()
const mockGetRegistrationNumberingGroupKey = jest.fn<any>()

jest.unstable_mockModule('./repository', () => ({
  registrationRepository: { patchGroup: mockPatchGroup },
}))

jest.unstable_mockModule('../lib/audit', () => ({
  audit: mockAudit,
  registrationAuditKey: jest.fn(() => 'audit-key'),
}))

const libRegistration = await import('../../lib/registration')
jest.unstable_mockModule('../../lib/registration', () => ({
  ...libRegistration,
  getRegistrationGroupKey: mockGetRegistrationGroupKey,
  getRegistrationNumberingGroupKey: mockGetRegistrationNumberingGroupKey,
}))

const { fixRegistrationGroups, saveGroup } = await import('./groups')

describe('registration/groups', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('saveGroup updates cancellation and writes audit', async () => {
    const user = { name: 'secretary' } as JsonUser
    await saveGroup(
      { eventId: 'e1', group: { key: 'reserve', number: 2 }, id: 'r1' },
      { key: 'reserve', number: 1 },
      user,
      'siirto'
    )

    expect(mockPatchGroup).toHaveBeenCalledWith('e1', 'r1', { cancelled: false, group: { key: 'reserve', number: 2 } })
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Ryhmä:'), user: 'secretary' })
    )
  })

  it('fixRegistrationGroups re-numbers and saves when save=true', async () => {
    const user = { name: 'user' } as JsonUser
    const regs = [
      { class: 'ALO', eventId: 'e1', group: { key: 'A', number: 3 }, id: 'r1' },
      { class: 'ALO', eventId: 'e1', group: { key: 'A', number: 1 }, id: 'r2' },
    ] as JsonRegistration[]

    mockGetRegistrationNumberingGroupKey.mockReturnValue('ALO')
    mockGetRegistrationGroupKey.mockReturnValue('A')

    const result = await fixRegistrationGroups(regs, user, true)
    expect(result[0].group?.number).toBe(1)
    expect(result[1].group?.number).toBe(2)
    expect(mockAudit).toHaveBeenCalled()
  })

  it('fixRegistrationGroups re-numbers without save when save=false', async () => {
    const user = { name: 'user' } as JsonUser
    const regs = [
      { class: 'ALO', group: { key: 'A', number: 3 } },
      { class: 'ALO', group: { key: 'A', number: 1 } },
    ] as JsonRegistration[]

    mockGetRegistrationNumberingGroupKey.mockReturnValue('ALO')
    mockGetRegistrationGroupKey.mockReturnValue('A')

    const result = await fixRegistrationGroups(regs, user, false)
    expect(result[0].group?.number).toBe(1)
    expect(result[1].group?.number).toBe(2)
    expect(mockAudit).not.toHaveBeenCalled()
  })
})
