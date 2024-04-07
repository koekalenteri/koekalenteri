export interface CreatePaymentResponse {
  transactionId: string
  href: string
  terms: string
  groups: PaymentMethodGroupData[]
  reference: string
  providers: Provider[]
  customProviders: object
}

export interface GetPaymentResponse {
  transactionId: string
  status: 'new' | 'ok' | 'fail' | 'pending' | 'delayed'
  amount: number
  currency: string
  stamp: string
  reference: string
  createdAt: string
  href: string
  provider: string
  filingCode: string
  paidAt: string
  settlementReference: string
}

export interface RefundPaymentResponse {
  provider: string
  status: 'pending' | 'ok' | 'fail'
  transactionId: string
}

export interface VerifyPaymentResponse {
  status: 'ok' | 'error'
  paymentStatus?: GetPaymentResponse['status']
  eventId?: string
  registrationId?: string
}

export interface Provider {
  /**
   * Form target URL. Use POST as method.
   */
  url: string
  /**
   * URL to PNG version of the provider icon
   */
  icon: string
  /**
   * URL to SVG version of the provider icon. Using the SVG icon is preferred.
   */
  svg: string
  /**
   * Provider group. Provider groups allow presenting same type of providers in separate groups which usually makes it easier for the customer to select a payment method.
   */
  group: PaymentMethodGroup
  /**
   * Display name of the provider.
   */
  name: string
  /**
   * 	ID of the provider
   */
  id: string
  /**
   * Array of form fields
   */
  parameters: FormField[]
}

export interface FormField {
  name: string
  value: string
}

export type PaymentMethodGroup = 'mobile' | 'bank' | 'creditcard' | 'credit'

export interface PaymentMethodGroupData {
  /**
   * ID of the group
   */
  id: PaymentMethodGroup
  /**
   * Localized name of the group
   */
  name: string
  /**
   * URL to PNG version of the group icon
   */
  icon: string
  /**
   * URL to SVG version of the group icon. Using the SVG icon is preferred.
   */
  svg: string
}
