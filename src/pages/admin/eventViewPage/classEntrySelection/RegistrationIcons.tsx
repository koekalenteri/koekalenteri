import type { PublicDogEvent, Registration } from '../../../../types'

import { useMemo } from 'react'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import CommentOutlined from '@mui/icons-material/CommentOutlined'
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined'
import MarkEmailReadOutlined from '@mui/icons-material/MarkEmailReadOutlined'
import PersonOutline from '@mui/icons-material/PersonOutline'
import SpeakerNotesOutlined from '@mui/icons-material/SpeakerNotesOutlined'
import Stack from '@mui/material/Stack'

import { hasPriority } from '../../../../lib/registration'
import { PriorityIcon } from '../../../components/icons/PriorityIcon'
import { IconsTooltip } from '../../../components/IconsTooltip'
import RankingPoints from '../../../components/RankingPoints'

import PaymentIcon from './registrationIcons/PaymentIcon'
import RegistrationTooltipContent from './registrationIcons/RegistrationTooltipContent'
import StatusIcon from './registrationIcons/StatusIcon'

interface RegistrationIconsProps {
  event: PublicDogEvent
  reg: Registration
}

const RegistrationIcons = ({ event, reg }: RegistrationIconsProps) => {
  const priority = hasPriority(event, reg)

  const manualResultCount = useMemo(
    () => reg.qualifyingResults.filter((r) => !r.official).length,
    [reg.qualifyingResults]
  )
  const rankingPoints = useMemo(() => reg.qualifyingResults.reduce((acc, r) => acc + (r.rankingPoints ?? 0), 0), [reg])

  return (
    <IconsTooltip
      placement="right"
      icons={
        <RegistrationTooltipContent
          key="tooltip-content"
          event={event}
          reg={reg}
          priority={priority}
          manualResultCount={manualResultCount}
          rankingPoints={rankingPoints}
        />
      }
    >
      <Stack direction="row" alignItems="center" mt="3px">
        <StatusIcon condition={!!priority} icon={<PriorityIcon dim priority={priority} fontSize="small" />} />
        <StatusIcon
          condition={reg.handler.membership || reg.owner.membership}
          icon={<PersonOutline fontSize="small" />}
        />
        <PaymentIcon reg={reg} />
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
