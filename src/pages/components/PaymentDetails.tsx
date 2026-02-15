import type { MinimalEventForCost, MinimalRegistrationForCost } from '../../types'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { useRecoilValue } from 'recoil'
import { getCostSegmentName, hasDifferentMemberPrice } from '../../lib/cost'
import { formatMoney } from '../../lib/money'
import { getRegistrationPaymentDetails } from '../../lib/payment'
import { languageAtom } from '../recoil'

interface Props {
  readonly event: MinimalEventForCost
  readonly registration: MinimalRegistrationForCost
  readonly includePayable?: boolean
  readonly includeTotal?: boolean
}

export const PaymentDetails = ({ event, registration, includePayable, includeTotal }: Props) => {
  const { t } = useTranslation()
  const language = useRecoilValue(languageAtom)
  const details = getRegistrationPaymentDetails(event, registration)
  const costSegmentName = getCostSegmentName(details.strategy)

  // Only show "for members" when the member price actually differs from base price
  const hasDifferentPrice =
    details.isMember && hasDifferentMemberPrice(event, details.strategy, registration.dog.breedCode)
  const member = hasDifferentPrice ? ` ${t('costForMembers')}` : ''

  const costDescription = t(costSegmentName, {
    ...details.translationOptions,
    name: details.costObject?.custom?.description?.[language] ?? details.costObject?.custom?.description?.fi,
  })

  return (
    <Stack direction="row" justifyContent="start">
      <Box px={1}>
        <Typography variant="body1" textAlign="right">
          {costDescription}
          {member} {formatMoney(details.cost)}
        </Typography>
        {details.optionalCosts.map((c, index) => (
          <Typography variant="body1" key={`${c.description.fi}${index}`} textAlign="right">
            {c.description[language]}
            {member}&nbsp;
            {formatMoney(c.cost)}
          </Typography>
        ))}
        <Divider />
        {includeTotal ? (
          <Typography variant="body1" textAlign="right">
            {t('costTotal')} {formatMoney(details.total)}
          </Typography>
        ) : null}
        {registration.paidAmount && registration.paidAmount > 0 ? (
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
