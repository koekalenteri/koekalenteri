import type { JsonDbRecord, JsonUser } from '../../types'

import { filterRelevantUsers } from './user'

const defaults: Omit<JsonDbRecord, 'id'> = {
  createdAt: '2020-11-12T11:11:11.000Z',
  createdBy: 'system',
  modifiedAt: '2020-11-12T11:11:11.000Z',
  modifiedBy: 'system',
}

const admin: JsonUser = { ...defaults, id: 'a', name: 'admin', email: 'a@exmaple.com', admin: true }
const judge: JsonUser = { ...defaults, id: 'b', name: 'judge', email: 'b@exmaple.com', judge: ['NOME-B'] }
const officer: JsonUser = { ...defaults, id: 'c', name: 'officer', email: 'c@exmaple.com', officer: ['NOME-B'] }
const orgAdmin: JsonUser = {
  ...defaults,
  id: 'd',
  name: 'org admin',
  email: 'd@exmaple.com',
  roles: { testOrg: 'admin' },
}
const orgSecretary: JsonUser = {
  ...defaults,
  id: 'e',
  name: 'org secretary',
  email: 'e@exmaple.com',
  roles: { testOrg: 'secretary' },
}
const otherOrgAdmin: JsonUser = {
  ...defaults,
  id: 'f',
  name: 'other org admin',
  email: 'f@exmaple.com',
  roles: { otherOrg: 'admin' },
}
const otherOrgSecretary: JsonUser = {
  ...defaults,
  id: 'g',
  name: 'other org secretary',
  email: 'g@exmaple.com',
  roles: { otherOrg: 'secretary' },
}
const justUser: JsonUser = { ...defaults, id: 'h', name: 'common user', email: 'h@exmaple.com' }

const testUsers: JsonUser[] = [
  admin,
  judge,
  officer,
  orgAdmin,
  orgSecretary,
  otherOrgAdmin,
  otherOrgSecretary,
  justUser,
]

describe('lib/user', () => {
  describe('filterRelevantUsers', () => {
    it('it should not filter anything for admin', () => {
      expect(filterRelevantUsers(testUsers, admin, [])).toEqual(testUsers)
      expect(filterRelevantUsers(testUsers, admin, ['testOrg'])).toEqual(testUsers)
      expect(filterRelevantUsers(testUsers, admin, ['someOrg'])).toEqual(testUsers)
      expect(filterRelevantUsers(testUsers, admin, ['testOrg', 'otherOrg'])).toEqual(testUsers)
    })
    it('should filter for org admin', () => {
      expect(filterRelevantUsers(testUsers, orgAdmin, ['testOrg']).map((u) => u.name)).toEqual([
        'admin',
        'judge',
        'officer',
        'org admin',
        'org secretary',
      ])
      expect(filterRelevantUsers(testUsers, orgAdmin, ['testOrg', 'otherOrg']).map((u) => u.name)).toEqual([
        'admin',
        'judge',
        'officer',
        'org admin',
        'org secretary',
      ])
      expect(filterRelevantUsers(testUsers, orgAdmin, ['otherOrg']).map((u) => u.name)).toEqual([
        'admin',
        'judge',
        'officer',
      ])
      expect(filterRelevantUsers(testUsers, orgAdmin, ['someOrg']).map((u) => u.name)).toEqual([
        'admin',
        'judge',
        'officer',
      ])
    })
    it('should filter for org secretary', () => {
      expect(filterRelevantUsers(testUsers, orgSecretary, ['testOrg']).map((u) => u.name)).toEqual([
        'admin',
        'judge',
        'officer',
        'org admin',
        'org secretary',
      ])
      expect(filterRelevantUsers(testUsers, orgSecretary, ['otherOrg']).map((u) => u.name)).toEqual([
        'admin',
        'judge',
        'officer',
      ])
      expect(filterRelevantUsers(testUsers, orgSecretary, ['someOrg']).map((u) => u.name)).toEqual([
        'admin',
        'judge',
        'officer',
      ])
    })
    it('should filter for common user', () => {
      expect(filterRelevantUsers(testUsers, justUser, []).map((u) => u.name)).toEqual(['admin', 'judge', 'officer'])
      expect(filterRelevantUsers(testUsers, justUser, ['testOrg']).map((u) => u.name)).toEqual([
        'admin',
        'judge',
        'officer',
      ])
    })
  })
})
