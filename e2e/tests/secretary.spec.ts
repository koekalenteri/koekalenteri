import type { BrowserContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { registerThroughApi } from '../fixtures/api'
import { signInAs } from '../fixtures/auth'
import { readEventsOf, readRegistration, seedDog, seedEvent, seedOrganizer, seedStaffUser } from '../fixtures/db'
import { issue } from '../fixtures/issue'
import { EventFormPage } from '../pages/EventFormPage'
import { EventViewPage } from '../pages/EventViewPage'
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

  test('is told when saving is refused', { annotation: issue('KOE-1482') }, async ({ context, page }) => {
    await saveAfterLosingTheRole(context, page)

    await expect(page.getByRole('alert')).toHaveText('Sinulla ei ole oikeutta tallentaa tätä koetta.')
  })

  test('asks before leaving the edit page with a change: staying keeps it, leaving drops it', {
    annotation: issue('KOE-1700'),
  }, async ({ context, page }) => {
    const { organizer, secretary, name } = await seedOrganization()
    await signInAs(context, secretary)
    const form = new EventFormPage(page)
    await form.gotoCreate()
    await form.fillDraft({ name, organizer, secretary })
    await form.save.click()
    await expect(page.getByText('Tapahtuma on tallennettu luonnoksena')).toBeVisible()
    const [draft] = await readEventsOf(organizer.id)

    await page.goto(`/admin/event/edit/${draft.id}`)
    const nameField = page.getByRole('textbox', { name: 'Nimi (Suomeksi)' })
    await nameField.fill(`${name} muutettu`)
    const judgesLink = page.getByRole('link', { name: 'Tuomarit' })

    await judgesLink.click()
    await page.getByRole('button', { name: 'Jatka muokkausta' }).click()
    await expect(nameField).toHaveValue(`${name} muutettu`)

    await judgesLink.click()
    await page.getByRole('button', { name: 'Poistu tallentamatta' }).click()
    await expect(page).toHaveURL(/\/admin\/judge/)

    // The change went with the answer: the page opens on the event as saved.
    await page.goto(`/admin/event/edit/${draft.id}`)
    await expect(nameField).toHaveValue(name)
  })

  // Esc closes the event view's details dialog the way Cancel does, also before the 300 ms in which the
  // field passes a typed value on: Chrome takes the focus off the field as the dialog removes it, and that
  // late value must not land in the draft the close has just dropped. jsdom moves no focus on removal.
  test('closing the details dialog with Esc right after typing drops the change', {
    annotation: issue('KOE-1700'),
  }, async ({ context, page }) => {
    const organizer = await seedOrganizer()
    const secretary = await seedStaffUser({ roles: { [organizer.id]: 'secretary' } })
    const event = await seedEvent({ organizer: { id: organizer.id, name: organizer.name } })
    await signInAs(context, secretary)
    const view = new EventViewPage(page)
    await view.goto(event)
    const details = page.getByRole('dialog', { name: event.name })
    const description = details.getByRole('textbox', { name: 'Lisätiedot (Suomeksi)' })
    const openDetails = () => page.getByRole('button', { name: 'Näytä tapahtuman tiedot' }).click()
    // The actions are in a drawer, which stays open under the dialog.
    await page.getByRole('button', { name: 'Avaa tapahtuman hallinta' }).click()

    await openDetails()
    await description.fill(`${event.description} muutettu`)
    await page.keyboard.press('Escape')
    await expect(details).toBeHidden()

    await openDetails()
    await expect(description).toHaveValue(event.description ?? '')
    await expect(details.getByRole('button', { name: 'Tallenna' })).toBeDisabled()
  })

  // The internal note saves as it is typed, with no Save to press: closing the entry with Esc right after
  // typing still saves it, while the dialog's own changes are left for the next opening to drop (KOE-1700).
  test('closing an entry with Esc right after typing an internal note still saves the note', {
    annotation: issue('KOE-1700'),
  }, async ({ context, page }) => {
    const organizer = await seedOrganizer()
    const secretary = await seedStaffUser({ roles: { [organizer.id]: 'secretary' } })
    const event = await seedEvent({
      classes: [],
      eventType: 'NOU',
      organizer: { id: organizer.id, name: organizer.name },
      paymentTime: 'confirmation',
    })
    const dog = await seedDog()
    const registration = await registerThroughApi(event, dog, secretary)
    await signInAs(context, secretary)
    const view = new EventViewPage(page)
    await view.goto(event)

    await view.row(dog).dblclick()
    const entry = page.getByRole('dialog')
    const note = entry.getByRole('textbox', { name: 'Sisäinen kommentti (ei näy ilmoittautujalle)' })
    if (!(await note.isVisible())) await entry.getByText('Koesihteerin merkinnät').click()
    await note.fill('Soitettu omistajalle')
    await page.keyboard.press('Escape')
    await expect(entry).toBeHidden()

    await expect
      .poll(async () => (await readRegistration(registration.eventId, registration.id))?.internalNotes)
      .toBe('Soitettu omistajalle')
  })
})
