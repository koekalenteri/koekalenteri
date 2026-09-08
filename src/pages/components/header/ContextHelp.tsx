import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined'
import { useAtomValue } from 'jotai'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { docsPathForRoute } from '@/lib/client/docsContext'
import { Path } from '@/routeConfig'
import { helpPathAtom } from '../../state/docs'
import AppBarButton from './AppBarButton'

/**
 * The header's way into the guide for the view on the screen. Shown only where a guide describes
 * the view: an icon that promises the right page must not land on the index (KOE-1402).
 */
export default function ContextHelp() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const claimed = useAtomValue(helpPathAtom)
  const path = claimed ?? docsPathForRoute(location.pathname)

  const handleClick = useCallback(() => {
    if (path) navigate(Path.docsPage(path))
  }, [navigate, path])

  if (!path) return null

  return (
    <AppBarButton label={t('docs.contextHelp')} onClick={handleClick} startIcon={<HelpOutlineOutlined />}>
      {t('docs.contextHelp')}
    </AppBarButton>
  )
}
