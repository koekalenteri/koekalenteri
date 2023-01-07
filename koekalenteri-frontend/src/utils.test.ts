import { eventWithEntryClosing, eventWithEntryNotYetOpen, eventWithEntryOpen } from './__mockData__/events'
import { entryDateColor } from './utils'

describe('utils', function () {
  describe('entryDateColor', function () {
    it('should return proper values based on event status', function () {
      expect(entryDateColor(eventWithEntryNotYetOpen)).toEqual('text.primary')
      expect(entryDateColor(eventWithEntryOpen)).toEqual('success.main')
      expect(entryDateColor(eventWithEntryClosing)).toEqual('warning.main')
    })
  })
})
