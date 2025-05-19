import type { JsonRegistration } from 'src/types'

import { expect, type Locator, type Page } from '@playwright/test'

import { BasicPage } from './BasicPage'

/**
 * Page object for the Registration page
 */
export class RegistrationPage extends BasicPage {
  readonly classSelect: Locator
  readonly dogRegNoInput: Locator
  readonly dogSireInput: Locator
  readonly dogDamInput: Locator

  readonly ownerHandlesSwitch: Locator
  readonly ownerPaysSwitch: Locator

  readonly termsCheckbox: Locator
  readonly submitButton: Locator
  readonly errorMessage: Locator

  private eventId: string | undefined
  private registrationId: string | undefined

  constructor(page: Page) {
    super(page)
    this.classSelect = page.getByTestId('Koeluokka')
    this.dogRegNoInput = page.getByRole('combobox', { name: 'Rekisterinumero' })
    this.dogSireInput = page.getByRole('textbox', { name: 'Isän tittelit ja nimi' })
    this.dogDamInput = page.getByRole('textbox', { name: 'Emän tittelit ja nimi' })
    this.ownerHandlesSwitch = page.getByRole('checkbox', { name: 'Omistaja ohjaa' })
    this.ownerPaysSwitch = page.getByRole('checkbox', { name: 'Omistaja maksaa' })
    this.termsCheckbox = page.getByRole('checkbox', { name: 'Hyväksyn ilmoittautumisen' })
    this.submitButton = page.getByRole('button', { name: 'Vahvista ja siirry maksamaan' })
    this.errorMessage = page.getByTestId('error-message')

    const url = page.url()
    const match = url.match(/\/event\/[^/]+\/([^/?#]+)/)
    this.eventId = match?.[1]
  }

  async selectClass(className: string): Promise<void> {
    await this.classSelect.click()
    await this.page.getByRole('option', { name: className }).click()
  }

  async fillOwnerDetails(details: {
    name: string
    city: string
    email: string
    phone: string
    handles: boolean
    pays: boolean
  }): Promise<void> {
    await this.fillFormFields({
      '#owner_name': details.name,
      '#owner_city': details.city,
      '#owner_email': details.email,
      '#owner_phone': details.phone,
    })

    await this.setSwitchState(this.ownerHandlesSwitch, details.handles)
    await this.setSwitchState(this.ownerPaysSwitch, details.handles)
  }

  async completeDogDetails(details: { regNo: string; sire: string; dam: string; breeder: string }): Promise<void> {
    await this.dogRegNoInput.fill(details.regNo)
    const [response] = await Promise.all([
      this.page.waitForResponse((res) => res.url().includes('/dog/')),
      this.page.getByRole('button', { name: 'Hae koiran tiedot' }).click(),
    ])

    const status = response.status()

    if (status !== 200) {
      throw new Error(`Unexpected Dog-API status code: ${status}`)
    }

    await this.dogSireInput.fill(details.sire)
    await this.dogDamInput.fill(details.dam)

    await this.fillFormFields({
      '#breeder_name': details.breeder,
      '#breeder_location': 'Test location',
    })
  }

  async acceptTerms(): Promise<void> {
    await this.termsCheckbox.check()
  }

  async submitRegistration(): Promise<void> {
    await this.acceptTerms()
    const [response] = await Promise.all([
      this.page.waitForResponse((response) => response.url().includes('/registration') && response.status() === 200),
      this.submitButton.click(),
    ])
    const reg: JsonRegistration = await response.json()
    this.registrationId = reg.id
    await this.page.waitForURL(`/p/${this.eventId}/${this.registrationId}`, { timeout: 5000 })
    await expect(this.page).toHaveURL(`/p/${this.eventId}/${this.registrationId}`)
  }

  async hasError(): Promise<boolean> {
    try {
      await this.waitForElement('[data-testid="error-message"]')
      return true
    } catch (error) {
      return false
    }
  }
}
