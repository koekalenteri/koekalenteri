import type { Registration } from '@/types'
import { render, screen } from '@testing-library/react'
import { KennelliittoStatus } from './KennelliittoStatus'

type Shown = Pick<Registration, 'dog' | 'eventResult' | 'kcResult'>

const registration = (kcResult: Shown['kcResult']): Shown => ({
  dog: { regNo: 'SE12345/2024', results: [] },
  eventResult: { result: 'NOME-A1', updatedAt: new Date('2026-09-26T09:00:00.000Z'), updatedBy: 'Sihteeri' },
  kcResult,
})

const at = new Date('2026-09-26T10:00:00.000Z')

describe('KennelliittoStatus', () => {
  it('explains a refused result with Kennelliitto’s reasons', () => {
    render(
      <KennelliittoStatus
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
})
