import type { Registration } from '@/types'
import type { ResultConflict } from './ConflictDialog'
import { render, screen } from '@testing-library/react'
import { registrationsToEventWithStations } from '@/__mockData__/resultsEvent'
import { describeWithTranslations } from '@/test-utils/language'
import { ConflictDialog } from './ConflictDialog'

vi.mock('react-i18next', async (importOriginal) =>
  (await import('@/test-utils/language')).spyOnUseTranslation(importOriginal)
)

const at = new Date('2026-10-21T10:00:00Z')
const [first] = registrationsToEventWithStations
const registrations: Registration[] = [{ ...first, class: undefined, eventType: 'NOME-A' }]
const conflicts: ResultConflict[] = [
  {
    id: first.id,
    stored: { result: 'NOME-A0', updatedAt: at, updatedBy: 'Toinen sihteeri' },
    submitted: { result: 'NOME-A1', updatedAt: at, updatedBy: 'Sihteeri' },
  },
]

describeWithTranslations('fi', () => {
  it('names both versions of a NOME-A result as Kennelliitto lists them (KOE-1592)', () => {
    render(
      <ConflictDialog
        choices={{}}
        conflicts={conflicts}
        eventType="NOME-A"
        onChoose={() => {}}
        onClose={() => {}}
        onResolve={async () => {}}
        registrations={registrations}
      />
    )

    expect(screen.getByLabelText('Tallennettu (Toinen sihteeri): A0')).toBeInTheDocument()
    expect(screen.getByLabelText('Sinun: A1')).toBeInTheDocument()
  })
})
