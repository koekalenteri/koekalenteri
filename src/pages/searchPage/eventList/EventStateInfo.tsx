import type { ReactNode } from 'react'
import type { EventState } from '../../../types'
import Box from '@mui/material/Box'
import { useTranslation } from 'react-i18next'
import { isStartListAvailable } from '../../../lib/event'
import { Path } from '../../../routeConfig'
import LinkButton from '../../components/LinkButton'

interface Props {
  readonly id: string
  readonly state: EventState
  readonly startListPublished?: boolean
  readonly text?: string | ReactNode | null
}

export function EventStateInfo({ id, state, startListPublished, text = null }: Props) {
  const { t } = useTranslation()

  if (isStartListAvailable({ startListPublished, state })) {
    return <LinkButton to={Path.startList(id)} text={t('viewStartList')} />
  }

  return (
    <Box sx={{ textTransform: 'uppercase' }} component="span">
      {state === 'tentative' || state === 'cancelled' ? t(`event.states.${state}_info`) : text}
    </Box>
  )
}
