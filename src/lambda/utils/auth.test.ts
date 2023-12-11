import type { JsonUser } from '../../types'

import { jest } from '@jest/globals'

jest.useFakeTimers()
jest.setSystemTime(new Date('2023-11-30T20:00:00Z'))
jest.unstable_mockModule('nanoid', () => ({ nanoid: () => 'test-id' }))

jest.unstable_mockModule('../lib/user', () => ({
  findUserByEmail: jest.fn(),
  updateUser: jest.fn(),
}))

const { findUserByEmail, updateUser } = await import('../lib/user')
const { getAndUpdateUserByEmail, getOrigin } = await import('./auth')

describe('getOrigin', () => {
  it.each`
    event                | expected
    ${null}              | ${''}
    ${undefined}         | ${''}
    ${{}}                | ${''}
    ${{ headers: null }} | ${''}
  `('when event is $event, it should return "$expected"', ({ event, expected }) => {
    expect(getOrigin(event)).toEqual(expected)
  })

  it.each`
    event                                        | expected
    ${{ headers: null }}                         | ${''}
    ${{ headers: { origin: 'test' } }}           | ${'test'}
    ${{ headers: { Origin: 'test' } }}           | ${'test'}
    ${{ headers: { origin: 'a', Origin: 'b' } }} | ${'a'}
  `('when headers are $event.headers, it should return "$expected"', ({ event, expected }) => {
    expect(getOrigin(event)).toEqual(expected)
  })
})

describe('getAndUpdateUserByEmail', () => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => null)

  it('should use lower case email', async () => {
    await getAndUpdateUserByEmail('AddReSS@DoMaIn.COM', {})

    const expectedUser: JsonUser = {
      id: 'test-id',
      name: '',
      email: 'address@domain.com',
      createdAt: '2023-11-30T20:00:00.000Z',
      createdBy: 'system',
      modifiedAt: '2023-11-30T20:00:00.000Z',
      modifiedBy: 'system',
    }

    expect(findUserByEmail).toHaveBeenCalledWith('address@domain.com')
    expect(logSpy).toHaveBeenCalledWith('creating user', expectedUser)
    expect(updateUser).toHaveBeenCalledWith(expectedUser)
  })

  it.each`
    oldName       | newName       | expected
    ${'Old Name'} | ${'New Name'} | ${'Old Name'}
    ${'Old Name'} | ${undefined}  | ${'Old Name'}
    ${undefined}  | ${'New Name'} | ${'New Name'}
    ${undefined}  | ${undefined}  | ${''}
    ${''}         | ${'New Name'} | ${'New Name'}
  `(
    'with oldName="$oldName", newName="$newName" should result to "$expected"',
    async ({ oldName, newName, expected }) => {
      ;(findUserByEmail as jest.MockedFunction<typeof findUserByEmail>).mockResolvedValueOnce({
        id: 'test-id',
        name: oldName,
        email: 'address@domain.com',
        createdAt: '2023-11-30T20:00:00.000Z',
        createdBy: 'system',
        modifiedAt: '2023-11-30T20:00:00.000Z',
        modifiedBy: 'system',
      })

      const user = await getAndUpdateUserByEmail('AddReSS@DoMaIn.COM', { name: newName })
      expect(user.name).toEqual(expected)
    }
  )
})
