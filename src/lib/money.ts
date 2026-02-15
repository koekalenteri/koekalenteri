const currency = 'EUR'
const moneyFormatter = Intl.NumberFormat('fi-FI', { currency, style: 'currency' })
const moneyCodeFormatter = Intl.NumberFormat('fi-FI', { currency, currencyDisplay: 'code', style: 'currency' })

export const formatMoney = (amount: number) => moneyFormatter.format(amount)
export const formatMoneyWithoutCurrency = (amount: number) =>
  moneyCodeFormatter.format(amount).replace(currency, '').trim()
