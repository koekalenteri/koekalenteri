import type { ReactNode } from 'react'
import type { MinimalEventForCost, MinimalRegistrationForCost } from '../../types'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'
import { getCostSegmentName, hasDifferentMemberPrice } from '../../lib/cost'
import { formatMoney } from '../../lib/money'
import { getRegistrationPaymentDetails } from '../../lib/payment'
import { languageAtom } from '../state'
import InfoTableContainerGrid from './InfoTableContainerGrid'
import InfoTableNumberGrid from './InfoTableNumberGrid'
import InfoTableTextGrid from './InfoTableTextGrid'

interface Props {
  readonly event: MinimalEventForCost
  readonly registration: MinimalRegistrationForCost
  readonly includePayable?: boolean
  readonly includeTotal?: boolean
}

interface RowProps {
  readonly amount: number
  readonly bold?: boolean
  readonly name: ReactNode
}

const PaymentRow = ({ amount, bold, name }: RowProps) => {
  const sx = bold ? { fontWeight: 'bold' } : undefined
  return (
    <>
      {/* A cost the registrant chose is named in full: an early bird span or a service name runs
          past the column, and an ellipsis would hide the very thing this table is for. */}
      <InfoTableTextGrid size={{ xs: 7 }} sx={{ ...sx, whiteSpace: 'normal' }}>
        {name}
      </InfoTableTextGrid>
      <InfoTableNumberGrid size={{ xs: 5 }} sx={sx}>
        {formatMoney(amount)}
      </InfoTableNumberGrid>
    </>
  )
}

export const PaymentDetails = ({ event, registration, includePayable, includeTotal }: Props) => {
  const { t } = useTranslation()
  const language = useAtomValue(languageAtom)
  const details = getRegistrationPaymentDetails(event, registration)
  const costSegmentName = getCostSegmentName(details.strategy)
  const paidAmount = registration.paidAmount ?? 0

  // Only show "for members" when the member price actually differs from base price. It says that
  // about the participation fee alone: an optional service has no member price of its own to compare.
  const hasDifferentPrice =
    details.isMember && hasDifferentMemberPrice(event, details.strategy, registration.dog.breedCode)
  const member = hasDifferentPrice ? ` ${t('costForMembers')}` : ''

  const costDescription = t(costSegmentName, {
    ...details.translationOptions,
    name: details.costObject?.custom?.description?.[language] ?? details.costObject?.custom?.description?.fi,
  })

  const summary = includeTotal || includePayable || paidAmount > 0

  return (
    <Box sx={{ maxWidth: 420, px: 1, width: '100%' }}>
      <InfoTableContainerGrid>
        <PaymentRow name={`${costDescription}${member}`} amount={details.cost} />
        {details.optionalCosts.map((c, index) => (
          <PaymentRow
            key={`${c.description.fi}${
              // biome-ignore lint/suspicious/noArrayIndexKey: combining with description
              index
            }`}
            name={c.description[language] || c.description.fi}
            amount={c.cost}
          />
        ))}
        {summary ? (
          <Grid size={12}>
            <Divider />
          </Grid>
        ) : null}
        {includeTotal ? <PaymentRow name={t('costTotal')} amount={details.total} /> : null}
        {paidAmount > 0 ? <PaymentRow name={t('registration.paid')} amount={paidAmount} /> : null}
        {includePayable ? (
          <PaymentRow bold name={t('registration.toBePaid')} amount={details.total - paidAmount} />
        ) : null}
      </InfoTableContainerGrid>
    </Box>
  )
}
