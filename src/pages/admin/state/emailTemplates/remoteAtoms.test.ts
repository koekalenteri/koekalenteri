import type { DataVersions, EmailTemplate, User } from '@/types'
import { vi } from 'vitest'

const mockReadEncryptedDataset = vi.fn()
const mockWriteEncryptedDataset = vi.fn(async () => undefined)
vi.mock('@/lib/client/encryptedStore', () => ({
  readEncryptedDataset: mockReadEncryptedDataset,
  writeEncryptedDataset: mockWriteEncryptedDataset,
}))

const mockGetEmailTemplates = vi.fn()
vi.mock('@/api/email', () => ({ getEmailTemplates: mockGetEmailTemplates }))

const template = (id: EmailTemplate['id']): EmailTemplate => ({
  createdAt: new Date('2026-01-01'),
  createdBy: 'seed',
  en: `${id} en`,
  fi: `${id} fi`,
  id,
  modifiedAt: new Date('2026-01-01'),
  modifiedBy: 'seed',
})

/** The rows the table held before the `message` id was added in code. */
const storedTemplates = (
  [
    'access',
    'cancel-early',
    'cancel-picked',
    'cancel-reserve',
    'invitation',
    'picked',
    'receipt',
    'refund',
    'registration',
    'reserve',
  ] as const
).map(template)

const dataVersions = { emailTemplates: { revision: '*:unchanged' } } as DataVersions
const user: User = { dataVersions, email: 'admin@example.com', id: 'user-1', name: 'Admin' }

const ids = (templates: EmailTemplate[]) => templates.map((item) => item.id)

describe('withEveryTemplate', () => {
  it('adds an empty placeholder for every template id the list lacks', async () => {
    const { withEveryTemplate } = await import('./remoteAtoms')
    const padded = withEveryTemplate(storedTemplates)
    expect(ids(padded)).toContain('message')
    const placeholder = padded.find((item) => item.id === 'message')
    expect(placeholder).toMatchObject({ en: '', fi: '' })
    expect(placeholder?.ses).toBeUndefined()
    expect(padded.filter((item) => item.id === 'registration')).toHaveLength(1)
  })

  it('returns a complete list as is', async () => {
    const { withEveryTemplate } = await import('./remoteAtoms')
    const complete = withEveryTemplate(storedTemplates)
    expect(withEveryTemplate(complete)).toBe(complete)
  })
})

describe('adminEmailTemplatesRemoteAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetEmailTemplates.mockResolvedValue([...storedTemplates])
  })

  it('pads a fetched list', async () => {
    const { fetchEmailTemplates } = await import('./remoteAtoms')
    expect(ids(await fetchEmailTemplates('token'))).toContain('message')
  })

  it('pads a cached list that predates a template id, even though its revision is still current', async () => {
    const { loadCachedRemoteCollection } = await import('../cached/createCachedRemoteCollection')
    const { fetchEmailTemplates, withEveryTemplate } = await import('./remoteAtoms')
    mockReadEncryptedDataset.mockResolvedValueOnce({ data: storedTemplates, revision: '*:unchanged' })

    const list = await loadCachedRemoteCollection(
      {
        cacheKey: 'emailTemplates',
        fetch: fetchEmailTemplates,
        sort: (items) => withEveryTemplate(items).sort((a, b) => a.id.localeCompare(b.id)),
      },
      'token',
      user
    )

    expect(mockGetEmailTemplates).not.toHaveBeenCalled()
    expect(ids(list)).toEqual([
      'access',
      'cancel-early',
      'cancel-picked',
      'cancel-reserve',
      'invitation',
      'message',
      'payment-request',
      'picked',
      'receipt',
      'refund',
      'registration',
      'reserve',
    ])
  })
})
