import type { Locator, Page } from '@playwright/test'

import { expect } from '@playwright/test'

export class BasicPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async fillFormField(selector: string, value: string): Promise<void> {
    const field = this.page.locator(selector)
    await field.fill(value)
    const type = await field.getAttribute('type')
    if (type === 'tel') {
      const phone = await field.getAttribute('value')
      await expect(value).toContain(phone?.replaceAll(' ', ''))
    } else {
      await expect(field).toHaveValue(value)
    }
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
    const el = this.page.locator(selector).first()
    await el.waitFor({ state: 'visible' })
    await expect(el).toBeVisible()
  }
}
