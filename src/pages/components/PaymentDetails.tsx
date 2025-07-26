import type { MinimalEventForCost, MinimalRegistrationForCost } from '../../types'

import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useRecoilValue } from 'recoil'

import { getCostSegmentName } from '../../lib/cost'
import { formatMoney } from '../../lib/money'
import { getRegistrationPaymentDetails } from '../../lib/payment'
import { languageAtom } from '../recoil'

interface Props {
  readonly event: MinimalEventForCost
  readonly registration: MinimalRegistrationForCost
  readonly includePayable?: boolean
}

export const PaymentDetails = ({ event, registration, includePayable }: Props) => {
  const { t } = useTranslation()
  const language = useRecoilValue(languageAtom)
  const details = getRegistrationPaymentDetails(event, registration)
  const costSegmentName = getCostSegmentName(details.strategy)
  const member = details.isMember ? ` (${t('costForMembers')})` : ''
  const costDescription =
    details.strategy === 'custom' && details.costObject?.custom?.description[language]
      ? details.costObject?.custom?.description[language]
      : t(costSegmentName, details.translationOptions)

  return (
    <Stack direction="row" justifyContent="start">
      <Box px={1}>
        <Typography variant="subtitle2" color="textSecondary" textAlign="left">
          {t('cost')}
        </Typography>
        <Typography variant="body1" textAlign="right">
          {costDescription}
          {member} {formatMoney(details.cost)}
        </Typography>
        {details.optionalCosts.length ? (
          <>
            <Typography variant="subtitle2" color="textSecondary" textAlign="left">
              {t('costNames.optionalAdditionalCosts')}
            </Typography>
            {details.optionalCosts.map((c, index) => (
              <Typography variant="body1" key={c.description.fi + index} textAlign="right">
                {c.description[language]}
                {member}&nbsp;
                {formatMoney(c.cost)}
              </Typography>
            ))}
          </>
        ) : null}
        <Divider />
        <Typography variant="body1" textAlign="right">
          {t('costTotal')} {formatMoney(details.total)}
        </Typography>
        {registration.paidAmount ? (
          <>
            <Divider />
            <Typography variant="body1" textAlign="right">
              Aiemmin maksettu {formatMoney(registration.paidAmount)}
            </Typography>
          </>
        ) : null}
        {includePayable ? (
          <>
            <Typography variant="subtitle2" color="textSecondary"></Typography>
            <Typography variant="body1" textAlign="right" fontWeight="bold">
              {t('registration.paymentToBePaid', {
                amount: formatMoney(details.total - (registration.paidAmount ?? 0)),
              })}
            </Typography>
          </>
        ) : null}
      </Box>
    </Stack>
  )
}
