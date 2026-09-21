import type { RouteObject } from 'react-router'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { Path } from './routeConfig'
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

  // The start list page is loaded on navigation, and its loader travels with it. A loader left
  // behind on the route object would be the one react-router keeps, and the lazy one silently
  // ignored -- the page would render with no data.
  it('loads the start list page and its loader together', async () => {
    const route = findRoute(Path.startList(':id'))

    expect(route?.loader).toBeUndefined()

    const loaded = typeof route?.lazy === 'function' ? await route.lazy() : undefined

    expect(loaded?.Component).toBeTypeOf('function')
    expect(loaded?.loader).toBeTypeOf('function')
  })

  // The guide and the release notes moved from Finnish to English paths in 1.12; a link handed out
  // before that still lands on its page, section anchor included.
  it.each([
    ['ohjeet', '/ohjeet', '/docs'],
    ['ohjeet/*', '/ohjeet/secretary/trial-day#tulosten-syotto', '/docs/secretary/trial-day#tulosten-syotto'],
    ['uutta', '/uutta#1.11.2', '/whats-new#1.11.2'],
  ])('redirects the old %s path', (pattern, from, to) => {
    const route = findRoute(pattern)
    const Location = () => {
      const location = useLocation()
      return <div data-testid="location">{`${location.pathname}${location.hash}`}</div>
    }
    render(
      <MemoryRouter initialEntries={[from]}>
        <Routes>
          <Route path={pattern} element={route?.element} />
          <Route path="*" element={<Location />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId('location')).toHaveTextContent(to)
  })
})
