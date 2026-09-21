import { docsPathForRoute } from './docsContext'

describe('docsPathForRoute', () => {
  it.each([
    ['/', 'participant/entering'],
    ['/event/NOME-B/abc123', 'participant/entering'],
    ['/p/abc123/reg456', 'participant/entering'],
    ['/r/abc123/reg456', 'participant/your-entry'],
    ['/r/abc123/reg456/access/token/edit', 'participant/your-entry'],
    ['/r/abc123/reg456/access/token/invitation', 'participant/your-entry'],
    ['/startlist/abc123', 'participant/start-list'],
    ['/admin/event', 'secretary/before-entry-opens'],
    ['/admin/event/create', 'secretary/before-entry-opens'],
    ['/admin/event/edit/abc123', 'secretary/before-entry-opens'],
    ['/admin/event/view/abc123', 'secretary/while-entry-is-open'],
    ['/admin/event/startnumbers/abc123', 'secretary/after-entry-closes'],
    ['/admin/event/startlist/abc123', 'secretary/after-entry-closes'],
    ['/admin/event/results/abc123', 'secretary/trial-day'],
    ['/admin/event/results/abc123/station/st1', 'secretary/trial-day'],
    ['/admin/event/stations/abc123', 'secretary/trial-day'],
    ['/admin/judge', 'secretary/directories'],
    ['/admin/officials', 'secretary/directories'],
    ['/admin/organizations', 'admin/payments'],
    ['/admin/users', 'admin/users'],
    ['/admin/stats', 'admin/statistics'],
    ['/admin/event-breakdown', 'admin/statistics'],
    ['/tilastot', 'admin/statistics'],
    ['/admin/types', 'admin/application'],
    ['/admin/templates', 'admin/application'],
    ['/start-numbers/abc123/ALO/access/token', 'secretary/after-entry-closes'],
  ])('%s → %s', (route, path) => {
    expect(docsPathForRoute(route)).toBe(path)
  })

  // A view with no guide gets no icon rather than the index: the icon promises the right page.
  it.each(['/live-entry/abc123/st1/access/token', '/ohjeet', '/uutta', '/support', '/login'])(
    '%s has no guide',
    (route) => {
      expect(docsPathForRoute(route)).toBeUndefined()
    }
  )
})
