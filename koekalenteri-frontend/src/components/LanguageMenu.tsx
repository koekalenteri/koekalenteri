import { Menu, MenuItem } from '@mui/material';
import { Language, ExpandMore } from '@mui/icons-material';
import { locales, LocaleKey } from '../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useLanguage } from '../stores';
import { AppBarButton } from '.';

export function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useLanguage(i18n.language);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = (...args: any[]) => {
    setAnchorEl(null);
  };

  useEffect(() => {
    if (language && i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [i18n, language])

  return (
    <>
      <AppBarButton onClick={handleClick} startIcon={<Language />} endIcon={<ExpandMore />}>
        {t(`locale_${language as LocaleKey}`)}
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
            {t(`locale_${locale as LocaleKey}`)}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
