import { useTranslation } from 'react-i18next'
import PersonOutline from '@mui/icons-material/PersonOutline'

import { useUserActions } from '../../../recoil'
import AppBarButton from '../AppBarButton'

export default function LoginButton() {
  const { t } = useTranslation()
  const actions = useUserActions()

  return (
    <AppBarButton onClick={actions.login} startIcon={<PersonOutline />} label={t(`login`)}>
      {t(`login`)}
    </AppBarButton>
  )
}
