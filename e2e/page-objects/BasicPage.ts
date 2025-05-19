import type { Locator } from '@playwright/test'

import { expect, type Page } from '@playwright/test'

export class BasicPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async fillFormField(selector: string, value: string): Promise<void> {
    await this.page.locator(selector).fill(value)
  }

  async fillFormFields(fields: Record<string, string>): Promise<void> {
    for (const [selector, value] of Object.entries(fields)) {
      await this.fillFormField(selector, value)
    }
  }

  async setSwitchState(locator: Locator, state: boolean): Promise<void> {
    const checked = await locator.isChecked()
    if (checked !== state) {
      await locator.click()
    }
  }

  async waitForElement(selector: string): Promise<void> {
    await this.page.locator(selector).waitFor({ state: 'visible' })
    await expect(this.page.locator(selector)).toBeVisible()
  }
}
