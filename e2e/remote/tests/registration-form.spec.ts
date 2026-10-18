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

  // The breeder's section opens and the qualifying results are read only once there is a dog, so
  // with the owner and the terms filled in, those two and the dog are all the form still asks for.
  test('the registration form checks what is filled in and asks only for what needs the dog', async ({ page }) => {
    const form = new RegistrationPage(page)
    await form.goto(remoteEvent())

    await form.fillOwner({ email: 'omistaja@example.com', location: 'Tampere', name: 'Olli Omistaja' }, '401234567')
    await form.acceptTerms()

    await expect(form.submit).toBeDisabled()
    await page.getByRole('button', { name: 'Miksi en voi siirtyä eteenpäin?' }).click()
    const missing = page.getByTestId('missing-info')
    await expect(missing.getByRole('listitem')).toHaveText([
      'Kasvattajan tiedot',
      'Koiran tiedot',
      'Osallistumisoikeuteen vaikuttavat tulokset',
    ])
  })
})
