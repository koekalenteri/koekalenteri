import { IconButton, Menu, MenuItem, Tooltip } from '@mui/material';
import { Language } from '@mui/icons-material';
import { locales, LocaleKey } from '../i18n';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

export function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = (...args: any[]) => {
    console.log(i18n.language);
    setAnchorEl(null);
  };

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

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
            selected={i18n.language === locale}
            onClick={() => changeLanguage(locale)}
          >
            {t(`locale_${locale as LocaleKey}`)}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
