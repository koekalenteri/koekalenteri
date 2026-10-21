import type { ConfirmedEvent } from '@/types'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { eventWithStaticDates } from '@/__mockData__/events'
import { TestProvider } from '@/test-utils/AtomProvider'
import { describeInLanguage } from '@/test-utils/language'
import { flushPromises } from '@/test-utils/utils'
import Title from './Title'

const named: ConfirmedEvent = { ...eventWithStaticDates, name: 'Kevätkoe', names: { en: 'Spring trial' } }
const finnishOnly: ConfirmedEvent = { ...eventWithStaticDates, name: 'Kevätkoe' }

// The step list asks the event types, which load on first use, whether the results go to Kennelliitto.
const renderTitle = async (event: ConfirmedEvent) => {
  render(
    <TestProvider>
      <MemoryRouter>
        <Title event={event} />
      </MemoryRouter>
    </TestProvider>
  )
  await flushPromises(false)
}

const heading = () => screen.getByRole('heading', { level: 1 })

// The secretary browsing in English reads the trial's English name where one is kept (KOE-1453);
// the Finnish name stays the one every trial has.
describe('Title', () => {
  it('names the trial in Finnish in a Finnish view', async () => {
    await renderTitle(named)
    expect(heading()).toHaveTextContent(/\(Kevätkoe\)$/)
  })

  it('leaves the name out of the heading of a trial that has none', async () => {
    await renderTitle({ ...eventWithStaticDates, name: '' })
    expect(heading()).toHaveTextContent(/test location$/)
  })

  describeInLanguage('en', () => {
    it.each([
      ['its English name', named, /\(Spring trial\)$/],
      ['its Finnish name when it has no English one', finnishOnly, /\(Kevätkoe\)$/],
    ])('names the trial by %s', async (_case, event, expected) => {
      await renderTitle(event)
      expect(heading()).toHaveTextContent(expected)
    })
  })
})
