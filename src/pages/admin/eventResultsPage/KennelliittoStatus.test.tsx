import type { KcBadge } from '@/lib/kennelliittoResults'
import type { Registration } from '@/types'
import { render, screen } from '@testing-library/react'
import { KennelliittoStatus } from './KennelliittoStatus'

type Shown = Pick<Registration, 'dog' | 'kcResult'>

const registration = (kcResult?: Shown['kcResult']): Shown => ({
  dog: { regNo: 'SE12345/2024', results: [] },
  kcResult,
})

const at = new Date('2026-09-26T10:00:00.000Z')
const failed: KcBadge = { problems: [], status: 'failed' }

describe('KennelliittoStatus', () => {
  it('explains a refused result with Kennelliitto’s reasons', () => {
    render(
      <KennelliittoStatus
        badge={failed}
        registration={registration({ at, by: 'Sihteeri', errors: ['Koiran nimi ei täsmää.'], status: 'failed' })}
      />
    )

    expect(screen.getByLabelText('Koiran nimi ei täsmää.')).toBeInTheDocument()
  })

  it.each([
    ['with Kennelliitto’s reasons', ['Ei käyttöoikeutta.']],
    ['without reasons (no answer it could read)', undefined],
  ])('says a foreign dog was not added %s (KOE-1201)', (_case, errors) => {
    render(
      <KennelliittoStatus
        badge={failed}
        registration={registration({
          at,
          by: 'Sihteeri',
          dogNotAdded: true,
          status: 'failed',
          ...(errors ? { errors } : {}),
        })}
      />
    )

    expect(screen.getByLabelText(/^results\.kennelliitto\.dogNotAdded/)).toBeInTheDocument()
  })

  const notAdded = registration({ at, by: 'Sihteeri', dogNotAdded: true, status: 'failed' })

  it('explains a foreign dog not added that reads blocked now by why, not by the failed adding', () => {
    const badge: KcBadge = { problems: [{ code: 'noMicrochip' }], status: 'blocked' }
    render(<KennelliittoStatus badge={badge} registration={notAdded} />)

    expect(screen.queryByLabelText(/dogNotAdded/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/problem\.noMicrochip/)).toBeInTheDocument()
  })

  it('says nothing of the failed adding of a foreign dog that reads ready now', () => {
    render(<KennelliittoStatus badge={{ problems: [], status: 'ready' }} registration={notAdded} />)

    expect(screen.getByText('results.kennelliitto.badge.unsent')).toBeInTheDocument()
    expect(screen.queryByLabelText(/dogNotAdded/)).not.toBeInTheDocument()
  })

  it('explains a result that cannot be sent with what the send dialog says of it', () => {
    const badge: KcBadge = { problems: [{ code: 'judgeWithoutNumber', detail: 'Ulkomaalainen' }], status: 'blocked' }
    render(<KennelliittoStatus badge={badge} registration={registration()} />)

    expect(screen.getByText('results.kennelliitto.badge.blocked')).toBeInTheDocument()
    expect(screen.getByLabelText(/^results\.kennelliitto\.problem\.judgeWithoutNumber/)).toBeInTheDocument()
  })

  it('says what a change since the sending means', () => {
    render(<KennelliittoStatus badge={{ problems: [], status: 'changed' }} registration={registration()} />)

    expect(screen.getByLabelText('results.kennelliitto.badge.changedNote')).toBeInTheDocument()
  })

  it('says why a result sent and then removed is not simply sent', () => {
    render(<KennelliittoStatus badge={{ problems: [], status: 'sentGone' }} registration={registration()} />)

    expect(screen.getByLabelText('results.kennelliitto.dogStatus.sentGone')).toBeInTheDocument()
  })

  it.each([
    ['a dog with no result', { problems: [], status: 'notRecorded' } satisfies KcBadge],
    ['a dog that did not run', undefined],
  ])('shows nothing for %s', (_case, badge) => {
    const { container } = render(<KennelliittoStatus badge={badge} registration={registration()} />)

    expect(container).toBeEmptyDOMElement()
  })
})
