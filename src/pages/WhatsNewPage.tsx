import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { parseISO } from 'date-fns'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { HEADER_HEIGHT } from '../assets/Theme'
import { releaseNotesFor } from '../lib/client/docs'
import { DocsBody } from './components/DocsBody'
import Header from './components/Header'

/**
 * What changed in each release, newest first. Every version is a section with the version as its
 * id, so the update notice can send a reader straight to the release they just got (KOE-1398).
 */
export const WhatsNewPage = () => {
  const { i18n, t } = useTranslation()
  const { hash } = useLocation()
  const notes = releaseNotesFor(i18n.language)

  useEffect(() => {
    const version = decodeURIComponent(hash.slice(1))
    if (version) document.getElementById(version)?.scrollIntoView()
  }, [hash])

  return (
    <>
      <Header />
      <Box sx={{ display: 'flex', height: '100%' }}>
        <Box
          sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxWidth: 900, mt: HEADER_HEIGHT, p: 2 }}
          data-testid="whats-new"
        >
          <Typography variant="h4" component="h1">
            {t('docs.whatsNew')}
          </Typography>
          {notes.map((note) => (
            <Box key={note.version} component="section" id={note.version} sx={{ mt: 3 }}>
              <Typography variant="h5" component="h2" sx={{ mb: 1 }}>
                {t('docs.version', { version: note.version })}
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1.5 }}>
                  {t('dateFormat.date', { date: parseISO(note.date) })}
                </Typography>
              </Typography>
              <DocsBody html={note.html} />
            </Box>
          ))}
        </Box>
      </Box>
    </>
  )
}
