import { expect, test } from '@playwright/test'
import { postRegistration, registrationBody } from '../fixtures/api'
import { helsinkiDay } from '../fixtures/dates'
import { readRegistration, seedDog, seedEvent, seedOrganizer, seedStaffUser } from '../fixtures/db'
import { issue } from '../fixtures/issue'
import { PaymentPage } from '../pages/PaymentPage'
import { RegistrationPage } from '../pages/RegistrationPage'

/**
 * An unofficial trial that runs a class of its own (KOE-674): a derby's DERBY. The class is the event's
 * own code, its days are the event's class days, and the trial has no Kennelliitto link.
 */
const seedDerby = async () => {
  const organizer = await seedOrganizer()
  return seedEvent({
    classes: [{ class: 'DERBY', date: helsinkiDay(14), places: 20 }],
    eventType: 'Derby',
    kcGuid: undefined,
    kcId: undefined,
    organizer: { id: organizer.id, name: organizer.name },
    ownClasses: [{ code: 'DERBY', name: { en: 'Derby', fi: 'Derby' } }],
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
    expect(await readRegistration(key.eventId, key.id)).toMatchObject({ class: 'DERBY' })
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
