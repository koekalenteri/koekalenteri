/**
 * Which guide page a view belongs to, from its route. The header's help icon opens that page, so
 * a reader gets the guide for what is on the screen rather than the index (KOE-1402).
 *
 * The route says most of it: an admin view gets the secretary's guides, a public one the entrant's.
 * A view whose guide depends on its data — the event page, whose guide is one page while entry is
 * open and another after — sets its own page through `helpPathAtom` instead.
 */
const CONTEXT: readonly (readonly [RegExp, string])[] = [
  [/^\/admin\/event\/(view)\//, 'koesihteerille/ilmoaikana'],
  [/^\/admin\/event\/(startnumbers|startlist|startlist-preview)\//, 'koesihteerille/ilmoajan-jalkeen'],
  [/^\/admin\/event(\/(edit|create)|$)/, 'koesihteerille/ennen-ilmoaikaa'],
  [/^\/admin\/organizations/, 'yhdistykselle/maksuliikenne'],
  [/^\/start-numbers\//, 'koesihteerille/ilmoajan-jalkeen'],
  [/^\/(event|r|p)\//, 'ilmoittautujalle/ilmoittautuminen'],
  [/^\/$/, 'ilmoittautujalle/ilmoittautuminen'],
]

/** The guide page for a route, or nothing when no guide describes it. */
export const docsPathForRoute = (pathname: string): string | undefined =>
  CONTEXT.find(([route]) => route.test(pathname))?.[1]
