/**
 * Which guide page a view belongs to, from its route. The help menu's first item opens that page,
 * so a reader gets the guide for what is on the screen rather than the index (KOE-1402).
 *
 * The route says most of it: an admin view gets the secretary's guides, a public one the entrant's.
 * A view whose guide depends on its data — the event page, whose guide is one page while entry is
 * open and another after — sets its own page through `helpPathAtom` instead.
 */
const CONTEXT: readonly (readonly [RegExp, string])[] = [
  [/^\/admin\/event\/(view)\//, 'secretary/while-entry-is-open'],
  [/^\/admin\/event\/(startnumbers|startlist|startlist-preview)\//, 'secretary/after-entry-closes'],
  [/^\/admin\/event\/(results|stations)\//, 'secretary/trial-day'],
  [/^\/admin\/event(\/(edit|create)|$)/, 'secretary/before-entry-opens'],
  [/^\/admin\/(judge|officials)$/, 'secretary/directories'],
  [/^\/admin\/organizations/, 'admin/payments'],
  [/^\/admin\/users$/, 'admin/users'],
  [/^\/admin\/(stats|event-breakdown)$/, 'admin/statistics'],
  [/^\/admin\/(types|templates)$/, 'admin/application'],
  [/^\/stats$/, 'admin/statistics'],
  [/^\/start-numbers\//, 'secretary/after-entry-closes'],
  [/^\/startlist\//, 'participant/start-list'],
  [/^\/r\//, 'participant/your-entry'],
  [/^\/(event|p)\//, 'participant/entering'],
  [/^\/$/, 'participant/entering'],
]

/** The guide page for a route, or nothing when no guide describes it. */
export const docsPathForRoute = (pathname: string): string | undefined =>
  CONTEXT.find(([route]) => route.test(pathname))?.[1]
