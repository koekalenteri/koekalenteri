import { expect, test } from '@playwright/test'
import { seedEvent } from '../fixtures/db'

test('the front page lists an event the API returns from the database', async ({ page }) => {
  const event = await seedEvent()

  const events = page.waitForResponse((response) => /\/dev\/event\/?$/.test(new URL(response.url()).pathname))
  await page.goto('/')

  expect((await events).status()).toBe(200)
  await expect(page.getByText(`${event.location} (demo: fails on purpose)`, { exact: true })).toBeVisible()
})
