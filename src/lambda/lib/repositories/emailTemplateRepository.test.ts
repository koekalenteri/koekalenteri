import type { JsonEmailTemplate } from '../../../types'
import { vi } from 'vitest'

const mockRead = vi.fn()
const mockReadAll = vi.fn()
const mockWrite = vi.fn()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { emailTemplateTable: 'email-template-table' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    constructor(table: string) {
      mockConstructor(table)
    }
    read = (...args: unknown[]) => mockRead(...args)
    readAll = (...args: unknown[]) => mockReadAll(...args)
    write = (...args: unknown[]) => mockWrite(...args)
  },
}))

const { readEmailTemplate, readEmailTemplates, writeEmailTemplate } = await import('./emailTemplateRepository')

const template: JsonEmailTemplate = {
  createdAt: '2026-10-01T10:00:00.000Z',
  createdBy: 'admin',
  en: 'Hello',
  fi: 'Hei',
  id: 'registration',
  modifiedAt: '2026-10-01T10:00:00.000Z',
  modifiedBy: 'admin',
}

describe('emailTemplateRepository', () => {
  beforeEach(() => {
    mockRead.mockReset()
    mockReadAll.mockReset()
    mockWrite.mockReset()
  })

  it('opens its client on the email template table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('email-template-table')
    expect(mockConstructor).toHaveBeenCalledTimes(1)
  })

  it('readEmailTemplates scans the whole table', async () => {
    mockReadAll.mockResolvedValueOnce([template])

    await expect(readEmailTemplates()).resolves.toEqual([template])
    expect(mockReadAll).toHaveBeenCalledWith()
  })

  it('readEmailTemplate reads the template by its id', async () => {
    mockRead.mockResolvedValueOnce(template)

    await expect(readEmailTemplate('registration')).resolves.toEqual(template)
    expect(mockRead).toHaveBeenCalledWith({ id: 'registration' })
  })

  it('readEmailTemplate returns undefined for a template the table does not hold', async () => {
    mockRead.mockResolvedValueOnce(undefined)

    await expect(readEmailTemplate('missing')).resolves.toBeUndefined()
  })

  it('writeEmailTemplate stores the template as given', async () => {
    mockWrite.mockResolvedValueOnce(undefined)

    await expect(writeEmailTemplate(template)).resolves.toBeUndefined()
    expect(mockWrite).toHaveBeenCalledWith(template)
  })

  it('passes a failed write on to the caller', async () => {
    mockWrite.mockRejectedValueOnce(new Error('write failed'))

    await expect(writeEmailTemplate(template)).rejects.toThrow('write failed')
  })
})
