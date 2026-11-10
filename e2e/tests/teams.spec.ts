import { expect, test } from '@playwright/test'
import { registerThroughApi } from '../fixtures/api'
import { signInAs } from '../fixtures/auth'
import { readEventsOf, seedDog, seedEvent, seedOrganizer, seedStaffUser } from '../fixtures/db'
import { issue } from '../fixtures/issue'
import { RegistrationPage } from '../pages/RegistrationPage'

const TEAM = 'Kultaiset E2E'

/** The teams page of an event; a save goes on to the event's view, so the page is opened anew. */
const teamsPage = (id: string) => `/admin/event/teams/${id}`

test('a team named at entry is suggested on the teams page and made a team with its first-team mark', {
  annotation: issue('KOE-1721'),
  tag: ['@secretary', '@public'],
}, async ({ browser, context, page }) => {
  const organizer = await seedOrganizer()
  const secretary = await seedStaffUser({ roles: { [organizer.id]: 'secretary' } })
  // Ready on confirmation, so the entries reach the secretary's list without a payment step.
  const event = await seedEvent({
    classes: [],
    eventType: 'NOU',
    organizer: { id: organizer.id, name: organizer.name },
    paymentTime: 'confirmation',
  })

  // The secretary has the entry form ask for the team before any team is made.
  await signInAs(context, secretary)
  await page.goto(teamsPage(event.id))
  await page.getByRole('checkbox', { name: 'Kysy joukkuetta ilmoittautumisessa' }).check()
  await page.getByRole('button', { name: 'Tallenna' }).click()
  await expect(page.getByText('Joukkueet tallennettu')).toBeVisible()
  expect(await readEventsOf(organizer.id)).toMatchObject([{ teamCompetition: { askAtEntry: true } }])

  // A participant, not signed in, names the team and marks it the first team; another dog of the team
  // is entered with the name spelled otherwise.
  const [first, second] = [await seedDog(), await seedDog()]
  const owner = await seedStaffUser()
  const participant = await (await browser.newContext()).newPage()
  const form = new RegistrationPage(participant)
  await form.goto(event)
  await form.fetchDog(first)
  await form.fillBreeder('Kennel E2E')
  await form.fillOwner(owner, '401234567')
  await form.fillTeam(TEAM, true)
  await form.acceptTerms()
  await participant.getByRole('button', { name: 'Vahvista ilmoittautuminen' }).click()
  await expect(participant).not.toHaveURL(new RegExp(`/event/NOU/${event.id}$`))
  const [stored] = await readEventsOf(organizer.id)
  const other = await registerThroughApi(stored, second, owner, { teamEntry: { name: ` ${TEAM.toLowerCase()} ` } })

  // The two spellings are one suggestion of both dogs, marked the first team.
  await page.goto(teamsPage(event.id))
  const suggestion = page.getByRole('listitem').filter({ hasText: first.name })
  await expect(suggestion).toContainText(TEAM)
  await expect(suggestion).toContainText(second.name)
  await expect(suggestion).toContainText('Ykkösjoukkue')
  await page.getByRole('button', { name: `Tee joukkue ${TEAM}` }).click()

  const team = page.getByRole('region', { name: 'Joukkue 1' })
  await expect(team.getByRole('textbox', { name: 'Joukkueen nimi' })).toHaveValue(TEAM)
  await expect(team.getByRole('checkbox', { name: 'Ykkösjoukkue' })).toBeChecked()
  await page.getByRole('button', { name: 'Tallenna' }).click()
  await expect(page.getByText('Joukkueet tallennettu')).toBeVisible()

  const [saved] = await readEventsOf(organizer.id)
  expect(saved.teams).toEqual([{ name: TEAM, primary: true, registrationIds: [expect.any(String), other.id] }])
  await page.goto(teamsPage(event.id))
  await expect(page.getByRole('region', { name: 'Joukkue 1' }).getByText(`1B ${second.name}`)).toBeVisible()
})

test('on a phone, a dog is found by its handler and added to a team', {
  annotation: issue('KOE-1725'),
  tag: '@secretary',
}, async ({ context, page }) => {
  await page.setViewportSize({ height: 844, width: 390 })
  const organizer = await seedOrganizer()
  const secretary = await seedStaffUser({ roles: { [organizer.id]: 'secretary' } })
  const event = await seedEvent({
    classes: [],
    eventType: 'NOU',
    organizer: { id: organizer.id, name: organizer.name },
    paymentTime: 'confirmation',
    teams: [{ registrationIds: [] }],
  })
  const owner = await seedStaffUser()
  const entry = await registerThroughApi(event, await seedDog(), owner)

  await signInAs(context, secretary)
  await page.goto(teamsPage(event.id))
  // The owner handles the dog; part of the handler's name is enough.
  await page.getByRole('combobox', { name: 'Lisää koira' }).fill(owner.id)
  await page.getByRole('option', { name: new RegExp(`ohj\\. ${owner.name}$`) }).click()
  await page.getByRole('button', { name: 'Tallenna' }).click()
  await expect(page.getByText('Joukkueet tallennettu')).toBeVisible()

  const [saved] = await readEventsOf(organizer.id)
  expect(saved.teams).toEqual([{ registrationIds: [entry.id] }])
})

// Every seeded dog is of the same sire, dam and birth day, and the entries name the same breeder.
test('dogs of one litter are suggested as a team named after their breeder', {
  annotation: issue('KOE-1727'),
  tag: '@secretary',
}, async ({ context, page }) => {
  const organizer = await seedOrganizer()
  const secretary = await seedStaffUser({ roles: { [organizer.id]: 'secretary' } })
  const event = await seedEvent({
    classes: [],
    eventType: 'NOU',
    organizer: { id: organizer.id, name: organizer.name },
    paymentTime: 'confirmation',
  })
  const [first, second] = [await seedDog(), await seedDog()]
  const owner = await seedStaffUser()
  const entries = [await registerThroughApi(event, first, owner), await registerThroughApi(event, second, owner)]

  await signInAs(context, secretary)
  await page.goto(teamsPage(event.id))
  await page.getByRole('checkbox', { name: 'Joukkueet ovat pentuejoukkueita' }).check()
  await page.getByRole('button', { name: 'Tee joukkue Kennel E2E' }).click()
  await expect(
    page.getByRole('region', { name: 'Joukkue 1' }).getByRole('textbox', { name: 'Joukkueen nimi' })
  ).toHaveValue('Kennel E2E')
  await page.getByRole('button', { name: 'Tallenna' }).click()
  await expect(page.getByText('Joukkueet tallennettu')).toBeVisible()

  const [saved] = await readEventsOf(organizer.id)
  expect(saved).toMatchObject({
    teamCompetition: { litters: true },
    teams: [{ name: 'Kennel E2E', registrationIds: entries.map(({ id }) => id) }],
  })
})
