import { expect, test } from '@playwright/test'
import { registerThroughApi } from '../fixtures/api'
import { signInAs } from '../fixtures/auth'
import { readRegistration, seedDog, seedEvent, seedOrganizer, seedStaffUser } from '../fixtures/db'
import { issue } from '../fixtures/issue'
import { EventViewPage, groupTitle } from '../pages/EventViewPage'

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
  const MORNING = groupTitle(event.startDate, 'ap')
  const AFTERNOON = groupTitle(event.startDate, 'ip')
  const dogs = [await seedDog(), await seedDog(), await seedDog()]
  const registrations = []
  for (const dog of dogs) registrations.push(await registerThroughApi(event, dog, secretary))
  const [byDialog, byDragging, waiting] = dogs

  await signInAs(context, secretary)
  const view = new EventViewPage(page)
  await view.goto(event)
  for (const dog of dogs) await expect(view.row(dog, view.group('Ilmoittautuneet'))).toBeVisible()

  await view.moveWithDialog(byDialog, AFTERNOON)
  await view.drag(byDragging, MORNING)

  const stored = await Promise.all(registrations.map(({ eventId, id }) => readRegistration(eventId, id)))
  expect(stored.map((registration) => registration?.group?.time)).toEqual(['ip', 'ap', undefined])

  await page.reload()
  await page.getByRole('heading', { name: 'Ilmoittautuneet' }).waitFor()
  await expect(view.row(byDialog, view.group(AFTERNOON))).toBeVisible()
  await expect(view.row(byDragging, view.group(MORNING))).toBeVisible()
  await expect(view.row(waiting, view.group('Ilmoittautuneet'))).toBeVisible()
})
