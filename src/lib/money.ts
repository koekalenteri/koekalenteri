const currency = 'EUR'
const moneyFormatter = Intl.NumberFormat('fi-FI', { style: 'currency', currency })
const moneyCodeFormatter = Intl.NumberFormat('fi-FI', { style: 'currency', currency, currencyDisplay: 'code' })

export const formatMoney = (amount: number) => moneyFormatter.format(amount)
export const formatMoneyWithoutCurrency = (amount: number) =>
  moneyCodeFormatter.format(amount).replace(currency, '').trim()
