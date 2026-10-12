import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { useTranslation } from 'react-i18next'
import { describeWithTranslations, spiedUseTranslation } from './language'

vi.mock('react-i18next', async (importOriginal) => (await import('./language')).spyOnUseTranslation(importOriginal))

const BreedName = () => {
  const { t } = useTranslation('breed')
  return <>{t('110')}</>
}

const ListedNamespaces = () => {
  const { t } = useTranslation(['breed', 'translation'])
  return <>{t('110')}</>
}

const PrefixedText = () => {
  const { t } = useTranslation('translation', { keyPrefix: 'audit' })
  return <>{t('unknownError')}</>
}

describe('describeWithTranslations', () => {
  describeWithTranslations('en', () => {
    it("reads the namespace the component asks for, in the block's language", () => {
      render(<BreedName />)

      expect(screen.getByText('Curly Coated Retriever')).toBeInTheDocument()
      expect(i18n.language).toBe('en')
    })

    it('reads a list of namespaces the component asks for, the first one leading', () => {
      render(<ListedNamespaces />)

      expect(screen.getByText('Curly Coated Retriever')).toBeInTheDocument()
    })

    it('keeps the key prefix the component asks for', () => {
      render(<PrefixedText />)

      expect(screen.getByText('Unknown error')).toBeInTheDocument()
    })
  })

  // Runs after the block: the file's own keys-only text and Finnish are back.
  it('leaves the rest of the file with keys, in Finnish', () => {
    render(<BreedName />)

    expect(screen.getByText('110')).toBeInTheDocument()
    expect(i18n.language).toBe('fi')
  })

  it('names the mock a file is missing', () => {
    expect(() => spiedUseTranslation(undefined)).toThrow(/spyOnUseTranslation/)
  })
})
