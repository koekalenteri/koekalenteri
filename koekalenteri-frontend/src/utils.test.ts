import { EventEx } from 'koekalenteri-shared/model';

import { emptyEvent } from './api/test-utils/emptyEvent';
import {entryDateColor} from './utils';

describe('utils', function() {
  describe('entryDateColor', function() {
    it('should return proper values based on event status', function() {
      const event: EventEx = {
        ...emptyEvent,
        isEntryUpcoming: false,
        isEntryOpen: false,
        isEntryClosing: false,
        isEntryClosed: false,

        isEventUpcoming: true,
        isEventOngoing: false,
        isEventOver: false,
      };

      expect(entryDateColor(event)).toEqual('text.primary');

      event.isEntryOpen = true;
      expect(entryDateColor(event)).toEqual('success.main');

      event.isEntryClosing = true;
      expect(entryDateColor(event)).toEqual('warning.main');
    })
  });
});
