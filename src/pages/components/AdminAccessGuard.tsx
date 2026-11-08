import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HEADER_HEIGHT } from '../../assets/Theme'
import { Path } from '../../routeConfig'
import { adminAccessAtom, signingOutAtom, userRefreshAtom, useUserActions } from '../state'
import Header from './Header'
import LinkButton from './LinkButton'

interface Props {
  readonly children: ReactNode
}

/** The heading, the text and the buttons in the middle of the page, under the header. */
const AccessMessage = ({ children }: Props) => (
  <>
    <Header />
    <Box
      sx={{
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        mt: HEADER_HEIGHT,
        px: 2,
        py: 4,
        textAlign: 'center',
      }}
    >
      {children}
    </Box>
  </>
)

/**
 * Renders an admin page only for a user with admin access. A visitor who is not signed in goes to
 * login, unless they have just signed out here and are on their way to the front page. A signed-in user is never sent there: the login page sees the session and returns to the
 * page at once, which looped forever (KOE-1734). Without a role they are told so; when their user
 * could not be loaded they get a retry.
 */
export function AdminAccessGuard({ children }: Props) {
  const { t } = useTranslation()
  const access = useAtomValue(adminAccessAtom)
  const signingOut = useAtomValue(signingOutAtom)
  // Whether this page was opened signed in: only such a page can be the one a sign-out leaves.
  const [openedSignedIn] = useState(access !== 'signedOut')
  const { login } = useUserActions()
  const bumpUserRefresh = useSetAtom(userRefreshAtom)

  useEffect(() => {
    // A sign-out clears the token on its way to the front page; the page it leaves sends no one to login.
    if (access === 'signedOut' && !(signingOut && openedSignedIn)) login()
  }, [access, login, openedSignedIn, signingOut])

  if (access === 'granted') return children

  if (access === 'denied') {
    return (
      <AccessMessage>
        <Typography variant="h1">{t('error.noAdminAccess')}</Typography>
        <Typography variant="body1">{t('error.noAdminAccessInfo')}</Typography>
        <LinkButton to={Path.home} text={t('goHome')} />
      </AccessMessage>
    )
  }

  if (access === 'unavailable') {
    return (
      <AccessMessage>
        <Typography variant="h1">{t('error.userUnavailable')}</Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button onClick={() => bumpUserRefresh((n) => n + 1)} variant="contained">
            {t('error.tryAgain')}
          </Button>
          <LinkButton to={Path.home} text={t('goHome')} />
        </Stack>
      </AccessMessage>
    )
  }

  return null
}
