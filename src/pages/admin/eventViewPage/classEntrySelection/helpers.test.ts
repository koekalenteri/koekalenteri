import type { CustomCost, DogEvent, Registration, RegistrationGroup } from '../../../../types'
import type { RegistrationWithGroups } from './types'

import { parseISO } from 'date-fns'

import { eventRegistrationDateKey } from '../../../../lib/event'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '../../../../lib/registration'

import {
  buildRegistrationsByGroup,
  buildSelectedAdditionalCostsByGroup,
  buildSelectedAdditionalCostsTotal,
  listKey,
} from './helpers'

describe('helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('listKey', () => {
    const mockEventGroups: RegistrationGroup[] = [
      { key: 'group1', number: 1, date: parseISO('2023-01-01T12:00:00Z'), time: 'ap' },
      { key: 'group2', number: 2, date: parseISO('2023-01-02T12:00:00Z'), time: 'ip' },
    ]

    const mockRegistration = {
      id: 'reg1',
      eventId: 'event1',
      dates: [],
      dog: { regNo: 'dog1' },
      handler: { name: 'Handler 1' },
      owner: { name: 'Owner 1' },
      createdAt: new Date(),
      modifiedAt: new Date(),
    } as unknown as Registration

    it('should return cancelled key when registration is cancelled', () => {
      const result = listKey({ ...mockRegistration, cancelled: true }, mockEventGroups)

      expect(result).toBe(GROUP_KEY_CANCELLED)
    })

    it('should return existing group key when registration has valid group', () => {
      const result = listKey({ ...mockRegistration, group: { key: 'group1', number: 5 } }, mockEventGroups)

      expect(result).toBe('group1')
    })

    it('should return reserve key when registration group is not found in event groups', () => {
      const result = listKey(mockRegistration, mockEventGroups)

      expect(result).toBe(GROUP_KEY_RESERVE)
    })

    it('should return reserve key when registration has no group', () => {
      const result = listKey(mockRegistration, mockEventGroups)

      expect(result).toBe(GROUP_KEY_RESERVE)
    })

    it('should fall back to derived key from group date+time when backend key does not match', () => {
      const date = parseISO('2023-01-01T12:00:00Z')
      const time = 'ap' as const
      const derivedKey = eventRegistrationDateKey({ date, time })

      const eventGroupsWithDerivedKeys: RegistrationGroup[] = [{ key: derivedKey, number: 1, date, time }]

      const result = listKey(
        {
          ...mockRegistration,
          group: { key: 'legacy-backend-key', number: 1, date, time },
        } as Registration,
        eventGroupsWithDerivedKeys
      )

      expect(result).toBe(derivedKey)
    })
  })

  describe('buildRegistrationsByGroup', () => {
    const mockGroups: RegistrationGroup[] = [
      { key: 'group1', number: 1, date: parseISO('2023-01-01T12:00:00Z'), time: 'ap' },
      { key: 'group2', number: 2, date: parseISO('2023-01-02T12:00:00Z'), time: 'ip' },
    ]

    const mockRegistrations: Registration[] = [
      {
        id: 'reg1',
        eventId: 'event1',
        dates: [
          { date: parseISO('2023-01-01T12:00:00Z'), time: 'ap' },
          { date: parseISO('2023-01-02T12:00:00Z'), time: 'ip' },
        ],
        dog: { regNo: 'dog1' },
        handler: { name: 'Handler 1' },
        owner: { name: 'Owner 1' },
        group: { number: 1, key: 'group1' },
        createdAt: new Date(),
        modifiedAt: new Date(),
      } as Partial<Registration> as Registration,
      {
        id: 'reg2',
        eventId: 'event1',
        dates: [{ date: parseISO('2023-01-01T12:00:00Z'), time: 'ap' }],
        dog: { regNo: 'dog2' },
        handler: { name: 'Handler 2' },
        owner: { name: 'Owner 2' },
        group: { number: 2, key: 'group2' },
        createdAt: new Date(),
        modifiedAt: new Date(),
      } as Partial<Registration> as Registration,
    ]

    it('should group registrations correctly', () => {
      const result = buildRegistrationsByGroup(
        [mockRegistrations[0], { ...mockRegistrations[1], cancelled: true }],
        mockGroups
      )

      expect(result).toHaveProperty('group1')
      expect(result).toHaveProperty('cancelled')
      expect(result).toHaveProperty('reserve')

      expect(result.group1).toHaveLength(1)
      expect(result.cancelled).toHaveLength(1)
      expect(result.reserve).toHaveLength(0)

      expect(result.group1[0].id).toBe('reg1')
      expect(result.cancelled[0].id).toBe('reg2')
    })

    it('should add groups and dropGroups properties to registrations', () => {
      const result = buildRegistrationsByGroup(mockRegistrations, mockGroups)

      const reg1 = result.group1[0]
      expect(reg1).toHaveProperty('groups')
      expect(reg1).toHaveProperty('dropGroups')
      expect(reg1.groups).toHaveLength(2)
      expect(reg1.dropGroups).toEqual(['group1', 'group2'])
    })

    it('should sort registrations by group number', () => {
      const registrationsWithNumbers: Registration[] = [
        {
          ...mockRegistrations[0],
          id: 'reg3',
          group: { number: 3, key: 'group1' },
        } as Registration,
        {
          ...mockRegistrations[0],
          id: 'reg1',
          group: { number: 1, key: 'group1' },
        } as Registration,
        {
          ...mockRegistrations[0],
          id: 'reg2',
          group: { number: 2, key: 'group1' },
        } as Registration,
      ]

      const result = buildRegistrationsByGroup(registrationsWithNumbers, mockGroups)

      expect(result.group1[0].group?.number).toBe(1)
      expect(result.group1[1].group?.number).toBe(2)
      expect(result.group1[2].group?.number).toBe(3)
    })

    it('should handle registrations without group numbers', () => {
      const registrationsWithoutNumbers: Registration[] = [
        {
          ...mockRegistrations[0],
          id: 'reg1',
          group: undefined,
        } as Registration,
        {
          ...mockRegistrations[0],
          id: 'reg2',
          group: { number: 1, key: 'group1' },
        } as Registration,
      ]

      const result = buildRegistrationsByGroup(registrationsWithoutNumbers, mockGroups)

      expect(result.group1[0].id).toBe('reg2')
      expect(result.reserve[0].id).toBe('reg1')
    })

    it('should populate dropGroups when group has no date', () => {
      const groupsWithNoDate: RegistrationGroup[] = [
        { key: 'group1', number: 1, date: parseISO('2023-01-01T12:00:00Z'), time: 'ap' },
        { key: 'group2', number: 2, date: undefined, time: 'ip' },
      ]

      const registrationsWithDates: Registration[] = [
        {
          ...mockRegistrations[0],
          id: 'reg1',
          dates: [{ date: parseISO('2023-01-03T12:00:00Z'), time: 'ap' }], // Date doesn't match any group
          group: { number: 1, key: 'group1' },
        } as Registration,
      ]

      const result = buildRegistrationsByGroup(registrationsWithDates, groupsWithNoDate)

      expect(result.group1[0].dropGroups).toContain('group2')
      expect(result.group1[0].dropGroups).toHaveLength(1)
    })

    it('should populate dropGroups when registration date matches group date', () => {
      const groupsWithDates: RegistrationGroup[] = [
        { key: 'group1', number: 1, date: parseISO('2023-01-01T12:00:00Z'), time: 'ap' },
        { key: 'group2', number: 2, date: parseISO('2023-01-02T12:00:00Z'), time: 'ip' },
      ]

      const registrationsWithMatchingDates: Registration[] = [
        {
          ...mockRegistrations[0],
          id: 'reg1',
          dates: [{ date: parseISO('2023-01-02T12:00:00Z'), time: 'ap' }], // Date matches group2
          group: { number: 1, key: 'group1' },
        } as Registration,
      ]

      const result = buildRegistrationsByGroup(registrationsWithMatchingDates, groupsWithDates)

      expect(result.group1[0].dropGroups).toContain('group2')
      expect(result.group1[0].dropGroups).toHaveLength(1)
    })
  })

  describe('buildSelectedAdditionalCostsByGroup', () => {
    const mockGroups: RegistrationGroup[] = [
      { key: 'group1', number: 1, date: parseISO('2023-01-01T12:00:00Z'), time: 'ap' },
      { key: 'group2', number: 2, date: parseISO('2023-01-02T12:00:00Z'), time: 'ip' },
    ]

    const mockCosts: CustomCost[] = [
      { description: { fi: 'Extra cost 1', en: 'Extra cost 1' }, cost: 10 },
      { description: { fi: 'Extra cost 2', en: 'Extra cost 2' }, cost: 20 },
    ]

    const mockEvent = {
      id: 'event1',
      cost: {
        normal: 50,
        optionalAdditionalCosts: mockCosts,
      },
      createdAt: new Date(),
      modifiedAt: new Date(),
    } as Partial<DogEvent> as DogEvent

    const mockRegistrationsByGroup: Record<string, RegistrationWithGroups[]> = {
      group1: [
        {
          id: 'reg1',
          optionalCosts: [0, 1], // Both costs selected
          groups: [],
          dropGroups: [],
        } as Partial<RegistrationWithGroups> as RegistrationWithGroups,
        {
          id: 'reg2',
          optionalCosts: [0], // Only first cost selected
          groups: [],
          dropGroups: [],
        } as Partial<RegistrationWithGroups> as RegistrationWithGroups,
      ],
      group2: [
        {
          id: 'reg3',
          optionalCosts: [1], // Only second cost selected
          groups: [],
          dropGroups: [],
        } as Partial<RegistrationWithGroups> as RegistrationWithGroups,
      ],
    }

    it('should return empty object when event cost is a number', () => {
      const eventWithNumberCost = {
        ...mockEvent,
        cost: 100,
      } as DogEvent

      const result = buildSelectedAdditionalCostsByGroup(eventWithNumberCost, mockGroups, mockRegistrationsByGroup)

      expect(result).toEqual({})
    })

    it('should return empty object when no optional costs exist', () => {
      const eventWithoutOptionalCosts = {
        ...mockEvent,
        cost: {
          normal: 50,
          optionalAdditionalCosts: undefined,
        },
      } as DogEvent

      const result = buildSelectedAdditionalCostsByGroup(
        eventWithoutOptionalCosts,
        mockGroups,
        mockRegistrationsByGroup
      )

      expect(result).toEqual({})
    })

    it('should count selected costs correctly by group', () => {
      const result = buildSelectedAdditionalCostsByGroup(mockEvent, mockGroups, mockRegistrationsByGroup)

      expect(result).toHaveProperty('group1')
      expect(result).toHaveProperty('group2')

      expect(result.group1).toHaveLength(2)
      expect(result.group1[0]).toEqual({ cost: mockCosts[0], count: 2 })
      expect(result.group1[1]).toEqual({ cost: mockCosts[1], count: 1 })

      expect(result.group2).toHaveLength(1)
      expect(result.group2[0]).toEqual({ cost: mockCosts[1], count: 1 })
    })

    it('should handle groups with no registrations', () => {
      const registrationsByGroupWithEmpty: Record<string, RegistrationWithGroups[]> = {
        group1: [],
        group2: mockRegistrationsByGroup.group2,
      }

      const result = buildSelectedAdditionalCostsByGroup(mockEvent, mockGroups, registrationsByGroupWithEmpty)

      expect(result.group1).toEqual([])
      expect(result.group2).toHaveLength(1)
    })

    it('should handle registrations without optional costs', () => {
      const registrationsByGroupWithoutCosts: Record<string, RegistrationWithGroups[]> = {
        group1: [
          {
            id: 'reg1',
            optionalCosts: undefined,
            groups: [],
            dropGroups: [],
          } as Partial<RegistrationWithGroups> as RegistrationWithGroups,
        ],
      }

      const result = buildSelectedAdditionalCostsByGroup(mockEvent, mockGroups, registrationsByGroupWithoutCosts)

      expect(result.group1).toEqual([])
    })
  })

  describe('buildSelectedAdditionalCostsTotal', () => {
    const mockGroups: RegistrationGroup[] = [
      { key: 'group1', number: 1, date: parseISO('2023-01-01T12:00:00Z'), time: 'ap' },
      { key: 'group2', number: 2, date: parseISO('2023-01-02T12:00:00Z'), time: 'ip' },
    ]

    const mockCosts: CustomCost[] = [
      { description: { fi: 'Lisämaksu 1', en: 'Extra cost 1' }, cost: 10 },
      { description: { fi: 'Lisämaksu 2', en: 'Extra cost 2' }, cost: 20 },
    ]

    it('should return empty string when no costs are selected', () => {
      const selectedByGroup: Record<string, Array<{ cost: CustomCost; count: number }>> = {
        group1: [],
        group2: [],
      }

      const result = buildSelectedAdditionalCostsTotal(mockGroups, selectedByGroup)

      expect(result).toBe('')
    })

    it('should return empty string when only one cost entry exists', () => {
      const selectedByGroup: Record<string, Array<{ cost: CustomCost; count: number }>> = {
        group1: [{ cost: mockCosts[0], count: 2 }],
        group2: [],
      }

      const result = buildSelectedAdditionalCostsTotal(mockGroups, selectedByGroup)

      expect(result).toBe('')
    })

    it('should return formatted string when multiple cost entries exist', () => {
      const selectedByGroup: Record<string, Array<{ cost: CustomCost; count: number }>> = {
        group1: [
          { cost: mockCosts[0], count: 2 },
          { cost: mockCosts[1], count: 1 },
        ],
        group2: [{ cost: mockCosts[0], count: 1 }],
      }

      const result = buildSelectedAdditionalCostsTotal(mockGroups, selectedByGroup)

      expect(result).toBe('Lisämaksu 1 x 3, Lisämaksu 2 x 1')
    })

    it('should aggregate same costs across groups', () => {
      const selectedByGroup: Record<string, Array<{ cost: CustomCost; count: number }>> = {
        group1: [{ cost: mockCosts[0], count: 2 }],
        group2: [{ cost: mockCosts[0], count: 3 }],
      }

      const result = buildSelectedAdditionalCostsTotal(mockGroups, selectedByGroup)

      expect(result).toBe('Lisämaksu 1 x 5')
    })

    it('should handle groups not present in selectedByGroup', () => {
      const selectedByGroup: Record<string, Array<{ cost: CustomCost; count: number }>> = {
        group1: [{ cost: mockCosts[0], count: 2 }],
        // group2 missing
      }

      const result = buildSelectedAdditionalCostsTotal(mockGroups, selectedByGroup)

      expect(result).toBe('')
    })

    it('should handle multiple different costs', () => {
      const selectedByGroup: Record<string, Array<{ cost: CustomCost; count: number }>> = {
        group1: [
          { cost: mockCosts[0], count: 1 },
          { cost: mockCosts[1], count: 2 },
        ],
        group2: [
          { cost: mockCosts[0], count: 2 },
          { cost: mockCosts[1], count: 1 },
        ],
      }

      const result = buildSelectedAdditionalCostsTotal(mockGroups, selectedByGroup)

      expect(result).toBe('Lisämaksu 1 x 3, Lisämaksu 2 x 3')
    })
  })
})
