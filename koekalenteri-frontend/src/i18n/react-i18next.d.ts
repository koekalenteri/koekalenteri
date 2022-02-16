import 'react-i18next';
import { fi, fiEvent, fiStates } from './locales';

declare module 'react-i18next' {
  interface CustomTypeOptions {
    // custom namespace type if you changed it
    defaultNS: 'common';
    // custom resources type
    resources: {
      common: typeof fi;
      event: typeof fiEvent;
      states: typeof fiStates;
    };
  };
}
