import type { ReactNode } from 'react'
import type { EventClassState, EventState, PublicDogEvent, RegistrationClass } from '../../../types'
import Box from '@mui/material/Box'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hasAllResultsPublished, isStartListAvailable } from '../../../lib/event'
import { Path } from '../../../routeConfig'
import LinkButton from '../../components/LinkButton'

interface Props {
  readonly id: string
  readonly classes?: Array<{ class: RegistrationClass; state?: EventClassState }>
  readonly state: EventState
  readonly startListPublished?: boolean | Partial<Record<RegistrationClass, boolean>>
  readonly resultsPublished?: PublicDogEvent['resultsPublished']
  readonly text?: string | ReactNode | null
}

export function EventStateInfo({ id, classes, state, startListPublished, resultsPublished, text = null }: Props) {
  const { t } = useTranslation()
  const [startListLoading, setStartListLoading] = useState(false)

  if (isStartListAvailable({ classes, startListPublished, state })) {
    // While any class is still running the list is the participants; only a complete set of
    // published results turns the same page into the results (KOE-1285).
    const complete = hasAllResultsPublished({ classes, resultsPublished })
    return (
      <LinkButton
        aria-label={startListLoading ? t('loading') : undefined}
        loading={startListLoading}
        onClick={() => setStartListLoading(true)}
        to={Path.startList(id)}
        text={t(complete ? 'viewResults' : 'viewStartList')}
      />
    )
  }

  return (
    <Box sx={{ textTransform: 'uppercase' }} component="span">
      {state === 'tentative' || state === 'cancelled' ? t(`event.states.${state}_info`) : text}
    </Box>
  )
}
