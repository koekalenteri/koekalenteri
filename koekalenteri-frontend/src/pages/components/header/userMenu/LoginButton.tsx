import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { PersonOutline } from '@mui/icons-material'

import { Path } from '../../../../routeConfig'
import AppBarButton from "../AppBarButton"

export default function LoginButton() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const navigateToLogin = useCallback(() => navigate(Path.login, { state: { from: location } }), [location, navigate])

  return (
    <>
      <AppBarButton onClick={navigateToLogin} startIcon={<PersonOutline />}>
        {t(`login`)}
      </AppBarButton>
    </>
  )
}
