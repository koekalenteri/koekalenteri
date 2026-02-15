import type { PublicDogEvent, Registration } from '../../../../../types'
import AddTaskOutlinedIcon from '@mui/icons-material/AddTaskOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import CommentOutlined from '@mui/icons-material/CommentOutlined'
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import MarkEmailReadOutlined from '@mui/icons-material/MarkEmailReadOutlined'
import PersonOutline from '@mui/icons-material/PersonOutline'
import SavingsOutlined from '@mui/icons-material/SavingsOutlined'
import SpeakerNotesOutlined from '@mui/icons-material/SpeakerNotesOutlined'
import { useTranslation } from 'react-i18next'
import { formatMoney } from '../../../../../lib/money'
import { priorityDescriptionKey } from '../../../../../lib/registration'
import { TooltipIcon } from '../../../../components/IconsTooltip'
import { PriorityIcon } from '../../../../components/icons/PriorityIcon'
import RankingPoints from '../../../../components/RankingPoints'

export const hasRegistrationTooltipContent = ({
  reg,
  priority,
  manualResultCount,
  rankingPoints,
}: {
  reg: Registration
  priority: boolean | 0.5
  manualResultCount: number
  rankingPoints: number
}): boolean => {
  if (priority) return true
  if (reg.owner?.membership) return true
  if (reg.handler?.membership) return true
  if (reg.paidAt) return true
  if ((reg.optionalCosts ?? []).length > 0) return true
  if (reg.confirmed) return true
  if (reg.invitationRead) return true
  if (manualResultCount > 0) return true
  if (reg.notes.trim()) return true
  if (reg.internalNotes?.trim()) return true
  if (rankingPoints > 0) return true

  return false
}

// Props for the RegistrationTooltipContent component
interface RegistrationTooltipContentProps {
  event: PublicDogEvent
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

  if (!hasRegistrationTooltipContent({ manualResultCount, priority, rankingPoints, reg })) return null

  // Get priority description
  const key = priority ? priorityDescriptionKey(event, reg) : null
  const descr = key && t(`priorityDescription.${key}`)
  const halfInfo = reg.owner?.membership ? '(vain omistaja on jäsen)' : '(vain ohjaaja on jäsen)'
  const info50 = priority === 0.5 ? halfInfo : ''
  const priorityText = `Ilmoittautuja on etusijalla: ${descr} ${info50}`.trim()
  const additionalCosts = event.cost && typeof event.cost !== 'number' ? (event.cost.optionalAdditionalCosts ?? []) : []
  const optionalCosts =
    reg.optionalCosts
      ?.map((i) => additionalCosts[i]?.description.fi)
      .filter(Boolean)
      .join(', ') ?? []

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
        condition={!!reg.owner?.membership}
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
        text={`Palautuksen käsittely on kesken. Palautetaan ${formatMoney(reg.refundAmount ?? 0)}, maksoi ${formatMoney(reg.paidAmount ?? 0)}`}
      />
      <TooltipIcon
        key="payment-refunded"
        condition={!!reg.paidAt && !!reg.refundAt && reg.refundStatus !== 'PENDING'}
        icon={<SavingsOutlined fontSize="small" />}
        text={`Ilmoittautumismaksua on palautettu. Palautettu ${formatMoney(reg.refundAmount ?? 0)}, maksoi ${formatMoney(reg.paidAmount ?? 0)}`}
      />
      <TooltipIcon
        key="payment-paid"
        condition={!!reg.paidAt && !reg.refundAt && reg.refundStatus !== 'PENDING'}
        icon={<EuroOutlined fontSize="small" />}
        text={`Ilmoittautuja on maksanut: ${formatMoney(reg.paidAmount ?? 0)}`}
      />
      <TooltipIcon
        key="optional-costs"
        condition={(reg.optionalCosts ?? []).length > 0}
        icon={<AddTaskOutlinedIcon fontSize="small" />}
        text={`Ilmoittautuja on valinnut lisäpalvelut: ${optionalCosts}`}
      />
      <TooltipIcon
        key="confirmed"
        condition={!!reg.confirmed}
        icon={<CheckOutlined fontSize="small" />}
        text="Ilmoittautuja on vahvistanut ottavansa koepaikan vastaan"
      />
      <TooltipIcon
        key="invitation-read"
        condition={!!reg.invitationRead}
        icon={<MarkEmailReadOutlined fontSize="small" />}
        text="Ilmoittautuja on kuitannut koekutsun"
      />
      <TooltipIcon
        key="manual-results"
        condition={manualResultCount > 0}
        icon={<ErrorOutlineOutlined fontSize="small" />}
        text="Ilmoittautuja on lisännyt koetuloksia"
      />
      <TooltipIcon
        key="notes"
        condition={!!reg.notes.trim()}
        icon={<CommentOutlined fontSize="small" />}
        text="Ilmoittautuja on lisännyt lisätietoja"
      />
      <TooltipIcon
        key="internal-notes"
        condition={!!reg.internalNotes?.trim()}
        icon={<SpeakerNotesOutlined fontSize="small" />}
        text={`Sisäinen kommentti: ${reg.internalNotes}`}
      />
      <TooltipIcon
        key="ranking-points"
        condition={rankingPoints > 0}
        icon={<RankingPoints points={rankingPoints} />}
        text={`Karsintapisteet: ${rankingPoints}`}
      />
    </>
  )
}

export default RegistrationTooltipContent
