import type { TFunction } from 'i18next'
import type { PublicConfirmedEvent } from '../types/Event'
import type { PublicRegistration } from '../types/Registration'
import { startListSpreadsheetRows } from './startList'

describe('startListSpreadsheetRows', () => {
  const t = ((key: string) =>
    ({
      'registration.timeLong.ap': 'morning',
      'startListExport.breeder': 'Breeder',
      'startListExport.cancelled': 'Cancelled',
      'startListExport.class': 'Class',
      'startListExport.date': 'Date',
      'startListExport.dateOfBirth': 'Date of birth',
      'startListExport.dog': 'Dog',
      'startListExport.handler': 'Handler',
      'startListExport.number': 'Number',
      'startListExport.owner': 'Owner',
      'startListExport.registrationNumber': 'Registration number',
      'startListExport.status': 'Status',
      'startListExport.time': 'Time',
    })[key] ?? key) as TFunction

  it('creates localized headers and typed date cells for registrations', () => {
    const event = { eventType: 'NOU', startDate: new Date('2023-02-01') } as PublicConfirmedEvent
    const registration = {
      breeder: 'Test Breeder',
      cancelled: true,
      class: 'ALO',
      dog: { dob: new Date('2020-01-02'), name: 'Test Dog', regNo: 'REG1', titles: 'FI MVA' },
      group: { number: 2, time: 'ap' },
      handler: 'Test Handler',
      owner: 'Test Owner',
      ownerHandles: true,
    } as PublicRegistration

    expect(startListSpreadsheetRows([registration], event, t)).toEqual([
      [
        'Date',
        'Time',
        'Class',
        'Number',
        'Status',
        'Dog',
        'Registration number',
        'Date of birth',
        'Owner',
        'Handler',
        'Breeder',
      ],
      [
        new Date(2023, 1, 1, 12),
        'morning',
        'ALO',
        2,
        'Cancelled',
        'FI MVA Test Dog',
        'REG1',
        new Date(2020, 0, 2, 12),
        'Test Owner',
        'Test Owner',
        'Test Breeder',
      ],
    ])
  })
})
