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
   * year by itself. Done once the filter has the date (its `s` or `e` in the url): the range passes
   * it on after a 100 ms debounce, and a field cleared before that has no held date to empty to.
   */
  private async typeDate(field: 'Tapahtumat alkaen' | 'Tapahtumat päättyen', isoDay: string) {
    const [year, month, day] = isoDay.split('-')
    const group = this.filters.getByRole('group', { name: field })
    // Typed into a field that holds a date, every key changes a whole date the range checks: 31
    // into a 30-day month is refused (the field ends on 03), a held 1st reads 01 as 10, and the end
    // field takes nothing before the start. So the field is emptied first and the date typed into
    // the empty field, where it is whole only when its year is.
    await group.getByRole('spinbutton', { name: 'Vuosi' }).click()
    await this.page.keyboard.press('Backspace')
    // The range empties the whole field once its 100 ms debounce has passed; typing sooner races it.
    await expect(group.getByRole('spinbutton', { name: 'Päivä' })).toHaveText('PP')
    await group.getByRole('spinbutton', { name: 'Päivä' }).click()
    await this.page.keyboard.type(`${day}${month}${year}`)
    await expect(group).toContainText(`${day}.${month}.${year}`)
    const param = field === 'Tapahtumat alkaen' ? 's' : 'e'
    await expect(this.page).toHaveURL(new RegExp(`[?&]${param}=${isoDay}(&|$)`))
  }

  setStartDate(offsetDays: number) {
    return this.typeDate('Tapahtumat alkaen', helsinkiDay(offsetDays))
  }

  /** The start date as a fixed yyyy-MM-dd, for a test that must not depend on today's date. */
  setStartDay(isoDay: string) {
    return this.typeDate('Tapahtumat alkaen', isoDay)
  }

  /** The end date as a fixed yyyy-MM-dd, for a test that must not depend on today's date. */
  setEndDay(isoDay: string) {
    return this.typeDate('Tapahtumat päättyen', isoDay)
  }

  setEndDate(offsetDays: number) {
    return this.typeDate('Tapahtumat päättyen', helsinkiDay(offsetDays))
  }

  async setEntryOpen(on: boolean) {
    await this.filters.getByRole('switch', { name: 'Ilmoittautuminen auki' }).setChecked(on)
  }

  async openEvent(event: Pick<JsonConfirmedEvent, 'name'>) {
    await this.event(event).getByRole('link', { name: 'Ilmoittaudu' }).click()
  }
}
