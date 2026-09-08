import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { supportRequestUrl } from '../../lib/client/support'
import { appVersion } from '../../lib/version'

interface Props {
  /** Path under /ohjeet, as the report names it. */
  readonly path: string
  readonly title: string
}

/**
 * The foot of every guide page: which version the page shipped with, and the way to say it did not
 * help. The note is honest — the guide is kept by a machine and checked by a developer, and a
 * reader reporting a wrong sentence is the intended way to use it (KOE-1402).
 */
export const DocsFooter = ({ path, title }: Props) => {
  const { i18n, t } = useTranslation()
  const href = supportRequestUrl(
    t('docs.feedbackSummary', { title }),
    t('docs.feedbackBody', { language: i18n.language, path: `/ohjeet/${path}`, version: appVersion })
  )

  return (
    <Box component="footer" sx={{ borderColor: 'divider', borderTop: 1, mt: 4, pt: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {t('docs.publishedWith', { version: appVersion })}{' '}
        <Link href={href} target="_blank" rel="noopener">
          {t('docs.feedback')}
        </Link>
      </Typography>
    </Box>
  )
}
