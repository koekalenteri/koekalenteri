import type { Locale } from 'date-fns'

import { Suspense } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import theme from '../assets/Theme'
import { locales } from '../i18n'
import { waitForDebounce } from '../test-utils/utils'

import { SearchPage } from './SearchPage'

jest.mock('../api/event')
jest.mock('../api/eventType')
jest.mock('../api/judge')
jest.mock('../api/official')
jest.mock('../api/organizer')
jest.mock('../api/registration')

const renderPage = (path: string, locale: Locale) =>
  render(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locale}>
        <RecoilRoot>
          <Suspense fallback={<div>loading...</div>}>
            <SnackbarProvider>
              <MemoryRouter initialEntries={[path]}>
                <SearchPage />
              </MemoryRouter>
            </SnackbarProvider>
          </Suspense>
        </RecoilRoot>
      </LocalizationProvider>
    </ThemeProvider>
  )

describe('SearchPage', () => {
  it('renders', async () => {
    renderPage('', locales.fi)
    await waitForDebounce()
    expect(screen.getAllByRole('row').length).toEqual(4)
  })

  it('filters by date/start', async () => {
    renderPage('/?s=2021-03-01', locales.fi)
    await waitForDebounce()
    expect(screen.getByRole('textbox', { name: 'daterangeStart' })).toHaveValue('01.03.2021')
    expect(screen.getAllByRole('row').length).toEqual(4)
  })

  it('filters by date/end', async () => {
    const { container } = renderPage('/?e=2021-03-01', locales.fi)
    await waitForDebounce()
    expect(screen.getByRole('textbox', { name: 'daterangeEnd' })).toHaveValue('01.03.2021')
    expect(screen.getAllByRole('row').length).toEqual(4)
    expect(container).toMatchSnapshot()
  })

  it('filters by date', async () => {
    const { container } = renderPage('/?s=2021-01-01&e=2021-03-01', locales.fi)
    await waitForDebounce()
    expect(screen.getByRole('textbox', { name: 'daterangeStart' })).toHaveValue('01.01.2021')
    expect(screen.getByRole('textbox', { name: 'daterangeEnd' })).toHaveValue('01.03.2021')
    expect(screen.getAllByRole('row').length).toEqual(4)
    expect(container).toMatchSnapshot()
  })

  it('filters by date - no-results', async () => {
    const { container } = renderPage('/?s=2021-03-01&e=2021-03-01', locales.fi)
    await waitForDebounce()
    expect(screen.getByRole('textbox', { name: 'daterangeStart' })).toHaveValue('01.03.2021')
    expect(screen.getByRole('textbox', { name: 'daterangeEnd' })).toHaveValue('01.03.2021')
    expect(screen.getByText('noResults')).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })

  it('filters by event type', async () => {
    const { container } = renderPage('/?t=NOME-B', locales.fi)
    await waitForDebounce()
    expect(screen.getByRole('button', { name: 'NOME-B' })).toBeInTheDocument()
    expect(screen.getAllByRole('row').length).toEqual(4)
    expect(container).toMatchSnapshot()
  })

  it('filters by event class', async () => {
    const { container } = renderPage('/?c=AVO', locales.fi)
    await waitForDebounce()
    expect(screen.getByRole('button', { name: 'AVO' })).toBeInTheDocument()
    expect(screen.getAllByRole('row').length).toEqual(4)
    expect(container).toMatchSnapshot()
  })

  it('filters by organizer', async () => {
    const { container } = renderPage('/?o=2', locales.fi)
    await waitForDebounce()
    expect(screen.getByRole('button', { name: 'Järjestäjä 2' })).toBeInTheDocument()
    expect(screen.getAllByRole('row').length).toEqual(1)
    expect(container).toMatchSnapshot()
  })

  it('filters by judge', async () => {
    renderPage('/?j=223', locales.fi)
    await waitForDebounce()
    expect(screen.getByRole('button', { name: 'Tuomari 2' })).toBeInTheDocument()
    expect(screen.getAllByRole('row').length).toEqual(5)
  })

  it('filters by entryUpcoming', async () => {
    renderPage('/?b=u', locales.fi)
    await waitForDebounce()
    expect(screen.getByRole('checkbox', { name: 'entryUpcoming' })).toBeChecked()
    expect(screen.getAllByRole('row').length).toEqual(1)
  })

  it('filters by entryOpen', async () => {
    renderPage('/?b=o', locales.fi)
    await waitForDebounce()
    expect(screen.getByRole('checkbox', { name: 'entryOpen' })).toBeChecked()
    expect(screen.getAllByRole('row').length).toEqual(2)
  })

  it('filters by entryOpen and entryUpcoming', async () => {
    renderPage('/?b=o&b=u', locales.fi)
    await waitForDebounce()
    expect(screen.getByRole('checkbox', { name: 'entryUpcoming' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'entryOpen' })).toBeChecked()
    expect(screen.getAllByRole('row').length).toEqual(3)
  })
})
