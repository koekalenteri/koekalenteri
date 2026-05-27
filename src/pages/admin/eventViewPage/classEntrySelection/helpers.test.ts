import type { CustomCost, DogEvent, Registration, RegistrationGroup } from '../../../../types'
import type { RegistrationWithGroups } from './types'
import { parseISO } from 'date-fns'
import { eventRegistrationDateKey } from '../../../../lib/event'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '../../../../lib/registration'
import {
  buildMoveToGroupChange,
  buildMoveToPositionGroupChange,
  buildMoveToPositionOptions,
  buildRegistrationsByGroup,
  buildSelectedAdditionalCostsByGroup,
  buildSelectedAdditionalCostsTotal,
  findMoveToPositionTargetGroup,
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

    it('should fall back to derived key from group date+time when backend key does not match', () => {
      const date = parseISO('2023-01-01T12:00:00Z')
      const time = 'ap' as const
      const derivedKey = eventRegistrationDateKey({ date, time })

      const eventGroupsWithDerivedKeys: RegistrationGroup[] = [{ date, key: derivedKey, number: 1, time }]

      const result = listKey(
        {
          ...mockRegistration,
          group: { date, key: 'legacy-backend-key', number: 1, time },
        } as Registration,
        eventGroupsWithDerivedKeys
      )

      expect(result).toBe(derivedKey)
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

  describe('buildMoveToPositionOptions', () => {
    const mockGroups: RegistrationGroup[] = [
      { date: parseISO('2023-01-01T12:00:00Z'), key: 'group1', number: 1, time: 'ap' },
      { date: parseISO('2023-01-02T12:00:00Z'), key: 'group2', number: 2, time: 'ip' },
    ]

    it('should return position 1 when no registration is selected', () => {
      const result = buildMoveToPositionOptions(undefined, mockGroups, {})

      expect(result).toEqual([1])
    })

    it('should include one more than the last participant position for reserve moves', () => {
      const selectedRegistration = {
        dates: [{ date: parseISO('2023-01-01T12:00:00Z'), time: 'ap' }],
        group: { key: GROUP_KEY_RESERVE, number: 1 },
      } as Partial<Registration> as Registration
      const registrationsByGroup: Record<string, RegistrationWithGroups[]> = {
        group1: [
          { group: { key: 'group1', number: 1 } } as RegistrationWithGroups,
          { group: { key: 'group1', number: 2 } } as RegistrationWithGroups,
        ],
      }

      const result = buildMoveToPositionOptions(selectedRegistration, mockGroups, registrationsByGroup)

      expect(result).toEqual([1, 2, 3])
    })

    it('should include participant positions from all dates allowed by a reserve registration', () => {
      const selectedRegistration = {
        dates: [
          { date: parseISO('2023-01-01T12:00:00Z'), time: 'ap' },
          { date: parseISO('2023-01-02T12:00:00Z'), time: 'ip' },
        ],
        group: { key: GROUP_KEY_RESERVE, number: 1 },
      } as Partial<Registration> as Registration
      const registrationsByGroup: Record<string, RegistrationWithGroups[]> = {
        group1: [{ group: { key: 'group1', number: 1 } } as RegistrationWithGroups],
        group2: [{ group: { key: 'group2', number: 2 } } as RegistrationWithGroups],
      }

      const result = buildMoveToPositionOptions(selectedRegistration, mockGroups, registrationsByGroup)

      expect(result).toEqual([1, 2, 3])
    })

    it('should offer position 1 for reserve moves when there are no participants', () => {
      const selectedRegistration = {
        dates: [{ date: parseISO('2023-01-01T12:00:00Z'), time: 'ap' }],
        group: { key: GROUP_KEY_RESERVE, number: 1 },
      } as Partial<Registration> as Registration

      const result = buildMoveToPositionOptions(selectedRegistration, mockGroups, { group1: [] })

      expect(result).toEqual([1])
    })

    it('should return allowed participant positions except the current position', () => {
      const selectedRegistration = {
        dates: [{ date: parseISO('2023-01-01T12:00:00Z'), time: 'ap' }],
        group: { key: 'group1', number: 2 },
      } as Partial<Registration> as Registration
      const registrationsByGroup: Record<string, RegistrationWithGroups[]> = {
        group1: [
          { group: { key: 'group1', number: 1 } } as RegistrationWithGroups,
          { group: { key: 'group1', number: 2 } } as RegistrationWithGroups,
          { group: { key: 'group1', number: 3 } } as RegistrationWithGroups,
        ],
        group2: [{ group: { key: 'group2', number: 4 } } as RegistrationWithGroups],
      }

      const result = buildMoveToPositionOptions(selectedRegistration, mockGroups, registrationsByGroup)

      expect(result).toEqual([1, 3])
    })
  })

  describe('findMoveToPositionTargetGroup', () => {
    const mockGroups: RegistrationGroup[] = [
      { date: parseISO('2023-01-01T12:00:00Z'), key: 'group1', number: 1, time: 'ap' },
      { date: parseISO('2023-01-02T12:00:00Z'), key: 'group2', number: 2, time: 'ip' },
    ]
    const selectedRegistration = {
      dates: [
        { date: parseISO('2023-01-01T12:00:00Z'), time: 'ap' },
        { date: parseISO('2023-01-02T12:00:00Z'), time: 'ip' },
      ],
      group: { key: GROUP_KEY_RESERVE, number: 1 },
    } as Partial<Registration> as Registration
    const registrationsByGroup: Record<string, RegistrationWithGroups[]> = {
      group1: [{ group: { key: 'group1', number: 1 } } as RegistrationWithGroups],
      group2: [{ group: { key: 'group2', number: 2 } } as RegistrationWithGroups],
    }

    it('should use the selected position group when moving before an existing position', () => {
      const result = findMoveToPositionTargetGroup(selectedRegistration, 1.5, mockGroups, registrationsByGroup)

      expect(result?.key).toBe('group2')
    })

    it('should use the previous position group when moving after the last position', () => {
      const result = findMoveToPositionTargetGroup(selectedRegistration, 2.5, mockGroups, registrationsByGroup)

      expect(result?.key).toBe('group2')
    })

    it('should return undefined when the position does not match an allowed participant group', () => {
      const result = findMoveToPositionTargetGroup(selectedRegistration, 3.5, mockGroups, registrationsByGroup)

      expect(result).toBeUndefined()
    })

    it('should use the selected position group when moving a participant to a greater position', () => {
      const participantRegistration = {
        dates: selectedRegistration.dates,
        group: { key: 'group1', number: 1 },
      } as Partial<Registration> as Registration

      const result = findMoveToPositionTargetGroup(participantRegistration, 3.5, mockGroups, {
        ...registrationsByGroup,
        group2: [{ group: { key: 'group2', number: 3 } } as RegistrationWithGroups],
      })

      expect(result?.key).toBe('group2')
    })

    it('should use the selected position group when moving a participant to a smaller position', () => {
      const participantRegistration = {
        dates: selectedRegistration.dates,
        group: { key: 'group2', number: 3 },
      } as Partial<Registration> as Registration

      const result = findMoveToPositionTargetGroup(participantRegistration, 0.5, mockGroups, registrationsByGroup)

      expect(result?.key).toBe('group1')
    })
  })

  describe('buildMoveToPositionGroupChange', () => {
    const mockGroups: RegistrationGroup[] = [
      { date: parseISO('2023-01-01T12:00:00Z'), key: 'group1', number: 1, time: 'ap' },
      { date: parseISO('2023-01-02T12:00:00Z'), key: 'group2', number: 2, time: 'ip' },
    ]
    const registrationsByGroup: Record<string, RegistrationWithGroups[]> = {
      group1: [{ group: { key: 'group1', number: 1 } } as RegistrationWithGroups],
      group2: [{ group: { key: 'group2', number: 3 } } as RegistrationWithGroups],
    }
    const allowedDates = [
      { date: parseISO('2023-01-01T12:00:00Z'), time: 'ap' },
      { date: parseISO('2023-01-02T12:00:00Z'), time: 'ip' },
    ]

    it('should build a participant move change using the selected position target group', () => {
      const selectedRegistration = {
        dates: allowedDates,
        eventId: 'event1',
        group: { key: 'group1', number: 1 },
        id: 'reg1',
      } as Partial<Registration> as Registration

      const result = buildMoveToPositionGroupChange(
        selectedRegistration,
        3.5,
        'event1',
        mockGroups,
        registrationsByGroup
      )

      expect(result).toEqual({
        cancelled: false,
        eventId: 'event1',
        group: { date: mockGroups[1].date, key: 'group2', number: 3.5, time: 'ip' },
        id: 'reg1',
      })
    })

    it('should build a reserve move change using the target participant group', () => {
      const selectedRegistration = {
        dates: allowedDates,
        eventId: 'event1',
        group: { key: GROUP_KEY_RESERVE, number: 1 },
        id: 'reg1',
      } as Partial<Registration> as Registration

      const result = buildMoveToPositionGroupChange(
        selectedRegistration,
        2.5,
        'event1',
        mockGroups,
        registrationsByGroup
      )

      expect(result).toEqual({
        cancelled: false,
        eventId: 'event1',
        group: { date: mockGroups[1].date, key: 'group2', number: 2.5, time: 'ip' },
        id: 'reg1',
      })
    })

    it('should build a current group move change for non-participant groups', () => {
      const selectedRegistration = {
        dates: allowedDates,
        eventId: 'event1',
        group: { key: GROUP_KEY_CANCELLED, number: 1 },
        id: 'reg1',
      } as Partial<Registration> as Registration

      const result = buildMoveToPositionGroupChange(
        selectedRegistration,
        2.5,
        'event1',
        mockGroups,
        registrationsByGroup
      )

      expect(result).toEqual({
        cancelled: false,
        eventId: 'event1',
        group: { key: GROUP_KEY_CANCELLED, number: 2.5 },
        id: 'reg1',
      })
    })

    it('should return undefined when a participant target group cannot be found', () => {
      const selectedRegistration = {
        dates: allowedDates,
        eventId: 'event1',
        group: { key: 'group1', number: 1 },
        id: 'reg1',
      } as Partial<Registration> as Registration

      const result = buildMoveToPositionGroupChange(
        selectedRegistration,
        4.5,
        'event1',
        mockGroups,
        registrationsByGroup
      )

      expect(result).toBeUndefined()
    })
  })

  describe('buildMoveToGroupChange', () => {
    const mockGroups: RegistrationGroup[] = [
      { date: parseISO('2023-01-01T12:00:00Z'), key: 'group1', number: 1, time: 'ap' },
      { date: parseISO('2023-01-02T12:00:00Z'), key: 'group2', number: 2, time: 'ip' },
    ]

    it('should move to the end of a non-empty target group', () => {
      const selectedRegistration = {
        eventId: 'event1',
        group: { key: 'group1', number: 1 },
        id: 'reg1',
      } as Partial<Registration> as Registration
      const registrationsByGroup: Record<string, RegistrationWithGroups[]> = {
        group2: [{ group: { key: 'group2', number: 2 }, id: 'reg2' } as RegistrationWithGroups],
      }

      const result = buildMoveToGroupChange(selectedRegistration, 'group2', 'event1', mockGroups, registrationsByGroup)

      expect(result).toEqual({
        cancelled: false,
        eventId: 'event1',
        group: { date: mockGroups[1].date, key: 'group2', number: 2.5, time: 'ip' },
        id: 'reg1',
      })
    })

    it('should use position 1 when moving to an empty target group', () => {
      const selectedRegistration = {
        eventId: 'event1',
        group: { key: 'group1', number: 1 },
        id: 'reg1',
      } as Partial<Registration> as Registration

      const result = buildMoveToGroupChange(selectedRegistration, 'group2', 'event1', mockGroups, {})

      expect(result).toEqual({
        cancelled: false,
        eventId: 'event1',
        group: { date: mockGroups[1].date, key: 'group2', number: 1, time: 'ip' },
        id: 'reg1',
      })
    })

    it('should ignore the selected registration when finding the target group end', () => {
      const selectedRegistration = {
        eventId: 'event1',
        group: { key: 'group2', number: 2 },
        id: 'reg1',
      } as Partial<Registration> as Registration
      const registrationsByGroup: Record<string, RegistrationWithGroups[]> = {
        group2: [
          { group: { key: 'group2', number: 2 }, id: 'reg1' } as RegistrationWithGroups,
          { group: { key: 'group2', number: 3 }, id: 'reg2' } as RegistrationWithGroups,
        ],
      }

      const result = buildMoveToGroupChange(selectedRegistration, 'group2', 'event1', mockGroups, registrationsByGroup)

      expect(result).toEqual({
        cancelled: false,
        eventId: 'event1',
        group: { date: mockGroups[1].date, key: 'group2', number: 3.5, time: 'ip' },
        id: 'reg1',
      })
    })

    it('should return undefined when target group does not exist', () => {
      const selectedRegistration = {
        eventId: 'event1',
        group: { key: 'group1', number: 1 },
        id: 'reg1',
      } as Partial<Registration> as Registration

      const result = buildMoveToGroupChange(selectedRegistration, 'missing', 'event1', mockGroups, {})

      expect(result).toBeUndefined()
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
