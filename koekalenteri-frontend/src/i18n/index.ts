import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import fi from './locales/fi.json';
import en from './locales/en.json';
import { locales, LocaleKey, formatDate, formatDateSpan } from "./dates";

export { locales };
export type { LocaleKey };

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: process.env.NODE_ENV === 'test' ? 'fi' : undefined,
    resources: {
      fi: { common: fi },
      en: { common: en }
    },
    ns: ['common'],
    defaultNS: 'common',
    fallbackLng: "fi",
    supportedLngs: ['fi', 'en'],
    debug: process.env.NODE_ENV === 'development',
    keySeparator: false, // flat json
    interpolation: {
      escapeValue: false
    }
  });

//  additional formats
i18n.services.formatter?.add('short', formatDate('eeeeee d.M.'));
i18n.services.formatter?.add('datespan', formatDateSpan);
