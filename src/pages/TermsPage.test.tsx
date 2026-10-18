import { render, screen } from '@testing-library/react'
import { TermsPage } from './TermsPage'

describe('TermsPage', () => {
  it('names the page in an h1 and each numbered term in an h2 under it', () => {
    render(<TermsPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Ilmoittautumisen ehdot' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      '1. Tapahtumaan ilmoittautuminen',
      '2. Osallistujan osallistumisoikeus',
      '3. Rokotusmääräykset ja antidopingmääräykset',
      '4. Kokeen ja/tai kilpailun tulosten julkaiseminen',
      '5. Ilmoittautumisen peruuttaminen',
      '6. Osallistumismaksujen palauttaminen',
      '7. Osallistumispaikkojen jakoperusteet',
    ])
  })
})
