import 'react-i18next';
import { fi } from './locales';

declare module 'react-i18next' {
  interface CustomTypeOptions {
    // custom namespace type if you changed it
    defaultNS: 'common'
    // custom resources type
    resources: {
      common: typeof fi
    };
  };
}
