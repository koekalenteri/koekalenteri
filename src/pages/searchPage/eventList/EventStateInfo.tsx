import type { EventState } from '../../../types'

import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'

import { Path } from '../../../routeConfig'
import LinkButton from '../../components/LinkButton'

interface Props {
  readonly id: string
  readonly state: EventState
  readonly text?: string | null
}

export function EventStateInfo({ id, state, text = null }: Props) {
  const { t } = useTranslation()

  if (state === 'invited' || state === 'started') {
    return <LinkButton to={Path.startList(id)} text="Katso osallistujalista" />
  }

  return (
    <Box sx={{ textTransform: 'uppercase' }}>
      {state === 'tentative' || state === 'cancelled' ? t(`event.states.${state}_info`) : text}
    </Box>
  )
}
