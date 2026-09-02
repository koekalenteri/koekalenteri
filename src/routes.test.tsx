import type { RouteObject } from 'react-router'
import routes from './routes'

const findRoute = (path: string, list: RouteObject[] = routes): RouteObject | undefined => {
  for (const route of list) {
    if (route.path === path) return route
    const nested = route.children && findRoute(path, route.children)
    if (nested) return nested
  }
  return undefined
}

describe('routes', () => {
  it('should match a snapshot', () => {
    expect(routes).toMatchSnapshot()
  })

  it('redirects a live entry link shared under the old station path', async () => {
    const route = findRoute('station/:eventId/:stationId/access/:token')
    const loader = typeof route?.loader === 'function' ? route.loader : undefined
    const url = new URL('http://localhost/station/event-1/post-1/access/a%2Fb')
    const response = await loader?.({
      context: {},
      params: { eventId: 'event-1', stationId: 'post-1', token: 'a/b' },
      pattern: 'station/:eventId/:stationId/access/:token',
      request: new Request(url),
      url,
    })

    expect(response).toBeInstanceOf(Response)
    if (!(response instanceof Response)) return
    expect(response.headers.get('Location')).toBe('/live-entry/event-1/post-1/access/a%2Fb')
  })
})
