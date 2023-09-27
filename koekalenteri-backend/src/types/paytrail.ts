export type PaytrailConfig = {
  PAYTRAIL_SECRET: string
}

export interface PaytrailHeaders {
  /**
   * Paytrail account ID, e.g. 375917
   */
  'checkout-account': string
  /**
   * Used signature algorithm, either sha256 or sha512
   */
  'checkout-algorithm': 'sha256' | 'sha512'
  /**
   * HTTP verb of the request, either GET or POST
   */
  'checkout-method': 'GET' | 'POST'
  /**
   * Unique identifier for this request
   */
  'checkout-nonce': string
  /**
   * ISO 8601 date time
   */
  'checkout-timestamp': string
  /**
   * Paytrail transaction ID when accessing single transaction - not required for a new payment request
   */
  'checkout-transaction-id'?: string
  /**
   * For SaaS services, use the marketing name of the platform (for example, shopify).
   * For third party eCommerce platform plugins, use the platform name and your identifier,
   * like company name (for example, woocommerce-yourcompany). Platform and integrator information
   * helps customer service to provide better assistance for the merchants using the integration.
   */
  'platform-name'?: string
}
export interface CreatePaymentRequest {
  /**
   * Merchant unique identifier for the order. Maximum of 200 characters.
   */
  stamp: string
  /**
   * Order reference. Maximum of 200 characters.
   */
  reference: string
  /**
   * Total amount of the payment in currency's minor units, e.g. for Euros use cents.
   * Must match the total sum of items and must be more than zero.
   * By default amount should include VAT, unless usePricesWithoutVat is set to true.
   * Maximum value of 99999999.
   */
  amount: number
  /**
   * Currency, only EUR supported at the moment
   */
  currency: 'EUR'
  /**
   * Payment's language, currently supported are FI, SV, and EN
   */
  language: 'FI' | 'SV' | 'EN'
  /**
   * Order ID. Used for e.g. Walley/Collector payments order ID.
   * If not given, merchant reference is used instead.
   */
  orderId?: string
  /**
   * Array of items. Always required for Shop-in-Shop payments.
   * Required if VAT calculations are wanted in settlement reports.
   */
  items: PaymentItem[]
  /**
   * Customer information
   */
  customer: PaymentCustomer
  /**
   * Delivery address
   */
  deliveryAddress?: PaymentAddress
  /**
   * Invoicing address
   */
  invoicingAddress?: PaymentAddress
  /**
   * If paid with invoice payment method, the invoice will not be activated automatically immediately.
   * Currently only supported with Walley/Collector.
   */
  manualInvoiceActivation?: boolean
  /**
   * Where to redirect browser after a payment is paid or cancelled.
   */
  redirectUrls: CallbackUrl
  /**
   * Which url to ping after this payment is paid or cancelled
   */
  callbackUrls?: CallbackUrl
  /**
   * Callback URL polling delay in seconds.
   * If callback URLs are given, the call can be delayed up to 900 seconds.
   * Default: 0
   */
  callbackDelay?: number
  /**
   * Instead of all enabled payment methods, return only those of given groups.
   * It is highly recommended to use list providers before initiating the payment if filtering by group.
   * If the payment methods are rendered in the webshop the grouping functionality can be implemented based on
   * the group attribute of each returned payment instead of filtering when creating a payment.
   */
  groups?: PaymentMethodGroup[]
  /**
   * If true, amount and items.unitPrice should be sent to API not including VAT, and final amount is calculated
   * by Paytrail's system using the items' unitPrice and vatPercentage (with amounts rounded to closest cent).
   * ßAlso, when true, items must be included.
   */
  usePricesWithoutVat?: boolean
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

export interface PaymentCommission {
  /**
   * Merchant who gets the commission
   */
  merchant: string
  /**
   * Amount of commission in currency's minor units, e.g. for Euros use cents. VAT not applicable.
   */
  amount: number
}

export interface PaymentCustomer {
  /**
   * Email. Maximum of 200 characters.
   */
  email: string
  /**
   * First name (required for OPLasku and Walley/Collector). Maximum of 50 characters.
   */
  firstName?: string
  /**
   * Last name (required for OPLasku and Walley/Collector). Maximum of 50 characters.
   */
  lastName?: string
  /**
   * Phone number
   */
  phone?: string
  /**
   * VAT ID, if any
   */
  vatId?: string
  /**
   * Company name, if any
   */
  companyName?: string
}

export interface PaymentAddress {
  /**
   * Street address. Maximum of 50 characters.
   */
  streetAddress: string
  /**
   * Postal code. Maximum of 15 characters.
   */
  postalCode: string
  /**
   * City. maximum of 30 characters.
   */
  city: string
  /**
   * County/State
   */
  county?: string
  /**
   * Alpha-2 country code
   */
  country: string
}

export interface CallbackUrl {
  /**
   * Called on successful payment
   */
  success: string
  /**
   * Called on cancelled payment
   */
  cancel: string
}

export interface CreatePaymentResponse {
  transactionId: string
  href: string
  terms: string
  groups: PaymentMethodGroupData[]
  reference: string
  providers: Provider[]
  customProviders: object
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
  paremeters: FormField[]
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
