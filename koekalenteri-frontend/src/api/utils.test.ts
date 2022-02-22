import { add, startOfDay } from "date-fns";
import { rehydrateEvent } from "./utils";

describe('api/utils', function() {
  describe('rehydrateEvent', function() {
    it('isEntryOpen should only be true for "confirmed" events', function() {
      const start = startOfDay(Date.now());
      const end = add(start, { days: 1 });
      expect(rehydrateEvent({ state: 'tentative', entryStartDate: start, entryEndDate: end }).isEntryOpen).toBe(false);
      expect(rehydrateEvent({ state: 'confirmed', entryStartDate: start, entryEndDate: end }).isEntryOpen).toBe(true);
    });
  });
});
