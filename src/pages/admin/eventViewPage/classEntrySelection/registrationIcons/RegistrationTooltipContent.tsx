import type { DogEvent, Registration } from '@/types'
import AddTaskOutlinedIcon from '@mui/icons-material/AddTaskOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import CommentOutlined from '@mui/icons-material/CommentOutlined'
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import MailOutline from '@mui/icons-material/MailOutlined'
import MarkEmailReadOutlined from '@mui/icons-material/MarkEmailReadOutlined'
import MarkEmailUnreadOutlined from '@mui/icons-material/MarkEmailUnreadOutlined'
import PersonOutline from '@mui/icons-material/PersonOutlined'
import SavingsOutlined from '@mui/icons-material/SavingsOutlined'
import ScheduleSendOutlined from '@mui/icons-material/ScheduleSendOutlined'
import SpeakerNotesOutlined from '@mui/icons-material/SpeakerNotesOutlined'
import { useTranslation } from 'react-i18next'
import { getPaymentBalance } from '@/lib/cost'
import { formatMoney } from '@/lib/money'
import { isInvitationAwaitingPayment } from '@/lib/payment'
import { getInvitationReadStatus, getRegistrationOwners, priorityDescriptionKey } from '@/lib/registration'
import { isConfirmedEvent } from '@/lib/typeGuards'
import { TooltipIcon } from '@/pages/components/IconsTooltip'
import { PriorityIcon } from '@/pages/components/icons/PriorityIcon'
import RankingPoints from '@/pages/components/RankingPoints'

const formatEmailDeliveryReason = (reason?: string) => (reason ? ` (${reason})` : '')

/** Only a confirmed trial has places to invite to, and only it carries the fee to compare against. */
const awaitsInvitationPayment = (event: DogEvent, reg: Registration): boolean =>
  isConfirmedEvent(event) && isInvitationAwaitingPayment(event, reg)

/**
 * The fee against what has been paid, once something has: a never-paid place is the dim euro sign,
 * not a shortfall. A missing part is what the secretary asks for (KOE-722); an excess is what they
 * give back (KOE-1382).
 */
const paidBalance = (event: DogEvent, reg: Registration) =>
  reg.paidAt && isConfirmedEvent(event) ? getPaymentBalance(event, reg) : undefined

export const hasRegistrationTooltipContent = ({
  event,
  reg,
  priority,
  manualResultCount,
  rankingPoints,
}: {
  event: DogEvent
  reg: Registration
  priority: boolean | 0.5
  manualResultCount: number
  rankingPoints: number
}): boolean => {
  if (priority) return true
  if (getRegistrationOwners(reg).some((owner) => owner?.membership)) return true
  if (reg.handler?.membership) return true
  if (reg.paidAt) return true
  if ((reg.optionalCosts ?? []).length > 0) return true
  if (reg.confirmed) return true
  if (reg.emailDeliveryStatus) return true
  if (getInvitationReadStatus(reg) !== 'not-sent') return true
  if (awaitsInvitationPayment(event, reg)) return true
  if (manualResultCount > 0) return true
  if (reg.notes.trim()) return true
  if (reg.internalNotes?.trim()) return true
  if (rankingPoints > 0) return true

  return false
}

// Props for the RegistrationTooltipContent component
interface RegistrationTooltipContentProps {
  event: DogEvent
  reg: Registration
  priority: boolean | 0.5
  manualResultCount: number
  rankingPoints: number
}

// Component for tooltip content
const RegistrationTooltipContent = ({
  event,
  reg,
  priority,
  manualResultCount,
  rankingPoints,
}: RegistrationTooltipContentProps) => {
  const { t } = useTranslation()

  if (!hasRegistrationTooltipContent({ event, manualResultCount, priority, rankingPoints, reg })) return null

  // Get priority description
  const key = priority ? priorityDescriptionKey(event, reg) : null
  const descr = key && t(`priorityDescription.${key}`)
  const ownerIsMember = getRegistrationOwners(reg).some((owner) => owner?.membership)
  const halfContext = ownerIsMember ? 'ownerOnly' : 'handlerOnly'
  const priorityText = t('registration.tooltip.priority', {
    context: priority === 0.5 ? halfContext : undefined,
    description: descr ?? '',
  })
  const additionalCosts = event.cost && typeof event.cost !== 'number' ? (event.cost.optionalAdditionalCosts ?? []) : []
  const invitationReadStatus = getInvitationReadStatus(reg)
  const invitationReadText = (() => {
    switch (invitationReadStatus) {
      case 'not-sent':
        return ''
      case 'read-latest':
        return t(
          Object.keys(event.invitationAttachmentHistory ?? {}).length <= 1
            ? 'registration.tooltip.invitation.read'
            : 'registration.tooltip.invitation.read-latest'
        )
      case 'read-previous':
        return t('registration.tooltip.invitation.read-previous')
      case 'unread':
        return t('registration.tooltip.invitation.unread')
    }
  })()
  const optionalCosts =
    reg.optionalCosts
      ?.map((i) => additionalCosts[i]?.description.fi)
      .filter(Boolean)
      .join(', ') ?? []
  const refundTextValues = {
    context: reg.refundHandlingCost === undefined ? undefined : 'handlingCost',
    handlingCost: formatMoney(reg.refundHandlingCost ?? 0),
    paidAmount: formatMoney(reg.paidAmount ?? 0),
    refundAmount: formatMoney(reg.refundAmount ?? 0),
  }
  const balance = paidBalance(event, reg)
  const balanceTextValues = balance && {
    cost: formatMoney(balance.cost),
    due: formatMoney(balance.due),
    excess: formatMoney(balance.excess),
    paid: formatMoney(balance.paid),
  }

  return (
    <>
      <TooltipIcon
        key="priority"
        condition={!!priority}
        icon={<PriorityIcon priority={priority} fontSize="small" />}
        text={priorityText}
      />
      <TooltipIcon
        key="owner-membership"
        condition={ownerIsMember}
        icon={<PersonOutline fontSize="small" />}
        text={t('registration.ownerIsMember')}
      />
      <TooltipIcon
        key="handler-membership"
        condition={!!reg.handler?.membership}
        icon={<PersonOutline fontSize="small" />}
        text={t('registration.handlerIsMember')}
      />
      <TooltipIcon
        key="payment-refund-pending"
        condition={!!reg.paidAt && reg.refundStatus === 'PENDING'}
        icon={<SavingsOutlined fontSize="small" />}
        text={t('registration.tooltip.refundPending', refundTextValues)}
      />
      <TooltipIcon
        key="payment-refunded"
        condition={!!reg.paidAt && !!reg.refundAt && reg.refundStatus !== 'PENDING'}
        icon={<SavingsOutlined fontSize="small" />}
        text={t('registration.tooltip.refunded', refundTextValues)}
      />
      <TooltipIcon
        key="payment-paid"
        condition={!!reg.paidAt && !reg.refundAt && reg.refundStatus !== 'PENDING'}
        icon={<EuroOutlined fontSize="small" />}
        text={t('registration.tooltip.paid', { amount: formatMoney(reg.paidAmount ?? 0) })}
      />
      <TooltipIcon
        key="payment-due"
        condition={Boolean(balance && balance.due > 0)}
        icon={<EuroOutlined color="warning" fontSize="small" />}
        text={t('registration.tooltip.paymentDue', balanceTextValues)}
      />
      <TooltipIcon
        key="payment-excess"
        condition={Boolean(balance && balance.excess > 0)}
        icon={<EuroOutlined color="warning" fontSize="small" />}
        text={t('registration.tooltip.paymentExcess', balanceTextValues)}
      />
      <TooltipIcon
        key="optional-costs"
        condition={(reg.optionalCosts ?? []).length > 0}
        icon={<AddTaskOutlinedIcon fontSize="small" />}
        text={t('registration.tooltip.optionalCosts', { costs: optionalCosts })}
      />
      <TooltipIcon
        key="confirmed"
        condition={!!reg.confirmed}
        icon={<CheckOutlined fontSize="small" />}
        text={t('registration.tooltip.confirmed')}
      />
      <TooltipIcon
        key="email-delivery-status"
        condition={!!reg.emailDeliveryStatus}
        icon={<MailOutline fontSize="small" />}
        text={t('registration.tooltip.emailDeliveryFailed', {
          email: reg.emailDeliveryStatus?.email,
          reason: formatEmailDeliveryReason(reg.emailDeliveryStatus?.reason),
        })}
      />
      <TooltipIcon
        key="invitation-read"
        condition={invitationReadStatus !== 'not-sent'}
        icon={
          invitationReadStatus === 'unread' ? (
            <MarkEmailUnreadOutlined fontSize="small" />
          ) : (
            <MarkEmailReadOutlined
              color={invitationReadStatus === 'read-previous' ? 'warning' : undefined}
              fontSize="small"
            />
          )
        }
        text={invitationReadText}
      />
      <TooltipIcon
        key="invitation-awaiting-payment"
        condition={awaitsInvitationPayment(event, reg)}
        icon={<ScheduleSendOutlined color="warning" fontSize="small" />}
        text={t('registration.tooltip.invitation.awaitingPayment')}
      />
      <TooltipIcon
        key="manual-results"
        condition={manualResultCount > 0}
        icon={<ErrorOutlineOutlined fontSize="small" />}
        text={t('registration.tooltip.manualResults')}
      />
      <TooltipIcon
        key="notes"
        condition={!!reg.notes.trim()}
        icon={<CommentOutlined fontSize="small" />}
        text={t('registration.tooltip.notes')}
      />
      <TooltipIcon
        key="internal-notes"
        condition={!!reg.internalNotes?.trim()}
        icon={<SpeakerNotesOutlined fontSize="small" />}
        text={t('registration.tooltip.internalNotes', { notes: reg.internalNotes })}
      />
      <TooltipIcon
        key="ranking-points"
        condition={rankingPoints > 0}
        icon={<RankingPoints points={rankingPoints} />}
        text={t('registration.tooltip.rankingPoints', { points: rankingPoints })}
      />
    </>
  )
}

export default RegistrationTooltipContent
