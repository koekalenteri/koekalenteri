import { render, screen } from '@testing-library/react'
import { StationHeading } from './StationHeading'

describe('StationHeading', () => {
  it('titles a trial of many posts by the post, with the trial beneath', () => {
    render(<StationHeading eventType="NOWT" station={{ number: 2 }} subtitle="12.9.2026 NOWT Ranua" />)

    expect(screen.getByRole('heading', { level: 1, name: 'event.station 2' })).toBeInTheDocument()
    expect(screen.getByText('12.9.2026 NOWT Ranua')).not.toHaveRole('heading')
  })

  it('titles a one-post trial by the trial itself', () => {
    render(<StationHeading eventType="NOME-B" station={{ number: 1 }} subtitle="12.9.2026 NOME-B Ranua" />)

    expect(screen.getByRole('heading', { level: 1, name: '12.9.2026 NOME-B Ranua' })).toBeInTheDocument()
    expect(screen.queryByText(/event\.station/)).not.toBeInTheDocument()
  })
})
