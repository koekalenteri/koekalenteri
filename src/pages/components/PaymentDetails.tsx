import type { ReactNode } from 'react'
import type { PaymentPictureRow } from '../../lib/payment'
import type { MinimalEventForCost, PublicDogEvent } from '../../types'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'
import { getCostSegmentName, hasDifferentMemberPrice } from '../../lib/cost'
import { formatMoney } from '../../lib/money'
import { getRegistrationPaymentDetails, getRowPaymentPicture } from '../../lib/payment'
import { languageAtom } from '../state'
import InfoTableContainerGrid from './InfoTableContainerGrid'
import InfoTableNumberGrid from './InfoTableNumberGrid'
import InfoTableTextGrid from './InfoTableTextGrid'

interface Props {
  /** The trial as the page holds it: what is to pay shows only once it is confirmed (KOE-1526). */
  readonly event: PublicDogEvent & MinimalEventForCost
  readonly registration: PaymentPictureRow
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
  // What was paid, what went back and what is to pay: the server's picture for the participant, the
  // row's own for the shared form and the secretary's refund dialog (KOE-1552).
  const payment = getRowPaymentPicture(event, registration)
  const { keptFee: refundHandlingCost, paidAmount, refundedAmount: refundAmount } = payment

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
        {/* A refund, the overpaid part or the whole fee, is money back: without its row the entrant
            reads the full payment as still standing (KOE-1460). */}
        {refundAmount > 0 ? <PaymentRow name={t('registration.refunded')} amount={-refundAmount} /> : null}
        {/* The fee kept from a refund paid for the refund, not for the place (KOE-1526): without its
            row the paid and refunded lines would not add up to what is left to pay. */}
        {refundHandlingCost > 0 ? (
          <PaymentRow name={t('registration.refundHandlingCost')} amount={-refundHandlingCost} />
        ) : null}
        {includePayable ? (
          // What the payment link collects: a reserve's refunded fee is not asked for again (KOE-1526).
          <PaymentRow bold name={t('registration.toBePaid')} amount={payment.due} />
        ) : null}
      </InfoTableContainerGrid>
    </Box>
  )
}
