import { expect, test } from '@playwright/test'
import { API_URL } from '../env.mjs'
import { helsinkiDay } from '../fixtures/dates'
import { seedEvent } from '../fixtures/db'
import { issue } from '../fixtures/issue'

test('the public start list answers with a version the page can read across origins', {
  annotation: issue('KOE-1516', 'the page orders its fetches against the live updates by it'),
  tag: '@public',
}, async ({ page }) => {
  const startDate = helsinkiDay(14)
  const event = await seedEvent({
    classes: [{ class: 'ALO', date: startDate, places: 20, state: 'invited' }],
    startDate,
    startListPublished: { ALO: true },
    state: 'invited',
  })

  const startListUrl = `${API_URL}/startlist/${event.id}`
  const startList = page.waitForResponse(
    (response) => new URL(response.url()).pathname === new URL(startListUrl).pathname
  )
  await page.goto(`/startlist/${event.id}`)
  expect((await startList).status()).toBe(200)

  // Playwright sees every response header; a page script sees only what Access-Control-Expose-Headers
  // lets through, since the API is another origin. So the header is read the way the page reads it.
  const version = await page.evaluate(
    async (url) => (await fetch(url)).headers.get('X-Start-List-Version'),
    startListUrl
  )
  expect(version).toMatch(/^\d+$/)
})
