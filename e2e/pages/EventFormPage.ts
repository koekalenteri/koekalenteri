import type { Locator, Page } from '@playwright/test'
import type { JsonUser, Organizer } from '../../src/types'

/** The secretary's event form, `/admin/event/create` and `/admin/event/edit/<id>`. */
export class EventFormPage {
  readonly page: Page
  readonly save: Locator

  constructor(page: Page) {
    this.page = page
    this.save = page.getByRole('button', { name: 'Tallenna' })
  }

  async gotoCreate() {
    await this.page.goto('/admin/event/create')
    await this.page.getByRole('combobox', { name: 'Tyyppi' }).waitFor()
  }

  /** Picks an option of an autocomplete or a select by its label and the option's text. */
  async pick(field: string, option: string) {
    await this.page.getByRole('combobox', { exact: true, name: field }).click()
    await this.page.getByRole('option', { exact: true, name: option }).click()
  }

  /** What a draft needs: the type, NOU unless told, the organizer and the secretary, plus a name to find it by. */
  async fillDraft({
    eventType = 'NOU',
    name,
    organizer,
    secretary,
  }: {
    eventType?: string
    name: string
    organizer: Organizer
    secretary: JsonUser
  }) {
    await this.pick('Tyyppi', eventType)
    await this.page.getByRole('textbox', { name: 'Nimi (Suomeksi)' }).fill(name)
    await this.pick('Järjestäjä', organizer.name)
    await this.pick('Koesihteeri', secretary.name)
  }

  /**
   * An own class of an unofficial trial (KOE-674), added at the end of the list: its code and its
   * Finnish name. A one-day trial runs it on its day at once.
   */
  async addOwnClass(code: string, name: string) {
    await this.page.getByRole('button', { name: 'Lisää oma luokka' }).click()
    await this.page.getByRole('textbox', { name: 'Koodi' }).last().fill(code)
    await this.page.getByRole('textbox', { name: 'Nimi (suomi)' }).last().fill(name)
  }

  /** What publishing adds on top of a draft for a NOU trial, or with `judgeField` for an unofficial one. */
  async fillForPublishing({ judgeField = 'Ylituomari', official }: { judgeField?: string; official: JsonUser }) {
    await this.pick('Tila', 'Julkaistu')
    const location = this.page.getByRole('combobox', { name: 'Paikkakunta' })
    await location.fill('Tampere')
    await location.press('Enter')
    await this.pick('Vastaava koetoimitsija', official.name)
    // An official trial asks for its chief judge, an unofficial one for its judges by number.
    await this.pick(judgeField, 'Tuomari 1')
    await this.page.getByRole('textbox', { name: 'Koepaikkojen määrä' }).fill('20')
    await this.page.getByRole('textbox', { exact: true, name: 'Osallistumismaksu Hinta' }).fill('50')
    // The secretary's email is the contact shown; the official's checkbox comes first.
    await this.page.getByRole('checkbox', { name: 'Sähköposti' }).last().check()
  }
}
