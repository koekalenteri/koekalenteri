import Box from '@mui/material/Box'
import theme from '../../assets/Theme'

/** The level a body's own headings start at: a guide's sections are h2, a release note's h3 (KOE-1506). */
type SectionLevel = 2 | 3

/** Markdown comes out as plain HTML tags, so the theme has to reach them here rather than through MUI. */
const docsBodySx = (sectionLevel: SectionLevel) => ({
  '& code': { bgcolor: 'action.hover', borderRadius: 0.5, fontSize: '0.875em', px: 0.5 },
  '& figcaption': { ...theme.typography.caption, color: 'text.secondary', mt: 0.5 },
  // A guide's picture is a visual test's reference screenshot, shown at the width it was taken at
  // or narrower; the caption is the markdown's own words for it.
  '& figure.guide-shot': { m: 0, mb: 3, mt: 1 },
  '& figure.guide-shot img': { border: 1, borderColor: 'divider', borderRadius: 1, height: 'auto', maxWidth: '100%' },
  [`& h${sectionLevel}`]: { ...theme.typography.h6, mb: 1, mt: 3 },
  [`& h${sectionLevel + 1}`]: { ...theme.typography.subtitle1, fontWeight: 'bold', mb: 0.5, mt: 2 },
  '& li': { mb: 0.5 },
  '& p': { ...theme.typography.body1, mb: 2, mt: 0 },
  '& table': { borderCollapse: 'collapse', mb: 2, width: '100%' },
  '& td, & th': { border: 1, borderColor: 'divider', p: 1, textAlign: 'left', verticalAlign: 'top' },
  '& ul, & ol': { mb: 2, mt: 0, pl: 3 },
  ...theme.typography.body1,
})

const SX_BY_SECTION_LEVEL = { 2: docsBodySx(2), 3: docsBodySx(3) }

interface Props {
  /** Built from the repository's own markdown at build time, not from anything a user sends. */
  readonly html: string
  /** The level the body's own top headings are at, below the headings the page draws itself. */
  readonly sectionLevel?: SectionLevel
}

/** A guide page's or a release note's body, as the build rendered it. */
export const DocsBody = ({ html, sectionLevel = 2 }: Props) => (
  <Box
    sx={SX_BY_SECTION_LEVEL[sectionLevel]}
    // biome-ignore lint/security/noDangerouslySetInnerHtml: repository markdown, rendered at build time
    dangerouslySetInnerHTML={{ __html: html }}
  />
)
