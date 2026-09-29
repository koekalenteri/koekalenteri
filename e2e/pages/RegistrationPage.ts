import type { Locator, Page } from '@playwright/test'
import type { JsonConfirmedEvent, JsonDog, JsonUser } from '../../src/types'

/** The public registration form of one event, `/event/<type>/<id>`. */
export class RegistrationPage {
  readonly page: Page
  readonly submit: Locator

  constructor(page: Page) {
    this.page = page
    this.submit = page.getByRole('button', { name: 'Vahvista ja siirry maksamaan' })
  }

  async goto(event: Pick<JsonConfirmedEvent, 'eventType' | 'id'>) {
    await this.page.goto(`/event/${event.eventType}/${event.id}`)
    await this.page.getByRole('combobox', { name: 'Rekisterinumero' }).waitFor()
  }

  /**
   * A collapsible section of the form. The sections carry no landmark role, so this is the
   * innermost element that holds both the section's toggle and a text field.
   */
  section(title: string): Locator {
    return this.page
      .locator('div')
      .filter({ has: this.page.getByRole('button', { exact: true, name: title }) })
      .filter({ has: this.page.getByRole('textbox') })
      .last()
  }

  async fetchDog(dog: Pick<JsonDog, 'name' | 'regNo'>) {
    await this.page.getByRole('combobox', { name: 'Rekisterinumero' }).fill(dog.regNo)
    await this.page.getByRole('button', { name: 'Hae koiran tiedot' }).click()
    await this.page.getByText(`${dog.regNo} - ${dog.name}`).waitFor()
  }

  async fillBreeder(name: string) {
    await this.section('Kasvattajan tiedot').getByRole('textbox', { name: 'Nimi' }).fill(name)
  }

  /** The owner, who by default also handles and pays. */
  async fillOwner(owner: Pick<JsonUser, 'email' | 'location' | 'name'>, phone: string) {
    const section = this.section('Omistajien tiedot')
    await section.getByRole('textbox', { name: 'Nimi' }).fill(owner.name)
    await section.getByRole('textbox', { name: 'Kotikunta' }).fill(owner.location ?? '')
    await section.getByRole('textbox', { name: 'Sähköposti' }).fill(owner.email)
    await section.getByRole('textbox', { name: 'Puhelin' }).fill(phone)
  }

  async acceptTerms() {
    await this.page.getByRole('checkbox', { name: 'Hyväksyn ilmoittautumisen ehdot ja tietosuojaselosteen.' }).check()
  }
}
