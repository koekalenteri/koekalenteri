import { Menu, MenuItem } from '@mui/material';
import { Language as LanguageIcon, ExpandMore } from '@mui/icons-material';
import { Language, locales } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useLanguage } from '../../stores';
import { AppBarButton } from '..';

export function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useLanguage(i18n.language);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  useEffect(() => {
    if (language && i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [i18n, language])

  return (
    <>
      <AppBarButton onClick={handleClick} startIcon={<LanguageIcon />} endIcon={<ExpandMore />}>
        {t(`locale.${language as Language}`)}
      </AppBarButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        onClick={handleClose}
      >
        {Object.keys(locales).map((locale) => (
          <MenuItem
            key={locale}
            selected={language === locale}
            onClick={() => setLanguage(locale)}
          >
            {t(`locale.${locale as Language}`)}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
