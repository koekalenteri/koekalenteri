import type { JsonEmailTemplate } from '../../../types'
import { readEmailTemplate, writeEmailTemplate, writeNewEmailTemplate } from './emailTemplateRepository'

const template = (id: JsonEmailTemplate['id'], fi: string): JsonEmailTemplate => ({
  createdAt: '2026-11-08T10:00:00.000Z',
  createdBy: 'system',
  en: '# Default',
  fi,
  id,
  modifiedAt: '2026-11-08T10:00:00.000Z',
  modifiedBy: 'system',
})

/** The deploy's seeding writes a default only where no row is, and an organizer's row stays (KOE-1363). */
describe('writeNewEmailTemplate against DynamoDB-local', () => {
  it('writes the row of an id the table does not hold', async () => {
    const seeded = template('access', '# Oletus')

    await expect(writeNewEmailTemplate(seeded)).resolves.toBe(true)
    await expect(readEmailTemplate('access')).resolves.toEqual(seeded)
  })

  it('leaves a row the table holds as it is', async () => {
    const edited = { ...template('refund', '# Muokattu'), modifiedBy: 'organizer' }
    await writeEmailTemplate(edited)

    await expect(writeNewEmailTemplate(template('refund', '# Oletus'))).resolves.toBe(false)
    await expect(readEmailTemplate('refund')).resolves.toEqual(edited)
  })
})
