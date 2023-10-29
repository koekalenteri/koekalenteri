import { render, screen } from '@testing-library/react'

import { flushPromises, renderWithUserEvents } from '../../../../test-utils/utils'

import { TitlesAndName } from './TitlesAndName'

describe('TitlesAndName', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.clearAllTimers())
  afterAll(() => jest.useRealTimers())

  it('should render with minimal properties', () => {
    const { container } = render(<TitlesAndName id="id" nameLabel="name label" titlesLabel="titles label" />)
    expect(container).toMatchSnapshot()
  })

  it('should render with disabled name', () => {
    const { container } = render(
      <TitlesAndName
        id="id"
        nameLabel="name label"
        titlesLabel="titles label"
        name="name"
        titles="titles"
        disabledName
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('should render with disabled titles', () => {
    const { container } = render(
      <TitlesAndName
        id="id"
        nameLabel="name label"
        titlesLabel="titles label"
        name="name"
        titles="titles"
        disabledTitles
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('should render with disabled name and titles', () => {
    const { container } = render(
      <TitlesAndName
        id="id"
        nameLabel="name label"
        titlesLabel="titles label"
        name="name"
        titles="titles"
        disabledName
        disabledTitles
      />
    )
    expect(container).toMatchSnapshot()
  })

  it('should not call onChange on initial values', async () => {
    const onChange = jest.fn()
    render(
      <TitlesAndName id="test" nameLabel="name" titlesLabel="titles" name="name" titles="titles" onChange={onChange} />
    )

    await flushPromises()
    expect(onChange).not.toHaveBeenCalled()

    const name = screen.getByRole('textbox', { name: 'name' })
    const titles = screen.getByRole('textbox', { name: 'titles' })

    expect(name).toHaveValue('NAME')
    expect(titles).toHaveValue('TITLES')
  })

  it('should provide both values in onChange event', async () => {
    const onChange = jest.fn()
    const { user } = renderWithUserEvents(
      <TitlesAndName id="test" nameLabel="name" titlesLabel="titles" name="name" titles="titles" onChange={onChange} />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )

    const name = screen.getByRole('textbox', { name: 'name' })
    const titles = screen.getByRole('textbox', { name: 'titles' })

    await user.type(name, ' changed')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({ name: 'NAME CHANGED', titles: 'TITLES' })

    await user.clear(titles)
    await user.type(titles, 'tämmönen arvå')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({ name: 'NAME CHANGED', titles: 'TÄMMÖNEN ARVÅ' })
  })

  it('should reset local state when re-rendered with new values', async () => {
    const { user, rerender } = renderWithUserEvents(
      <TitlesAndName id="test" nameLabel="name" titlesLabel="titles" name="name" titles="titles" />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )
    const name = screen.getByRole('textbox', { name: 'name' })
    const titles = screen.getByRole('textbox', { name: 'titles' })
    await user.type(name, ' changed')
    expect(name).toHaveValue('NAME CHANGED')
    rerender(<TitlesAndName id="test" nameLabel="name" titlesLabel="titles" name="new name" titles="new titles" />)
    await flushPromises()
    expect(name).toHaveValue('NEW NAME')
    expect(titles).toHaveValue('NEW TITLES')
  })

  it('should not call onChange after unmounted', async () => {
    const onChange = jest.fn()
    const { user, unmount } = renderWithUserEvents(
      <TitlesAndName id="test" nameLabel="name" titlesLabel="titles" name="name" titles="titles" onChange={onChange} />,
      undefined,
      { advanceTimers: jest.advanceTimersByTime }
    )
    const name = screen.getByRole('textbox', { name: 'name' })
    await user.type(name, ' changed')
    expect(name).toHaveValue('NAME CHANGED')
    unmount()
    await flushPromises()
    expect(onChange).not.toHaveBeenCalled()
  })
})
