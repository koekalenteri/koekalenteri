import Alert from '@mui/material/Alert'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecoilValueLoadable } from 'recoil'
import { userSelector } from '../../recoil/user/selectors'

type Viewer = {
  name: string
  userId: string
}

interface Props {
  readonly viewers: Viewer[]
}

export default function OtherViewers({ viewers }: Props) {
  const { t } = useTranslation()
  const currentUserLoadable = useRecoilValueLoadable(userSelector)

  const otherViewers = useMemo(() => {
    const currentUserId = currentUserLoadable.state === 'hasValue' ? currentUserLoadable.contents?.id : undefined
    return viewers.filter((viewer) => viewer.userId !== currentUserId)
  }, [currentUserLoadable, viewers])

  if (!otherViewers.length) return null

  const names = otherViewers.map((viewer) => viewer.name).join(', ')
  const text = t('event.viewerBanner_one', { count: otherViewers.length, names })

  return <Alert severity="info">{text}</Alert>
}
