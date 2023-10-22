import { render, screen } from '@testing-library/react'

import { renderWithUserEvents, waitForDebounce } from '../../test-utils/utils'

import AutocompleteSingle from './AutocompleteSingle'

describe('AutocompleteSingle', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(console.debug)
    jest.spyOn(console, 'error').mockImplementation(console.debug)
  })

  afterEach(() => {
    expect(console.warn).toHaveBeenCalledTimes(0)
    expect(console.error).toHaveBeenCalledTimes(0)
  })

  describe('when options are strings', () => {
    it('should render with minimal information', () => {
      const { container } = render(<AutocompleteSingle id="test-minimal" options={['A', 'B']} label={'test-label'} />)
      expect(container).toMatchSnapshot()
    })

    it('should render with selected option', () => {
      render(<AutocompleteSingle id="test-option" options={['A', 'B']} label={'test-label'} value="B" />)
      expect(screen.getByRole('combobox')).toMatchInlineSnapshot(`
<input
  aria-autocomplete="list"
  aria-expanded="false"
  aria-invalid="false"
  autocapitalize="none"
  autocomplete="off"
  class="MuiInputBase-input MuiOutlinedInput-input MuiInputBase-inputAdornedEnd MuiAutocomplete-input MuiAutocomplete-inputFocused css-nxo287-MuiInputBase-input-MuiOutlinedInput-input"
  id="test-option"
  role="combobox"
  spellcheck="false"
  type="text"
  value="B"
/>
`)
    })

    it('should render with missing selected option', () => {
      render(<AutocompleteSingle id="test-option-missing" options={['A', 'B']} label={'test-label'} value="C" />)
      expect(screen.getByRole('combobox')).toMatchInlineSnapshot(`
<input
  aria-autocomplete="list"
  aria-expanded="false"
  aria-invalid="false"
  autocapitalize="none"
  autocomplete="off"
  class="MuiInputBase-input MuiOutlinedInput-input MuiInputBase-inputAdornedEnd MuiAutocomplete-input MuiAutocomplete-inputFocused css-nxo287-MuiInputBase-input-MuiOutlinedInput-input"
  id="test-option-missing"
  role="combobox"
  spellcheck="false"
  type="text"
  value="C"
/>
`)
    })

    it('should render helperText', () => {
      const { container } = render(
        <AutocompleteSingle
          id="test-helperText"
          options={['test-a', 'test-b']}
          label={'test-label'}
          helperText={'helper text'}
        />
      )
      expect(container).toMatchSnapshot()
    })

    it('should render helperText with error state', () => {
      const { container } = render(
        <AutocompleteSingle
          id="test-helperTest-error"
          options={['test-a', 'test-b']}
          label={'test-label'}
          helperText={'helper text'}
          error
        />
      )
      expect(container).toMatchSnapshot()
    })

    it('should call onChange', async () => {
      const onChange = jest.fn()
      const { user } = renderWithUserEvents(
        <AutocompleteSingle
          id="test-onChange"
          options={['test-a', 'test-b']}
          label={'test-label'}
          onChange={onChange}
        />
      )

      const input = screen.getByRole('combobox')
      await user.type(input, 'b{ArrowDown}{Enter}')

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith('test-b')
    })

    it('should not warn when changing from undefined to value', async () => {
      const { rerender } = render(
        <AutocompleteSingle id="test-warn" options={['test-a', 'test-b']} label={'test-label'} />
      )
      rerender(<AutocompleteSingle id="test-warn" options={['test-a', 'test-b']} label={'test-label'} value="test-a" />)
    })

    it.each([undefined, null, '', 'test-a', 'test-b', 'test-c'])(
      'should not call onChange on initial render when value=%p',
      async (value) => {
        const onChange = jest.fn()
        render(
          <AutocompleteSingle
            id="test-warn"
            options={['test-a', 'test-b']}
            label={'test-label'}
            value={value}
            onChange={onChange}
          />
        )
        await waitForDebounce()
        expect(onChange).not.toHaveBeenCalled()
      }
    )
  })

  describe('when options are objects', () => {
    const getName = (o: { name: string } | string) => (typeof o === 'string' ? o : o.name)
    it('should render with minimal information', () => {
      const { container } = render(
        <AutocompleteSingle id="test-minimal" options={[{ name: 'A' }, { name: 'B' }]} label={'test-label'} />
      )
      expect(container).toMatchSnapshot()
    })

    it('should render with selected option', () => {
      render(
        <AutocompleteSingle
          id="test-option"
          options={[{ name: 'A' }, { name: 'B' }]}
          label={'test-label'}
          value={{ name: 'B' }}
          getOptionLabel={getName}
        />
      )
      expect(screen.getByRole('combobox')).toMatchInlineSnapshot(`
<input
  aria-autocomplete="list"
  aria-expanded="false"
  aria-invalid="false"
  autocapitalize="none"
  autocomplete="off"
  class="MuiInputBase-input MuiOutlinedInput-input MuiInputBase-inputAdornedEnd MuiAutocomplete-input MuiAutocomplete-inputFocused css-nxo287-MuiInputBase-input-MuiOutlinedInput-input"
  id="test-option"
  role="combobox"
  spellcheck="false"
  type="text"
  value="B"
/>
`)
    })

    it('should render with missing selected option', () => {
      render(
        <AutocompleteSingle
          id="test-option-missing"
          options={[{ name: 'A' }, { name: 'B' }]}
          label={'test-label'}
          value={{ name: 'C' }}
          getOptionLabel={getName}
        />
      )
      expect(screen.getByRole('combobox')).toMatchInlineSnapshot(`
<input
  aria-autocomplete="list"
  aria-expanded="false"
  aria-invalid="false"
  autocapitalize="none"
  autocomplete="off"
  class="MuiInputBase-input MuiOutlinedInput-input MuiInputBase-inputAdornedEnd MuiAutocomplete-input MuiAutocomplete-inputFocused css-nxo287-MuiInputBase-input-MuiOutlinedInput-input"
  id="test-option-missing"
  role="combobox"
  spellcheck="false"
  type="text"
  value="C"
/>
`)
    })

    it('should render helperText', () => {
      const { container } = render(
        <AutocompleteSingle
          id="test-helperText"
          options={[{ name: 'test-a' }, { name: 'test-b' }]}
          label={'test-label'}
          helperText={'helper text'}
          getOptionLabel={getName}
        />
      )
      expect(container).toMatchSnapshot()
    })

    it('should render helperText with error state', () => {
      const { container } = render(
        <AutocompleteSingle
          id="test-helperTest-error"
          options={[{ name: 'test-a' }, { name: 'test-b' }]}
          label={'test-label'}
          helperText={'helper text'}
          error
          getOptionLabel={getName}
        />
      )
      expect(container).toMatchSnapshot()
    })

    it('should call onChange', async () => {
      const onChange = jest.fn()
      const { user } = renderWithUserEvents(
        <AutocompleteSingle
          id="test-onChange"
          options={[{ name: 'test-a' }, { name: 'test-b' }]}
          label={'test-label'}
          getOptionLabel={getName}
          onChange={onChange}
        />
      )

      const input = screen.getByRole('combobox')
      await user.type(input, 'b{ArrowDown}{Enter}')

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'test-b' }))
    })
  })
})
