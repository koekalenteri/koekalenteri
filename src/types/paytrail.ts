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
  editToken?: string
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

interface FormField {
  name: string
  value: string
}

export type PaymentMethodGroup = 'mobile' | 'bank' | 'creditcard' | 'credit'

interface PaymentMethodGroupData {
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

export interface PaymentItem {
  /**
   * Price per unit, in each country's minor unit, e.g. for Euros use cents.
   * By default price should include VAT, unless usePricesWithoutVat is set to true.
   * No negative values accepted. Maximum value of 2147483647, minimum value is 0.
   */
  unitPrice: number
  /**
   * Quantity, how many items ordered. Negative values are not supported.
   */
  units: number
  /**
   * VAT percentage
   */
  vatPercentage: number
  /**
   * Merchant product code. May appear on invoices of certain payment methods. Maximum of 100 characters
   */
  productCode: string
  /**
   * Item description. May appear on invoices of certain payment methods. Maximum of 1000 characters.
   */
  description?: string
  /**
   * Merchant specific item category
   */
  category?: string
  /**
   * Item level order ID (suborder ID). Mainly useful for Shop-in-Shop purchases.
   */
  orderId?: string
  /**
   * Reference for this item. Required for Shop-in-Shop payments.
   */
  reference: string
  /**
   * Merchant ID for the item. Required for Shop-in-Shop payments, do not use for normal payments.
   * This is the money-receiving merchant ID.
   */
  merchant: string
  /**
   * Shop-in-Shop commission. Do not use for normal payments.
   */
  commission?: PaymentCommission
  /**
   * Unique identifier for this item. Required for Shop-in-Shop payments. Required for item refunds.
   */
  stamp: string
}

interface PaymentCommission {
  /**
   * Merchant who gets the commission
   */
  merchant: string
  /**
   * Amount of commission in currency's minor units, e.g. for Euros use cents. VAT not applicable.
   */
  amount: number
}

export interface RefundItem {
  /**
   * Total amount to refund this item, in currency's minor units (ie. EUR cents)
   */
  amount: number
  /**
   * The item unique identifier
   */
  stamp: string
  /**
   * Merchant unique identifier for the refund. Only for Shop-in-Shop payments, do not use for normal payments.
   */
  refundStamp: string
  /**
   * Refund reference. Only for Shop-in-Shop payments, do not use for normal payments.
   */
  refundReference: string
  /**
   * Shop-in-Shop commission return. In refunds, the given amount is returned from the given commission account
   * to the item merchant account. Only for Shop-in-Shop payments, do not use for normal payments.
   */
  commission?: RefundCommission
}

interface RefundCommission {
  /**
   * Merchant from whom the commission is returned to the submerchant.
   */
  merchant: string
  /**
   * Amount of commission in currency's minor units, e.g. for Euros use cents. VAT not applicable.
   */
  amount: number
}
