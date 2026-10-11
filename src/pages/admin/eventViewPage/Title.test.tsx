import type { ConfirmedEvent } from '@/types'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { eventWithStaticDates } from '@/__mockData__/events'
import { TestProvider } from '@/test-utils/AtomProvider'
import { describeInLanguage } from '@/test-utils/language'
import Title from './Title'

const named: ConfirmedEvent = { ...eventWithStaticDates, name: 'Kevätkoe', names: { en: 'Spring trial' } }
const finnishOnly: ConfirmedEvent = { ...eventWithStaticDates, name: 'Kevätkoe' }

const renderTitle = (event: ConfirmedEvent) =>
  render(
    <TestProvider>
      <MemoryRouter>
        <Title event={event} />
      </MemoryRouter>
    </TestProvider>
  )

const heading = () => screen.getByRole('heading', { level: 5 })

// The secretary browsing in English reads the trial's English name where one is kept (KOE-1453);
// the Finnish name stays the one every trial has.
describe('Title', () => {
  it('names the trial in Finnish in a Finnish view', () => {
    renderTitle(named)
    expect(heading()).toHaveTextContent(/\(Kevätkoe\)$/)
  })

  describeInLanguage('en', () => {
    it.each([
      ['its English name', named, /\(Spring trial\)$/],
      ['its Finnish name when it has no English one', finnishOnly, /\(Kevätkoe\)$/],
    ])('names the trial by %s', (_case, event, expected) => {
      renderTitle(event)
      expect(heading()).toHaveTextContent(expected)
    })
  })
})
