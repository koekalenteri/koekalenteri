import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, useAsyncError, useRouteError } from 'react-router'
import { recordError } from '../../lib/client/rum'
import LinkButton from './LinkButton'

export const ErrorInfo = () => {
  const { t } = useTranslation()
  const routeError = useRouteError()
  const asyncError = useAsyncError()
  const error = routeError ?? asyncError

  useEffect(() => {
    recordError(error)
  })

  const reload = useCallback(() => globalThis.location.reload(), [])

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
  // Anything that lands here is a failure the page cannot recover from on its own -- a load that
  // gave up, a render that threw -- and most of them pass on a second attempt. Without something to
  // press, the only way on from here is knowing that a reload is worth trying (KOE-1463).
  return (
    <>
      <Typography variant="h1">{t('error.somethingWentWrong')}</Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Button onClick={reload} variant="contained">
          {t('error.tryAgain')}
        </Button>
        <LinkButton to="/" text={t('goHome')}></LinkButton>
      </Stack>
    </>
  )
}
