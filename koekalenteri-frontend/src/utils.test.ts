import { eventWithEntryClosing, eventWithEntryNotYetOpen, eventWithEntryOpen } from './__mockData__/events'
import { entryDateColor, parseJSON } from './utils'

describe('utils', function () {
  describe('entryDateColor', function () {
    it('should return proper values based on event status', function () {
      expect(entryDateColor(eventWithEntryNotYetOpen)).toEqual('text.primary')
      expect(entryDateColor(eventWithEntryOpen)).toEqual('success.main')
      expect(entryDateColor(eventWithEntryClosing)).toEqual('warning.main')
    })
  })

  describe('parseJSON', function() {
    expect(parseJSON('')).toBeUndefined()
    expect(parseJSON('{pvm:"2021-05-10T12:05:12"}')).toEqual({
      pvm: new Date("2021-05-10T12:05:12"),
    })
  })
})
