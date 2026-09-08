import { docsPathForRoute } from './docsContext'

describe('docsPathForRoute', () => {
  it.each([
    ['/', 'ilmoittautujalle/ilmoittautuminen'],
    ['/event/NOME-B/abc123', 'ilmoittautujalle/ilmoittautuminen'],
    ['/r/abc123/reg456/access/token/edit', 'ilmoittautujalle/ilmoittautuminen'],
    ['/p/abc123/reg456', 'ilmoittautujalle/ilmoittautuminen'],
    ['/admin/event', 'koesihteerille/ennen-ilmoaikaa'],
    ['/admin/event/create', 'koesihteerille/ennen-ilmoaikaa'],
    ['/admin/event/edit/abc123', 'koesihteerille/ennen-ilmoaikaa'],
    ['/admin/event/view/abc123', 'koesihteerille/ilmoaikana'],
    ['/admin/event/startnumbers/abc123', 'koesihteerille/ilmoajan-jalkeen'],
    ['/admin/event/startlist/abc123', 'koesihteerille/ilmoajan-jalkeen'],
    ['/admin/organizations', 'yhdistykselle/maksuliikenne'],
    ['/start-numbers/abc123/ALO/access/token', 'koesihteerille/ilmoajan-jalkeen'],
  ])('%s → %s', (route, path) => {
    expect(docsPathForRoute(route)).toBe(path)
  })

  // A view with no guide gets no icon rather than the index: the icon promises the right page.
  it.each(['/admin/event/results/abc123', '/admin/users', '/tilastot', '/ohjeet', '/uutta', '/support'])(
    '%s has no guide',
    (route) => {
      expect(docsPathForRoute(route)).toBeUndefined()
    }
  )
})
