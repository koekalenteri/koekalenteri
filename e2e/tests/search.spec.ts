import { expect, test } from '@playwright/test'
import { endOfDay, startOfDay } from '../fixtures/dates'
import { seedEvent } from '../fixtures/db'
import { issue } from '../fixtures/issue'
import { SearchPage } from '../pages/SearchPage'

test.describe('finding an event', { annotation: issue('KOE-1476'), tag: '@public' }, () => {
  test('the event type filter shows the matching event and hides the other', {
    annotation: issue('KOE-1480', 'the options are picked with includeHidden'),
  }, async ({ page }) => {
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

  test('a date typed over any other date lands as typed', async ({ page }) => {
    const search = new SearchPage(page)
    await search.goto()
    const group = search.filters.getByRole('group', { name: 'Tapahtumat alkaen' })

    // Each day is typed over the one before it. The pairs are the ones where the field's own
    // checks get in the way: a day the new month lacks, a held 1st (typing 01 reads as 10), a leap day.
    const days = [
      '2031-05-01',
      '2031-05-12', // held 1st to another day
      '2031-01-01',
      '2028-02-29', // held 1st to a leap day
      '2030-02-28', // leap day to the 28th
      '2028-02-29', // and back
      '2031-01-01',
      '2030-04-30', // held 1st to the 30th
      '2030-05-31', // 30th to 31st
      '2030-06-30', // 31st to a 30-day month
      '2030-12-31',
      '2031-01-01', // December to January
    ]
    for (const day of days) {
      await search.setStartDay(day)
      const [year, month, date] = day.split('-')
      await expect(group).toContainText(`${date}.${month}.${year}`)
    }
  })

  test('the end date typed into the empty field hides a later event', { annotation: issue('KOE-1481') }, async ({
    page,
  }) => {
    const event = await seedEvent({ endDate: startOfDay(20), startDate: startOfDay(20) })
    const search = new SearchPage(page)
    await search.goto()
    await expect(search.event(event)).toBeVisible()

    // Typed key by key into the empty field; the year's first digit used to empty it (KOE-1481).
    await search.setEndDate(18)

    await expect(search.event(event)).toBeHidden()
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
