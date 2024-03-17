import type { DogEvent } from '../../types'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  readonly event: Pick<DogEvent, 'cost' | 'costMember'>
}

export default function CostInfo({ event }: Props) {
  const { t } = useTranslation()
  const text = useMemo(
    () =>
      event.costMember
        ? `${event.cost}\u00A0€${t('event.costMember')}\u00A0${event.costMember}\u00A0€`
        : `${event.cost}\u00A0€`,
    [event.cost, event.costMember, t]
  )

  return <>{text}</>
}
