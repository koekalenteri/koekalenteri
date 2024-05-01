const moneyFormatter = Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR' })

export const formatMoney = (amount: number) => moneyFormatter.format(amount)
