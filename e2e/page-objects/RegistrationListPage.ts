import { expect, type Locator, type Page } from 'playwright/test'

export class RegistrationListPage {
  // getByRole('heading', { name: 'Olen maksanut' })

  readonly page: Page

  readonly registrationIsPaid: Locator
  readonly toFrontPage: Locator

  constructor(page: Page) {
    this.page = page

    this.registrationIsPaid = page.getByRole('heading', { name: 'Olen maksanut' })
    this.toFrontPage = page.getByRole('link', { name: 'Etusivulle' })
  }

  async verifyRegistrationIsPaid(): Promise<void> {
    await expect(this.registrationIsPaid).toBeVisible()
  }

  async navigateToFrontPage(): Promise<void> {
    await this.toFrontPage.click()
  }
}
