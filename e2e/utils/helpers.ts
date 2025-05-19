import type { Page } from '@playwright/test'

import { expect } from '@playwright/test'

/**
 * Helper functions for Playwright tests
 */

/**
 * Waits for navigation to complete and verifies the URL
 * @param page - Playwright Page object
 * @param urlPattern - URL pattern to verify after navigation
 */
export const waitForNavigation = async (page: Page, urlPattern: RegExp | string): Promise<void> => {
  if (typeof urlPattern === 'string') {
    urlPattern = new RegExp(urlPattern)
  }

  await page.waitForURL(urlPattern)
  await expect(page).toHaveURL(urlPattern)
}

/**
 * Fills a form field with the given value
 * @param page - Playwright Page object
 * @param selector - Field selector
 * @param value - Value to fill
 */
export const fillFormField = async (page: Page, selector: string, value: string): Promise<void> => {
  await page.locator(selector).fill(value)
}

/**
 * Fills multiple form fields at once
 * @param page - Playwright Page object
 * @param fields - Object with field selectors as keys and values to fill
 */
export const fillFormFields = async (page: Page, fields: Record<string, string>): Promise<void> => {
  for (const [selector, value] of Object.entries(fields)) {
    await fillFormField(page, selector, value)
  }
}

/**
 * Waits for an element to be visible and verifies its presence
 * @param page - Playwright Page object
 * @param selector - Element selector
 */
export const waitForElement = async (page: Page, selector: string): Promise<void> => {
  await page.locator(selector).waitFor({ state: 'visible' })
  await expect(page.locator(selector)).toBeVisible()
}

/**
 * Clicks an element and optionally waits for navigation
 * @param page - Playwright Page object
 * @param selector - Element selector
 * @param waitForUrl - Optional URL pattern to wait for after clicking
 */
export const clickElement = async (page: Page, selector: string, waitForUrl?: RegExp | string): Promise<void> => {
  await page.locator(selector).click()

  if (waitForUrl) {
    await waitForNavigation(page, waitForUrl)
  }
}

/**
 * Selects an option from a dropdown
 * @param page - Playwright Page object
 * @param selector - Dropdown selector
 * @param value - Value to select
 */
export const selectOption = async (page: Page, selector: string, value: string): Promise<void> => {
  await page.locator(selector).selectOption(value)
}

/**
 * Waits for a specified amount of time (use sparingly)
 * @param ms - Milliseconds to wait
 */
export const wait = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Takes a screenshot and saves it with a timestamp
 * @param page - Playwright Page object
 * @param name - Screenshot name
 */
export const takeScreenshot = async (page: Page, name: string): Promise<void> => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  await page.screenshot({ path: `./screenshots/${name}-${timestamp}.png` })
}
