import 'react-i18next';

import common from './locales/fi.json';
import states from './locales/fi_states.json';
declare module 'react-i18next' {
  export interface Resources {
    common: typeof common;
    states: typeof states;
  }
}
