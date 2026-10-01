import { expect, test } from '@playwright/test'
import { registerThroughApi } from '../fixtures/api'
import { signInAs } from '../fixtures/auth'
import { groupDay } from '../fixtures/dates'
import { readRegistration, seedDog, seedEvent, seedOrganizer, seedStaffUser } from '../fixtures/db'
import { issue } from '../fixtures/issue'
import { EventViewPage } from '../pages/EventViewPage'

test('a secretary places registered dogs into groups by dialog and by dragging', {
  annotation: issue('KOE-1479'),
  tag: '@secretary',
}, async ({ context, page }) => {
  const organizer = await seedOrganizer()
  const secretary = await seedStaffUser({ roles: { [organizer.id]: 'secretary' } })
  // Paid on confirmation: a registration is ready as soon as it is sent, no payment step needed.
  const event = await seedEvent({
    classes: [],
    eventType: 'NOU',
    organizer: { id: organizer.id, name: organizer.name },
    paymentTime: 'confirmation',
  })
  // The event is two weeks from today, so its groups are named after whatever day that is.
  const morning = `${groupDay(event.startDate)} aamupäivä`
  const afternoon = `${groupDay(event.startDate)} iltapäivä`
  const dogs = [await seedDog(), await seedDog(), await seedDog()]
  const registrations = []
  for (const dog of dogs) registrations.push(await registerThroughApi(event, dog, secretary))
  const [byDialog, byDragging, waiting] = dogs

  await signInAs(context, secretary)
  const view = new EventViewPage(page)
  await view.goto(event)
  for (const dog of dogs) await expect(view.row(dog, view.group('Ilmoittautuneet'))).toBeVisible()

  await view.moveWithDialog(byDialog, afternoon)
  await view.drag(byDragging, morning)

  const stored = await Promise.all(registrations.map(({ eventId, id }) => readRegistration(eventId, id)))
  expect(stored.map((registration) => registration?.group?.time)).toEqual(['ip', 'ap', undefined])

  await page.reload()
  await page.getByRole('heading', { name: 'Ilmoittautuneet' }).waitFor()
  await expect(view.row(byDialog, view.group(afternoon))).toBeVisible()
  await expect(view.row(byDragging, view.group(morning))).toBeVisible()
  await expect(view.row(waiting, view.group('Ilmoittautuneet'))).toBeVisible()
})
