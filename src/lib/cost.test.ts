import type { BreedCode } from '../types'
import type { DogEventCost, DogEventCostSegment, MinimalRegistrationForCost } from '../types/Cost'

import { startOfDay } from 'date-fns'

import {
  additionalCost,
  calculateCost,
  costStrategies,
  DOG_EVENT_COST_KEYS,
  getApplicableStrategy,
  getCostSegmentName,
  getCostValue,
  getEarlyBirdEndDate,
  hasDifferentMemberPrice,
  selectCost,
  setCostValue,
} from './cost'

const makeEvent = (
  cost: number | DogEventCost,
  costMember: number | DogEventCost | undefined,
  entryStartDate = new Date()
) => ({ cost, costMember, entryStartDate })

const makeRegistration = (
  handler: boolean,
  owner: boolean,
  breed: BreedCode = '110',
  selectedCost?: DogEventCostSegment,
  createdAt = new Date(),
  optionalCosts?: number[]
): MinimalRegistrationForCost => ({
  selectedCost,
  optionalCosts,
  createdAt,
  dog: { breedCode: breed },
  handler: { membership: handler },
  owner: { membership: owner },
})

describe('selectCost', () => {
  it('should select `cost` when nobody is a member', () => {
    expect(selectCost(makeEvent(100, 80), makeRegistration(false, false))).toEqual(100)
  })
  it('should select `cotsMember` when handler is member', () => {
    expect(selectCost(makeEvent(100, 80), makeRegistration(true, false))).toEqual(80)
  })
  it('should select `cotsMember` when owner is member', () => {
    expect(selectCost(makeEvent(100, 80), makeRegistration(false, true))).toEqual(80)
  })
  it('should select `cotsMember` when both are members', () => {
    expect(selectCost(makeEvent(100, 80), makeRegistration(true, true))).toEqual(80)
  })

  describe('merging cost structures for members', () => {
    it('should merge member cost with base cost, preserving non-member-specific fields', () => {
      const baseCost: DogEventCost = {
        normal: 50,
        earlyBird: { cost: 40, days: 5 },
        breed: { '110': 45 },
      }
      const memberCost: DogEventCost = {
        normal: 40, // Member discount on normal price
        // No earlyBird or breed defined for members
      }
      const event = makeEvent(baseCost, memberCost)
      const result = selectCost(event, makeRegistration(true, false))

      expect(result).toEqual({
        normal: 40, // Member price
        earlyBird: { cost: 40, days: 5 }, // Inherited from base
        breed: { '110': 45 }, // Inherited from base
      })
    })

    it('should merge breed prices, allowing member-specific breed overrides', () => {
      const baseCost: DogEventCost = {
        normal: 50,
        breed: { '110': 45, '120': 48 },
      }
      const memberCost: DogEventCost = {
        normal: 40,
        breed: { '110': 35 }, // Override only breed 110 for members
      }
      const event = makeEvent(baseCost, memberCost)
      const result = selectCost(event, makeRegistration(true, false))

      expect(result).toEqual({
        normal: 40,
        breed: { '110': 35, '120': 48 }, // Member override for 110, base for 120
      })
    })

    it('should handle optional additional costs in member pricing', () => {
      const baseCost: DogEventCost = {
        normal: 50,
        optionalAdditionalCosts: [{ cost: 10, description: { fi: 'Option' } }],
      }
      const memberCost: DogEventCost = {
        normal: 40,
        optionalAdditionalCosts: [{ cost: 8, description: { fi: 'Option' } }],
      }
      const event = makeEvent(baseCost, memberCost)
      const result = selectCost(event, makeRegistration(true, false))

      expect(result).toEqual({
        normal: 40,
        optionalAdditionalCosts: [{ cost: 8, description: { fi: 'Option' } }],
      })
    })

    it('should inherit optional additional costs when not defined for members', () => {
      const baseCost: DogEventCost = {
        normal: 50,
        optionalAdditionalCosts: [{ cost: 10, description: { fi: 'Option' } }],
      }
      const memberCost: DogEventCost = {
        normal: 40,
      }
      const event = makeEvent(baseCost, memberCost)
      const result = selectCost(event, makeRegistration(true, false))

      expect(result).toEqual({
        normal: 40,
        optionalAdditionalCosts: [{ cost: 10, description: { fi: 'Option' } }],
      })
    })

    it('should handle custom costs in merging', () => {
      const baseCost: DogEventCost = {
        normal: 50,
        custom: { cost: 30, description: { fi: 'Base custom' } },
      }
      const memberCost: DogEventCost = {
        normal: 40,
        custom: { cost: 25, description: { fi: 'Member custom' } },
      }
      const event = makeEvent(baseCost, memberCost)
      const result = selectCost(event, makeRegistration(true, false))

      expect(result).toEqual({
        normal: 40,
        custom: { cost: 25, description: { fi: 'Member custom' } },
      })
    })

    it('should not merge when member is not a member', () => {
      const baseCost: DogEventCost = {
        normal: 50,
        earlyBird: { cost: 40, days: 5 },
      }
      const memberCost: DogEventCost = {
        normal: 40,
      }
      const event = makeEvent(baseCost, memberCost)
      const result = selectCost(event, makeRegistration(false, false))

      expect(result).toBe(baseCost)
    })

    it('should handle legacy number costs without merging', () => {
      const event = makeEvent(100, 80)
      const result = selectCost(event, makeRegistration(true, false))

      expect(result).toBe(80)
    })

    it('should handle member cost as number with base cost as object', () => {
      const baseCost: DogEventCost = {
        normal: 50,
        earlyBird: { cost: 40, days: 5 },
      }
      const event = makeEvent(baseCost, 40) // Member cost as legacy number
      const result = selectCost(event, makeRegistration(true, false))

      expect(result).toBe(40)
    })
  })
})

describe('additionalCost', () => {
  it('should return value when there is additional cost and its selected', () => {
    expect(
      additionalCost(makeRegistration(false, false, '110', undefined, new Date(), [0]), {
        optionalAdditionalCosts: [{ cost: 5, description: { fi: '' } }],
        normal: 10,
      })
    ).toEqual(5)
  })

  it('should return 0 when there is additional cost but its not selected', () => {
    expect(
      additionalCost(makeRegistration(false, false, '110', undefined), {
        optionalAdditionalCosts: [{ cost: 5, description: { fi: '' } }],
        normal: 10,
      })
    ).toEqual(0)
  })

  it('should return 0 when there is no additional cost', () => {
    expect(
      additionalCost(makeRegistration(false, false, '110', undefined), {
        normal: 10,
      })
    ).toEqual(0)
  })

  it('should sum multiple selected optional costs', () => {
    expect(
      additionalCost(makeRegistration(false, false, '110', undefined, new Date(), [0, 2]), {
        optionalAdditionalCosts: [
          { cost: 5, description: { fi: 'Option 1' } },
          { cost: 10, description: { fi: 'Option 2' } },
          { cost: 15, description: { fi: 'Option 3' } },
        ],
        normal: 10,
      })
    ).toEqual(20) // 5 + 15
  })

  it('should handle empty optionalCosts array', () => {
    expect(
      additionalCost(makeRegistration(false, false, '110', undefined, new Date(), []), {
        optionalAdditionalCosts: [
          { cost: 5, description: { fi: 'Option 1' } },
          { cost: 10, description: { fi: 'Option 2' } },
        ],
        normal: 10,
      })
    ).toEqual(0)
  })
})

describe('getEarlyBirdEndDate', () => {
  it('should return undefined when earlyBird is missing', () => {
    expect(
      getEarlyBirdEndDate({ entryStartDate: new Date('2026-01-01T00:00:00.000Z') } as any, { earlyBird: undefined })
    ).toBeUndefined()
  })

  it('should return undefined when entryStartDate is missing', () => {
    expect(getEarlyBirdEndDate({} as any, { earlyBird: { cost: 40, days: 5 } })).toBeUndefined()
  })

  it('should return undefined when earlyBird.days is 0', () => {
    expect(
      getEarlyBirdEndDate({ entryStartDate: new Date('2026-01-01T00:00:00.000Z') } as any, {
        earlyBird: { cost: 40, days: 0 },
      })
    ).toBeUndefined()
  })

  it('should return undefined when earlyBird.days is negative', () => {
    expect(
      getEarlyBirdEndDate({ entryStartDate: new Date('2026-01-01T00:00:00.000Z') } as any, {
        earlyBird: { cost: 40, days: -2 },
      })
    ).toBeUndefined()
  })

  it('should return the end date as entryStartDate + (days - 1)', () => {
    const entryStartDate = new Date('2026-01-01T00:00:00.000Z')
    const result = getEarlyBirdEndDate({ entryStartDate } as any, {
      earlyBird: { cost: 40, days: 5 },
    })
    expect(result?.toISOString()).toBe('2026-01-05T00:00:00.000Z')
  })

  it('should treat days=1 as ending on the same day as entryStartDate', () => {
    const entryStartDate = new Date('2026-01-01T00:00:00.000Z')
    const result = getEarlyBirdEndDate({ entryStartDate } as any, {
      earlyBird: { cost: 40, days: 1 },
    })
    expect(result?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('should work when entryStartDate is an ISO string', () => {
    const result = getEarlyBirdEndDate({ entryStartDate: '2026-01-01T00:00:00.000Z' } as any, {
      earlyBird: { cost: 40, days: 3 },
    })
    expect(result?.toISOString()).toBe('2026-01-03T00:00:00.000Z')
  })
})

describe('getCostValue', () => {
  it('should return 0 when segment does not exist', () => {
    expect(getCostValue({ normal: 10 }, 'custom')).toEqual(0)
    // @ts-expect-error invalid segment
    expect(getCostValue({ normal: 10 }, 'asdf')).toEqual(0)
  })

  it('should return value for the segment', () => {
    const cost: DogEventCost = {
      breed: { '110': 110 },
      custom: { cost: 50, description: { fi: '' } },
      normal: 70,
    }
    expect(getCostValue(cost, 'breed', '110')).toEqual(110)
    expect(getCostValue(cost, 'breed', '120')).toEqual(0)
    expect(getCostValue(cost, 'custom')).toEqual(50)
    expect(getCostValue(cost, 'normal')).toEqual(70)
  })

  it('should handle earlyBird cost', () => {
    const cost: DogEventCost = {
      earlyBird: { cost: 45, days: 5 },
      normal: 70,
    }
    expect(getCostValue(cost, 'earlyBird')).toEqual(45)
  })

  it('should return 0 for optionalAdditionalCosts', () => {
    const cost: DogEventCost = {
      optionalAdditionalCosts: [
        { cost: 10, description: { fi: 'Option 1' } },
        { cost: 20, description: { fi: 'Option 2' } },
      ],
      normal: 70,
    }
    expect(getCostValue(cost, 'optionalAdditionalCosts')).toEqual(0)
  })

  it('should handle legacy cost (number)', () => {
    expect(getCostValue(100, 'normal')).toEqual(100)
    expect(getCostValue(100, 'custom')).toEqual(100)
    expect(getCostValue(100, 'breed', '110')).toEqual(100)
  })
})

describe('calculateCost', () => {
  it('should work with legacy costs', () => {
    const event = { cost: 10, entryStartDate: new Date() }
    const registration = makeRegistration(false, false)
    expect(calculateCost(event, registration)).toEqual({
      amount: 10,
      segment: 'legacy',
    })
    expect(
      calculateCost({ cost: 10, costMember: 5, entryStartDate: new Date() }, makeRegistration(true, false))
    ).toEqual({
      amount: 5,
      segment: 'legacy',
    })
    expect(
      calculateCost({ cost: 10, costMember: 5, entryStartDate: new Date() }, makeRegistration(false, true))
    ).toEqual({
      amount: 5,
      segment: 'legacy',
    })
    expect(
      calculateCost({ cost: 10, costMember: 5, entryStartDate: new Date() }, makeRegistration(true, true))
    ).toEqual({
      amount: 5,
      segment: 'legacy',
    })
  })

  it('should work with new costs', () => {
    const cost = { normal: 10 }
    const event = { cost, entryStartDate: new Date() }
    const registration = makeRegistration(false, false)
    expect(calculateCost(event, registration)).toEqual({
      amount: 10,
      segment: 'normal',
      cost,
    })
    expect(
      calculateCost(
        { cost: { normal: 10 }, costMember: { normal: 8 }, entryStartDate: new Date() },
        makeRegistration(true, false)
      )
    ).toEqual({
      amount: 8,
      segment: 'normal',
      cost: { normal: 8 },
    })
  })

  it('should include optional additional costs when selected', () => {
    expect(
      calculateCost(
        {
          cost: {
            normal: 10,
            optionalAdditionalCosts: [
              { cost: 5, description: { fi: 'Option 1' } },
              { cost: 10, description: { fi: 'Option 2' } },
            ],
          },
          entryStartDate: new Date(),
        },
        makeRegistration(false, false, '110', undefined, new Date(), [0])
      )
    ).toEqual({
      amount: 15, // 10 + 5
      segment: 'normal',
      cost: {
        normal: 10,
        optionalAdditionalCosts: [
          { cost: 5, description: { fi: 'Option 1' } },
          { cost: 10, description: { fi: 'Option 2' } },
        ],
      },
    })
  })

  it('should use early bird cost when applicable', () => {
    const startDate = startOfDay(new Date())
    const earlyDate = startDate
    expect(
      calculateCost(
        {
          cost: {
            normal: 50,
            earlyBird: { cost: 40, days: 5 },
          },
          entryStartDate: startDate,
        },
        makeRegistration(false, false, '110', undefined, earlyDate)
      )
    ).toEqual({
      amount: 40,
      segment: 'earlyBird',
      cost: {
        normal: 50,
        earlyBird: { cost: 40, days: 5 },
      },
    })
  })

  it('should use breed-specific cost when applicable', () => {
    expect(
      calculateCost(
        {
          cost: {
            normal: 50,
            breed: { '110': 45 },
          },
          entryStartDate: new Date(),
        },
        makeRegistration(false, false, '110')
      )
    ).toEqual({
      amount: 45,
      segment: 'breed',
      cost: {
        normal: 50,
        breed: { '110': 45 },
      },
    })
  })

  it('should use custom cost when selected', () => {
    expect(
      calculateCost(
        {
          cost: {
            normal: 50,
            custom: { cost: 30, description: { fi: 'Custom' } },
          },
          entryStartDate: new Date(),
        },
        makeRegistration(false, false, '110', 'custom')
      )
    ).toEqual({
      amount: 30,
      segment: 'custom',
      cost: {
        normal: 50,
        custom: { cost: 30, description: { fi: 'Custom' } },
      },
    })
  })

  it('should handle complex cost scenario with multiple options', () => {
    const startDate = startOfDay(new Date())
    const earlyDate = startDate
    expect(
      calculateCost(
        {
          cost: {
            normal: 50,
            earlyBird: { cost: 40, days: 5 },
            breed: { '110': 45 },
            custom: { cost: 30, description: { fi: 'Custom' } },
            optionalAdditionalCosts: [
              { cost: 5, description: { fi: 'Option 1' } },
              { cost: 10, description: { fi: 'Option 2' } },
            ],
          },
          entryStartDate: startDate,
        },
        makeRegistration(false, false, '110', 'custom', earlyDate, [0, 1])
      )
    ).toEqual({
      amount: 45, // 30 (custom) + 5 + 10
      segment: 'custom',
      cost: {
        normal: 50,
        earlyBird: { cost: 40, days: 5 },
        breed: { '110': 45 },
        custom: { cost: 30, description: { fi: 'Custom' } },
        optionalAdditionalCosts: [
          { cost: 5, description: { fi: 'Option 1' } },
          { cost: 10, description: { fi: 'Option 2' } },
        ],
      },
    })
  })

  it('should use early bird cost when applicable with string dates', () => {
    const startDate = startOfDay(new Date())
    const earlyDate = startDate
    const event = {
      cost: {
        normal: 50,
        earlyBird: { cost: 40, days: 5 },
      },
      entryStartDate: startDate.toISOString(),
    }
    const registration = {
      ...makeRegistration(false, false, '110', undefined, earlyDate),
      createdAt: earlyDate.toISOString(),
    }

    expect(calculateCost(event as any, registration)).toEqual({
      amount: 40,
      segment: 'earlyBird',
      cost: {
        normal: 50,
        earlyBird: { cost: 40, days: 5 },
      },
    })
  })
})

describe('getCostSegmentName', () => {
  it('should return correct translation key for each segment', () => {
    expect(getCostSegmentName('normal')).toBe('costNames.normal')
    expect(getCostSegmentName('earlyBird')).toBe('costNames.earlyBird')
    expect(getCostSegmentName('breed')).toBe('costNames.breed')
    expect(getCostSegmentName('custom')).toBe('costNames.custom')
    expect(getCostSegmentName('legacy')).toBe('costNames.normal')
  })
})

describe('setCostValue', () => {
  it('should set normal cost', () => {
    const cost: DogEventCost = { normal: 10 }
    const newCost = setCostValue(cost, 'normal', 20)
    expect(newCost.normal).toBe(20)
  })

  it('should set custom cost with description', () => {
    const cost: DogEventCost = { normal: 10 }
    const newCost = setCostValue(cost, 'custom', 20, { description: { fi: 'Testi' } })
    expect(newCost.custom).toEqual({ cost: 20, description: { fi: 'Testi' } })
  })

  it('should set earlyBird cost with days', () => {
    const cost: DogEventCost = { normal: 10 }
    const newCost = setCostValue(cost, 'earlyBird', 20, { days: 7 })
    expect(newCost.earlyBird).toEqual({ cost: 20, days: 7 })
  })

  it('should set breed cost for a single breed', () => {
    const cost: DogEventCost = { normal: 10 }
    const newCost = setCostValue(cost, 'breed', 20, { breedCode: '110' })
    expect(newCost.breed).toEqual({ '110': 20 })
  })

  it('should set breed cost for multiple breeds', () => {
    const cost: DogEventCost = { normal: 10, breed: { '120': 15 } }
    const newCost = setCostValue(cost, 'breed', 20, { breedCode: ['110', '130'] })
    expect(newCost.breed).toEqual({ '110': 20, '120': 15, '130': 20 })
  })

  it('should not modify optionalAdditionalCosts', () => {
    const cost: DogEventCost = {
      normal: 10,
      optionalAdditionalCosts: [{ cost: 5, description: { fi: 'Test' } }],
    }
    const newCost = setCostValue(cost, 'optionalAdditionalCosts', 20)
    expect(newCost).toEqual(cost)
  })

  it('should return original cost for unknown key', () => {
    const cost: DogEventCost = { normal: 10 }
    // @ts-expect-error invalid key
    const newCost = setCostValue(cost, 'unknown', 20)
    expect(newCost).toEqual(cost)
  })
})

describe('DOG_EVENT_COST_KEYS', () => {
  it('should contain all cost keys', () => {
    expect(DOG_EVENT_COST_KEYS).toContain('normal')
    expect(DOG_EVENT_COST_KEYS).toContain('earlyBird')
    expect(DOG_EVENT_COST_KEYS).toContain('breed')
    expect(DOG_EVENT_COST_KEYS).toContain('custom')
    expect(DOG_EVENT_COST_KEYS).toContain('optionalAdditionalCosts')
    expect(DOG_EVENT_COST_KEYS.length).toBe(5)
  })
})

describe('getApplicableStrategy', () => {
  it('should return normalStrategy for legacy costs', () => {
    const event = makeEvent(100, undefined)
    const registration = makeRegistration(false, false)
    const strategy = getApplicableStrategy(event, registration)
    expect(strategy.key).toBe('normal')
  })

  it('should return selected strategy when applicable', () => {
    const event = makeEvent({ normal: 50, custom: { cost: 30, description: { fi: 'Custom' } } }, undefined)
    const registration = makeRegistration(false, false, '110', 'custom')
    const strategy = getApplicableStrategy(event, registration)
    expect(strategy.key).toBe('custom')
  })

  it('should fall back to cheapest when selected strategy is not applicable', () => {
    const event = makeEvent({ normal: 50, earlyBird: { cost: 40, days: 5 } }, undefined, startOfDay(new Date()))
    // Custom is selected but not available, so it should fall back to earlyBird (cheapest)
    const registration = makeRegistration(false, false, '110', 'custom', startOfDay(new Date()))
    const strategy = getApplicableStrategy(event, registration)
    expect(strategy.key).toBe('earlyBird')
  })

  it('should find the cheapest applicable strategy', () => {
    const startDate = startOfDay(new Date())
    const event = makeEvent(
      {
        normal: 50,
        earlyBird: { cost: 40, days: 5 },
        breed: { '110': 35 },
      },
      undefined,
      startDate
    )
    const registration = makeRegistration(false, false, '110', undefined, startDate)
    const strategy = getApplicableStrategy(event, registration)
    expect(strategy.key).toBe('breed')
  })

  it('should ignore custom strategy when not explicitly selected', () => {
    const event = makeEvent(
      {
        normal: 50,
        custom: { cost: 30, description: { fi: 'Custom' } },
      },
      undefined
    )
    const registration = makeRegistration(false, false)
    const strategy = getApplicableStrategy(event, registration)
    expect(strategy.key).toBe('normal')
  })
})

describe('setCostValue edge cases', () => {
  it('should preserve existing custom description when not provided', () => {
    const cost: DogEventCost = {
      normal: 10,
      custom: { cost: 15, description: { fi: 'Existing', en: 'Existing EN' } },
    }
    const newCost = setCostValue(cost, 'custom', 20)
    expect(newCost.custom).toEqual({
      cost: 20,
      description: { fi: 'Existing', en: 'Existing EN' },
    })
  })

  it('should preserve existing earlyBird days when not provided', () => {
    const cost: DogEventCost = {
      normal: 10,
      earlyBird: { cost: 8, days: 5 },
    }
    const newCost = setCostValue(cost, 'earlyBird', 7)
    expect(newCost.earlyBird).toEqual({ cost: 7, days: 5 })
  })

  it('should handle setting breed cost when breed object is undefined', () => {
    const cost: DogEventCost = { normal: 10 }
    const newCost = setCostValue(cost, 'breed', 20, { breedCode: '110' })
    expect(newCost.breed).toEqual({ '110': 20 })
  })
})

describe('invalid input handling', () => {
  it('should handle null or undefined registration in calculateCost', () => {
    // @ts-expect-error testing invalid input
    expect(calculateCost({ cost: 10, entryStartDate: new Date() }, null)).toEqual({ amount: 10, segment: 'legacy' })
    // @ts-expect-error testing invalid input
    expect(calculateCost({ cost: 10, entryStartDate: new Date() }, undefined)).toEqual({
      amount: 10,
      segment: 'legacy',
    })
  })
  it('should handle invalid breed code in breed-specific cost calculation', () => {
    const event = makeEvent({ normal: 50, breed: { '110': 40 } }, undefined)
    const registration = makeRegistration(false, false, '999') // Non-existent breed code
    const result = calculateCost(event, registration)
    expect(result.amount).toBe(50) // Should fall back to normal cost
    expect(result.segment).toBe('normal')
  })

  it('should handle missing dog breedCode in calculateCost', () => {
    const invalidRegistration = {
      ...makeRegistration(false, false),
      dog: { breedCode: undefined },
    }

    const result = calculateCost({ cost: 10, entryStartDate: new Date() }, invalidRegistration)
    expect(result.amount).toBe(10)
    expect(result.segment).toBe('legacy')
  })

  it('should handle missing createdAt in registration for earlyBird calculation', () => {
    const invalidRegistration = {
      ...makeRegistration(false, false),
      createdAt: undefined,
    }
    const event = makeEvent({ normal: 50, earlyBird: { cost: 40, days: 5 } }, undefined, new Date())
    // @ts-expect-error testing invalid input
    const result = calculateCost(event, invalidRegistration)
    expect(result.amount).toBe(50) // Should fall back to normal cost
    expect(result.segment).toBe('normal')
  })
})

describe('calculateCost with complex scenarios', () => {
  it('should handle mixed member and non-member costs', () => {
    const event = makeEvent({ normal: 50, breed: { '110': 45 } }, { normal: 40, breed: { '110': 35 } })
    // Non-member
    const regNonMember = makeRegistration(false, false, '110')
    const resultNonMember = calculateCost(event, regNonMember)
    expect(resultNonMember.amount).toBe(45)
    expect(resultNonMember.segment).toBe('breed')

    // Member
    const regMember = makeRegistration(true, false, '110')
    const resultMember = calculateCost(event, regMember)
    expect(resultMember.amount).toBe(35)
    expect(resultMember.segment).toBe('breed')
  })

  it('should handle different cost structures for member and non-member', () => {
    const event = makeEvent(
      { normal: 50, earlyBird: { cost: 40, days: 5 } },
      { normal: 40 } // No earlyBird for members
    )
    const registration = makeRegistration(true, false, '110', undefined, startOfDay(new Date()))
    const result = calculateCost(event, registration)
    expect(result.amount).toBe(40)
    expect(result.segment).toBe('normal')
  })

  it('should handle optional costs with member discounts', () => {
    const event = makeEvent(
      {
        normal: 50,
        optionalAdditionalCosts: [{ cost: 10, description: { fi: 'Option 1' } }],
      },
      {
        normal: 40,
        optionalAdditionalCosts: [{ cost: 8, description: { fi: 'Option 1' } }],
      }
    )
    // Non-member with optional cost
    const regNonMember = makeRegistration(false, false, '110', undefined, new Date(), [0])
    const resultNonMember = calculateCost(event, regNonMember)
    expect(resultNonMember.amount).toBe(60) // 50 + 10

    // Member with optional cost
    const regMember = makeRegistration(true, false, '110', undefined, new Date(), [0])
    const resultMember = calculateCost(event, regMember)
    expect(resultMember.amount).toBe(48) // 40 + 8
  })

  it('should correctly calculate cost for member with custom cost when member custom is 0', () => {
    const event = makeEvent(
      { normal: 50, custom: { cost: 30, description: { fi: 'Custom' } } },
      { normal: 40, custom: { cost: 0, description: { fi: 'Custom' } } }
    )
    const registration = makeRegistration(true, false, '110', 'custom')
    const result = calculateCost(event, registration)

    // Member should get base custom cost of 30 since member custom is 0
    expect(result.amount).toBe(30)
    expect(result.segment).toBe('custom')
    expect(result.cost).toEqual({
      normal: 40,
      custom: { cost: 30, description: { fi: 'Custom' } },
    })
  })
})

describe('setCostValue with additional edge cases', () => {
  it('should handle setting custom cost with partial description', () => {
    const cost: DogEventCost = { normal: 10 }
    const newCost = setCostValue(cost, 'custom', 20, { description: { fi: 'Finnish only' } })
    expect(newCost.custom).toEqual({
      cost: 20,
      description: { fi: 'Finnish only' },
    })
  })

  it('should handle setting custom cost with complete description', () => {
    const cost: DogEventCost = { normal: 10 }
    const newCost = setCostValue(cost, 'custom', 20, {
      description: { fi: 'Finnish', en: 'English' },
    })
    expect(newCost.custom).toEqual({
      cost: 20,
      description: { fi: 'Finnish', en: 'English' },
    })
  })

  it('should handle updating earlyBird with zero days', () => {
    const cost: DogEventCost = { normal: 10 }
    const newCost = setCostValue(cost, 'earlyBird', 8, { days: 0 })
    expect(newCost.earlyBird).toEqual({ cost: 8, days: 0 })
  })

  it('should handle updating earlyBird with negative days', () => {
    const cost: DogEventCost = { normal: 10 }
    const newCost = setCostValue(cost, 'earlyBird', 8, { days: -5 })
    expect(newCost.earlyBird).toEqual({ cost: 8, days: -5 })
  })
})

describe('additionalCost with complex scenarios', () => {
  it('should handle out-of-bounds indices in optionalCosts array', () => {
    const cost: DogEventCost = {
      normal: 10,
      optionalAdditionalCosts: [
        { cost: 5, description: { fi: 'Option 1' } },
        { cost: 10, description: { fi: 'Option 2' } },
      ],
    }
    // Selected index 5 which is out of bounds
    const result = additionalCost(makeRegistration(false, false, '110', undefined, new Date(), [0, 5]), cost)
    expect(result).toBe(5) // Should only count the valid index 0
  })

  it('should handle negative indices in optionalCosts array', () => {
    const cost: DogEventCost = {
      normal: 10,
      optionalAdditionalCosts: [
        { cost: 5, description: { fi: 'Option 1' } },
        { cost: 10, description: { fi: 'Option 2' } },
      ],
    }
    // Selected index -1 which is invalid
    const result = additionalCost(makeRegistration(false, false, '110', undefined, new Date(), [-1, 1]), cost)
    expect(result).toBe(10) // Should only count the valid index 1
  })

  it('should handle duplicate indices in optionalCosts array', () => {
    const cost: DogEventCost = {
      normal: 10,
      optionalAdditionalCosts: [
        { cost: 5, description: { fi: 'Option 1' } },
        { cost: 10, description: { fi: 'Option 2' } },
      ],
    }
    // Selected index 0 twice
    const result = additionalCost(makeRegistration(false, false, '110', undefined, new Date(), [0, 0]), cost)
    expect(result).toBe(5) // Should only count once
  })
})

describe('costStrategies integration', () => {
  it('should correctly apply all strategies in order', () => {
    const cost: DogEventCost = {
      normal: 50,
      earlyBird: { cost: 40, days: 5 },
      breed: { '110': 45 },
      custom: { cost: 30, description: { fi: 'Custom' } },
    }

    // Test each strategy individually
    const customStrategy = costStrategies.find((s) => s.key === 'custom')
    expect(customStrategy?.getValue(cost)).toBe(30)
    expect(customStrategy?.isApplicable(cost, {} as any, {} as any)).toBe(true)

    const earlyBirdStrategy = costStrategies.find((s) => s.key === 'earlyBird')
    expect(earlyBirdStrategy?.getValue(cost)).toBe(40)

    const breedStrategy = costStrategies.find((s) => s.key === 'breed')
    expect(breedStrategy?.getValue(cost, '110')).toBe(45)

    const normalStrategy = costStrategies.find((s) => s.key === 'normal')
    expect(normalStrategy?.getValue(cost)).toBe(50)
    expect(normalStrategy?.isApplicable(cost, {} as any, {} as any)).toBe(true)
  })
})

describe('hasDifferentMemberPrice', () => {
  it('should return false when no member cost exists', () => {
    const event = makeEvent({ normal: 50 }, undefined)
    expect(hasDifferentMemberPrice(event, 'normal')).toBe(false)
  })

  it('should return false for legacy number costs that are equal', () => {
    const event = makeEvent(50, 50)
    expect(hasDifferentMemberPrice(event, 'legacy')).toBe(false)
  })

  it('should return true for legacy number costs that differ', () => {
    const event = makeEvent(50, 40)
    expect(hasDifferentMemberPrice(event, 'legacy')).toBe(true)
  })

  it('should return true when using any segment with legacy costs', () => {
    const event = makeEvent(50, 40)
    expect(hasDifferentMemberPrice(event, 'custom')).toBe(true)
  })

  it('should return false when member cost is same as base cost', () => {
    const event = makeEvent({ normal: 50 }, { normal: 50 })
    expect(hasDifferentMemberPrice(event, 'normal')).toBe(false)
  })

  it('should return true when member cost differs from base cost', () => {
    const event = makeEvent({ normal: 50 }, { normal: 40 })
    expect(hasDifferentMemberPrice(event, 'normal')).toBe(true)
  })

  it('should return false when member cost is 0 (not specified)', () => {
    const event = makeEvent(
      { normal: 50, custom: { cost: 30, description: { fi: 'Custom' } } },
      { normal: 40, custom: { cost: 0, description: { fi: 'Custom' } } }
    )
    expect(hasDifferentMemberPrice(event, 'custom')).toBe(false)
  })

  it('should return true for different breed prices', () => {
    const event = makeEvent({ normal: 50, breed: { '110': 45 } }, { normal: 40, breed: { '110': 35 } })
    expect(hasDifferentMemberPrice(event, 'breed', '110')).toBe(true)
  })

  it('should return false when breed has same price for members', () => {
    const event = makeEvent({ normal: 50, breed: { '110': 45 } }, { normal: 40, breed: { '110': 45 } })
    expect(hasDifferentMemberPrice(event, 'breed', '110')).toBe(false)
  })

  it('should return true when segment does not exist in base cost', () => {
    const event = makeEvent({ normal: 50 }, { normal: 40, custom: { cost: 30, description: { fi: 'Custom' } } })
    expect(hasDifferentMemberPrice(event, 'custom')).toBe(true)
  })

  it('should return false when segment does not exist in member cost', () => {
    const event = makeEvent({ normal: 50, custom: { cost: 30, description: { fi: 'Custom' } } }, { normal: 40 })
    expect(hasDifferentMemberPrice(event, 'custom')).toBe(false)
  })

  it('should return true for different earlyBird prices', () => {
    const event = makeEvent(
      { normal: 50, earlyBird: { cost: 40, days: 5 } },
      { normal: 40, earlyBird: { cost: 35, days: 5 } }
    )
    expect(hasDifferentMemberPrice(event, 'earlyBird')).toBe(true)
  })

  it('should return false when member earlyBird is 0 (uses base)', () => {
    const event = makeEvent(
      { normal: 50, earlyBird: { cost: 40, days: 5 } },
      { normal: 40, earlyBird: { cost: 0, days: 5 } }
    )
    expect(hasDifferentMemberPrice(event, 'earlyBird')).toBe(false)
  })
})
