import type { Locator, Page } from '@playwright/test'

import { RegistrationListPage } from './RegistrationListPage'

/**
 * Page object for the Payment page
 */
export class PaymentPage {
  readonly page: Page
  readonly pageTitle: Locator
  readonly nordeaPayment: Locator
  readonly nordeaConfirmButton: Locator
  readonly nordeaCancelButton: Locator

  /**
   * Constructor for PaymentPage
   * @param page - Playwright Page object
   */
  constructor(page: Page) {
    this.page = page

    this.pageTitle = page.getByRole('heading', { name: 'Valitse maksutapa' })
    this.nordeaPayment = page.getByRole('button', { name: 'Nordea' })
    this.nordeaConfirmButton = page.getByRole('link', { name: 'Palauta hyväksytty maksu' })
    this.nordeaCancelButton = page.getByRole('link', { name: 'Palauta epäonnistunut maksu' })
  }

  /**
   * Navigates to the payment page for a specific registration
   * @param eventId - ID of the event
   * @param registrationId - ID of the registration
   */
  async navigateTo(eventId: string, registrationId: string): Promise<void> {
    await this.page.goto(`/p/${eventId}/${registrationId}`)
    await this.pageTitle.waitFor({ state: 'visible', timeout: 5000 })
  }

  async payWithNordea(): Promise<RegistrationListPage> {
    await this.nordeaPayment.click()
    await this.nordeaConfirmButton.click()
    await this.page.waitForResponse((response) => response.url().includes('/payment') && response.status() === 200)
    await this.page.pause()
    await this.page.waitForURL(/.*\/p\/success.*/)

    return new RegistrationListPage(this.page)
  }
}
