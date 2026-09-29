import type { Page } from '@playwright/test'

type BankOutcome = 'Maksa' | 'Peruuta' | 'Väärennetty paluu'

/**
 * The payment step: `/p/<eventId>/<registrationId>/...` lists the methods Paytrail returned, and
 * the fake bank (e2e/fakes) stands in for the provider's page.
 */
export class PaymentPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** The registration the payment page is for, read from its address. */
  async registrationKey() {
    await this.page.waitForURL(/\/p\/[^/]+\/[^/]+\//)
    const [, , eventId, id] = new URL(this.page.url()).pathname.split('/')
    return { eventId, id }
  }

  async payAtBank(outcome: BankOutcome) {
    await this.page.getByRole('heading', { name: 'Valitse maksutapa' }).waitFor()
    await this.page.getByRole('button', { name: 'E2E-pankki' }).click()
    await this.page.getByRole('heading', { name: 'E2E-pankki' }).waitFor()
    await this.page.getByRole('button', { name: outcome }).click()
  }
}
