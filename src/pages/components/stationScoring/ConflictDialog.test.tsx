import type { EventResultVersion } from '@/types'
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

  describe("a post's own view", () => {
    const at = new Date('2026-10-21T10:00:00Z')
    const later = new Date('2026-10-21T11:00:00Z')
    const task = (exercise: number, points: number | null, more: object = {}) => ({
      exercise,
      part: 0,
      points,
      updatedAt: at,
      ...more,
    })
    const version = (more: Partial<EventResultVersion>): EventResultVersion => ({ updatedAt: at, ...more })
    const renderAtPost = (stored: EventResultVersion, submitted: EventResultVersion, exercises = [1]) =>
      render(
        <ConflictDialog
          choices={{}}
          conflicts={[{ id: 'dog', stored, submitted }]}
          eventType="NOWT"
          exercisesOf={() => exercises}
          onChoose={() => {}}
          onClose={() => {}}
          onResolve={async () => {}}
          registrations={[{ dog: { name: 'Rekku' }, id: 'dog' }]}
        />
      )

    it("shows the post's own score and no name on a link, which gets none", () => {
      renderAtPost(version({ tasks: [task(1, 15), task(2, 9)] }), version({ tasks: [task(1, 18)] }))

      expect(screen.getByLabelText('Tallennettu: Rasti 1: 15 p')).toBeInTheDocument()
      expect(screen.getByLabelText('Sinun: Rasti 1: 18 p')).toBeInTheDocument()
    })

    it("names the writer of the post's own tasks, not the whole result's", () => {
      renderAtPost(
        version({
          tasks: [task(1, 15, { updatedBy: 'Koesihteeri' }), task(2, 9, { updatedAt: later, updatedBy: 'Paikka 2' })],
          updatedBy: 'Paikka 2',
        }),
        version({ tasks: [task(1, 18)] })
      )

      expect(screen.getByLabelText('Tallennettu (Koesihteeri): Rasti 1: 15 p')).toBeInTheDocument()
    })

    it("spells out a split exercise, a zero's reason and each exercise the post holds", () => {
      renderAtPost(
        version({ tasks: [task(3, 7), { ...task(1, 7), part: 1 }, task(1, 8)] }),
        version({ tasks: [task(1, 0, { zeroFault: 'eyeWipe' }), task(3, null, { recalled: true })] }),
        [1, 3]
      )

      expect(screen.getByLabelText('Tallennettu: Rasti 1: 8 + 7 p · Rasti 3: 7 p')).toBeInTheDocument()
      expect(screen.getByLabelText('Sinun: Rasti 1: 0 p (Eye-wipe) · Rasti 3: – p')).toBeInTheDocument()
    })

    it('shows how the round ended in the version that says so', () => {
      renderAtPost(
        version({ retirement: { cause: 'injury', exercise: 1 }, tasks: [task(1, 15)] }),
        version({ elimination: { exercise: 1, fault: 'hardMouth' }, tasks: [task(1, 15)] })
      )

      expect(screen.getByLabelText('Tallennettu: Rasti 1: 15 p · Koira loukkaantui')).toBeInTheDocument()
      expect(screen.getByLabelText('Sinun: Rasti 1: 15 p · Riistan vahingoittaminen')).toBeInTheDocument()
    })

    it('says so of a version that holds nothing, as a post that cleared its score sends', () => {
      renderAtPost(version({ tasks: [task(1, 15)] }), version({ tasks: [task(1, null)] }))

      expect(screen.getByLabelText('Sinun: ei kirjausta')).toBeInTheDocument()
    })
  })
})
