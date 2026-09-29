import { expect, test } from '@playwright/test'
import { endOfDay, startOfDay } from '../fixtures/dates'
import { seedEvent } from '../fixtures/db'
import { SearchPage } from '../pages/SearchPage'

test.describe('finding an event', () => {
  test('the event type filter shows the matching event and hides the other', async ({ page }) => {
    const nomeB = await seedEvent({ eventType: 'NOME-B' })
    const nowt = await seedEvent({ eventType: 'NOWT' })
    const search = new SearchPage(page)
    await search.goto()
    await expect(search.event(nomeB)).toBeVisible()
    await expect(search.event(nowt)).toBeVisible()

    await search.selectEventType('NOME-B')

    await expect(search.event(nomeB)).toBeVisible()
    await expect(search.event(nowt)).toBeHidden()
  })

  test('the start date hides an earlier event and shows it again when moved back', async ({ page }) => {
    const event = await seedEvent({ endDate: startOfDay(20), startDate: startOfDay(20) })
    const search = new SearchPage(page)
    await search.goto()
    await expect(search.event(event)).toBeVisible()

    await search.setStartDate(25)
    await expect(search.event(event)).toBeHidden()

    await search.setStartDate(15)
    await expect(search.event(event)).toBeVisible()
  })

  test('typing a date into the empty end date keeps it', async ({ page }) => {
    test.fail(true, 'KOE-1481: the day and month typed into the empty end date are lost')
    const search = new SearchPage(page)
    await search.goto()

    await search.setEndDate(18)
  })

  test('"entry open" hides an event whose entry has not opened yet', async ({ page }) => {
    const open = await seedEvent()
    const upcoming = await seedEvent({ entryEndDate: endOfDay(10), entryStartDate: startOfDay(3) })
    const search = new SearchPage(page)
    await search.goto()
    await expect(search.event(upcoming)).toBeVisible()

    await search.setEntryOpen(true)

    await expect(search.event(open)).toBeVisible()
    await expect(search.event(upcoming)).toBeHidden()
  })

  test('a range no event falls in shows the empty result', async ({ page }) => {
    const search = new SearchPage(page)
    await search.goto()

    await search.setStartDate(3000)

    await expect(search.emptyResult).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(0)
  })

  test('an event opens from the list', async ({ page }) => {
    const event = await seedEvent()
    const search = new SearchPage(page)
    await search.goto()

    await search.openEvent(event)

    await expect(page).toHaveURL(`/event/${event.eventType}/${event.id}`)
    await expect(page.getByText(event.location, { exact: false }).first()).toBeVisible()
  })
})
