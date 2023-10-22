import routes from './routes'

describe('routes', () => {
  it('should match a snapshot', () => {
    expect(routes).toMatchSnapshot()
  })
})
