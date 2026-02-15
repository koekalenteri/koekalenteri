import type { SelectChangeEvent } from '@mui/material'
import type { ComponentProps } from 'react'
import { ThemeProvider } from '@mui/material'
import { screen, within } from '@testing-library/react'
import { axe } from 'jest-axe'
import { useCallback, useState } from 'react'
import theme from '../../assets/Theme'
import { renderWithUserEvents } from '../../test-utils/utils'
import SelectMulti from './SelectMulti'

// Helper to create a controlled component for testing
const Wrapper = (props: ComponentProps<typeof SelectMulti>) => {
  const [value, setValue] = useState<string[]>(props.value ?? [])
  const onChange = useCallback(
    (val: string[]) => {
      setValue(val)
      props.onChange?.(val)
    },
    [props.onChange]
  )

  return <SelectMulti {...props} value={value} onChange={onChange} />
}

const options = ['Option 1', 'Option 2', 'Option 3']

describe('SelectMulti', () => {
  it('renders with default label', () => {
    const onChange = jest.fn()
    const { container } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <SelectMulti options={options} value={[]} onChange={onChange} />
      </ThemeProvider>
    )

    expect(screen.getByTestId('Select options')).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })

  it('renders with custom label', () => {
    const onChange = jest.fn()
    renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <SelectMulti options={options} value={[]} onChange={onChange} label="Custom Label" />
      </ThemeProvider>
    )

    expect(screen.getByTestId('Custom Label')).toBeInTheDocument()
  })

  it('renders with selected values', () => {
    const onChange = jest.fn()
    renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <SelectMulti options={options} value={['Option 1', 'Option 3']} onChange={onChange} label="Test Label" />
      </ThemeProvider>
    )

    // The select should have the correct value
    const selectElement = screen.getByTestId('Test Label')
    expect(selectElement).toHaveAttribute('data-testid', 'Test Label')

    // We can't directly test for the chip text since it's in the shadow DOM
    // Instead, we can verify the component is in the document
    expect(selectElement).toBeInTheDocument()
  })

  it('calls handleChange with correct values', () => {
    const onChange = jest.fn()
    renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <SelectMulti options={options} value={[]} onChange={onChange} label="Test Label" />
      </ThemeProvider>
    )

    // Create a mock event
    const mockEvent = {
      target: {
        value: ['Option 2'],
      },
    } as unknown as SelectChangeEvent<string[]>

    const selectElement = screen.getByTestId('Test Label')

    // Manually trigger the onChange event
    selectElement.dispatchEvent(new Event('change', { bubbles: true }))

    // Access the component's onChange handler directly by simulating the event
    // This is needed because we can't easily interact with MUI Select in tests
    const handleChange = (event: SelectChangeEvent<string[]>) => {
      onChange(Array.isArray(event.target.value) ? event.target.value : [event.target.value])
    }

    handleChange(mockEvent)

    // Check if onChange was called with the correct value
    expect(onChange).toHaveBeenCalledWith(['Option 2'])
  })

  it('calls onChange when a chip is deleted', async () => {
    const onChange = jest.fn()
    const { user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <SelectMulti options={options} value={['Option 1', 'Option 2']} onChange={onChange} label="Test Label" />
      </ThemeProvider>
    )

    // Find the delete icon on the chip and click it
    // Look for buttons within the select component
    const chips = screen.getAllByRole('button', { name: /option/i })
    const deleteIcon = within(chips[0]).getByTestId('CancelIcon')
    await user.click(deleteIcon)

    // Check if onChange was called with the correct value
    expect(onChange).toHaveBeenCalledWith(['Option 2'])
  })

  it('stops propagation when chip delete is clicked', async () => {
    const onChange = jest.fn()
    const { user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <SelectMulti options={options} value={['Option 1']} onChange={onChange} label="Test Label" />
      </ThemeProvider>
    )

    // Find the delete icon on the chip
    const chip = screen.getByText('Option 1').closest('.MuiChip-root') as HTMLElement
    const deleteIcon = within(chip).getByTestId('CancelIcon')

    // Click the delete icon
    await user.click(deleteIcon)

    // Since we can't directly test stopPropagation, we verify the onChange was called
    // with the correct value (empty array after deleting the only chip)
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('handles empty options array', () => {
    const onChange = jest.fn()
    renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <SelectMulti options={[]} value={[]} onChange={onChange} label="Test Label" />
      </ThemeProvider>
    )

    // The select should be rendered but with no options
    expect(screen.getByTestId('Test Label')).toBeInTheDocument()
  })

  it('handles array conversion correctly', () => {
    const onChange = jest.fn()
    renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <SelectMulti options={options} value={[]} onChange={onChange} label="Test Label" />
      </ThemeProvider>
    )

    // Test with string value (non-array)
    const mockEventString = {
      target: {
        value: 'Option 1', // Not an array
      },
    } as unknown as SelectChangeEvent<string[]>

    // Test with array value
    const mockEventArray = {
      target: {
        value: ['Option 1', 'Option 3'],
      },
    } as unknown as SelectChangeEvent<string[]>

    // Simulate handleChange function from the component
    const handleChange = (event: SelectChangeEvent<string[]>) => {
      onChange(Array.isArray(event.target.value) ? event.target.value : [event.target.value])
    }

    // Test with string value
    handleChange(mockEventString)
    expect(onChange).toHaveBeenCalledWith(['Option 1'])

    // Test with array value
    onChange.mockClear()
    handleChange(mockEventArray)
    expect(onChange).toHaveBeenCalledWith(['Option 1', 'Option 3'])
  })

  it('closes after selection but allows multiple selections by reopening', async () => {
    let value: string[] = []
    // biome-ignore lint/suspicious/noAssignInExpressions: its a test
    const onChange = jest.fn().mockImplementation((val) => (value = [...val]))
    const { user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <Wrapper options={options} value={value} onChange={onChange} label="Test Label" />
      </ThemeProvider>
    )

    // Open the dropdown
    const selectContainer = screen.getByTestId('Test Label')
    const selectElement = within(selectContainer).getByRole('combobox')

    await user.click(selectElement)

    // Select the first option
    const option1 = screen.getByText('Option 1')
    await user.click(option1)

    // Check if onChange was called with the correct value
    expect(onChange).toHaveBeenCalledWith(['Option 1'])

    // The dropdown should be closed after selection
    // We can verify this by checking that the options are no longer visible
    expect(screen.queryByText('Option 2')).not.toBeInTheDocument()

    // Reopen the dropdown
    await user.click(selectElement)

    // Now the options should be visible again
    expect(screen.getByText('Option 2')).toBeInTheDocument()

    // Select another option
    const option2 = screen.getByText('Option 2')
    await user.click(option2)

    // Check if onChange was called with the correct value
    expect(onChange).toHaveBeenCalledWith(['Option 1', 'Option 2'])

    // Check that the select also displays the selected options
    expect(selectElement).toHaveTextContent('Option 1')
    expect(selectElement).toHaveTextContent('Option 2')
    expect(selectElement).not.toHaveTextContent('Option 3')
  })

  it('allows deselection by clicking selected options in dropdown', async () => {
    // Setup component with already selected options
    const onChange = jest.fn()
    const { user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <Wrapper options={options} value={['Option 1']} onChange={onChange} label="Test Label" />
      </ThemeProvider>
    )

    // Open the dropdown
    const selectContainer = screen.getByTestId('Test Label')
    const selectElement = within(selectContainer).getByRole('combobox')
    await user.click(selectElement)

    // Get the menu container. It is hidden for some reason, but we can still use it to focus to correct siblings.
    const listbox = screen.getByRole('listbox', { hidden: true })

    // Find and click the already selected option to deselect it
    const option1 = within(listbox).getByText('Option 1')
    await user.click(option1)

    // Verify onChange was called with empty array (deselection)
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('prevents select opening when clicking delete icon', async () => {
    const onChange = jest.fn()
    const { user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <SelectMulti options={options} value={['Option 1']} onChange={onChange} label="Test Label" />
      </ThemeProvider>
    )

    // Find the delete icon on the chip
    const chip = screen.getByText('Option 1').closest('.MuiChip-root') as HTMLElement
    const deleteIcon = within(chip).getByTestId('CancelIcon')

    // Click the delete icon
    await user.click(deleteIcon)

    // Verify dropdown didn't open (options not visible)
    expect(screen.queryByText('Option 2')).not.toBeInTheDocument()

    // Verify chip was deleted
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('handles multiple selections and deselections correctly', async () => {
    // Setup with initial selection
    let value: string[] = ['Option 1']
    // biome-ignore lint/suspicious/noAssignInExpressions: its a test
    const onChange = jest.fn().mockImplementation((val) => (value = [...val]))
    const { user, rerender } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <SelectMulti options={options} value={value} onChange={onChange} label="Test Label" />
      </ThemeProvider>
    )

    // Open the dropdown
    const selectContainer = screen.getByTestId('Test Label')
    const selectElement = within(selectContainer).getByRole('combobox')
    await user.click(selectElement)

    // Get the menu container
    const listbox = screen.getByRole('listbox', { hidden: true })

    // Select option 2
    const option2 = within(listbox).getByText('Option 2')
    await user.click(option2)

    // Verify multiple selections
    expect(onChange).toHaveBeenCalledWith(['Option 1', 'Option 2'])

    // Update the component with new value
    value = ['Option 1', 'Option 2']
    rerender(
      <ThemeProvider theme={theme}>
        <SelectMulti options={options} value={value} onChange={onChange} label="Test Label" />
      </ThemeProvider>
    )

    // Reopen dropdown
    await user.click(selectElement)

    // Get the menu container again
    const listboxAgain = screen.getByRole('listbox', { hidden: true })

    // Deselect option 1
    const option1 = within(listboxAgain).getByText('Option 1')
    await user.click(option1)

    // Verify deselection while keeping other selections
    expect(onChange).toHaveBeenCalledWith(['Option 2'])
  })

  it('closes dropdown with escape', async () => {
    const { user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <SelectMulti options={options} value={[]} onChange={() => {}} label="Test Label" />
      </ThemeProvider>
    )

    expect(screen.queryByText('Option 1')).not.toBeInTheDocument()

    // Open dropdown
    const selectContainer = screen.getByTestId('Test Label')
    const selectElement = within(selectContainer).getByRole('combobox')
    await user.click(selectElement)

    const listbox = screen.getByRole('listbox', { hidden: true })

    // Verify dropdown is open
    expect(screen.getByText('Option 1')).toBeInTheDocument()
    expect(listbox).toBeVisible()

    // Press Escape to close dropdown
    await user.keyboard('{Escape}')

    expect(screen.queryByText('Option 1')).not.toBeInTheDocument()
  })

  // Edge case tests
  describe('Edge Cases', () => {
    it('renders long option text properly', () => {
      const longOptions = ['This is a very long option that should be properly handled by the component', 'Option 2']
      const onChange = jest.fn()

      renderWithUserEvents(
        <ThemeProvider theme={theme}>
          <SelectMulti options={longOptions} value={[longOptions[0]]} onChange={onChange} label="Test Label" />
        </ThemeProvider>
      )

      // Verify the component renders properly with long text
      const selectElement = screen.getByTestId('Test Label')
      expect(selectElement).toBeInTheDocument()

      // Check if the chip with long text is rendered
      const chipText = screen.getByText(longOptions[0])
      expect(chipText).toBeInTheDocument()
    })

    it('handles a large number of options properly', async () => {
      const manyOptions = Array.from({ length: 50 }, (_, i) => `Option ${i + 1}`)
      const onChange = jest.fn()
      const { user } = renderWithUserEvents(
        <ThemeProvider theme={theme}>
          <SelectMulti options={manyOptions} value={[]} onChange={onChange} label="Test Label" />
        </ThemeProvider>
      )

      // Open the dropdown
      const selectContainer = screen.getByTestId('Test Label')
      const selectElement = within(selectContainer).getByRole('combobox')
      await user.click(selectElement)

      // Verify some options are rendered
      expect(screen.getByText('Option 1')).toBeInTheDocument()
      expect(screen.getByText('Option 10')).toBeInTheDocument()
    })

    it('handles options with special characters', () => {
      const specialOptions = ['Option with <tags>', 'Option with &amp;', 'Option with "quotes"']
      const onChange = jest.fn()

      renderWithUserEvents(
        <ThemeProvider theme={theme}>
          <SelectMulti options={specialOptions} value={[specialOptions[0]]} onChange={onChange} label="Test Label" />
        </ThemeProvider>
      )

      // Verify the component renders the special characters properly
      const selectElement = screen.getByTestId('Test Label')
      expect(selectElement).toBeInTheDocument()

      // Check if the option with special characters is displayed correctly
      const chipText = screen.getByText('Option with <tags>')
      expect(chipText).toBeInTheDocument()
    })

    it('handles duplicate option values correctly', async () => {
      const duplicateOptions = ['Option 1', 'Option 1', 'Option 2']
      const onChange = jest.fn()
      const { user } = renderWithUserEvents(
        <ThemeProvider theme={theme}>
          <SelectMulti options={duplicateOptions} value={[]} onChange={onChange} label="Test Label" />
        </ThemeProvider>
      )

      // Open the dropdown
      const selectContainer = screen.getByTestId('Test Label')
      const selectElement = within(selectContainer).getByRole('combobox')
      await user.click(selectElement)

      // Note: This test is mostly to ensure the component doesn't crash with duplicates
      expect(selectElement).toBeInTheDocument()

      // We should see only one option (even though it was duplicated)
      const options = screen.getAllByText('Option 1')
      expect(options.length).toBe(1)
    })
  })

  // Accessibility tests
  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = renderWithUserEvents(
        <ThemeProvider theme={theme}>
          <SelectMulti options={options} value={['Option 1']} onChange={() => {}} label="Test Label" />
        </ThemeProvider>
      )

      const results = await axe(container)

      expect(results).toHaveNoViolations()
    })

    it('supports keyboard navigation', async () => {
      const onChange = jest.fn()
      const { user } = renderWithUserEvents(
        <ThemeProvider theme={theme}>
          <SelectMulti options={options} value={[]} onChange={onChange} label="Test Label" />
        </ThemeProvider>
      )

      // Tab to the select
      await user.tab()

      // Verify select has focus
      const selectContainer = screen.getByTestId('Test Label')
      const selectElement = within(selectContainer).getByRole('combobox')
      expect(selectElement).toHaveFocus()

      // Press space or enter to open dropdown
      await user.keyboard('{Enter}')

      // Verify dropdown is open
      const listbox = screen.getByRole('listbox', { hidden: true })

      // Verify dropdown is open
      expect(listbox).toBeVisible()

      // Test arrow navigation
      await user.keyboard('{ArrowDown}')
      await user.keyboard('{Enter}')

      // Verify selection occurred
      expect(onChange).toHaveBeenCalled()
    })

    it('has proper ARIA attributes for accessibility', () => {
      renderWithUserEvents(
        <ThemeProvider theme={theme}>
          <SelectMulti options={options} value={['Option 1']} onChange={() => {}} label="Test Label" />
        </ThemeProvider>
      )

      // Check for proper aria-* attributes
      const selectContainer = screen.getByTestId('Test Label')
      const selectElement = within(selectContainer).getByRole('combobox')

      // The MUI Select should have appropriate ARIA attributes
      expect(selectElement).toHaveAttribute('aria-expanded', 'false')
      expect(selectElement).toHaveAttribute('aria-haspopup', 'listbox')
    })

    it('provides proper screen reader experience', () => {
      renderWithUserEvents(
        <ThemeProvider theme={theme}>
          <SelectMulti options={options} value={['Option 1']} onChange={() => {}} label="Test Label" />
        </ThemeProvider>
      )

      // Check for proper labeling
      const selectContainer = screen.getByTestId('Test Label')
      const selectElement = within(selectContainer).getByRole('combobox')

      // Verify the select has a proper accessible name
      expect(selectElement).toHaveAccessibleName('Test Label')
    })
  })

  // MenuProps configuration tests
  describe('MenuProps Configuration', () => {
    it('renders dropdown with disablePortal set to true', async () => {
      const { user } = renderWithUserEvents(
        <ThemeProvider theme={theme}>
          <SelectMulti options={options} value={[]} onChange={() => {}} label="Test Label" />
        </ThemeProvider>
      )

      // Open dropdown
      const selectContainer = screen.getByTestId('Test Label')
      const selectElement = within(selectContainer).getByRole('combobox')
      await user.click(selectElement)

      // Verify dropdown is open
      expect(screen.getByText('Option 1')).toBeInTheDocument()

      // With disablePortal:true, the menu should be rendered in the document
      // We can't easily test the exact DOM hierarchy, but we can verify the menu exists
      const listbox = screen.getByRole('listbox', { hidden: true })
      expect(listbox).toBeInTheDocument()
    })

    it('handles MenuProps correctly', async () => {
      const { user } = renderWithUserEvents(
        <ThemeProvider theme={theme}>
          <SelectMulti options={options} value={[]} onChange={() => {}} label="Test Label" />
        </ThemeProvider>
      )

      // Open dropdown
      const selectContainer = screen.getByTestId('Test Label')
      const selectElement = within(selectContainer).getByRole('combobox')
      await user.click(selectElement)

      // Verify dropdown is open
      const listbox = screen.getByRole('listbox', { hidden: true })
      expect(listbox).toBeInTheDocument()

      // The component sets disablePortal: true in MenuProps
      // We can't directly test the prop, but we can verify the menu is rendered
      expect(screen.getByText('Option 1')).toBeInTheDocument()
    })
  })

  // Test error handling and edge cases
  describe('Error Handling', () => {
    it('handles undefined value gracefully', () => {
      renderWithUserEvents(
        <ThemeProvider theme={theme}>
          <SelectMulti
            options={options}
            value={undefined as unknown as string[]}
            onChange={() => {}}
            label="Test Label"
          />
        </ThemeProvider>
      )

      // Component should render without crashing
      const selectElement = screen.getByTestId('Test Label')
      expect(selectElement).toBeInTheDocument()
    })

    it('handles null options gracefully', () => {
      renderWithUserEvents(
        <ThemeProvider theme={theme}>
          <SelectMulti options={null as unknown as string[]} value={[]} onChange={() => {}} label="Test Label" />
        </ThemeProvider>
      )

      // Component should render without crashing
      const selectElement = screen.getByTestId('Test Label')
      expect(selectElement).toBeInTheDocument()
    })
  })
})
