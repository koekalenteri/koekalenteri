import type { Page } from '@playwright/test'

import { dogs } from '../fixtures/dogs'
import { events } from '../fixtures/events'
import { registrations } from '../fixtures/registrations'

// API base URL from the application
// When running locally, this will be loaded from the .env file in the project root
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? 'http://127.0.0.1:8080'
console.log('- Using API_BASE_URL:', API_BASE_URL)

/**
 * Sets up API mocks for Playwright tests
 * @param page - Playwright Page object
 */
export const setupApiMocks = async (page: Page) => {
  const { nanoid } = await import('nanoid')

  console.log('Setting up API mocks with base URL:', API_BASE_URL)

  // Enable request logging to debug which API calls are being made
  page.on('request', (request) => {
    if (request.url().includes(API_BASE_URL)) {
      console.log(`Request: ${request.method()} ${request.url()}`)
    }
  })

  // Enable response logging to debug mock responses
  page.on('response', (response) => {
    if (response.url().includes(API_BASE_URL)) {
      console.log(`Response: ${response.status()} ${response.url()}`)
    }
  })

  // Mock API responses for events - using correct endpoint from src/api/event.ts
  await page.route(`${API_BASE_URL}/event/`, async (route) => {
    // console.log('Mocking GET /event/ endpoint')
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(events),
    })
  })

  // Mock API response for a single event - using correct endpoint from src/api/event.ts
  await page.route(new RegExp(`${API_BASE_URL}/event/([^/]+)$`), async (route) => {
    const url = route.request().url()
    const eventId = url.split('/').pop()
    console.log(`Mocking GET /event/${eventId} endpoint`)
    const event = events.find((e) => e.id === eventId)

    if (event) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(event),
      })
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Event not found' }),
    })
  })

  // Mock registration API - using correct endpoint from src/api/registration.ts
  await page.route(`${API_BASE_URL}/registration/`, async (route) => {
    const request = route.request()
    console.log(`Mocking ${request.method()} /registration/ endpoint`)

    if (request.method() === 'POST') {
      const data = request.postDataJSON()
      const id = nanoid(10)
      registrations[id] = { ...data, id }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(registrations[id]),
      })
    }
  })

  // Mock specific registration endpoint
  await page.route(new RegExp(`${API_BASE_URL}/registration/([^/]+)/([^/]+)$`), async (route) => {
    const url = route.request().url()
    const parts = url.split('/')
    const eventId = parts[parts.length - 2]
    const regId = parts[parts.length - 1]

    console.log(`Mocking GET /registration/${eventId}/${regId} endpoint`)

    const registration = registrations[regId]

    if (registration && registration.eventId === eventId) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(registration),
      })
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Registration not found' }),
    })
  })

  // Mock payment API - using correct endpoint from src/api/payment.ts
  /*
  await page.route(`${API_BASE_URL}/payment/create`, async (route) => {
    console.log('Mocking POST /payment/create endpoint')
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(paymentProviderResponse),
    })
  })
  */

  // Mock payment verify endpoint
  await page.route(`${API_BASE_URL}/payment/verify`, async (route) => {
    console.log('Mocking POST /payment/verify endpoint')
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        status: 'paid',
        transactionId: 'txn_test_123',
      }),
    })
  })

  // Mock payment success callback
  await page.route('**/p/success**', async (route) => {
    console.log('Handling payment success callback')
    return route.continue()
  })

  // Mock startlist endpoint
  await page.route(new RegExp(`${API_BASE_URL}/startlist/([^/]+)$`), async (route) => {
    const url = route.request().url()
    const eventId = url.split('/').pop()
    console.log(`Mocking GET /startlist/${eventId} endpoint`)

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(registrations),
    })
  })

  // Mock user authentication
  await page.route(`${API_BASE_URL}/user`, async (route) => {
    console.log('Mocking GET /user endpoint')
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'test-user-1',
        name: 'Test User',
        email: 'test@example.com',
        isAuthenticated: true,
      }),
    })
  })

  // Mock getDog API - using correct endpoint from src/api/dog.ts
  await page.route(new RegExp(`${API_BASE_URL}/dog/([^/]+)`), async (route) => {
    const url = route.request().url()
    const regNoEncoded = url.split('/').pop()?.split('?')[0]
    const regNo = regNoEncoded?.replace('~', '/')

    console.log(`Mocking GET /dog/${regNoEncoded} endpoint for dog ${regNo}`)

    if (regNo && dogs[regNo]) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(dogs[regNo]),
      })
    }

    // If no specific mock is found, return 404 with error message
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Upstream error: not found' }),
    })
  })

  console.log('API mocks setup complete')
}

/**
 * Clears all API mocks
 * @param page - Playwright Page object
 */
export const clearApiMocks = async (page: Page) => {
  console.log('Clearing all API mocks')
  await page.unrouteAll()
}
