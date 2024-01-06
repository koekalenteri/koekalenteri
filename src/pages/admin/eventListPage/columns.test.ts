import useEventListColumns from './columns'

jest.mock('../recoil/judges/actions', () => ({
  useJudgesActions: () => ({
    find: (id: number) => ({ id, name: `Judge ${id}` }),
  }),
}))

describe('useEventListColumns', () => {
  it('should match snapshot', () => {
    expect(useEventListColumns()).toMatchSnapshot()
  })
})
