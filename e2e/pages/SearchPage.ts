import type { Locator, Page } from '@playwright/test'
import type { JsonConfirmedEvent } from '../../src/types'
import { expect } from '@playwright/test'
import { helsinkiDay } from '../fixtures/dates'

/** The public front page: the filter bar and the event list under it. */
export class SearchPage {
  readonly page: Page
  readonly filters: Locator
  readonly emptyResult: Locator

  constructor(page: Page) {
    this.page = page
    this.filters = page.getByRole('navigation').getByRole('region')
    this.emptyResult = page.getByText('Tekemälläsi haulla ei löytynyt tapahtumia')
  }

  async goto() {
    await this.page.goto('/')
    await this.filters.waitFor()
  }

  /** The event's row in the list, found by its name, which carries the event's unique id. */
  event(event: Pick<JsonConfirmedEvent, 'name'>): Locator {
    return this.page.getByRole('article').filter({ hasText: event.name })
  }

  async selectEventType(eventType: string) {
    await this.filters.getByRole('combobox', { name: 'Tapahtumatyyppi' }).click()
    // includeHidden: the options sit inside an aria-hidden ancestor (SelectMulti, disablePortal), KOE-1480
    await this.page.getByRole('option', { exact: true, includeHidden: true, name: eventType }).click()
    await this.page.keyboard.press('Escape')
  }

  /**
   * Types a date into a range field as a keyboard user would: the field moves from day to month to
   * year by itself. Keys come 250 ms apart, a person's pace; at 100 ms or less the range's 100 ms
   * debounce drops a date typed over an earlier one.
   */
  private async typeDate(field: 'Tapahtumat alkaen' | 'Tapahtumat päättyen', offsetDays: number) {
    const [year, month, day] = helsinkiDay(offsetDays).split('-')
    const group = this.filters.getByRole('group', { name: field })
    await group.getByRole('spinbutton', { name: 'Päivä' }).click()
    await this.page.keyboard.type(`${day}${month}${year}`, { delay: 250 })
    await expect(group).toContainText(`${day}.${month}.${year}`)
  }

  setStartDate(offsetDays: number) {
    return this.typeDate('Tapahtumat alkaen', offsetDays)
  }

  setEndDate(offsetDays: number) {
    return this.typeDate('Tapahtumat päättyen', offsetDays)
  }

  async setEntryOpen(on: boolean) {
    await this.filters.getByRole('switch', { name: 'Ilmoittautuminen auki' }).setChecked(on)
  }

  async openEvent(event: Pick<JsonConfirmedEvent, 'name'>) {
    await this.event(event).getByRole('link', { name: 'Ilmoittaudu' }).click()
  }
}
