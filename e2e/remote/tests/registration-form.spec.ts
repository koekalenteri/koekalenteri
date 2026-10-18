import { expect, test } from '@playwright/test'
import { issue } from '../../fixtures/issue'
import { RegistrationPage } from '../../pages/RegistrationPage'
import { SearchPage } from '../../pages/SearchPage'
import { remoteEvent } from '../event'

/**
 * The public path through the deployed stack, on the event the run wrote (global-setup.ts). The
 * dog is never fetched, since that would go to the Kennel Club, and the form is never sent.
 */
test.describe('the test environment after a deploy', { annotation: issue('KOE-1559'), tag: '@public' }, () => {
  test('the front page lists the event and its registration form opens from the list', async ({ page }) => {
    const event = remoteEvent()
    const search = new SearchPage(page)
    await search.goto()
    await expect(search.event(event)).toBeVisible()

    await search.openEvent(event)

    await expect(page).toHaveURL(`/event/${event.eventType}/${event.id}`)
    await expect(page.getByRole('combobox', { name: 'Rekisterinumero' })).toBeVisible()
  })

  // Without a dog the form offers only the class, the reserve and groups, the notes and the terms:
  // the breeder's and the owners' sections open once there is a dog, and the dog would be fetched
  // from the Kennel Club. So the check is that the form's own validation answers what is filled in:
  // accepting the terms takes them off the list of what is missing, and nothing else changes.
  test('the registration form lists what is missing and takes the terms off once accepted', async ({ page }) => {
    const form = new RegistrationPage(page)
    await form.goto(remoteEvent())
    const missing = await form.missingInfo()
    const forTheDog = [
      'Kasvattajan tiedot',
      'Koiran tiedot',
      'Omistajan tiedot',
      'Osallistumisoikeuteen vaikuttavat tulokset',
    ]
    await expect(missing).toHaveText(['Ehdot ja tietosuojaseloste', ...forTheDog])

    await form.acceptTerms()

    await expect(missing).toHaveText(forTheDog)
    await expect(form.submit).toBeDisabled()
  })
})
