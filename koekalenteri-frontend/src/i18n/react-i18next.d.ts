import 'react-i18next';

import common from './locales/fi.json';

declare module 'react-i18next' {
  export interface Resources {
    common: typeof common;
  }
}
