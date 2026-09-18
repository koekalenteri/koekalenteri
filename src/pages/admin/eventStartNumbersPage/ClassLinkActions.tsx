import ContentCopy from '@mui/icons-material/ContentCopy'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'

interface Props {
  readonly onCopy: () => void
  readonly onRevoke: () => void
}

/**
 * What the event secretary can do with one class's link: hand it out, or call it back.
 *
 * The buttons carry a sentence saying what the link is for. Copying a link says nothing about what
 * the receiver can then do with it, and the secretary reaching for this is doing it once a season —
 * "kyllä se kopioituu, mutta ei oikein selitä, että mihin tätä voisi käyttää" (KOE-1267).
 */
export function ClassLinkActions({ onCopy, onRevoke }: Props) {
  const { t } = useTranslation()

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        alignItems: 'center',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        px: 2,
      }}
    >
      <Typography color="text.secondary" sx={{ flexGrow: 1, minWidth: '20ch' }} variant="caption">
        {t('startNumbers.copyLinkInfo')}
      </Typography>
      <Button onClick={onCopy} size="small" startIcon={<ContentCopy fontSize="small" />}>
        {t('startNumbers.copyLink')}
      </Button>
      <Button onClick={onRevoke} size="small">
        {t('startNumbers.revokeLink')}
      </Button>
    </Stack>
  )
}
