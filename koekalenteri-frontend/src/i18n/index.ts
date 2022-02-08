import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import fi from './locales/fi.json';
import fiStates from './locales/fi_states.json';
import en from './locales/en.json';
import enStates from './locales/en_states.json';
import { fiFI, enUS, Localization } from '@mui/material/locale';
import { fiFI as gfiFI, enUS as genUS, GridLocaleText } from "@mui/x-data-grid";
import { locales, LocaleKey, formatDate, formatDateSpan, formatDistance } from "./dates";

type MuiLocalization = Localization & {
  components: {
    MuiDataGrid: {
      defaultProps: {
        localeText: Partial<GridLocaleText>;
      };
    };
  };
};


export { locales };
export type { LocaleKey };

export const muiLocales: Record<LocaleKey, MuiLocalization> = {
  fi: { ...fiFI, ...gfiFI },
  en: { ...enUS, ...genUS }
};


i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: process.env.NODE_ENV === 'test' ? 'fi' : undefined,
    resources: {
      fi: { common: fi, states: fiStates },
      en: { common: en, states: enStates }
    },
    ns: ['common', 'states'],
    defaultNS: 'common',
    fallbackLng: 'fi',
    supportedLngs: ['fi', 'en'],
    debug: process.env.NODE_ENV === 'development',
    keySeparator: false, // flat json
    interpolation: {
      escapeValue: false
    }
  });

//  additional formats
i18n.services.formatter?.add('short', formatDate('eeeeee d.M.'));
i18n.services.formatter?.add('weekday', formatDate('eeeeee'));
i18n.services.formatter?.add('datespan', formatDateSpan);
i18n.services.formatter?.add('distance', formatDistance);
