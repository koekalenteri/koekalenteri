import { PersonOutline } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useSnackbar } from 'notistack';
import { AppBarButton } from './Buttons';


export function UserMenu() {
  const { t } = useTranslation();
  const { enqueueSnackbar } = useSnackbar();

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    enqueueSnackbar(t('login_failed'), {variant: 'error'});
  };

  return (
    <>
      <AppBarButton onClick={handleClick} startIcon={<PersonOutline />}>
        {t(`login`)}
      </AppBarButton>
    </>
  );
}
