import type { Locator, Page } from '@playwright/test'
import type { JsonConfirmedEvent, JsonDog, JsonUser } from '../../src/types'
import { expect } from '@playwright/test'

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
   * The content of a collapsible section of the form, once the section is open. The sections carry
   * no landmark role: the content is the MUI Collapse beside the section's toggle, and only a fully
   * open one counts. A closed section keeps its fields in the page, and while it closes they still
   * count as visible, so a looser locator fills a field the next moment hides (the breeder's and
   * owners' sections open only once there is a dog).
   */
  section(title: string): Locator {
    return this.page
      .getByRole('button', { exact: true, name: title })
      .locator('xpath=..')
      .locator(':scope > div > .MuiCollapse-entered')
  }

  /** The open section, or a failure that names the section when it does not open. */
  private async openSection(title: string) {
    const section = this.section(title)
    await expect(section, `the section "${title}" is not open`).toBeVisible()
    return section
  }

  async fetchDog(dog: Pick<JsonDog, 'name' | 'regNo'>) {
    await this.page.getByRole('combobox', { name: 'Rekisterinumero' }).fill(dog.regNo)
    await this.page.getByRole('button', { name: 'Hae koiran tiedot' }).click()
    await this.page.getByText(`${dog.regNo} - ${dog.name}`).waitFor()
  }

  async fillBreeder(name: string) {
    const section = await this.openSection('Kasvattajan tiedot')
    await section.getByRole('textbox', { name: 'Nimi' }).fill(name)
  }

  /** The owner, who by default also handles and pays. */
  async fillOwner(owner: Pick<JsonUser, 'email' | 'location' | 'name'>, phone: string) {
    const section = await this.openSection('Omistajien tiedot')
    await section.getByRole('textbox', { name: 'Nimi' }).fill(owner.name)
    await section.getByRole('textbox', { name: 'Kotikunta' }).fill(owner.location ?? '')
    await section.getByRole('textbox', { name: 'Sähköposti' }).fill(owner.email)
    await section.getByRole('textbox', { name: 'Puhelin' }).fill(phone)
  }

  async acceptTerms() {
    await this.page.getByRole('checkbox', { name: 'Hyväksyn ilmoittautumisen ehdot ja tietosuojaselosteen.' }).check()
  }

  /** What the form says is still missing, under "Miksi en voi siirtyä eteenpäin?", opened. */
  async missingInfo(): Promise<Locator> {
    const why = this.page.getByRole('button', { name: 'Miksi en voi siirtyä eteenpäin?' })
    if ((await why.getAttribute('aria-expanded')) !== 'true') await why.click()
    return this.page.getByTestId('missing-info').getByRole('listitem')
  }
}
