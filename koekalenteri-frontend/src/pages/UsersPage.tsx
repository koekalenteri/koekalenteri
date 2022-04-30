import { useTranslation } from 'react-i18next';
import { AuthPage } from './AuthPage';

export function UsersPage() {
  const { t } = useTranslation();

  return (
    <AuthPage title={t('users')}>
    </AuthPage>
  )
}
