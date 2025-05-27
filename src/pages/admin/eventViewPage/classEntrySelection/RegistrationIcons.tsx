import type { PublicDogEvent, Registration } from '../../../../types'
import type { TooltipContent } from '../../../components/IconsTooltip'

import { cloneElement, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import CommentOutlined from '@mui/icons-material/CommentOutlined'
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import MarkEmailReadOutlined from '@mui/icons-material/MarkEmailReadOutlined'
import PersonOutline from '@mui/icons-material/PersonOutline'
import SavingsOutlined from '@mui/icons-material/SavingsOutlined'
import SpeakerNotesOutlined from '@mui/icons-material/SpeakerNotesOutlined'
import Stack from '@mui/material/Stack'

import { formatMoney } from '../../../../lib/money'
import { hasPriority, priorityDescriptionKey } from '../../../../lib/registration'
import { PriorityIcon } from '../../../components/icons/PriorityIcon'
import { IconsTooltip } from '../../../components/IconsTooltip'
import RankingPoints from '../../../components/RankingPoints'

interface RegistrationIconsProps {
  event: PublicDogEvent
  reg: Registration
}

const RegistrationIcons = ({ event, reg }: RegistrationIconsProps) => {
  const { t } = useTranslation()
  const priority = hasPriority(event, reg)

  const manualResultCount = useMemo(
    () => reg.qualifyingResults.filter((r) => !r.official).length,
    [reg.qualifyingResults]
  )
  const rankingPoints = useMemo(() => reg.qualifyingResults.reduce((acc, r) => acc + (r.rankingPoints ?? 0), 0), [reg])

  // Helper function to create tooltip items
  const createTooltipItem = (condition: boolean, icon: JSX.Element, text: string): TooltipContent | null => {
    return condition ? { icon, text } : null
  }

  // Helper function for payment-related tooltip items
  const getPaymentTooltipItem = (reg: Registration): TooltipContent | null => {
    if (!reg.paidAt) return null

    if (reg.refundStatus === 'PENDING') {
      return {
        icon: <SavingsOutlined fontSize="small" />,
        text: `Palautuksen käsittely on kesken. Palautetaan ${formatMoney(reg.refundAmount ?? 0)}, maksoi ${formatMoney(reg.paidAmount ?? 0)}`,
      }
    }

    if (reg.refundAt) {
      return {
        icon: <SavingsOutlined fontSize="small" />,
        text: `Ilmoittautumismaksua on palautettu. Palautettu ${formatMoney(reg.refundAmount ?? 0)}, maksoi ${formatMoney(reg.paidAmount ?? 0)}`,
      }
    }

    return {
      icon: <EuroOutlined fontSize="small" />,
      text: `Ilmoittautuja on maksanut ilmoittautumisen: ${formatMoney(reg.paidAmount ?? 0)}`,
    }
  }

  // Helper function for priority tooltip item
  const getPriorityTooltipItem = (
    event: PublicDogEvent,
    reg: Registration,
    priority: boolean | 0.5
  ): TooltipContent | null => {
    if (!priority) return null

    const key = priorityDescriptionKey(event, reg)
    const descr = key && t(`priorityDescription.${key}`)
    const info50 =
      priority === 0.5 ? (reg.owner.membership ? '(vain omistaja on jäsen)' : '(vain ohjaaja on jäsen)') : ''

    return {
      icon: <PriorityIcon priority={priority} fontSize="small" />,
      text: `Ilmoittautuja on etusijalla: ${descr} ${info50}`.trim(),
    }
  }

  const tooltipContent: TooltipContent[] = useMemo(() => {
    // Create all possible tooltip items, filtering out nulls
    const items = [
      // Priority information
      getPriorityTooltipItem(event, reg, priority),

      // Membership information
      createTooltipItem(
        !!reg.owner.membership,
        <PersonOutline fontSize="small" />,
        'Omistaja on järjestävän yhdistyksen jäsen'
      ),
      createTooltipItem(
        !!reg.handler.membership,
        <PersonOutline fontSize="small" />,
        'Ohjaaja on järjestävän yhdistyksen jäsen'
      ),

      // Payment information
      getPaymentTooltipItem(reg),

      // Status information
      createTooltipItem(
        !!reg.confirmed,
        <CheckOutlined fontSize="small" />,
        'Ilmoittautuja on vahvistanut ottavansa koepaikan vastaan'
      ),
      createTooltipItem(
        !!reg.invitationRead,
        <MarkEmailReadOutlined fontSize="small" />,
        'Ilmoittautuja on kuitannut koekutsun'
      ),
      createTooltipItem(
        manualResultCount > 0,
        <ErrorOutlineOutlined fontSize="small" />,
        'Ilmoittautuja on lisännyt koetuloksia'
      ),

      // Notes information
      createTooltipItem(
        !!reg.notes.trim(),
        <CommentOutlined fontSize="small" />,
        'Ilmoittautuja on lisännyt lisätietoja'
      ),
      createTooltipItem(
        !!reg.internalNotes?.trim(),
        <SpeakerNotesOutlined fontSize="small" />,
        'Sisäinen kommentti: ' + reg.internalNotes
      ),

      // Ranking points
      createTooltipItem(
        rankingPoints > 0,
        <RankingPoints points={rankingPoints} />,
        'Karsintapisteet: ' + rankingPoints
      ),
    ].filter((item): item is TooltipContent => item !== null)

    return items
  }, [event, manualResultCount, priority, rankingPoints, reg, t])

  // Helper component for conditional icon rendering
  const StatusIcon = ({
    condition,
    icon,
    alwaysShow = false,
  }: {
    condition?: boolean
    icon: JSX.Element
    alwaysShow?: boolean
  }) => {
    return cloneElement(icon, {
      fontSize: 'small',
      sx: { opacity: condition || alwaysShow ? 1 : 0.05 },
    })
  }

  // Special case for payment icon which has conditional rendering
  const PaymentIcon = () => {
    if (reg.refundAt || reg.refundStatus === 'PENDING') {
      return <SavingsOutlined fontSize="small" />
    }
    return <EuroOutlined fontSize="small" sx={{ opacity: reg.paidAt ? 1 : 0.05 }} />
  }

  return (
    <IconsTooltip placement="right" items={tooltipContent}>
      <Stack direction="row" alignItems="center" mt="3px">
        <StatusIcon condition={!!priority} icon={<PriorityIcon dim priority={priority} fontSize="small" />} />
        <StatusIcon
          condition={reg.handler.membership || reg.owner.membership}
          icon={<PersonOutline fontSize="small" />}
        />
        <PaymentIcon />
        <StatusIcon condition={reg.confirmed} icon={<CheckOutlined fontSize="small" />} />
        <StatusIcon condition={reg.invitationRead} icon={<MarkEmailReadOutlined fontSize="small" />} />
        <StatusIcon condition={manualResultCount > 0} icon={<ErrorOutlineOutlined fontSize="small" />} />
        <StatusIcon condition={!!reg.notes.trim()} icon={<CommentOutlined fontSize="small" />} />
        <StatusIcon condition={!!reg.internalNotes?.trim()} icon={<SpeakerNotesOutlined fontSize="small" />} />
        <RankingPoints points={rankingPoints} />
      </Stack>
    </IconsTooltip>
  )
}

export default RegistrationIcons
