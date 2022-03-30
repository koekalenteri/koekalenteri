import 'react-i18next';
import { fi, fiBreed } from './locales';

declare module 'react-i18next' {
  interface CustomTypeOptions {
    resources: {
      translation: typeof fi
      breed: typeof fiBreed
    };
  };
}
