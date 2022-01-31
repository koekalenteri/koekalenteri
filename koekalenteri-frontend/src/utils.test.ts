import { emptyEvent } from './api/test-utils/emptyEvent';
import {entryDateColor} from './utils';

describe('utils', function() {
  describe('entryDateColor', function() {
    it('should return proper values based on event status', function() {
      expect(entryDateColor({...emptyEvent, isEntryOpen: false, isEntryClosing: false, isEntryUpcoming: false })).toEqual('text.primary');
      expect(entryDateColor({...emptyEvent, isEntryOpen: true, isEntryClosing: false, isEntryUpcoming: false })).toEqual('success.main');
      expect(entryDateColor({...emptyEvent, isEntryOpen: true, isEntryClosing: true, isEntryUpcoming: false })).toEqual('warning.main');
    })
  });
});
