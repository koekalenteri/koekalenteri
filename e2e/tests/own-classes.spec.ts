import { expect, test } from '@playwright/test'
import { postRegistration, registrationBody } from '../fixtures/api'
import { signInAs } from '../fixtures/auth'
import { helsinkiDay } from '../fixtures/dates'
import {
  putItem,
  readEventsOf,
  readRegistration,
  seedDog,
  seedEvent,
  seedOrganizer,
  seedStaffUser,
  TABLES,
} from '../fixtures/db'
import { issue } from '../fixtures/issue'
import { EventFormPage } from '../pages/EventFormPage'
import { PaymentPage } from '../pages/PaymentPage'
import { RegistrationPage } from '../pages/RegistrationPage'

/** An unofficial event type the form offers, as the Kennel Club's list never holds one. */
const UNOFFICIAL_TYPE = 'E2E-harjoitus'

const seedUnofficialType = () => {
  const now = new Date().toISOString()
  return putItem(TABLES.eventType, {
    active: true,
    createdAt: now,
    createdBy: 'e2e',
    description: { en: 'E2E training', fi: 'E2E-harjoitus', sv: 'E2E-övning' },
    eventType: UNOFFICIAL_TYPE,
    modifiedAt: now,
    modifiedBy: 'e2e',
    official: false,
  })
}

/**
 * An unofficial trial that runs a class of its own (KOE-674): a derby's one class, coded DRB and named
 * Derby, since a code may not be the type's name (`ownClassErrors`). The class is the event's own
 * code, its days are the event's class days, and the trial has no Kennelliitto link.
 */
const seedDerby = async () => {
  const organizer = await seedOrganizer()
  return seedEvent({
    classes: [{ class: 'DRB', date: helsinkiDay(14), places: 20 }],
    eventType: 'Derby',
    kcGuid: undefined,
    kcId: undefined,
    organizer: { id: organizer.id, name: organizer.name },
    ownClasses: [{ code: 'DRB', name: { en: 'Derby', fi: 'Derby' } }],
  })
}

test.describe('an own class of an unofficial trial', { annotation: issue('KOE-674'), tag: ['@public'] }, () => {
  test('an entry through the form is stored in the own class', async ({ page }) => {
    const event = await seedDerby()
    const dog = await seedDog()
    const owner = await seedStaffUser()

    const form = new RegistrationPage(page)
    await form.goto(event)
    await form.fetchDog(dog)
    await form.fillBreeder('Kennel E2E')
    await form.fillOwner(owner, '401234567')
    await form.acceptTerms()
    await form.submit.click()

    const key = await new PaymentPage(page).registrationKey()
    expect(await readRegistration(key.eventId, key.id)).toMatchObject({ class: 'DRB' })
  })

  test('the server refuses an entry in a class the trial does not run', async () => {
    const event = await seedDerby()
    const dog = await seedDog()
    const owner = await seedStaffUser()
    const response = await postRegistration({ ...registrationBody(event, dog, owner), class: 'ALO' })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalidClass' })
  })
})

test('a secretary gives an unofficial trial classes of its own, and a dog enters one by its name', {
  annotation: issue('KOE-674'),
  tag: ['@secretary', '@public'],
}, async ({ browser, context, page }) => {
  await seedUnofficialType()
  const organizer = await seedOrganizer()
  const secretary = await seedStaffUser({ roles: { [organizer.id]: 'secretary' } })
  const official = await seedStaffUser({ name: `Teemu Toimitsija ${organizer.id}`, officer: ['NOU'], roles: {} })
  const name = `E2E-omat luokat ${organizer.id}`

  await signInAs(context, secretary)
  const form = new EventFormPage(page)
  await form.gotoCreate()
  await form.fillDraft({ eventType: UNOFFICIAL_TYPE, name, organizer, secretary })
  // The second class first in the list: the order is the secretary's, not the codes'.
  await form.addOwnClass('YKS', 'Yksilö')
  await form.addOwnClass('VET', 'Veteraanit')
  await page.getByRole('button', { name: 'Siirrä VET ylemmäs' }).click()
  await form.fillForPublishing({ judgeField: 'Tuomari 1', official })
  // Each class needs its judge; the choice lists them in the secretary's order.
  await page.getByRole('combobox', { name: 'Arvostelee luokat' }).click()
  await page.getByRole('option', { name: 'VET' }).click()
  await page.getByRole('option', { name: 'YKS' }).click()
  await page.keyboard.press('Escape')
  await form.save.click()
  await expect(page.getByText('Tapahtuma on julkaistu')).toBeVisible()

  const [event] = await readEventsOf(organizer.id)
  expect(event).toMatchObject({
    classes: [{ class: 'YKS' }, { class: 'VET' }],
    ownClasses: [
      { code: 'VET', name: { fi: 'Veteraanit' } },
      { code: 'YKS', name: { fi: 'Yksilö' } },
    ],
    state: 'confirmed',
  })

  // The form puts the entry weeks ahead of today; it opens now, as the test cannot wait for it.
  await putItem(TABLES.event, { ...event, entryStartDate: helsinkiDay(-1) })

  // A participant, not signed in, picks the class by its name.
  const dog = await seedDog()
  const owner = await seedStaffUser()
  const entry = new RegistrationPage(await (await browser.newContext()).newPage())
  await entry.goto(event)
  await entry.fetchDog(dog)
  await entry.pickClass('Veteraanit')
  await entry.fillBreeder('Kennel E2E')
  await entry.fillOwner(owner, '401234567')
  await entry.acceptTerms()
  await entry.submit.click()

  const key = await new PaymentPage(entry.page).registrationKey()
  expect(await readRegistration(key.eventId, key.id)).toMatchObject({ class: 'VET' })
})

// KOE-1723: an unofficial trial that follows NOWT runs its own classes at the posts as NOWT runs ALO,
// and asks for no judges of its own. The trial is today, so its posts take scores.
test('a trial that follows NOWT scores a dog of its own class at a post', {
  annotation: issue('KOE-1723'),
  tag: '@secretary',
}, async ({ context, page }) => {
  const organizer = await seedOrganizer()
  const secretary = await seedStaffUser({ roles: { [organizer.id]: 'secretary' } })
  const today = helsinkiDay(0)
  const event = await seedEvent({
    classes: [
      { class: 'YKS', date: today, places: 20 },
      { class: 'VET', date: today, places: 20 },
    ],
    dates: [{ date: today, time: 'ap' }],
    endDate: today,
    // Entry still open today, so the dog is entered as the form enters it.
    entryEndDate: today,
    entryStartDate: helsinkiDay(-7),
    eventType: 'Pirkka',
    judges: [],
    kcGuid: undefined,
    kcId: undefined,
    officialFormat: 'NOWT',
    organizer: { id: organizer.id, name: organizer.name },
    ownClasses: [
      { code: 'YKS', name: { en: 'Individual', fi: 'Yksilö' } },
      { code: 'VET', name: { en: 'Veterans', fi: 'Veteraanit' } },
    ],
    rotations: [{ class: 'YKS', exercises: [{ stationId: 'post-1' }, { stationId: 'post-2' }] }],
    startDate: today,
    stations: [
      { date: today, id: 'post-1', number: 1 },
      { date: today, id: 'post-2', number: 2 },
    ],
  })
  const dog = await seedDog()
  const owner = await seedStaffUser()
  // Entered and placed before the trial, as the secretary would have.
  const body = registrationBody(event, dog, owner)
  const created = await postRegistration({ ...body, class: 'YKS' })
  expect(created.status, await created.clone().text()).toBe(200)
  const { id } = (await created.json()) as { id: string }
  const stored = await readRegistration(event.id, id)
  await putItem(TABLES.registration, {
    ...stored,
    group: { date: today, key: `${today}-ap`, number: 1, time: 'ap' },
    state: 'ready',
  })

  await signInAs(context, secretary)
  await page.goto(`/admin/event/results/${event.id}/station/post-1`)
  await page.getByRole('button', { name: `1 ${dog.name}` }).click()
  await page.getByRole('textbox', { name: /Rasti 1/ }).fill('15')
  await page.getByRole('button', { name: 'Tallenna tulokset' }).click()

  await expect.poll(async () => (await readRegistration(event.id, id))?.eventResult?.tasks?.[0]?.points).toBe(15)
})
