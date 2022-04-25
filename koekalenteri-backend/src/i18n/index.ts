import i18n from "i18next";
import { Language } from "koekalenteri-shared/model";
import { formatDate } from "./dates";
import { en, enBreed, fi, fiBreed } from "./locales";

export type { Language };
export { i18n };

i18n
  .init({
    lng: process.env.NODE_ENV === 'test' ? 'fi' : undefined,
    ns: ['translation', 'breed'],
    resources: {
      fi: { translation: fi, breed: fiBreed },
      en: { translation: en, breed: enBreed }
    },
    fallbackLng: 'fi',
    supportedLngs: ['fi', 'en'],
    debug: true, // process.env.NODE_ENV === 'development',
    interpolation: {
      escapeValue: false
    }
  });

//  additional formats
i18n.services.formatter?.add('lowercase', value => value.toLowerCase());
i18n.services.formatter?.add('weekday', formatDate('eeeeee d.M.'));

console.log('i18next initialized');


