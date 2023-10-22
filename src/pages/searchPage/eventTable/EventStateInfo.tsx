import type { EventState } from '../../../types'

import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'

import { Path } from '../../../routeConfig'
import LinkButton from '../../components/LinkButton'

interface Props {
  readonly id: string
  readonly state: EventState
}

export function EventStateInfo({ id, state }: Props) {
  const { t } = useTranslation()

  if (state === 'invited' || state === 'started') {
    return <LinkButton to={Path.startList(id)} text="Katso osallistujalista" />
  }

  return (
    <Box sx={{ textTransform: 'uppercase', mr: 1 }}>
      {state === 'tentative' || state === 'cancelled' ? t(`event.states.${state}_info`) : null}
    </Box>
  )
}
