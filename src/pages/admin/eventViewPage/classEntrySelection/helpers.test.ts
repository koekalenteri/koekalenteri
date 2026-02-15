import type { CustomCost, DogEvent, Registration, RegistrationGroup } from '../../../../types'
import type { RegistrationWithGroups } from './types'
import { parseISO } from 'date-fns'
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
      { date: parseISO('2023-01-01T12:00:00Z'), key: 'group1', number: 1, time: 'ap' },
      { date: parseISO('2023-01-02T12:00:00Z'), key: 'group2', number: 2, time: 'ip' },
    ]

    const mockRegistration = {
      createdAt: new Date(),
      dates: [],
      dog: { regNo: 'dog1' },
      eventId: 'event1',
      handler: { name: 'Handler 1' },
      id: 'reg1',
      modifiedAt: new Date(),
      owner: { name: 'Owner 1' },
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
  })

  describe('buildRegistrationsByGroup', () => {
    const mockGroups: RegistrationGroup[] = [
      { date: parseISO('2023-01-01T12:00:00Z'), key: 'group1', number: 1, time: 'ap' },
      { date: parseISO('2023-01-02T12:00:00Z'), key: 'group2', number: 2, time: 'ip' },
    ]

    const mockRegistrations: Registration[] = [
      {
        createdAt: new Date(),
        dates: [
          { date: parseISO('2023-01-01T12:00:00Z'), time: 'ap' },
          { date: parseISO('2023-01-02T12:00:00Z'), time: 'ip' },
        ],
        dog: { regNo: 'dog1' },
        eventId: 'event1',
        group: { key: 'group1', number: 1 },
        handler: { name: 'Handler 1' },
        id: 'reg1',
        modifiedAt: new Date(),
        owner: { name: 'Owner 1' },
      } as Partial<Registration> as Registration,
      {
        dates: [{ date: parseISO('2023-01-01T12:00:00Z'), time: 'ap' }],
        dog: { regNo: 'dog2' },
        eventId: 'event1',
        group: { key: 'group2', number: 2 },
        handler: { name: 'Handler 2' },
        id: 'reg2',
        modifiedAt: new Date(),
        owner: { name: 'Owner 2' },
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
          group: { key: 'group1', number: 3 },
          id: 'reg3',
        } as Registration,
        {
          ...mockRegistrations[0],
          group: { key: 'group1', number: 1 },
          id: 'reg1',
        } as Registration,
        {
          ...mockRegistrations[0],
          group: { key: 'group1', number: 2 },
          id: 'reg2',
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
          group: undefined,
          id: 'reg1',
        } as Registration,
        {
          ...mockRegistrations[0],
          group: { key: 'group1', number: 1 },
          id: 'reg2',
        } as Registration,
      ]

      const result = buildRegistrationsByGroup(registrationsWithoutNumbers, mockGroups)

      expect(result.group1[0].id).toBe('reg2')
      expect(result.reserve[0].id).toBe('reg1')
    })

    it('should populate dropGroups when group has no date', () => {
      const groupsWithNoDate: RegistrationGroup[] = [
        { date: parseISO('2023-01-01T12:00:00Z'), key: 'group1', number: 1, time: 'ap' },
        { date: undefined, key: 'group2', number: 2, time: 'ip' },
      ]

      const registrationsWithDates: Registration[] = [
        {
          ...mockRegistrations[0],
          dates: [{ date: parseISO('2023-01-03T12:00:00Z'), time: 'ap' }], // Date doesn't match any group
          group: { key: 'group1', number: 1 },
          id: 'reg1',
        } as Registration,
      ]

      const result = buildRegistrationsByGroup(registrationsWithDates, groupsWithNoDate)

      expect(result.group1[0].dropGroups).toContain('group2')
      expect(result.group1[0].dropGroups).toHaveLength(1)
    })

    it('should populate dropGroups when registration date matches group date', () => {
      const groupsWithDates: RegistrationGroup[] = [
        { date: parseISO('2023-01-01T12:00:00Z'), key: 'group1', number: 1, time: 'ap' },
        { date: parseISO('2023-01-02T12:00:00Z'), key: 'group2', number: 2, time: 'ip' },
      ]

      const registrationsWithMatchingDates: Registration[] = [
        {
          ...mockRegistrations[0],
          dates: [{ date: parseISO('2023-01-02T12:00:00Z'), time: 'ap' }], // Date matches group2
          group: { key: 'group1', number: 1 },
          id: 'reg1',
        } as Registration,
      ]

      const result = buildRegistrationsByGroup(registrationsWithMatchingDates, groupsWithDates)

      expect(result.group1[0].dropGroups).toContain('group2')
      expect(result.group1[0].dropGroups).toHaveLength(1)
    })
  })

  describe('buildSelectedAdditionalCostsByGroup', () => {
    const mockGroups: RegistrationGroup[] = [
      { date: parseISO('2023-01-01T12:00:00Z'), key: 'group1', number: 1, time: 'ap' },
      { date: parseISO('2023-01-02T12:00:00Z'), key: 'group2', number: 2, time: 'ip' },
    ]

    const mockCosts: CustomCost[] = [
      { cost: 10, description: { en: 'Extra cost 1', fi: 'Extra cost 1' } },
      { cost: 20, description: { en: 'Extra cost 2', fi: 'Extra cost 2' } },
    ]

    const mockEvent = {
      cost: {
        normal: 50,
        optionalAdditionalCosts: mockCosts,
      },
      createdAt: new Date(),
      id: 'event1',
      modifiedAt: new Date(),
    } as Partial<DogEvent> as DogEvent

    const mockRegistrationsByGroup: Record<string, RegistrationWithGroups[]> = {
      group1: [
        {
          dropGroups: [],
          groups: [],
          id: 'reg1',
          optionalCosts: [0, 1], // Both costs selected
        } as Partial<RegistrationWithGroups> as RegistrationWithGroups,
        {
          dropGroups: [],
          groups: [],
          id: 'reg2',
          optionalCosts: [0], // Only first cost selected
        } as Partial<RegistrationWithGroups> as RegistrationWithGroups,
      ],
      group2: [
        {
          dropGroups: [],
          groups: [],
          id: 'reg3',
          optionalCosts: [1], // Only second cost selected
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
            dropGroups: [],
            groups: [],
            id: 'reg1',
            optionalCosts: undefined,
          } as Partial<RegistrationWithGroups> as RegistrationWithGroups,
        ],
      }

      const result = buildSelectedAdditionalCostsByGroup(mockEvent, mockGroups, registrationsByGroupWithoutCosts)

      expect(result.group1).toEqual([])
    })
  })

  describe('buildSelectedAdditionalCostsTotal', () => {
    const mockGroups: RegistrationGroup[] = [
      { date: parseISO('2023-01-01T12:00:00Z'), key: 'group1', number: 1, time: 'ap' },
      { date: parseISO('2023-01-02T12:00:00Z'), key: 'group2', number: 2, time: 'ip' },
    ]

    const mockCosts: CustomCost[] = [
      { cost: 10, description: { en: 'Extra cost 1', fi: 'Lisämaksu 1' } },
      { cost: 20, description: { en: 'Extra cost 2', fi: 'Lisämaksu 2' } },
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
