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

  /** What a draft needs: the type, the organizer and the secretary, plus a name to find it by. */
  async fillDraft({ name, organizer, secretary }: { name: string; organizer: Organizer; secretary: JsonUser }) {
    await this.pick('Tyyppi', 'NOU')
    await this.page.getByRole('textbox', { name: 'Nimi (Suomeksi)' }).fill(name)
    await this.pick('Järjestäjä', organizer.name)
    await this.pick('Koesihteeri', secretary.name)
  }

  /** What publishing adds on top of a draft for a NOU trial. */
  async fillForPublishing({ official }: { official: JsonUser }) {
    await this.pick('Tila', 'Julkaistu')
    const location = this.page.getByRole('combobox', { name: 'Paikkakunta' })
    await location.fill('Tampere')
    await location.press('Enter')
    await this.pick('Vastaava koetoimitsija', official.name)
    await this.pick('Ylituomari', 'Tuomari 1')
    await this.page.getByRole('textbox', { name: 'Koepaikkojen määrä' }).fill('20')
    await this.page.getByRole('textbox', { exact: true, name: 'Osallistumismaksu Hinta' }).fill('50')
    // The secretary's email is the contact shown; the official's checkbox comes first.
    await this.page.getByRole('checkbox', { name: 'Sähköposti' }).last().check()
  }
}
