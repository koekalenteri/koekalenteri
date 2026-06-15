import type { Locator, Page } from '@playwright/test'

import { RegistrationPage } from './RegistrationPage'

/**
 * Page object for the Search page
 */
export class SearchPage {
  readonly page: Page
  readonly filterAccordion: Locator
  readonly filterAccordionSummary: Locator
  readonly dateRangeStart: Locator
  readonly dateRangeEnd: Locator
  readonly eventTypeFilter: Locator
  readonly eventClassFilter: Locator
  readonly organizerFilter: Locator
  readonly judgeFilter: Locator
  readonly entryOpenSwitch: Locator
  readonly entryUpcomingSwitch: Locator
  readonly eventList: Locator
  readonly noResultsMessage: Locator

  /**
   * Constructor for SearchPage
   * @param page - Playwright Page object
   */
  constructor(page: Page) {
    this.page = page
    this.filterAccordion = page.locator('nav').locator('div[role="region"]').first()
    this.filterAccordionSummary = page.locator('div[role="button"]').filter({ hasText: /filter/ })
    this.dateRangeStart = page.getByLabel(/daterangeStart/i)
    this.dateRangeEnd = page.getByLabel(/daterangeEnd/i)
    this.eventTypeFilter = page.getByRole('combobox', { name: 'Tapahtumatyyppi' })
    this.eventClassFilter = page.getByLabel(/filter.eventClass/i)
    this.organizerFilter = page.getByLabel(/filter.organizer/i)
    this.judgeFilter = page.getByLabel(/judge/i)
    this.entryOpenSwitch = page.getByLabel(/entryOpen/i)
    this.entryUpcomingSwitch = page.getByLabel(/entryUpcoming/i)
    this.eventList = page.locator('article')
    this.noResultsMessage = page.getByText(/noResults/i)
  }

  /**
   * Navigates to the search page
   */
  async navigateTo(): Promise<void> {
    await this.page.goto('/')
    // Wait for the filter accordion to be visible
    await this.filterAccordion.waitFor({ state: 'visible' })
  }

  /**
   * Filters events by event type
   * @param eventType - Event type to filter by
   */
  async filterByEventType(eventType: string): Promise<void> {
    await this.eventTypeFilter.click()
    await this.page.locator('li').filter({ hasText: eventType }).click()
  }

  /**
   * Filters events by date range
   * @param startDate - Start date in format YYYY-MM-DD
   * @param endDate - End date in format YYYY-MM-DD
   */
  async filterByDateRange(startDate?: string, endDate?: string): Promise<void> {
    // Expand filter accordion if collapsed
    if ((await this.filterAccordionSummary.getAttribute('aria-expanded')) === 'false') {
      await this.filterAccordionSummary.click()
    }

    if (startDate) {
      await this.dateRangeStart.fill(startDate)
    }

    if (endDate) {
      await this.dateRangeEnd.fill(endDate)
    }

    // Click outside to trigger the filter
    await this.page.keyboard.press('Tab')

    // Wait for the API response
    await this.page.waitForResponse((response) => response.url().includes('/events') && response.status() === 200)
  }

  /**
   * Toggles the "Entry Open" filter
   * @param checked - Whether the filter should be checked or not
   */
  async toggleEntryOpenFilter(checked: boolean): Promise<void> {
    // Expand filter accordion if collapsed
    if ((await this.filterAccordionSummary.getAttribute('aria-expanded')) === 'false') {
      await this.filterAccordionSummary.click()
    }

    const isChecked = await this.entryOpenSwitch.isChecked()
    if (isChecked !== checked) {
      await this.entryOpenSwitch.click()

      // Wait for the API response
      await this.page.waitForResponse((response) => response.url().includes('/events') && response.status() === 200)
    }
  }

  /**
   * Selects an event from the search results
   * @param eventName - Name of the event to select
   */
  async navigateToRegistration(eventName: string): Promise<RegistrationPage> {
    await this.page.getByRole('heading', { name: eventName }).getByRole('link').click()
    await this.page.waitForURL(/.*\/event\/.*/)

    return new RegistrationPage(this.page)
  }

  /**
   * Checks if any events are found in the search results
   */
  async hasResults(): Promise<boolean> {
    try {
      // Wait for the event list to be visible
      await this.eventList.first().waitFor({ state: 'visible', timeout: 5000 })
      const count = await this.eventList.count()
      return count > 0
    } catch (error) {
      return false
    }
  }

  /**
   * Checks if the no results message is displayed
   */
  async hasNoResultsMessage(): Promise<boolean> {
    try {
      await this.noResultsMessage.waitFor({ state: 'visible', timeout: 5000 })
      return true
    } catch (error) {
      return false
    }
  }
}
