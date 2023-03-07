import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { Box, Typography } from '@mui/material'

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
        <Link to="/">{t('goHome')}</Link>
      </>
    )
  }
  return <Typography variant="h1">Oops</Typography>
}
