import type { Event } from '../../types'

import { useTranslation } from 'react-i18next'

interface Props {
  readonly event: Pick<Event, 'cost' | 'costMember'>
}

export default function CostInfo({ event }: Props) {
  const { t } = useTranslation()

  return (
    <>
      {t('event.cost')}: {event.cost} €<br />
      {event.costMember ? (
        <>
          {t('event.costMember')}: {event.costMember} €<br />
        </>
      ) : null}
    </>
  )
}
