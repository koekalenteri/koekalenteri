import { accessOf, isGranted, READ_ACTIONS, unusedGrants } from './dynamoActions'

const grants = (entries: [string, string[]][]) => new Map(entries.map(([key, actions]) => [key, new Set(actions)]))

describe('accessOf', () => {
  it('refuses an action it does not classify', () => {
    expect(() => accessOf('PartiQLSelect')).toThrow(/dynamodb:PartiQLSelect is not classified/)
  })
})

describe('isGranted', () => {
  const granted = grants([
    ['UserTable', ['GetItem']],
    ['UserTable/index/gsiEmail', ['Query']],
    ['AuditTable/index/*', ['Query']],
    ['EventTable', ['*']],
  ])

  it.each([
    ['UserTable', 'GetItem', true],
    ['UserTable', 'Query', false],
    ['UserTable/index/gsiEmail', 'Query', true],
    ['UserTable/index/gsiName', 'Query', false],
    ['AuditTable/index/gsiName', 'Query', true],
    ['AuditTable', 'Query', false],
    ['EventTable', 'DeleteItem', true],
    ['OtherTable', 'GetItem', false],
  ])('%s %s is %s', (key, action, expected) => {
    expect(isGranted(granted, key, action)).toBe(expected)
  })
})

describe('unusedGrants', () => {
  it('reports a class the code never uses, folding an index onto its table', () => {
    const granted = grants([
      ['AuditTable', ['GetItem', 'PutItem']],
      ['AuditTable/index/*', ['GetItem', 'PutItem']],
    ])

    expect(unusedGrants(granted, grants([['AuditTable', ['PutItem']]]))).toEqual([
      { access: 'read', table: 'AuditTable' },
    ])
    expect(unusedGrants(granted, grants([['AuditTable/index/gsiEmail', ['Query']]]))).toEqual([
      { access: 'write', table: 'AuditTable' },
    ])
    expect(unusedGrants(granted, grants([]))).toEqual([
      { access: 'read', table: 'AuditTable' },
      { access: 'write', table: 'AuditTable' },
    ])
  })

  // No write template carries DeleteItem or ConditionCheckItem, so a table the code only deletes
  // from needs the crud template, read class and all.
  it.each(['DeleteItem', 'ConditionCheckItem'])(
    'accepts the crud read class on a table the code only uses for %s',
    (action) => {
      const crud = grants([['EventTable', [...READ_ACTIONS, 'DeleteItem', 'ConditionCheckItem', 'PutItem']]])

      expect(unusedGrants(crud, grants([['EventTable', [action]]]))).toEqual([])
      // A narrower read grant beside the delete is not the crud template, and could have been left out.
      const inline = grants([['EventTable', ['GetItem', action]]])
      expect(unusedGrants(inline, grants([['EventTable', [action]]]))).toEqual([
        { access: 'read', table: 'EventTable' },
      ])
      expect(unusedGrants(crud, grants([['EventTable', ['UpdateItem']]]))).toEqual([
        { access: 'read', table: 'EventTable' },
      ])
    }
  )
})
