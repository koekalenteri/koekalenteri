import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import {
  eventWithEntryClosed,
  eventWithEntryOpen,
  eventWithEntryOpenButNoEntries,
} from '../../../../__mockData__/events'
import theme from '../../../../assets/Theme'

import { EventClassTableRow } from './EventClassTableRow'

describe('EventInfo', () => {
  it('render places for a class in event with multiple classes', async () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <RecoilRoot>
            <table>
              <tbody>
                <EventClassTableRow event={eventWithEntryClosed} eventClass={eventWithEntryClosed.classes[0]} />
              </tbody>
            </table>
          </RecoilRoot>
        </MemoryRouter>
      </ThemeProvider>
    )

    expect(container).toMatchSnapshot()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('render places for event with single class and places defined only on event level', async () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <RecoilRoot>
            <table>
              <tbody>
                <EventClassTableRow event={eventWithEntryOpen} eventClass={eventWithEntryOpen.classes[0]} />
              </tbody>
            </table>
          </RecoilRoot>
        </MemoryRouter>
      </ThemeProvider>
    )

    expect(container).toMatchSnapshot()
    expect(screen.getByText('7 / 10')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'register' })).toHaveAttribute('href', '/event/NOWT/test3/VOI/dd.MM.')
  })

  it('render places for event entry open but no entries', async () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <RecoilRoot>
            <table>
              <tbody>
                <EventClassTableRow
                  event={eventWithEntryOpenButNoEntries}
                  eventClass={eventWithEntryOpenButNoEntries.classes[0]}
                />
              </tbody>
            </table>
          </RecoilRoot>
        </MemoryRouter>
      </ThemeProvider>
    )

    expect(container).toMatchSnapshot()
    expect(screen.getByText('0 / 10')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'register' })).toHaveAttribute('href', '/event/NOWT/test3/VOI/dd.MM.')
  })
})
