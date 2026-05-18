import type { JsonDogEvent, JsonRegistration, Registration } from '../../types'
import { jest } from '@jest/globals'
import { eventWithStaticDates } from '../../__mockData__/events'
import { registrationWithStaticDates } from '../../__mockData__/registrations'
import { GROUP_KEY_RESERVE } from '../../lib/registration'
import { LambdaError } from '../lib/lambda'
import { constructAPIGwEvent } from '../test-utils/helpers'

const mockSES = {
  send: jest.fn(),
}
jest.unstable_mockModule('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => mockSES),
  SendTemplatedEmailCommand: jest.fn((p) => p),
}))

const mockDynamoDBWrite = jest.fn()

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    write: mockDynamoDBWrite,
  })),
}))

const mockSubmitRegistration = jest.fn<() => Promise<unknown>>()

jest.unstable_mockModule('../registration/actions', () => ({
  submitRegistration: mockSubmitRegistration,
}))

const { default: putRegistrationLambda } = await import('./handler')

const confirmedEvent: JsonDogEvent = JSON.parse(JSON.stringify(eventWithStaticDates))
const existingJson: JsonRegistration = JSON.parse(JSON.stringify(registrationWithStaticDates))

describe('putRegistrationLambda', () => {
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

  it('should return 304 for no-op', async () => {
    mockSubmitRegistration.mockResolvedValueOnce({ kind: 'no-op', registration: existingJson })

    const res = await putRegistrationLambda(constructAPIGwEvent(registrationWithStaticDates))

    expect(res.statusCode).toEqual(304)
    expect(res.body).toBeUndefined()
    expect(mockSES.send).not.toHaveBeenCalled()
    expect(mockDynamoDBWrite).not.toHaveBeenCalled()
  })

  it('should return 410 when entry is closed', async () => {
    mockSubmitRegistration.mockResolvedValueOnce({ kind: 'entry-closed' })

    const res = await putRegistrationLambda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(410)
    expect(res.body).toContain('Entry is not open')
    expect(mockSES.send).not.toHaveBeenCalled()
    expect(mockDynamoDBWrite).not.toHaveBeenCalled()
  })

  it('should return 409 when dog is already registered', async () => {
    mockSubmitRegistration.mockResolvedValueOnce({ cancelled: false, kind: 'already-registered' })

    const res = await putRegistrationLambda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(409)
    expect(JSON.parse(res.body ?? '{}')).toMatchObject({
      cancelled: false,
      message: 'Conflict: Dog already registered to this event',
    })
  })

  it('should return 409 with cancelled=true when duplicate was previously cancelled', async () => {
    mockSubmitRegistration.mockResolvedValueOnce({ cancelled: true, kind: 'already-registered' })

    const res = await putRegistrationLambda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(409)
    expect(JSON.parse(res.body ?? '{}')).toMatchObject({ cancelled: true })
  })

  it('should return 200 and write audit for new registration (no email when paymentTime is not confirmation)', async () => {
    const created: JsonRegistration = {
      ...existingJson,
      createdAt: new Date().toISOString(),
      createdBy: 'anonymous',
      id: 'newid12345',
    }
    mockSubmitRegistration.mockResolvedValueOnce({ event: confirmedEvent, kind: 'created', registration: created })

    const res = await putRegistrationLambda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(200)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Ilmoittautui', user: 'anonymous' }),
      'audit-table-not-found-in-env'
    )
    expect(mockDynamoDBWrite).toHaveBeenCalledTimes(1)
    expect(mockSES.send).not.toHaveBeenCalled()
  })

  it('should send email for new registration when paymentTime is confirmation', async () => {
    const eventWithConfirmationPayment: JsonDogEvent = { ...confirmedEvent, paymentTime: 'confirmation' }
    const created: JsonRegistration = {
      ...existingJson,
      id: 'newid12345',
      state: 'ready',
    }
    mockSubmitRegistration.mockResolvedValueOnce({
      event: eventWithConfirmationPayment,
      kind: 'created',
      registration: created,
    })

    const res = await putRegistrationLambda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(200)

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
  })

  it('should return 200 for updated registration with update email and audit', async () => {
    const updated: JsonRegistration = { ...existingJson, notes: 'updated notes' }
    mockSubmitRegistration.mockResolvedValueOnce({
      classification: 'updated',
      event: confirmedEvent,
      existing: existingJson,
      kind: 'updated',
      registration: updated,
    })

    const res = await putRegistrationLambda(
      constructAPIGwEvent({ ...registrationWithStaticDates, notes: 'updated notes' })
    )

    expect(res.statusCode).toEqual(200)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Muutti: Lisätiedot', user: 'anonymous' }),
      'audit-table-not-found-in-env'
    )

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
  })

  it('should return 200 for confirmed registration with confirm email and audit', async () => {
    const updated: JsonRegistration = { ...existingJson, confirmed: true }
    mockSubmitRegistration.mockResolvedValueOnce({
      classification: 'confirmed',
      event: confirmedEvent,
      existing: existingJson,
      kind: 'updated',
      registration: updated,
    })

    const res = await putRegistrationLambda(constructAPIGwEvent({ ...registrationWithStaticDates, confirmed: true }))

    expect(res.statusCode).toEqual(200)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Ilmoittautumisen vahvistus', user: 'anonymous' }),
      'audit-table-not-found-in-env'
    )

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
  })

  it('should return 200 for cancelled registration with cancel email and secretary notification', async () => {
    const updated: JsonRegistration = { ...existingJson, cancelled: true }
    mockSubmitRegistration.mockResolvedValueOnce({
      classification: 'cancelled',
      event: confirmedEvent,
      existing: existingJson,
      kind: 'updated',
      registration: updated,
    })

    const res = await putRegistrationLambda(constructAPIGwEvent({ ...registrationWithStaticDates, cancelled: true }))

    expect(res.statusCode).toEqual(200)

    expect(mockDynamoDBWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Ilmoittautuminen peruttiin, syy: (ei täytetty)',
        user: 'anonymous',
      }),
      'audit-table-not-found-in-env'
    )

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
  })

  it('should send cancel-reserve when cancelling from reserve and reserveNotified is set', async () => {
    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: GROUP_KEY_RESERVE, number: 2 },
    }
    const existingWithReserve: JsonRegistration = JSON.parse(JSON.stringify({ ...registration, reserveNotified: 2 }))
    const updated: JsonRegistration = { ...existingWithReserve, cancelled: true }

    mockSubmitRegistration.mockResolvedValueOnce({
      classification: 'cancelled',
      event: confirmedEvent,
      existing: existingWithReserve,
      kind: 'updated',
      registration: updated,
    })

    const res = await putRegistrationLambda(constructAPIGwEvent({ ...registration, cancelled: true }))

    expect(res.statusCode).toEqual(200)
    expect(mockSES.send).toHaveBeenCalledWith(expect.objectContaining({ Template: 'cancel-reserve-local-fi' }))
    expect(mockSES.send).toHaveBeenCalledTimes(2)
  })

  it('should send cancel-picked when cancelling from participants group', async () => {
    const registration: Registration = {
      ...registrationWithStaticDates,
      group: { key: 'participants-1', number: 2 },
    }
    const existingWithGroup: JsonRegistration = JSON.parse(JSON.stringify(registration))
    const updated: JsonRegistration = { ...existingWithGroup, cancelled: true }

    mockSubmitRegistration.mockResolvedValueOnce({
      classification: 'cancelled',
      event: confirmedEvent,
      existing: existingWithGroup,
      kind: 'updated',
      registration: updated,
    })

    const res = await putRegistrationLambda(constructAPIGwEvent({ ...registration, cancelled: true }))

    expect(res.statusCode).toEqual(200)
    expect(mockSES.send).toHaveBeenCalledWith(expect.objectContaining({ Template: 'cancel-picked-local-fi' }))
    expect(mockSES.send).toHaveBeenCalledTimes(2)
  })

  it('should not send secretary email on cancellation if secretary has no email', async () => {
    const eventWithoutSecretaryEmail: JsonDogEvent = {
      ...confirmedEvent,
      contactInfo: { secretary: { name: 'Testi Testinen' } },
    }
    const updated: JsonRegistration = { ...existingJson, cancelled: true }
    mockSubmitRegistration.mockResolvedValueOnce({
      classification: 'cancelled',
      event: eventWithoutSecretaryEmail,
      existing: existingJson,
      kind: 'updated',
      registration: updated,
    })

    const res = await putRegistrationLambda(constructAPIGwEvent({ ...registrationWithStaticDates, cancelled: true }))

    expect(res.statusCode).toEqual(200)
    // once for user, not for secretary
    expect(mockSES.send).toHaveBeenCalledTimes(1)
  })

  it('should send invitation read email', async () => {
    const updated: JsonRegistration = { ...existingJson, invitationRead: true }
    mockSubmitRegistration.mockResolvedValueOnce({
      classification: 'invitation-read',
      event: confirmedEvent,
      existing: existingJson,
      kind: 'updated',
      registration: updated,
    })

    const res = await putRegistrationLambda(
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

  it('should not fail if secretary email fails', async () => {
    const error = new Error('test error')
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    mockSES.send.mockImplementationOnce(() => Promise.resolve()) // first send is for user
    mockSES.send.mockImplementationOnce(() => Promise.reject(error)) // second send is for secretary

    const updated: JsonRegistration = { ...existingJson, cancelled: true }
    mockSubmitRegistration.mockResolvedValueOnce({
      classification: 'cancelled',
      event: confirmedEvent,
      existing: existingJson,
      kind: 'updated',
      registration: updated,
    })

    const res = await putRegistrationLambda(constructAPIGwEvent({ ...registrationWithStaticDates, cancelled: true }))
    expect(res.statusCode).toEqual(200)
    expect(errorSpy).toHaveBeenCalledWith('error notifying cancellation to secretary', error)
  })

  it('should return 404 if event is not found (LambdaError thrown by action)', async () => {
    mockSubmitRegistration.mockRejectedValueOnce(
      new LambdaError(404, `Event with id '${eventWithStaticDates.id}' was not found`)
    )

    const res = await putRegistrationLambda(constructAPIGwEvent({ ...registrationWithStaticDates, id: undefined }))

    expect(res.statusCode).toEqual(404)
  })
})
