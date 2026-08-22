import PersonOutline from '@mui/icons-material/PersonOutline'
import { useTranslation } from 'react-i18next'
import { useUserActions } from '../../../state'
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
