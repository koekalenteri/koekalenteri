import type { DocsAudience } from '../generated/docs'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink } from 'react-router'
import { HEADER_HEIGHT } from '../assets/Theme'
import { docsPagesFor } from '../lib/client/docs'
import { Path } from '../routeConfig'
import Header from './components/Header'

/** Reader first, then the people who run a trial: the order the index is grouped in. */
const AUDIENCES: DocsAudience[] = ['participant', 'secretary', 'admin']

export const DocsIndexPage = () => {
  const { i18n, t } = useTranslation()
  const pages = docsPagesFor(i18n.language)

  return (
    <>
      <Header />
      <Box sx={{ display: 'flex', height: '100%' }}>
        <Box
          sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxWidth: 900, mt: HEADER_HEIGHT, p: 2 }}
          data-testid="docs-index"
        >
          <Typography variant="h4" component="h1">
            {t('docs.title')}
          </Typography>
          {AUDIENCES.map((audience) => {
            const forAudience = pages.filter((page) => page.audience === audience)
            if (!forAudience.length) return null

            return (
              <Box key={audience} sx={{ mt: 2 }}>
                <Typography variant="h6" component="h2">
                  {t(`docs.audience.${audience}`)}
                </Typography>
                <List dense>
                  {forAudience.map((page) => (
                    <ListItem key={page.path} disableGutters>
                      <Link component={RouterLink} to={Path.docsPage(page.path)} variant="body1">
                        {page.title}
                      </Link>
                    </ListItem>
                  ))}
                </List>
              </Box>
            )
          })}
        </Box>
      </Box>
    </>
  )
}
