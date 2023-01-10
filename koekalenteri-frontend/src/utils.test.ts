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

    // @ts-expect-error invalid input
    expect(parseJSON(null)).toBeUndefined()

    // @ts-expect-error invalid input
    expect(parseJSON(undefined)).toBeUndefined()

    expect(parseJSON('{"pvm":"2021-05-10T09:05:12.000Z"}')).toEqual({
      pvm: new Date("2021-05-10T09:05:12.000Z"),
    })
  })
})
