import type { JsonRegistration, Registration } from '../../types'

import { jest } from '@jest/globals'
import { addMinutes } from 'date-fns'

import { eventWithStaticDates } from '../../__mockData__/events'
import { registrationWithStaticDates } from '../../__mockData__/registrations'
import { GROUP_KEY_RESERVE } from '../../lib/registration'
import { ISO8601DateTimeRE } from '../test-utils/constants'
import { constructAPIGwEvent } from '../test-utils/helpers'

const mockSES = {
  send: jest.fn(),
}
jest.unstable_mockModule('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => mockSES),
  SendTemplatedEmailCommand: jest.fn((p) => p),
}))

const mockGetEvent = jest.fn<(eventId: string) => Promise<JsonRegistration>>()
const mockUpdateEventStatsForRegistration = jest.fn()
const mockUpdateRegistrations = jest.fn()
const mockDynamoDBWrite = jest.fn()

jest.unstable_mockModule('../lib/event', () => ({
  getEvent: mockGetEvent,
  updateRegistrations: mockUpdateRegistrations,
}))

jest.unstable_mockModule('../lib/stats', () => ({
  updateEventStatsForRegistration: mockUpdateEventStatsForRegistration,
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    write: mockDynamoDBWrite,
  })),
}))

const mockGetRegistration = jest.fn<(eventId: string, registrationId: string) => Promise<JsonRegistration>>()
const mockSaveRegistration = jest.fn()
const mockfindExistingRegistrationToEventForDog = jest.fn<
  (eventId: string, regNo: string) => Promise<JsonRegistration | undefined>
>(async () => undefined)

const libRegistration = await import('../lib/registration')

jest.unstable_mockModule('../lib/registration', () => ({
  ...libRegistration,
  getRegistration: mockGetRegistration,
  saveRegistration: mockSaveRegistration,
  findExistingRegistrationToEventForDog: mockfindExistingRegistrationToEventForDog,
}))

const { default: putRegistrationLabmda } = await import('./handler')

describe('putRegistrationLabmda', () => {
  jest.spyOn(console, 'debug').mockImplementation(() => undefined)
  jest.spyOn(console, 'log').mockImplementation(() => undefined)

  beforeAll(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.clearAllMocks()
  })
  afterAll(() => {
    jest.useRealTimers()
  })

  it('should do happy path for new registration', async () => {
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(mockSaveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        ...JSON.parse(JSON.stringify(registrationWithStaticDates)),
        id: expect.stringMatching(/^[A-Za-z0-9_-]{10}$/),
        createdAt: expect.stringMatching(ISO8601DateTimeRE),
        createdBy: 'anonymous',
        modifiedAt: expect.stringMatching(ISO8601DateTimeRE),
        modifiedBy: 'anonymous',
      })
    )
    expect(mockSaveRegistration).toHaveBeenCalledWith(expect.not.objectContaining({ state: expect.anything() }))
    expect(mockSaveRegistration).toHaveBeenCalledTimes(1)
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({ auditKey: expect.any(String), message: 'Ilmoittautui', user: 'anonymous' }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledTimes(1)

    expect(mockSES.send).not.toHaveBeenCalled()
    expect(mockUpdateRegistrations).not.toHaveBeenCalled()

    expect(res.statusCode).toEqual(200)
  })

  it('should send email for new registration when paymentTime is confirmation', async () => {
    const eventWithConfirmationPayment = { ...eventWithStaticDates, paymentTime: 'confirmation' }
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithConfirmationPayment)))
    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(mockSaveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'ready',
      })
    )

    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['handler@example.com', 'owner@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Template: 'registration-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisen vahvistus"'),
    })
    expect(mockSES.send).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toEqual(200)
  })

  it.each([
    [undefined, 'Ilmoittautuminen peruttiin, syy: (ei täytetty)'],
    ['dog-heat', 'Ilmoittautuminen peruttiin, syy: Koiran juoksut'],
    ['handler-sick', 'Ilmoittautuminen peruttiin, syy: Ohjaajan sairastuminen'],
    ['dog-sick', 'Ilmoittautuminen peruttiin, syy: Koiran sairastuminen'],
    ['gdpr', 'Ilmoittautuminen peruttiin, syy: En halua kertoa'],
    ['custom reason', 'Ilmoittautuminen peruttiin, syy: custom reason'],
  ])('should do happy path for cancelled registration', async (cancelReason, auditMessage) => {
    const existingJson = JSON.parse(JSON.stringify(registrationWithStaticDates))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const res = await putRegistrationLabmda(
      constructAPIGwEvent({ ...registrationWithStaticDates, cancelled: true, cancelReason })
    )

    expect(mockSaveRegistration).toHaveBeenCalledWith({
      ...existingJson,
      cancelled: true,
      cancelReason,
      modifiedAt: new Date().toISOString(),
      modifiedBy: 'anonymous',
    })
    expect(mockSaveRegistration).toHaveBeenCalledTimes(1)
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: auditMessage,
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Email: Ilmoittautumisesi on peruttu, to: handler@example.com, owner@example.com',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledTimes(2)

    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['handler@example.com', 'owner@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Template: 'registration-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })
    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['secretary@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Template: 'cancel-early-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })

    expect(mockSES.send).toHaveBeenCalledTimes(2)

    expect(mockUpdateRegistrations).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toEqual(200)
  })

  it('should notify secretary when cancelling from reserve and it was notified', async () => {
    jest.setSystemTime(addMinutes(eventWithStaticDates.entryStartDate, 1))

    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: GROUP_KEY_RESERVE, number: 2 },
    }
    const existingJson: JsonRegistration = JSON.parse(JSON.stringify({ ...registration, reserveNotified: true }))

    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registration, cancelled: true }))

    expect(mockSaveRegistration).toHaveBeenCalledWith({
      ...existingJson,
      cancelled: true,
      modifiedAt: new Date().toISOString(),
      modifiedBy: 'anonymous',
    })
    expect(mockSaveRegistration).toHaveBeenCalledTimes(1)
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Ilmoittautuminen peruttiin, syy: (ei täytetty)',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Email: Ilmoittautumisesi on peruttu, to: handler@example.com, owner@example.com',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledTimes(2)

    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['handler@example.com', 'owner@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Template: 'registration-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })
    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['secretary@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Template: 'cancel-reserve-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })
    expect(mockSES.send).toHaveBeenCalledTimes(2)

    expect(mockUpdateRegistrations).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toEqual(200)
  })

  it('should notify secretary when cancelling from reserve and it was not notified', async () => {
    jest.setSystemTime(addMinutes(eventWithStaticDates.entryEndDate, 1))

    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: GROUP_KEY_RESERVE, number: 2 },
    }
    const existingJson: JsonRegistration = JSON.parse(JSON.stringify({ ...registration, reserveNotified: false }))

    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registration, cancelled: true }))

    expect(mockSaveRegistration).toHaveBeenCalledWith({
      ...existingJson,
      cancelled: true,
      modifiedAt: new Date().toISOString(),
      modifiedBy: 'anonymous',
    })
    expect(mockSaveRegistration).toHaveBeenCalledTimes(1)
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Ilmoittautuminen peruttiin, syy: (ei täytetty)',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Email: Ilmoittautumisesi on peruttu, to: handler@example.com, owner@example.com',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledTimes(2)

    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['handler@example.com', 'owner@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Template: 'registration-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })
    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['secretary@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Template: 'cancel-early-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })

    expect(mockSES.send).toHaveBeenCalledTimes(2)

    expect(mockUpdateRegistrations).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toEqual(200)
  })

  it('should notify secretary when cancelling from participants', async () => {
    jest.setSystemTime(addMinutes(eventWithStaticDates.entryEndDate, 1))

    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: 'participants-1', number: 2 },
    }
    const existingJson: JsonRegistration = JSON.parse(JSON.stringify(registration))

    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)

    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registration, cancelled: true }))

    expect(mockSaveRegistration).toHaveBeenCalledWith({
      ...existingJson,
      cancelled: true,
      modifiedAt: new Date().toISOString(),
      modifiedBy: 'anonymous',
    })
    expect(mockSaveRegistration).toHaveBeenCalledTimes(1)
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Ilmoittautuminen peruttiin, syy: (ei täytetty)',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Email: Ilmoittautumisesi on peruttu, to: handler@example.com, owner@example.com',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledTimes(2)

    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['handler@example.com', 'owner@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Template: 'registration-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })
    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['secretary@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Template: 'cancel-picked-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })
    expect(mockSES.send).toHaveBeenCalledTimes(2)

    expect(mockUpdateRegistrations).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toEqual(200)
  })
  it('should do happy path for updating registration', async () => {
    const existingJson = JSON.parse(JSON.stringify(registrationWithStaticDates))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const updatedRegistration = { ...registrationWithStaticDates, notes: 'updated notes' }
    const res = await putRegistrationLabmda(constructAPIGwEvent(updatedRegistration))

    expect(mockSaveRegistration).toHaveBeenCalledWith({
      ...existingJson,
      notes: 'updated notes',
      modifiedAt: new Date().toISOString(),
      modifiedBy: 'anonymous',
    })
    expect(mockSaveRegistration).toHaveBeenCalledTimes(1)
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: expect.any(String),
        message: 'Muutti: Lisätiedot',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Email: Ilmoittautumisesi tietoja on muokattu, to: handler@example.com, owner@example.com',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledTimes(2)

    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['handler@example.com', 'owner@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Template: 'registration-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi tietoja on muokattu"'),
    })
    expect(mockSES.send).toHaveBeenCalledTimes(1)

    expect(mockUpdateRegistrations).not.toHaveBeenCalled()

    expect(res.statusCode).toEqual(200)
  })

  it('should do happy path for confirming registration', async () => {
    const existingJson = JSON.parse(JSON.stringify(registrationWithStaticDates))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, confirmed: true }))

    expect(mockSaveRegistration).toHaveBeenCalledWith({
      ...existingJson,
      confirmed: true,
      modifiedAt: new Date().toISOString(),
      modifiedBy: 'anonymous',
    })
    expect(mockSaveRegistration).toHaveBeenCalledTimes(1)
    expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledTimes(1)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: expect.any(String),
        message: 'Ilmoittautumisen vahvistus',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        auditKey: `${eventWithStaticDates.id}:${registrationWithStaticDates.id}`,
        message: 'Email: Vahvistit vastaanottavasi koepaikan, to: handler@example.com, owner@example.com',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledTimes(2)

    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['handler@example.com', 'owner@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Template: 'registration-local-fi',
      TemplateData: expect.stringContaining('"subject":"Vahvistit vastaanottavasi koepaikan"'),
    })
    expect(mockSES.send).toHaveBeenCalledTimes(1)

    expect(mockUpdateRegistrations).not.toHaveBeenCalled()

    expect(res.statusCode).toEqual(200)
  })

  it('should not send secretary email on cancellation if secretary has no email', async () => {
    const eventWithoutSecretaryEmail = {
      ...eventWithStaticDates,
      contactInfo: { secretary: { name: 'Testi Testinen' } },
    }
    const existingJson = JSON.parse(JSON.stringify(registrationWithStaticDates))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithoutSecretaryEmail)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, cancelled: true }))

    expect(mockSES.send).toHaveBeenCalledWith({
      ConfigurationSetName: 'Koekalenteri',
      Destination: {
        ToAddresses: ['handler@example.com', 'owner@example.com'],
      },
      Source: 'koekalenteri@koekalenteri.snj.fi',
      Template: 'registration-local-fi',
      TemplateData: expect.stringContaining('"subject":"Ilmoittautumisesi on peruttu"'),
    })
    // once for user, not for secretary
    expect(mockSES.send).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toEqual(200)
  })

  it('should not confirm an already cancelled registration', async () => {
    const existingJson = JSON.parse(JSON.stringify({ ...registrationWithStaticDates, cancelled: true }))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const res = await putRegistrationLabmda(
      constructAPIGwEvent({ ...registrationWithStaticDates, confirmed: true, cancelled: true })
    )

    expect(mockSaveRegistration).toHaveBeenCalledWith({
      ...existingJson,
      confirmed: true, // data is merged
      modifiedAt: new Date().toISOString(),
      modifiedBy: 'anonymous',
    })
    expect(mockSaveRegistration).toHaveBeenCalledTimes(1)

    // No audit message for confirmation
    expect(mockDynamoDBWrite).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Ilmoittautumisen vahvistus',
      })
    )

    // No email for confirmation
    expect(mockSES.send).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toEqual(200)
  })

  it('should return 409 if dog is already registered to the event', async () => {
    mockfindExistingRegistrationToEventForDog.mockResolvedValueOnce(
      JSON.parse(JSON.stringify(registrationWithStaticDates))
    )

    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(409)
  })

  it('should not fail if secretary email fails', async () => {
    const error = new Error('test error')
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    mockSES.send.mockImplementationOnce(() => Promise.resolve()) // first send is for user
    mockSES.send.mockImplementationOnce(() => Promise.reject(error)) // second send is for secretary
    const existingJson = JSON.parse(JSON.stringify(registrationWithStaticDates))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const res = await putRegistrationLabmda(constructAPIGwEvent({ ...registrationWithStaticDates, cancelled: true }))
    expect(res.statusCode).toEqual(200)
    expect(errorSpy).toHaveBeenCalledWith('error notifying cancellation to secretary', error)
  })

  it('should send invitation read email', async () => {
    const existingJson = JSON.parse(JSON.stringify(registrationWithStaticDates))
    mockGetEvent.mockResolvedValueOnce(JSON.parse(JSON.stringify(eventWithStaticDates)))
    mockGetRegistration.mockResolvedValueOnce(existingJson)
    const res = await putRegistrationLabmda(
      constructAPIGwEvent({ ...registrationWithStaticDates, invitationRead: true })
    )
    expect(res.statusCode).toEqual(200)
    expect(mockSES.send).toHaveBeenCalledWith(
      expect.objectContaining({
        Template: 'registration-local-fi',
        TemplateData: expect.stringContaining('"subject":"Olet kuitannut koekutsun"'),
      })
    )
  })
})
