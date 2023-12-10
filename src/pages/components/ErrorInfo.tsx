import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, useAsyncError, useRouteError } from 'react-router-dom'
import Typography from '@mui/material/Typography'

import { rum } from '../../lib/client/rum'

import LinkButton from './LinkButton'

export const ErrorInfo = () => {
  const { t } = useTranslation()
  const routeError = useRouteError()
  const asyncError = useAsyncError()
  const error = routeError ?? asyncError

  useEffect(() => {
    rum()?.recordError(error)
  })

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
