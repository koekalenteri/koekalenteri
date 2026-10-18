import type { EmailTemplate } from '../types'
import { API_BASE_URL } from '../routeConfig'
import fetchMock from '../test-utils/fetchMock'
import { getEmailTemplates, putEmailTemplate, sendTemplatedEmail } from './email'

fetchMock.enableMocks()

beforeEach(() => {
  fetchMock.resetMocks()
  fetchMock.enableMocks()
})

const wireTemplate = {
  createdAt: '2026-01-02T10:00:00.000Z',
  createdBy: 'seed',
  en: 'en',
  fi: 'fi',
  id: 'registration',
  modifiedAt: '2026-01-03T10:00:00.000Z',
  modifiedBy: 'seed',
}

const modelTemplate: EmailTemplate = {
  ...wireTemplate,
  createdAt: new Date('2026-01-02T10:00:00.000Z'),
  id: 'registration',
  modifiedAt: new Date('2026-01-03T10:00:00.000Z'),
}

test('getEmailTemplates makes the stamps Dates, in a full list and an incremental response (KOE-1546)', async () => {
  fetchMock.mockResponseOnce(JSON.stringify([wireTemplate]))
  await expect(getEmailTemplates('token')).resolves.toEqual([modelTemplate])
  expect(fetchMock).toHaveBeenLastCalledWith(`${API_BASE_URL}/admin/email-templates`, expect.any(Object))

  fetchMock.mockResponseOnce(JSON.stringify({ cursor: 456, deletedIds: [], items: [wireTemplate] }))
  await expect(getEmailTemplates('token', undefined, new Date(123))).resolves.toEqual({
    cursor: 456,
    deletedIds: [],
    items: [modelTemplate],
  })
  expect(fetchMock).toHaveBeenLastCalledWith(`${API_BASE_URL}/admin/email-templates?since=123`, expect.any(Object))
})

test('putEmailTemplate answers with the template as stored', async () => {
  fetchMock.mockResponseOnce(JSON.stringify(wireTemplate))

  await expect(putEmailTemplate(modelTemplate, 'token')).resolves.toEqual(modelTemplate)
  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/admin/email-templates`,
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }), method: 'POST' })
  )
})

test('sendTemplatedEmail answers with the classes and the registrations as stored, their dates Dates', async () => {
  fetchMock.mockResponseOnce(
    JSON.stringify({
      classes: [{ class: 'ALO', date: '2026-09-11T21:00:00.000Z', state: 'invited' }],
      failed: [],
      ok: ['a@b.c'],
      registrations: [
        {
          dates: [{ date: '2026-09-11T21:00:00.000Z', time: 'ap' }],
          id: 'r1',
          lastEmail: { context: '', sentAt: '2026-09-01T08:00:00.000Z', template: 'invitation' },
          modifiedAt: '2026-09-01T08:00:00.000Z',
          notes: '2026-09-12',
        },
      ],
      startListPublished: false,
      state: 'invited',
    })
  )

  const response = await sendTemplatedEmail(
    { contactInfo: undefined, eventId: 'e1', registrationIds: ['r1'], template: 'invitation', text: '' },
    'token'
  )

  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/admin/email-send`,
    expect.objectContaining({ method: 'POST' })
  )
  expect(response.classes).toEqual([{ class: 'ALO', date: new Date('2026-09-11T21:00:00.000Z'), state: 'invited' }])
  expect(response.registrations).toEqual([
    {
      dates: [{ date: new Date('2026-09-11T21:00:00.000Z'), time: 'ap' }],
      id: 'r1',
      lastEmail: { context: '', sentAt: new Date('2026-09-01T08:00:00.000Z'), template: 'invitation' },
      modifiedAt: new Date('2026-09-01T08:00:00.000Z'),
      notes: '2026-09-12',
    },
  ])
  expect(response.startListPublished).toBe(false)
})
