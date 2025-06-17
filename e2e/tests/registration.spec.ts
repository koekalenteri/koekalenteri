import { expect, test } from '@playwright/test'

import { events } from '../fixtures/events'
import { SearchPage } from '../page-objects/SearchPage'
import { setupDynamoDB } from '../utils/dynamodb'

test.describe('Registration', () => {
  test.beforeEach(async ({ page }) => {
    // Set up DynamoDB with test data instead of using API mocks
    await setupDynamoDB()
  })

  test.describe('with Dog found in SKL', () => {
    test('to NOME-B / AVO', async ({ page }) => {
      const eventTitle = events.find((e) => e.id === 'test-event-1')?.name ?? 'evet-not-found'

      const searchPage = new SearchPage(page)

      await searchPage.navigateTo()
      await searchPage.filterByEventType('NOME-B')

      const registrationPage = await searchPage.navigateToRegistration(eventTitle)

      expect(registrationPage.submitButton).toBeDisabled()
      expect(await registrationPage.hasError()).toBeTruthy()

      await registrationPage.selectClass('AVO')

      await registrationPage.completeDogDetails({
        regNo: 'ALO/123',
        sire: 'Test Sire',
        dam: 'Test Dam',
        breeder: 'Test Breeder',
      })

      await registrationPage.fillOwnerDetails({
        name: 'Test Owner',
        city: 'Test Location',
        email: 'test@example.com',
        phone: '+16675664424',
        handles: true,
        pays: true,
      })

      const paymentPage = await registrationPage.submitRegistration()

      const registrationListPage = await paymentPage.payWithNordea()

      await registrationListPage.verifyRegistrationIsPaid()
    })
  })
})
