import { expect, test } from '@playwright/test'

import { events } from '../fixtures/events'
import { PaymentPage } from '../page-objects/PaymentPage'
import { RegistrationPage } from '../page-objects/RegistrationPage'
import { SearchPage } from '../page-objects/SearchPage'
import { setupApiMocks } from '../utils/mocks'

test.describe('End-to-end user flow', () => {
  test.beforeEach(async ({ page }) => {
    // Set up API mocks
    await setupApiMocks(page)
  })

  test('Complete registration flow from search to payment', async ({ page }) => {
    // Start from home page
    const searchPage = new SearchPage(page)
    await searchPage.navigateTo()

    // Search for an event
    await page.getByTestId('Tapahtumatyyppi').getByRole('combobox').click()
    await page.locator('#menu-').getByText('NOME-B').click()

    expect(await searchPage.hasResults()).toBeTruthy()

    // Select the first event from search results
    const event = events.find((e) => e.eventType === 'NOME-B')
    await searchPage.navigateToRegistration(event!.name)

    // Fill in the registration form
    const registrationPage = new RegistrationPage(page)

    await registrationPage.selectClass('ALO')
    await registrationPage.completeDogDetails({
      regNo: 'NOU/123',
      sire: 'Test Sire',
      dam: 'Test Dam',
      breeder: 'Test Breeder',
    })

    await registrationPage.fillOwnerDetails({
      name: 'John Doe',
      city: 'Test City',
      email: 'john@example.com',
      phone: '040123456',
      handles: true,
      pays: true,
    })

    // Submit the registration
    await registrationPage.submitRegistration()

    // Verify we're redirected to the payment page
    await expect(page).toHaveURL(/.*\/p\/.*\/.*/)

    // Complete the payment
    const paymentPage = new PaymentPage(page)
    await paymentPage.selectPaymentMethod('bank')
    await paymentPage.confirmPayment()

    // Verify payment success
    await expect(page).toHaveURL(/.*\/p\/success.*/)
    expect(await paymentPage.isPaymentSuccessful()).toBeTruthy()

    // Return to event page
    await paymentPage.returnToEvent()

    // Verify we're back on the event page
    await expect(page).toHaveURL(/.*\/event\/.*/)
  })

  test('Search, register, and cancel payment flow', async ({ page }) => {
    const searchPage = new SearchPage(page)
    await searchPage.navigateTo()
    expect(await searchPage.hasResults()).toBeTruthy()

    // Select the first event from search results
    const eventTitle = events.find((e) => e.eventType === 'retriever')?.name
    await searchPage.navigateToRegistration(eventTitle!)

    // Verify we're on the event details page
    await expect(page).toHaveURL(/.*\/event\/.*/)

    // Click the register button
    await page.getByText('Register').click()

    // Verify we're on the registration page
    await expect(page).toHaveURL(/.*\/register.*/)

    // Fill in the registration form
    const registrationPage = new RegistrationPage(page)

    // Select a class
    await registrationPage.selectClass('Intermediate')

    // Submit the registration
    await registrationPage.submitRegistration()

    // Verify we're redirected to the payment page
    await expect(page).toHaveURL(/.*\/p\/.*\/registration-id/)

    // Cancel the payment
    const paymentPage = new PaymentPage(page)
    await paymentPage.cancelPayment()

    // Verify we're back on the event page
    await expect(page).toHaveURL(/.*\/event\/.*/)
  })

  test('Handle validation errors during registration flow', async ({ page }) => {
    const searchPage = new SearchPage(page)
    await searchPage.navigateTo()

    await searchPage.filterByEventType('NOME-B')
    const eventTitle = events.find((e) => e.eventType === 'agility')?.name
    await searchPage.navigateToRegistration(eventTitle!)

    // Try to submit without filling any fields
    const registrationPage = new RegistrationPage(page)
    await registrationPage.submitButton.click()

    // Verify error messages are displayed
    expect(await registrationPage.hasError()).toBeTruthy()

    // Select a class
    await registrationPage.selectClass('Class A')

    // Submit the registration
    await registrationPage.submitRegistration()

    // Verify we're redirected to the payment page
    await expect(page).toHaveURL(/.*\/p\/.*\/registration-id/)
  })
})
