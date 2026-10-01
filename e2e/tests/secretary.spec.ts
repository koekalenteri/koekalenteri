import type { BrowserContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { signInAs } from '../fixtures/auth'
import { readEventsOf, seedOrganizer, seedStaffUser } from '../fixtures/db'
import { issue } from '../fixtures/issue'
import { EventFormPage } from '../pages/EventFormPage'
import { SearchPage } from '../pages/SearchPage'

/**
 * An organizer of its own, its secretary (a role in that organizer, not an admin) and an official
 * the form offers for NOU trials.
 */
const seedOrganization = async () => {
  const organizer = await seedOrganizer()
  const secretary = await seedStaffUser({ roles: { [organizer.id]: 'secretary' } })
  const official = await seedStaffUser({ name: `Teemu Toimitsija ${organizer.id}`, officer: ['NOU'], roles: {} })
  return { name: `E2E-julkaisu ${organizer.id}`, official, organizer, secretary }
}

test.describe('a secretary', { annotation: issue('KOE-1478'), tag: '@secretary' }, () => {
  test('creates a draft, publishes it, and it is on the front page for everyone', async ({
    browser,
    context,
    page,
  }) => {
    const { official, organizer, secretary, name } = await seedOrganization()
    await signInAs(context, secretary)
    const form = new EventFormPage(page)
    await form.gotoCreate()

    await form.fillDraft({ name, organizer, secretary })
    await form.save.click()
    await expect(page.getByText('Tapahtuma on tallennettu luonnoksena')).toBeVisible()
    expect(await readEventsOf(organizer.id)).toMatchObject([{ name, state: 'draft' }])

    // A visitor who is not signed in, in a context of their own each time: the public event list is
    // cacheable, so the same browser would be shown the list it fetched before. The list starts
    // from the event's day to stay short however many events earlier runs left behind.
    const [draft] = await readEventsOf(organizer.id)
    const daysAhead = Math.floor((Date.parse(draft.startDate) - Date.now()) / (24 * 3600 * 1000))
    const lookFromEventDay = async () => {
      const search = new SearchPage(await (await browser.newContext()).newPage())
      await search.goto()
      await search.setStartDate(daysAhead)
      return search
    }
    const search = await lookFromEventDay()
    await expect(search.event({ name })).toBeHidden()

    await page.getByRole('button', { name: 'Muokkaa' }).click()
    await form.fillForPublishing({ official })
    await form.save.click()
    await expect(page.getByText('Tapahtuma on julkaistu')).toBeVisible()
    expect(await readEventsOf(organizer.id)).toMatchObject([
      { location: 'Tampere', name, official: { name: official.name }, state: 'confirmed' },
    ])

    const later = await lookFromEventDay()
    await expect(later.event({ name })).toBeVisible()
  })

  /** Opens the form as the secretary, fills a draft, then takes the role away before saving. */
  const saveAfterLosingTheRole = async (context: BrowserContext, page: Page) => {
    const { organizer, secretary, name } = await seedOrganization()
    await signInAs(context, secretary)
    const form = new EventFormPage(page)
    await form.gotoCreate()
    await form.fillDraft({ name, organizer, secretary })

    // The role goes while the form is open; the page still thinks it may save.
    await seedStaffUser({ ...secretary, roles: {} })
    const saved = page.waitForResponse((response) => response.request().method() === 'POST')
    await form.save.click()
    return { organizer, saved: await saved }
  }

  test('whose role has been taken away cannot save an event', async ({ context, page }) => {
    const { organizer, saved } = await saveAfterLosingTheRole(context, page)

    expect(saved.status()).toBe(403)
    await expect(page.getByText('Tapahtuma on tallennettu luonnoksena')).toBeHidden()
    expect(await readEventsOf(organizer.id)).toEqual([])
  })

  test.fail(
    'is told when saving is refused',
    { annotation: issue('KOE-1482', 'a refused save other than 409 shows nothing') },
    async ({ context, page }) => {
      await saveAfterLosingTheRole(context, page)

      await expect(page.getByRole('alert')).toBeVisible()
    }
  )
})
