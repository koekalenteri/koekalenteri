import { IconButton, Menu, MenuItem, Tooltip } from '@mui/material';
import { Language } from '@mui/icons-material';
import { locales, LocaleKey } from '../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import useLocalStorage from "use-local-storage";

export function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const [language, setLanguage] = useLocalStorage('i18nextLng', i18n.language, {serializer: (v) => v || '', parser: (v) => v});

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = (...args: any[]) => {
    setAnchorEl(null);
  };

  useEffect(() => {
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [i18n, language])

  return (
    <>
      <Tooltip title="">
        <IconButton onClick={handleClick} size="large">
          <Language />
        </IconButton>
      </Tooltip>
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
