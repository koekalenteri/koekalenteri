import { render, screen } from '@testing-library/react'
import { describeWithTranslations } from '@/test-utils/language'
import { ConflictDialog } from './ConflictDialog'
import { nomeAConflictRegistrations, nomeAConflicts } from './conflictDialogFixtures'

vi.mock('react-i18next', async (importOriginal) =>
  (await import('@/test-utils/language')).spyOnUseTranslation(importOriginal)
)

describeWithTranslations('fi', () => {
  it('names both versions of a NOME-A result as Kennelliitto lists them (KOE-1592)', () => {
    render(
      <ConflictDialog
        choices={{}}
        conflicts={nomeAConflicts}
        eventType="NOME-A"
        onChoose={() => {}}
        onClose={() => {}}
        onResolve={async () => {}}
        registrations={nomeAConflictRegistrations}
      />
    )

    expect(screen.getByLabelText('Tallennettu (Toinen sihteeri): A0')).toBeInTheDocument()
    expect(screen.getByLabelText('Sinun: A1')).toBeInTheDocument()
  })
})
