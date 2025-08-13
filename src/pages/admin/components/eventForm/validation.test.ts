import { emptyEvent } from '../../../../__mockData__/emptyEvent'

import { requiredFields, validateEvent, validateEventField, VALIDATORS } from './validation'

describe('validation', () => {
  describe('VALIDATORS', () => {
    describe('classes', () => {
      it('returns false when not required', () => {
        const event = { ...emptyEvent, classes: [] } as any
        expect(VALIDATORS.classes?.(event, false)).toBe(false)
      })

      it('returns classes when required and empty', () => {
        const event = { ...emptyEvent, classes: [] } as any
        expect(VALIDATORS.classes?.(event, true)).toBe('classes')
      })

      it('returns false when required and has classes', () => {
        const event = { ...emptyEvent, classes: [{ class: 'ALO' }] } as any
        expect(VALIDATORS.classes?.(event, true)).toBe(false)
      })
    })

    describe('cost', () => {
      it('returns false when not required', () => {
        const event = { ...emptyEvent, cost: undefined } as any
        expect(VALIDATORS.cost?.(event, false)).toBe(false)
      })

      it('returns true when required and missing', () => {
        const event = { ...emptyEvent, cost: undefined } as any
        expect(VALIDATORS.cost?.(event, true)).toBe(true)
      })

      it('returns false when required and present', () => {
        const event = { ...emptyEvent, cost: 10 } as any
        expect(VALIDATORS.cost?.(event, true)).toBe(false)
      })
    })

    describe('headquarters', () => {
      it.each`
        headquarters              | required | expected
        ${{ zipCode: undefined }} | ${false} | ${false}
        ${{ zipCode: '' }}        | ${false} | ${false}
        ${{ zipCode: '' }}        | ${false} | ${false}
        ${{ zipCode: '33101' }}   | ${false} | ${false}
        ${{ zipCode: '33101' }}   | ${true}  | ${false}
        ${{ zipCode: '' }}        | ${true}  | ${false}
        ${{ zipCode: 'abba' }}    | ${false} | ${'zipCode'}
        ${{ zipCode: '1234' }}    | ${true}  | ${'zipCode'}
        ${{ zipCode: '123456' }}  | ${true}  | ${'zipCode'}
      `('when headquarters is %p, required is %p, it should return %p', ({ headquarters, required, expected }) => {
        expect(VALIDATORS.headquarters?.({ ...emptyEvent, headquarters }, required)).toEqual(expected)
      })
    })
  })

  describe('costMember', () => {
    it('should return false when costMember is less than or equal to cost', () => {
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost: 10, costMember: 10 }, true)).toBe(false)
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost: 10, costMember: 5 }, true)).toBe(false)
    })

    it('should return costMemberHigh when costMember is greater than cost', () => {
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost: 10, costMember: 11 }, true)).toBe('costMemberHigh')
    })

    it('should handle complex cost objects', () => {
      const cost = { normal: 10, earlyBird: { cost: 8, days: 5 } }
      const costMember = { normal: 10, earlyBird: { cost: 8, days: 5 } }
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember }, true)).toBe(false)
    })

    it('should return costMemberHigh for complex cost objects', () => {
      const cost = { normal: 10, earlyBird: { cost: 8, days: 5 } }
      const costMember = { normal: 10, earlyBird: { cost: 9, days: 5 } }
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember }, true)).toEqual({
        key: 'costMemberHigh',
        opts: { field: 'costMember', list: ['earlyBird'] },
      })
    })

    it('should handle breed costs', () => {
      const cost = { normal: 10, breed: { '110': 8 } }
      const costMember = { normal: 10, breed: { '110': 8 } }
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember }, true)).toBe(false)
    })

    it('should return costMemberHigh for breed costs', () => {
      const cost = { normal: 10, breed: { '110': 8 } }
      const costMember = { normal: 10, breed: { '110': 9 } }
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember }, true)).toEqual({
        key: 'costMemberHigh',
        opts: { field: 'costMember', list: ['breed[110]'] },
      })
    })

    it('should handle optional additional costs', () => {
      const cost = {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 5, description: { fi: 'Test' } }],
      }
      const costMember = {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 5, description: { fi: 'Test' } }],
      }
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember }, true)).toBe(false)
    })

    it('should return costMemberHigh for optional additional costs', () => {
      const cost = {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 5, description: { fi: 'Test' } }],
      }
      const costMember = {
        normal: 10,
        optionalAdditionalCosts: [{ cost: 6, description: { fi: 'Test' } }],
      }
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember }, true)).toEqual({
        key: 'costMemberHigh',
        opts: { field: 'costMember', list: ['optionalAdditionalCosts[0]'] },
      })
    })

    it('returns false when cost is object and costMember is number', () => {
      const cost = { normal: 10 }
      const costMember = 5
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember } as any, true)).toBe(false)
    })

    it('returns false when costMember is missing', () => {
      const cost = 10
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember: undefined } as any, true)).toBe(false)
    })

    it('returns false when cost is missing', () => {
      const costMember = 10
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost: undefined, costMember } as any, true)).toBe(false)
    })

    it('handles missing optionalAdditionalCosts in cost object', () => {
      const cost = { normal: 10 } // No optionalAdditionalCosts
      const costMember = { normal: 10, optionalAdditionalCosts: [{ cost: 5, description: { fi: 'Test' } }] }
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember }, true)).toBe(false)
    })

    it('handles missing optionalAdditionalCosts in costMember object', () => {
      const cost = { normal: 10, optionalAdditionalCosts: [{ cost: 5, description: { fi: 'Test' } }] }
      const costMember = { normal: 10 } // No optionalAdditionalCosts
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember }, true)).toBe(false)
    })

    it('handles missing breed in cost object', () => {
      const cost = { normal: 10 } // No breed
      const costMember = { normal: 10, breed: { '110': 8 } }
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember }, true)).toBe(false)
    })

    it('handles missing breed in costMember object', () => {
      const cost = { normal: 10, breed: { '110': 8 } }
      const costMember = { normal: 10 } // No breed
      expect(VALIDATORS.costMember?.({ ...emptyEvent, cost, costMember }, true)).toBe(false)
    })
  })

  describe('requiredFields()', () => {
    it('merges requirements from draft and tentative into confirmed and resolves function flags', () => {
      const event = { ...emptyEvent, state: 'confirmed' as const, eventType: 'NOME-B' as any }
      const req = requiredFields(event)

      // From draft
      expect(req.required.startDate).toBe(true)
      expect(req.required.endDate).toBe(true)
      expect(req.required.eventType).toBe(true)
      expect(req.required.organizer).toBe(true)
      expect(req.required.secretary).toBe(true)
      // The "state" that last set startDate is "draft" because inclusion order overwrites
      expect(req.state.startDate).toBe('draft')

      // From tentative
      expect(req.required.location).toBe(true)
      expect(req.state.location).toBe('tentative')

      // From confirmed: classes conditional must resolve to true for NOME-B
      expect(req.required.classes).toBe(true)
      expect(req.state.classes).toBe('confirmed')
    })

    it('is true for NOWT', () => {
      const req = requiredFields({ ...emptyEvent, state: 'confirmed' as const, eventType: 'NOWT' as any })
      expect(req.required.classes).toBe(true)
    })
    it('is false for non-matching types', () => {
      const req = requiredFields({ ...emptyEvent, state: 'confirmed' as const, eventType: 'SOME' as any })
      expect(req.required.classes).toBeFalsy()
    })
  })

  describe('validateEventField()', () => {
    it('returns validationError for unknown fields when required and empty', () => {
      const event = { ...emptyEvent, state: 'draft' as const, name: '' as any }
      const res = validateEventField(event as any, 'name' as any, true)
      expect(res).toEqual({
        key: 'validationError',
        opts: { field: 'name', state: 'draft' },
      })
    })

    it('returns a string key for validators that yield string (e.g., classes)', () => {
      const event = { ...emptyEvent, state: 'confirmed' as const, eventType: 'NOWT' as any, classes: [] as any }
      const res = validateEventField(event as any, 'classes', true)
      expect(res).toEqual({
        key: 'classes',
        opts: { field: 'classes', state: 'confirmed', type: 'NOWT' },
      })
    })

    it('returns an object for validators that yield structured errors (e.g., judgeCount)', () => {
      const event = {
        ...emptyEvent,
        state: 'confirmed' as const,
        eventType: 'NOME-A' as any,
        judges: [{ id: 1, name: 'Only One' }],
      }
      const res = validateEventField(event as any, 'judges', true)
      expect(res).toEqual({
        key: 'judgeCount',
        opts: { field: 'judges', length: 2, state: 'confirmed', type: 'NOME-A' },
      })
    })
  })

  describe('judges', () => {
    it('requires 2 judges for NOWT or NOME-A and 1 for others', () => {
      // NOWT: requires 2
      const nowt = {
        ...emptyEvent,
        state: 'confirmed' as const,
        eventType: 'NOWT' as any,
        judges: [{ id: 1, name: 'T1' }],
      }
      expect(VALIDATORS.judges?.(nowt as any, true)).toEqual({
        key: 'judgeCount',
        opts: { field: 'judges', length: 2 },
      })

      // Non-NOWT/A: requires 1 (ok when one judge present and classes have judges assigned)
      const other = {
        ...emptyEvent,
        state: 'confirmed' as const,
        eventType: 'SOME' as any,
        judges: [{ id: 1, name: 'T1' }],
        classes: [{ class: 'ALO', judge: { id: 1 } }], // Assign judge to class
      }
      expect(VALIDATORS.judges?.(other as any, true)).toBe(false)
    })

    it('requires class judge assignment for non-NOWT event types', () => {
      const event = {
        ...emptyEvent,
        state: 'confirmed' as const,
        eventType: 'NOME-B' as any,
        classes: [{ class: 'ALO' } as any, { class: 'VOI', judge: { id: 99 } } as any],
      }
      const res = VALIDATORS.judges?.(event as any, true)
      expect(res).toEqual({
        key: 'classesJudge',
        opts: { field: 'judges', list: ['ALO'], length: 1 },
      })
    })

    it('does not require class judge assignment for NOWT', () => {
      const event = {
        ...emptyEvent,
        state: 'confirmed' as const,
        eventType: 'NOWT' as any,
        classes: [{ class: 'ALO' } as any],
      }
      // Only min-count matters, not per-class assignment
      const res = VALIDATORS.judges?.(event as any, true)
      expect(res === false || (typeof res === 'object' && (res as any).key === 'judgeCount')).toBe(true)
    })

    it('returns false for NOWT with sufficient judges (covers line 150)', () => {
      const event = {
        ...emptyEvent,
        state: 'confirmed' as const,
        eventType: 'NOWT' as any,
        classes: [{ class: 'ALO' } as any, { class: 'VOI' } as any],
        judges: [
          { id: 1, name: 'Judge 1' },
          { id: 2, name: 'Judge 2' },
        ], // Sufficient judges for NOWT
      }
      // NOWT with enough judges should return false (line 150)
      const res = VALIDATORS.judges?.(event as any, true)
      expect(res).toBe(false)
    })

    it('returns false when required is false', () => {
      const ev = { ...emptyEvent, judges: [] } as any
      expect(VALIDATORS.judges?.(ev, false)).toBe(false)
    })

    it('handles array judges in class assignment validation', () => {
      const event = {
        ...emptyEvent,
        state: 'confirmed' as const,
        eventType: 'NOME-B' as any,
        classes: [
          { class: 'ALO', judge: [] }, // Empty array judge
          { class: 'VOI', judge: [{ id: 1 }] }, // Non-empty array judge
        ],
        judges: [{ id: 1, name: 'Judge 1' }],
      }
      const res = VALIDATORS.judges?.(event as any, true)
      expect(res).toEqual({
        key: 'classesJudge',
        opts: { field: 'judges', list: ['ALO'], length: 1 },
      })
    })
  })

  describe('places', () => {
    it('returns validationError when required and overall places missing (non NOME-B)', () => {
      const event = { ...emptyEvent, state: 'confirmed' as const, eventType: 'SOME' as any, places: undefined }
      const res = validateEventField(event as any, 'places', true)
      expect(res).toEqual({
        key: 'validationError',
        opts: { field: 'places', state: 'confirmed' },
      })
    })

    it('returns placesClass with list of classes missing places for NOME-B', () => {
      const event = {
        ...emptyEvent,
        state: 'confirmed' as const,
        eventType: 'NOME-B' as any,
        places: 10, // overall places exist (not undefined/falsy)
        classes: [{ class: 'ALO' } as any, { class: 'VOI', places: 5 } as any],
      }
      const res = VALIDATORS.places?.(event as any, true)
      expect(res).toEqual({
        key: 'placesClass',
        opts: { field: 'places', list: ['ALO'], length: 1 },
      })
    })

    it('returns true when required and overall places missing for non NOME-B', () => {
      const event = { ...emptyEvent, eventType: 'SOME' as any, places: undefined } as any
      expect(VALIDATORS.places?.(event, true)).toBe(true)
    })

    it('returns false when places exist and not NOME-B', () => {
      const event = { ...emptyEvent, eventType: 'SOME' as any, places: 10 } as any
      expect(VALIDATORS.places?.(event, true)).toBe(false)
    })

    it('returns false when not required', () => {
      const event = { ...emptyEvent, eventType: 'SOME' as any, places: undefined } as any
      expect(VALIDATORS.places?.(event, false)).toBe(false)
    })
  })

  describe('contactInfo', () => {
    it('returns contactInfo when neither official nor secretary is shown', () => {
      const event = {
        ...emptyEvent,
        state: 'confirmed' as const,
        contactInfo: { official: {}, secretary: {} } as any,
      }
      expect(VALIDATORS.contactInfo?.(event as any, true)).toBe('contactInfo')
    })

    it('requires secretary email when required even if official is shown', () => {
      const event = {
        ...emptyEvent,
        state: 'confirmed' as const,
        contactInfo: { official: { phone: '111' }, secretary: { name: 'X' } } as any,
      }
      expect(VALIDATORS.contactInfo?.(event as any, true)).toBe('secretaryEmail')
    })
  })

  describe('startDate/endDate', () => {
    it('fail for past dates when required', () => {
      // emptyEvent dates are in the past
      expect(VALIDATORS.startDate?.(emptyEvent as any, true)).toBe('startDate')
      expect(VALIDATORS.endDate?.(emptyEvent as any, true)).toBe('endDate')
    })

    it('return false for past dates when not required', () => {
      expect(VALIDATORS.startDate?.(emptyEvent as any, false)).toBe(false)
      expect(VALIDATORS.endDate?.(emptyEvent as any, false)).toBe(false)
    })
  })

  describe('validateEvent()', () => {
    it('collects errors across fields', () => {
      // emptyEvent is in the past, so start/end date validators should surface when required via inclusion
      const errors = validateEvent(emptyEvent as any)
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'startDate' }),
          expect.objectContaining({ key: 'endDate' }),
        ])
      )
    })

    it('returns detailed objects for structured validators', () => {
      const event = {
        ...emptyEvent,
        state: 'confirmed' as const,
        eventType: 'NOME-B' as any,
        classes: [{ class: 'ALO' } as any],
        judges: [],
        places: undefined,
        contactInfo: { official: { phone: '111' }, secretary: { name: 'X' } } as any,
        cost: undefined,
        entryStartDate: undefined,
        entryEndDate: undefined,
        headquarters: undefined,
      }
      const errors = validateEvent(event as any)

      // Expect a mix of structured and generic errors without asserting the full set
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'judgeCount' }),
          expect.objectContaining({ key: 'validationError', opts: expect.objectContaining({ field: 'cost' }) }),
          expect.objectContaining({
            key: 'validationError',
            opts: expect.objectContaining({ field: 'entryStartDate' }),
          }),
          expect.objectContaining({ key: 'validationError', opts: expect.objectContaining({ field: 'entryEndDate' }) }),
          expect.objectContaining({ key: 'validationError', opts: expect.objectContaining({ field: 'places' }) }),
          expect.objectContaining({ key: 'secretaryEmail' }),
          expect.objectContaining({ key: 'startDate' }),
          expect.objectContaining({ key: 'endDate' }),
        ])
      )
    })

    it('requires official for OFFICIAL_EVENT_TYPES', () => {
      const event = {
        ...emptyEvent,
        state: 'confirmed' as const,
        eventType: 'NOME-B' as any,
        official: undefined,
      } as any
      const errors = validateEvent(event)
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'validationError', opts: expect.objectContaining({ field: 'official' }) }),
        ])
      )
    })

    it('does not require official for non-official event types', () => {
      const event = { ...emptyEvent, state: 'confirmed' as const, eventType: 'SOME' as any, official: undefined } as any
      const errors = validateEvent(event)
      // Ensure no error object with field 'official'
      expect(errors.find((e: any) => e?.opts?.field === 'official')).toBeUndefined()
    })
  })
})
