import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import LinkButton from './components/LinkButton'

export function ErrorPage() {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundColor: 'background.default',
      }}
    >
      <ErrorInfo />
    </Box>
  )
}

function ErrorInfo() {
  const { t } = useTranslation()
  const error = useRouteError()

  if (isRouteErrorResponse(error) || error instanceof Response) {
    return (
      <>
        <Typography variant="h1">{error.status}</Typography>
        <Typography variant="body1">{error.statusText}</Typography>
        {'data' in error && error.data?.message && <p>{error.data.message}</p>}
        <LinkButton to="/" text={t('goHome')}></LinkButton>
      </>
    )
  }
  return (
    <>
      <Typography variant="h1">Oops</Typography>
      <LinkButton to="/" text={t('goHome')}></LinkButton>
    </>
  )
}
