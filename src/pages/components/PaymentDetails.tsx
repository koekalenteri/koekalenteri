import type { MinimalEventForCost, MinimalRegistrationForCost } from '../../types'

import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import { useRecoilValue } from 'recoil'

import { getCostSegmentName } from '../../lib/cost'
import { getRegistrationPaymentDetails } from '../../lib/payment'
import { languageAtom } from '../recoil'

interface Props {
  readonly event: MinimalEventForCost
  readonly registration: MinimalRegistrationForCost
  readonly includePayable?: boolean
}

const formatMoney = (amount: number) => `${amount.toFixed(2)} €`

export const PaymentDetails = ({ event, registration, includePayable }: Props) => {
  const { t } = useTranslation()
  const language = useRecoilValue(languageAtom)
  const details = getRegistrationPaymentDetails(event, registration)
  const costSegmentName = getCostSegmentName(details.strategy)
  const member = details.isMember ? ` (${t('costForMembers')})` : ''

  return (
    <Box px={1} textAlign="end">
      <p>
        {t('cost')} {t(costSegmentName, details.translationOptions)}
        {member} {formatMoney(details.cost)}
      </p>
      {details.optionalCosts.map((c, index) => (
        <p key={c.description.fi + index}>{`${c.description[language]}${member} ${formatMoney(c.cost)}`}</p>
      ))}
      <p>
        {t('costTotal')} {formatMoney(details.total)}
      </p>
      {registration.paidAmount ? <p>Aiemmin maksettu {formatMoney(registration.paidAmount)}</p> : null}
      {includePayable ? (
        <p>
          <b>
            {t('registration.paymentToBePaid', { amount: formatMoney(details.total - (registration.paidAmount ?? 0)) })}
          </b>
        </p>
      ) : null}
    </Box>
  )
}
