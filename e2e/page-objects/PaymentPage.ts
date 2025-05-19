import type { Locator, Page } from '@playwright/test'

import { waitForElement } from '../utils/helpers'

/**
 * Page object for the Payment page
 */
export class PaymentPage {
  readonly page: Page
  readonly eventTitle: Locator
  readonly paymentAmount: Locator
  readonly bankTransferOption: Locator
  readonly cardPaymentOption: Locator
  readonly mobilePayOption: Locator
  readonly confirmPaymentButton: Locator
  readonly cancelButton: Locator
  readonly paymentSuccessMessage: Locator
  readonly paymentErrorMessage: Locator
  readonly returnToEventButton: Locator

  /**
   * Constructor for PaymentPage
   * @param page - Playwright Page object
   */
  constructor(page: Page) {
    this.page = page
    this.eventTitle = page.getByTestId('event-title')
    this.paymentAmount = page.getByTestId('payment-amount')
    this.bankTransferOption = page.getByTestId('payment-method-bank')
    this.cardPaymentOption = page.getByTestId('payment-method-card')
    this.mobilePayOption = page.getByTestId('payment-method-mobile')
    this.confirmPaymentButton = page.getByTestId('confirm-payment')
    this.cancelButton = page.getByTestId('cancel-payment')
    this.paymentSuccessMessage = page.getByTestId('payment-success')
    this.paymentErrorMessage = page.getByTestId('payment-error')
    this.returnToEventButton = page.getByTestId('return-to-event')
  }

  /**
   * Navigates to the payment page for a specific registration
   * @param eventId - ID of the event
   * @param registrationId - ID of the registration
   */
  async navigateTo(eventId: string, registrationId: string): Promise<void> {
    await this.page.goto(`/p/${eventId}/${registrationId}`)
    // Wait for a specific element instead of networkidle
    await this.paymentAmount.waitFor({ state: 'visible', timeout: 5000 })
  }

  /**
   * Selects a payment method
   * @param method - Payment method to select ('bank', 'card', or 'mobile')
   */
  async selectPaymentMethod(method: 'bank' | 'card' | 'mobile'): Promise<void> {
    await waitForElement(this.page, '[data-testid="payment-amount"]')

    switch (method) {
      case 'bank':
        await this.bankTransferOption.click()
        break
      case 'card':
        await this.cardPaymentOption.click()
        break
      case 'mobile':
        await this.mobilePayOption.click()
        break
      default:
        throw new Error(`Unsupported payment method: ${method}`)
    }
  }

  /**
   * Confirms the payment
   */
  async confirmPayment(): Promise<void> {
    await this.confirmPaymentButton.click()

    // Wait for the payment processing to complete and redirect
    await this.page.waitForResponse((response) => response.url().includes('/payment') && response.status() === 200)

    // Wait for navigation to the success page
    await this.page.waitForURL(/.*\/p\/success.*/)
  }

  /**
   * Cancels the payment
   */
  async cancelPayment(): Promise<void> {
    await this.cancelButton.click()

    // Wait for navigation back to the event page
    await this.page.waitForURL(/.*\/event\/.*/)
  }

  /**
   * Completes the entire payment process
   * @param method - Payment method to use
   */
  async completePayment(method: 'bank' | 'card' | 'mobile'): Promise<void> {
    await this.selectPaymentMethod(method)
    await this.confirmPayment()
  }

  /**
   * Checks if the payment was successful
   */
  async isPaymentSuccessful(): Promise<boolean> {
    try {
      await waitForElement(this.page, '[data-testid="payment-success"]')
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Checks if there's a payment error
   */
  async hasPaymentError(): Promise<boolean> {
    try {
      await waitForElement(this.page, '[data-testid="payment-error"]')
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Gets the payment amount
   */
  async getPaymentAmount(): Promise<string | null> {
    await waitForElement(this.page, '[data-testid="payment-amount"]')
    return this.paymentAmount.textContent()
  }

  /**
   * Returns to the event page after payment
   */
  async returnToEvent(): Promise<void> {
    await this.returnToEventButton.click()
    await this.page.waitForURL(/.*\/event\/.*/)
  }
}
