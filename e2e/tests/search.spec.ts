import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { helsinkiDay } from '../fixtures/dates'
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
    const event = await seedEvent({ endDate: helsinkiDay(20), startDate: helsinkiDay(20) })
    const search = new SearchPage(page)
    await search.goto()
    await expect(search.event(event)).toBeVisible()

    await search.setStartDate(25)
    await expect(search.event(event)).toBeHidden()

    await search.setStartDate(15)
    await expect(search.event(event)).toBeVisible()
  })

  // Each date is typed over the one before it. The pairs are the ones where a field's own checks
  // get in the way: a day the new month lacks, a held 1st, a leap day, an end before the start.
  const typedOver = async (
    page: Page,
    field: 'Tapahtumat alkaen' | 'Tapahtumat päättyen',
    days: string[],
    type: (search: SearchPage, day: string) => Promise<void>
  ) => {
    const search = new SearchPage(page)
    await search.goto()
    const group = search.filters.getByRole('group', { name: field })
    for (const day of days) {
      await type(search, day)
      const [year, month, date] = day.split('-')
      await expect(group).toContainText(`${date}.${month}.${year}`)
    }
  }

  test('a start date typed over a held 1st or a shorter month lands as typed', async ({ page }) => {
    await typedOver(
      page,
      'Tapahtumat alkaen',
      ['2031-05-01', '2031-05-12', '2031-01-01', '2028-02-29', '2030-02-28', '2028-02-29'],
      (search, day) => search.setStartDay(day)
    )
  })

  test('a start date typed over a 30th, a 31st or December lands as typed', async ({ page }) => {
    await typedOver(
      page,
      'Tapahtumat alkaen',
      ['2030-04-30', '2030-05-31', '2030-06-30', '2030-12-31', '2031-01-01', '2031-01-31'],
      (search, day) => search.setStartDay(day)
    )
  })

  test('an end date typed over another, with the start fixed, lands as typed', async ({ page }) => {
    // The end field takes nothing before the start, so the start is fixed first. The first date
    // is in the start's month and after the start, as an end date typed this month is.
    await typedOver(
      page,
      'Tapahtumat päättyen',
      ['2028-01-17', '2028-01-11', '2028-01-12', '2028-03-01', '2028-03-12', '2028-01-31', '2028-02-29', '2028-02-11'],
      async (search, day) => {
        if (day === '2028-01-17') await search.setStartDay('2028-01-10')
        await search.setEndDay(day)
      }
    )
  })

  test('the end date typed into the empty field hides a later event', { annotation: issue('KOE-1481') }, async ({
    page,
  }) => {
    const event = await seedEvent({ endDate: helsinkiDay(20), startDate: helsinkiDay(20) })
    const search = new SearchPage(page)
    await search.goto()
    await expect(search.event(event)).toBeVisible()

    // Typed key by key into the empty field; the year's first digit used to empty it (KOE-1481).
    await search.setEndDate(18)

    await expect(search.event(event)).toBeHidden()
  })

  test('"entry open" hides an event whose entry has not opened yet', async ({ page }) => {
    const open = await seedEvent()
    const upcoming = await seedEvent({ entryEndDate: helsinkiDay(10), entryStartDate: helsinkiDay(3) })
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
