import type { DogEvent, Registration } from '../../../../types'
import AddTaskOutlinedIcon from '@mui/icons-material/AddTaskOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import CommentOutlined from '@mui/icons-material/CommentOutlined'
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined'
import MailOutline from '@mui/icons-material/MailOutlined'
import MarkEmailReadOutlined from '@mui/icons-material/MarkEmailReadOutlined'
import MarkEmailUnreadOutlined from '@mui/icons-material/MarkEmailUnreadOutlined'
import PersonOutline from '@mui/icons-material/PersonOutlined'
import SpeakerNotesOutlined from '@mui/icons-material/SpeakerNotesOutlined'
import Stack from '@mui/material/Stack'
import { useMemo } from 'react'
import { getInvitationReadStatus, hasPriority } from '../../../../lib/registration'
import { IconsTooltip } from '../../../components/IconsTooltip'
import { PriorityIcon } from '../../../components/icons/PriorityIcon'
import RankingPoints from '../../../components/RankingPoints'
import PaymentIcon from './registrationIcons/PaymentIcon'
import RegistrationTooltipContent, {
  hasRegistrationTooltipContent,
} from './registrationIcons/RegistrationTooltipContent'
import StatusIcon from './registrationIcons/StatusIcon'

interface RegistrationIconsProps {
  event: DogEvent
  reg: Registration
}

const RegistrationIcons = ({ event, reg }: RegistrationIconsProps) => {
  const priority = hasPriority(event, reg)
  const invitationReadStatus = getInvitationReadStatus(reg)

  const manualResultCount = useMemo(
    () => reg.qualifyingResults.filter((r) => !r.official).length,
    [reg.qualifyingResults]
  )
  const rankingPoints = useMemo(() => reg.qualifyingResults.reduce((acc, r) => acc + (r.rankingPoints ?? 0), 0), [reg])

  const tooltipIcons = hasRegistrationTooltipContent({ manualResultCount, priority, rankingPoints, reg }) ? (
    <RegistrationTooltipContent
      key="tooltip-content"
      event={event}
      reg={reg}
      priority={priority}
      manualResultCount={manualResultCount}
      rankingPoints={rankingPoints}
    />
  ) : undefined

  return (
    <IconsTooltip placement="top-end" icons={tooltipIcons} arrow>
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          mt: '3px',
        }}
      >
        {/* Keep the icons column width in useClassEntrySelectionColumns in sync when adding icons here. */}
        <StatusIcon condition={!!priority} icon={<PriorityIcon dim priority={priority} fontSize="small" />} />
        <StatusIcon
          condition={reg.handler?.membership || reg.owner?.membership}
          icon={<PersonOutline fontSize="small" />}
        />
        <PaymentIcon reg={reg} />
        <StatusIcon condition={(reg.optionalCosts?.length ?? 0) > 0} icon={<AddTaskOutlinedIcon fontSize="small" />} />
        <StatusIcon condition={reg.confirmed} icon={<CheckOutlined fontSize="small" />} />
        <StatusIcon condition={!!reg.emailDeliveryStatus} icon={<MailOutline color="error" fontSize="small" />} />
        <StatusIcon
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
        />
        <StatusIcon condition={manualResultCount > 0} icon={<ErrorOutlineOutlined fontSize="small" />} />
        <StatusIcon condition={!!reg.notes.trim()} icon={<CommentOutlined fontSize="small" />} />
        <StatusIcon condition={!!reg.internalNotes?.trim()} icon={<SpeakerNotesOutlined fontSize="small" />} />
        <RankingPoints points={rankingPoints} />
      </Stack>
    </IconsTooltip>
  )
}

export default RegistrationIcons
