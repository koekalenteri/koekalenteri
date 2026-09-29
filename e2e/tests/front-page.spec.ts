import { expect, test } from '@playwright/test'
import { seedEvent } from '../fixtures/db'
import { issue } from '../fixtures/issue'

test('the front page lists an event the API returns from the database', {
  annotation: issue('KOE-1475'),
  tag: '@public',
}, async ({ page }) => {
  const event = await seedEvent()

  const events = page.waitForResponse((response) => /\/dev\/event\/?$/.test(new URL(response.url()).pathname))
  await page.goto('/')

  expect((await events).status()).toBe(200)
  await expect(page.getByText(event.location, { exact: true })).toBeVisible()
})
