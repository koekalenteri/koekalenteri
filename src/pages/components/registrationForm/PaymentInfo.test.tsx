import { render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import PaymentInfo from './PaymentInfo'

describe('PaymentInfo', () => {
  const baseEvent = {
    cost: { normal: 100 },
  } as any

  const baseCost = {
    cost: { normal: 100 },
    segment: 'normal',
  } as any

  it('does not auto-select cost when selectedCost is empty string', () => {
    const onChange = vi.fn()

    render(
      <Provider>
        <PaymentInfo
          event={baseEvent}
          cost={baseCost}
          registration={
            {
              dog: { breedCode: '110' },
              language: 'fi',
              selectedCost: '',
            } as any
          }
          onChange={onChange}
        />
      </Provider>
    )

    expect(onChange).not.toHaveBeenCalledWith({
      optionalCosts: [],
      selectedCost: 'normal',
    })
  })

  it('auto-selects cost when selectedCost is undefined', () => {
    const onChange = vi.fn()

    render(
      <Provider>
        <PaymentInfo
          event={baseEvent}
          cost={baseCost}
          registration={
            {
              dog: { breedCode: '110' },
              language: 'fi',
              selectedCost: undefined,
            } as any
          }
          onChange={onChange}
        />
      </Provider>
    )

    expect(onChange).toHaveBeenCalledWith({
      optionalCosts: [],
      selectedCost: 'normal',
    })
  })

  it('clears selected cost and optional costs in legacy segment', () => {
    const onChange = vi.fn()

    render(
      <Provider>
        <PaymentInfo
          event={baseEvent}
          cost={{ cost: { normal: 100 }, segment: 'legacy' } as any}
          registration={
            {
              dog: { breedCode: '110' },
              language: 'fi',
              optionalCosts: [0],
              selectedCost: 'normal',
            } as any
          }
          onChange={onChange}
        />
      </Provider>
    )

    expect(onChange).toHaveBeenCalledWith({
      optionalCosts: undefined,
      selectedCost: undefined,
    })
  })

  it('does not touch the registration language (RegistrationForm owns it, KOE-1268)', () => {
    const onChange = vi.fn()

    render(
      <Provider>
        <PaymentInfo
          event={baseEvent}
          cost={{ cost: { normal: 100 }, segment: 'legacy' } as any}
          registration={{ dog: { breedCode: '110' }, language: 'en' } as any}
          onChange={onChange}
        />
      </Provider>
    )

    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ language: expect.any(String) }))
  })

  it('does not clear legacy selection when nothing is selected', () => {
    const onChange = vi.fn()

    render(
      <Provider>
        <PaymentInfo
          event={baseEvent}
          cost={{ cost: { normal: 100 }, segment: 'legacy' } as any}
          registration={
            {
              dog: { breedCode: '110' },
              language: 'fi',
              optionalCosts: undefined,
              selectedCost: undefined,
            } as any
          }
          onChange={onChange}
        />
      </Provider>
    )

    expect(onChange).not.toHaveBeenCalledWith({
      optionalCosts: undefined,
      selectedCost: undefined,
    })
  })

  it('renders optional additional costs section', async () => {
    const onChange = vi.fn()

    render(
      <Provider>
        <PaymentInfo
          event={baseEvent}
          cost={
            {
              cost: {
                normal: 100,
                optionalAdditionalCosts: [{ cost: 10, description: { fi: 'Lisämaksu' } }],
              },
              segment: 'normal',
            } as any
          }
          registration={
            {
              createdAt: new Date(),
              dog: { breedCode: '110' },
              language: 'fi',
              optionalCosts: [],
              selectedCost: 'normal',
            } as any
          }
          onChange={onChange}
        />
      </Provider>
    )

    expect(screen.getByText('costNames.optionalAdditionalCosts')).toBeInTheDocument()
  })

  it('returns null when registration is not minimal for cost rendering', () => {
    const onChange = vi.fn()
    const { container } = render(
      <Provider>
        <PaymentInfo event={baseEvent} cost={baseCost} registration={{ language: 'fi' } as any} onChange={onChange} />
      </Provider>
    )

    expect(container).toBeEmptyDOMElement()
  })
})
