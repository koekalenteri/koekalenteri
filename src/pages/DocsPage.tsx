import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink, useParams } from 'react-router'
import theme, { HEADER_HEIGHT } from '../assets/Theme'
import { docsPageFor } from '../lib/client/docs'
import { Path } from '../routeConfig'
import Header from './components/Header'

/** Markdown comes out as plain HTML tags, so the theme has to reach them here rather than through MUI. */
const DOCS_BODY_SX = {
  '& code': { bgcolor: 'action.hover', borderRadius: 0.5, fontSize: '0.875em', px: 0.5 },
  '& h2': { ...theme.typography.h6, mb: 1, mt: 3 },
  '& h3': { ...theme.typography.subtitle1, fontWeight: 'bold', mb: 0.5, mt: 2 },
  '& li': { mb: 0.5 },
  '& p': { ...theme.typography.body1, mb: 2, mt: 0 },
  '& table': { borderCollapse: 'collapse', mb: 2, width: '100%' },
  '& td, & th': { border: 1, borderColor: 'divider', p: 1, textAlign: 'left', verticalAlign: 'top' },
  '& ul, & ol': { mb: 2, mt: 0, pl: 3 },
  ...theme.typography.body1,
}

export const DocsPage = () => {
  const { i18n, t } = useTranslation()
  const params = useParams()
  const page = docsPageFor(i18n.language, params['*'] ?? '')

  return (
    <>
      <Header />
      <Box sx={{ display: 'flex', height: '100%' }}>
        <Box
          sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxWidth: 900, mt: HEADER_HEIGHT, p: 2 }}
          data-testid="docs-page"
        >
          <Link component={RouterLink} to={Path.docs} variant="body2" sx={{ mb: 1 }}>
            {t('docs.title')}
          </Link>
          {page ? (
            <>
              <Typography variant="h4" component="h1">
                {page.title}
              </Typography>
              {/* Built from the repository's own markdown at build time, not from anything a user sends. */}
              <Box
                sx={DOCS_BODY_SX}
                // biome-ignore lint/security/noDangerouslySetInnerHtml: repository markdown, rendered at build time
                dangerouslySetInnerHTML={{ __html: page.html }}
              />
            </>
          ) : (
            <Typography variant="h6" component="h1">
              {t('docs.notFound')}
            </Typography>
          )}
        </Box>
      </Box>
    </>
  )
}
