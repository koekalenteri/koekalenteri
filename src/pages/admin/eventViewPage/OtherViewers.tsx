import Alert from '@mui/material/Alert'
import { useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { userAtom } from '../../state/user/derivedAtoms'

const userValueAtom = unwrap(userAtom)

type Viewer = {
  name: string
  userId: string
}

interface Props {
  readonly viewers: Viewer[]
}

export default function OtherViewers({ viewers }: Props) {
  const { t } = useTranslation()
  const currentUser = useAtomValue(userValueAtom)

  const otherViewers = useMemo(() => {
    const currentUserId = currentUser?.id
    return viewers.filter((viewer) => viewer.userId !== currentUserId)
  }, [currentUser, viewers])

  if (!otherViewers.length) return null

  const names = otherViewers.map((viewer) => viewer.name).join(', ')
  const text = t('event.viewerBanner_one', { count: otherViewers.length, names })

  return <Alert severity="info">{text}</Alert>
}
