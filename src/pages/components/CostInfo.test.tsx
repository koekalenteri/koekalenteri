import type { DogEvent } from '../../types'
import type { DogEventCost } from '../../types/Cost'

import { render, screen } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import { languageAtom } from '../recoil'

import CostInfo from './CostInfo'

// Mock the recoil state for language
const mockRecoilState = (language: string = 'fi') => ({
  initializeState: ({ set }: any) => {
    set(languageAtom, language)
  },
})

describe('CostInfo', () => {
  const setup = (event: Pick<DogEvent, 'cost' | 'costMember'>, language: string = 'fi') =>
    render(<CostInfo event={event} />, {
      wrapper: ({ children }) => (
        <RecoilRoot initializeState={mockRecoilState(language).initializeState}>{children}</RecoilRoot>
      ),
    })

  describe('with numeric costs', () => {
    it('should render with cost and costMember', () => {
      const { container } = setup({ cost: 50, costMember: 40 })
      expect(container).toHaveTextContent('50 €, event.costMember 40 €')
    })

    it('should render only cost when costMember is not provided', () => {
      const { container } = setup({ cost: 50 })
      expect(container).toHaveTextContent('50 €')
      expect(container).not.toHaveTextContent('event.costMember')
    })

    it('should render only cost when costMember is zero', () => {
      const { container } = setup({ cost: 50, costMember: 0 })
      expect(container).toHaveTextContent('50 €')
      expect(container).not.toHaveTextContent('event.costMember')
    })

    it('should show error for invalid configuration (numeric cost with object costMember)', () => {
      const { container } = setup({
        cost: 50,
        costMember: { normal: 40 } as any,
      })
      expect(container).toHaveTextContent('invalid cost configuration')
    })
  })

  describe('with object costs', () => {
    it('should show error for invalid configuration (object cost with numeric costMember)', () => {
      const { container } = setup({
        cost: { normal: 50 } as DogEventCost,
        costMember: 40 as any,
      })
      expect(container).toHaveTextContent('invalid cost configuration')
    })

    it('should render normal cost segment', () => {
      setup({
        cost: { normal: 50 } as DogEventCost,
      })

      expect(screen.getByText('costNames.normal')).toBeInTheDocument()
      expect(screen.getByText('50 €')).toBeInTheDocument()
    })

    it('should render normal cost with member price', () => {
      setup({
        cost: { normal: 50 } as DogEventCost,
        costMember: { normal: 40 } as DogEventCost,
      })

      expect(screen.getByText('costNames.normal')).toBeInTheDocument()
      expect(screen.getByText('50 €, event.costMember 40 €')).toBeInTheDocument()
    })

    it('should render earlyBird cost segment', () => {
      setup({
        cost: {
          normal: 50,
          earlyBird: { cost: 45, days: 7 },
        } as DogEventCost,
      })

      expect(screen.getByText('costNames.normal')).toBeInTheDocument()
      expect(screen.getByText(/costNames.earlyBird/)).toBeInTheDocument()
      expect(screen.getByText('50 €')).toBeInTheDocument()
      expect(screen.getByText('45 €')).toBeInTheDocument()
    })

    it('should render breed cost segment', () => {
      setup({
        cost: {
          normal: 50,
          breed: { '123': 40 },
        } as DogEventCost,
      })

      expect(screen.getByText('costNames.normal')).toBeInTheDocument()
      expect(screen.getByText('costNames.breed code')).toBeInTheDocument()
      expect(screen.getByText('50 €')).toBeInTheDocument()
      expect(screen.getByText('40 €')).toBeInTheDocument()
    })

    it('should render custom cost segment with Finnish description', () => {
      setup({
        cost: {
          normal: 50,
          custom: {
            cost: 35,
            description: { fi: 'Erikoishinta' },
          },
        } as DogEventCost,
      })

      expect(screen.getByText('costNames.normal')).toBeInTheDocument()
      expect(screen.getByText('costNames.custom name')).toBeInTheDocument()
      expect(screen.getByText('50 €')).toBeInTheDocument()
      expect(screen.getByText('35 €')).toBeInTheDocument()
    })

    it('should render custom cost segment with English description when language is set to English', () => {
      setup(
        {
          cost: {
            normal: 50,
            custom: {
              cost: 35,
              description: { fi: 'Erikoishinta', en: 'Special price' },
            },
          } as DogEventCost,
        },
        'en'
      )

      expect(screen.getByText('costNames.normal')).toBeInTheDocument()
      expect(screen.getByText('costNames.custom name')).toBeInTheDocument()
      expect(screen.getByText('50 €')).toBeInTheDocument()
      expect(screen.getByText('35 €')).toBeInTheDocument()
    })

    it('should render optional additional costs', () => {
      setup({
        cost: {
          normal: 50,
          optionalAdditionalCosts: [
            { cost: 10, description: { fi: 'Lisämaksu 1' } },
            { cost: 15, description: { fi: 'Lisämaksu 2', en: 'Additional fee 2' } },
          ],
        } as DogEventCost,
      })

      expect(screen.getByText('costNames.normal')).toBeInTheDocument()
      expect(screen.getByText('Lisämaksu 1')).toBeInTheDocument()
      expect(screen.getByText('Lisämaksu 2')).toBeInTheDocument()
      expect(screen.getByText('50 €')).toBeInTheDocument()
      expect(screen.getByText('10 €')).toBeInTheDocument()
      expect(screen.getByText('15 €')).toBeInTheDocument()
    })

    it('should render optional additional costs with member prices', () => {
      setup({
        cost: {
          normal: 50,
          optionalAdditionalCosts: [
            { cost: 10, description: { fi: 'Lisämaksu 1' } },
            { cost: 15, description: { fi: 'Lisämaksu 2' } },
          ],
        } as DogEventCost,
        costMember: {
          normal: 40,
          optionalAdditionalCosts: [
            { cost: 8, description: { fi: 'Lisämaksu 1' } },
            { cost: 12, description: { fi: 'Lisämaksu 2' } },
          ],
        } as DogEventCost,
      })

      expect(screen.getByText('costNames.normal')).toBeInTheDocument()
      expect(screen.getByText('Lisämaksu 1')).toBeInTheDocument()
      expect(screen.getByText('Lisämaksu 2')).toBeInTheDocument()
      expect(screen.getByText('50 €, event.costMember 40 €')).toBeInTheDocument()
      expect(screen.getByText('10 €, event.costMember 8 €')).toBeInTheDocument()
      expect(screen.getByText('15 €, event.costMember 12 €')).toBeInTheDocument()
    })

    it('should handle optional additional costs with missing member prices', () => {
      setup({
        cost: {
          normal: 50,
          optionalAdditionalCosts: [
            { cost: 10, description: { fi: 'Lisämaksu 1' } },
            { cost: 15, description: { fi: 'Lisämaksu 2' } },
          ],
        } as DogEventCost,
        costMember: {
          normal: 40,
          // Missing or incomplete optionalAdditionalCosts
          optionalAdditionalCosts: [{ cost: 8, description: { fi: 'Lisämaksu 1' } }],
        } as DogEventCost,
      })

      // First optional cost should have member price
      expect(screen.getByText('10 €, event.costMember 8 €')).toBeInTheDocument()
      // Second optional cost should not have member price
      expect(screen.getByText('15 €')).toBeInTheDocument()
    })
  })
})
