import type { RulesDocument, RulesSection } from '../../generated/docs'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { parseISO } from 'date-fns'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DocsBody } from './DocsBody'

interface Props {
  readonly document: RulesDocument
}

/** Whether a section's words hold every word of the query. */
const matches = (section: RulesSection, words: readonly string[]) =>
  words.every((word) => section.text.includes(word) || section.number.startsWith(word))

/**
 * The Kennel Club's rules as a page: the whole text, searchable, every section under an anchor of
 * its own (`#s-4-4` is §4.4) so the application and the guides can point at the rule they act on.
 * The text is extracted from the official PDF, and the page says so; where they differ, the PDF
 * prevails (KOE-1399).
 */
export const RulesBody = ({ document }: Props) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  const words = useMemo(() => deferredQuery.toLowerCase().split(/\s+/).filter(Boolean), [deferredQuery])
  const visible = useMemo(() => {
    const parts = document.parts.map((part) => ({
      ...part,
      chapters: part.chapters
        .map((chapter) => ({ ...chapter, sections: chapter.sections.filter((section) => matches(section, words)) }))
        .filter((chapter) => chapter.sections.length > 0),
    }))
    const count = parts.reduce(
      (sum, part) => sum + part.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.sections.length, 0),
      0
    )

    return { count, parts: parts.filter((part) => part.chapters.length > 0) }
  }, [document.parts, words])

  const searching = words.length > 0

  return (
    <Box data-testid="rules">
      <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
        {t('docs.rulesNotice')} {t('docs.rulesEdition', { edition: parseISO(document.edition) })}
        {document.amended ? ` ${t('docs.rulesAmended', { amended: parseISO(document.amended) })}` : ''}{' '}
        <Link href={document.source} target="_blank" rel="noopener">
          {t('docs.rulesSource')}
        </Link>
      </Alert>
      <TextField
        fullWidth
        label={t('docs.rulesSearch')}
        onChange={(event) => setQuery(event.target.value)}
        size="small"
        type="search"
        value={query}
      />
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2, mt: 0.5 }}>
        {t('docs.rulesCount', { count: visible.count })}
      </Typography>
      {!searching && (
        <Box component="nav" aria-label={t('docs.rulesToc')} sx={{ mb: 3 }}>
          {document.parts.map((part) => (
            <Box key={part.number} sx={{ mb: 1 }}>
              <Typography variant="subtitle2" component="p">
                {part.number}: {part.title}
              </Typography>
              <List dense disablePadding>
                {part.chapters.map((chapter) => (
                  <ListItem key={chapter.id} disableGutters sx={{ py: 0 }}>
                    <Link href={`#${chapter.id}`} variant="body2">
                      {chapter.title}
                    </Link>
                  </ListItem>
                ))}
              </List>
            </Box>
          ))}
        </Box>
      )}
      {visible.parts.map((part) => (
        <Box key={part.number} component="section">
          <Typography variant="h5" component="h2" sx={{ mt: 4 }}>
            {part.number}: {part.title}
          </Typography>
          {!searching && part.intro ? <DocsBody html={part.intro} /> : null}
          {part.chapters.map((chapter) => (
            <Box key={chapter.id} component="section" id={chapter.id} sx={{ scrollMarginTop: 80 }}>
              <Typography variant="h6" component="h3" sx={{ mt: 3 }}>
                {chapter.title}
              </Typography>
              {!searching && chapter.intro ? <DocsBody html={chapter.intro} /> : null}
              {chapter.sections.map((section) => (
                <Box key={section.id} component="section" id={section.id} sx={{ scrollMarginTop: 80 }}>
                  <Typography
                    variant={section.level === 1 ? 'subtitle1' : 'subtitle2'}
                    component={section.level === 1 ? 'h4' : 'h5'}
                    sx={{ fontWeight: 'bold', mt: 2 }}
                  >
                    <Link href={`#${section.id}`} color="text.secondary" underline="hover" sx={{ mr: 1 }}>
                      §{section.number}
                    </Link>
                    {section.title}
                  </Typography>
                  <DocsBody html={section.html} />
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      ))}
      {searching && visible.count === 0 ? (
        <Typography color="text.secondary">{t('docs.rulesNoMatch')}</Typography>
      ) : null}
    </Box>
  )
}
