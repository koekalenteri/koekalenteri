import type { EventState } from '../../../types'

import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'

import { isStartListAvailable } from '../../../lib/event'
import { Path } from '../../../routeConfig'
import LinkButton from '../../components/LinkButton'

interface Props {
  readonly id: string
  readonly state: EventState
  readonly startListPublished?: boolean
  readonly text?: string | null
}

export function EventStateInfo({ id, state, startListPublished, text = null }: Props) {
  const { t } = useTranslation()

  if (isStartListAvailable({ state, startListPublished })) {
    return <LinkButton to={Path.startList(id)} text={t('viewStartList')} />
  }

  return (
    <Box sx={{ textTransform: 'uppercase' }} component="span">
      {state === 'tentative' || state === 'cancelled' ? t(`event.states.${state}_info`) : text}
    </Box>
  )
}
