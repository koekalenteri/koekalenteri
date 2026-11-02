import type { ComponentProps } from 'react'
import type { KcDogReport, KcPreviewResponse, KcSendReport } from '@/lib/kennelliittoResults'
import { render, screen } from '@testing-library/react'
import { describeWithTranslations } from '@/test-utils/language'
import { KennelliittoSendDialog } from './KennelliittoSendDialog'

vi.mock('react-i18next', async (importOriginal) =>
  (await import('@/test-utils/language')).spyOnUseTranslation(importOriginal)
)

const noop = () => {}

const dog = (id: string, status: KcDogReport['status'], fields: Partial<KcDogReport> = {}): KcDogReport => ({
  id,
  name: `Koira ${id}`,
  problems: [],
  regNo: `FI${id}/20`,
  status,
  ...fields,
})

const previewOf = (dogs: KcDogReport[]): KcPreviewResponse => ({ blockers: [], dogs })

const props = (
  phase: ComponentProps<typeof KennelliittoSendDialog>['phase'],
  force = false
): ComponentProps<typeof KennelliittoSendDialog> => ({
  decisions: {},
  force,
  onBack: noop,
  onClose: noop,
  onDecide: noop,
  onForce: noop,
  onSend: noop,
  open: true,
  phase,
})

/** The lines of the hand-entry notice, as the secretary reads them; none when it is not shown. */
const handEntryLines = () => screen.queryAllByText(/: pisteet /).map((line) => line.textContent)

describeWithTranslations('fi', () => {
  describe('the points to enter in Omakoira by hand (KOE-1676)', () => {
    const dogs = [
      dog('1', 'ready', { pointsByHand: 63.75 }),
      dog('2', 'unchanged', { pointsByHand: 40 }),
      dog('3', 'blocked', { pointsByHand: 55, problems: [{ code: 'noJudge' }] }),
    ]

    it('names only the dogs about to be sent, and the sending stays possible', () => {
      render(<KennelliittoSendDialog {...props({ kind: 'preview', preview: previewOf(dogs) })} />)

      expect(handEntryLines()).toEqual(['Koira 1 (FI1/20): pisteet 63,75'])
      expect(screen.getByRole('button', { name: 'Lähetä Omakoiraan' })).toBeEnabled()
    })

    it('names an unchanged dog too when the unchanged results are sent again', () => {
      render(<KennelliittoSendDialog {...props({ kind: 'preview', preview: previewOf(dogs) }, true)} />)

      expect(handEntryLines()).toEqual(['Koira 1 (FI1/20): pisteet 63,75', 'Koira 2 (FI2/20): pisteet 40'])
    })

    it('keeps the sending possible when the one dog to send has points to enter by hand', () => {
      const preview = previewOf([dog('1', 'ready', { pointsByHand: 63.75 })])

      render(<KennelliittoSendDialog {...props({ kind: 'preview', preview })} />)

      expect(screen.getByRole('button', { name: 'Lähetä Omakoiraan' })).toBeEnabled()
    })

    it('names after the sending only the dogs that were sent', () => {
      const report = (id: string, outcome: KcSendReport['outcome']): KcSendReport => ({
        id,
        name: `Koira ${id}`,
        outcome,
        pointsByHand: 63.75,
        regNo: `FI${id}/20`,
      })
      const summary = {
        blockers: [],
        interrupted: false,
        notAttempted: [],
        reports: [report('1', 'sent'), report('2', 'failed'), report('3', 'skipped')],
      }

      render(<KennelliittoSendDialog {...props({ blocked: [], kind: 'report', summary })} />)

      expect(handEntryLines()).toEqual(['Koira 1 (FI1/20): pisteet 63,75'])
    })
  })
})
