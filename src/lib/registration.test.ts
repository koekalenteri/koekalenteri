import { PRIORITY_INVITED, PRIORITY_MEMBER, PRIORIZED_BREED_CODES } from './priority'
import { hasPriority } from './registration'

describe('lib/registration', () => {
  describe('hasPriority', () => {
    it('should return false when nobody is priorized', () => {
      expect(
        hasPriority(
          {},
          {
            owner: {
              membership: true,
            },
            handler: {
              membership: true,
            },
            priorityByInvitation: true,
          }
        )
      ).toEqual(false)
    })

    describe('membership priority', () => {
      const event = { priority: [PRIORITY_MEMBER] }

      it.each`
        owner    | handler  | result
        ${false} | ${false} | ${false}
        ${true}  | ${false} | ${0.5}
        ${false} | ${true}  | ${0.5}
        ${true}  | ${true}  | ${true}
      `(
        'should return $result when owner membersio is $owner and handler membership is $handler',
        ({ owner, handler, result }) => {
          expect(
            hasPriority(event, {
              owner: {
                membership: owner,
              },
              handler: {
                membership: handler,
              },
              dog: {},
              priorityByInvitation: true,
            })
          ).toEqual(result)
        }
      )
    })

    describe('priority by invitation', () => {
      const event = { priority: [PRIORITY_INVITED] }
      it('should return true when invited', () => {
        expect(hasPriority(event, { priorityByInvitation: true })).toEqual(true)
      })
      it('should return false when not invited', () => {
        expect(hasPriority(event, { priorityByInvitation: false })).toEqual(false)
        expect(hasPriority(event, {})).toEqual(false)
      })
    })

    describe('breed priority', () => {
      it.each(PRIORIZED_BREED_CODES)('should work for breedCode %p', (breedCode) => {
        expect(hasPriority({ priority: [breedCode] }, { dog: { breedCode } })).toEqual(true)
        expect(hasPriority({ priority: PRIORIZED_BREED_CODES }, { dog: { breedCode } })).toEqual(true)

        expect(hasPriority({ priority: [breedCode] }, { dog: { breedCode: '1' } })).toEqual(false)
        expect(hasPriority({ priority: [breedCode] }, {})).toEqual(false)
      })
    })
  })
})
