import type { Locator } from '@vitest/browser/context'
import type { Result, RunOptions } from 'axe-core'
// The context values come from @vitest/browser/context rather than the newer `vitest/browser`
// re-export: that one only surfaces the providers actually installed, so TypeScript finds neither
// `commands` nor `Locator` behind it.
import { commands } from '@vitest/browser/context'
import axe from 'axe-core'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { chai, expect } from 'vitest'
import { registerFormatters } from './i18n/formatters'
import { en, enBreed, enBreedAbbr, enCountry, fi, fiBreed, fiBreedAbbr, fiCountry } from './i18n/locales'

// Real translations, not the key-echoing mock the other projects use. Label length is part of
// what these screenshots are for: Finnish breed names run past 30 characters, and a legend that
// only ever renders "111" would never show the layout the reader actually gets.
//
// The resources are wired up here rather than through i18n/config, whose `debug: isDevEnv()`
// reads process.env and has nothing to define it in a browser.
i18n.use(initReactI18next).init({
  fallbackLng: 'fi',
  interpolation: { escapeValue: false },
  lng: 'fi',
  // Both app languages, so a visual test can render the English view too (KOE-1263) — without the
  // en bundle a changeLanguage('en') silently falls back to Finnish captions.
  resources: {
    en: { breed: enBreed, breedAbbr: enBreedAbbr, country: enCountry, translation: en },
    fi: { breed: fiBreed, breedAbbr: fiBreedAbbr, country: fiCountry, translation: fi },
  },
})

// The date and span formats the app registers on top of i18next: without these a screenshot shows a
// raw Date.toString() wherever a label formats one, which is not the label anyone gets.
registerFormatters(i18n)

// The test files run in the same browser origin, and the app's storage-backed atoms (the language
// above all) read their initial value from it. A file that set the language to English left the
// next file reading English — on the CI runner the payment details captured "Saturday
// accommodation" where the reference says "Majoitus lauantaina", and which file ran before which
// depended on the machine. Every file starts from empty storage instead.
localStorage.clear()
sessionStorage.clear()

// Every screenshot is also an accessibility audit. The real-browser render that pixel comparison
// needs is the render axe needs, and a component that only appears in a screenshot test would
// otherwise never meet it. The matcher itself is wrapped, rather than a helper offered beside it,
// so that no test can take a picture without the audit. What the audit finds is ratcheted against
// scripts/a11y-baseline.json by scripts/a11yRatchet.mjs: a new violation fails, a fixed one lowers the
// allowance.

/** A component fragment has no landmarks to speak of; the page-level `region` rule is the page's. */
const AXE_OPTIONS: RunOptions = { resultTypes: ['violations'], rules: { region: { enabled: false } } }

const describeViolation = ({ help, helpUrl, id, nodes }: Result, allowed: number) =>
  [
    `${id}: ${help} (${nodes.length} found, ${allowed} allowed)`,
    `  ${helpUrl}`,
    ...nodes.map((node) => `  ${node.target.join(' ')}\n    ${node.failureSummary?.replaceAll('\n', '\n    ')}`),
  ].join('\n')

async function auditAccessibility(element: Element, screenshot: string) {
  const { violations } = await axe.run(element, AXE_OPTIONS)
  const found = Object.fromEntries(violations.map((violation) => [violation.id, violation.nodes.length]))
  const grown = await commands.a11yRatchet(screenshot, found)
  if (!grown.length) return
  const details = grown.flatMap(({ allowed, rule }) =>
    violations.filter((violation) => violation.id === rule).map((violation) => describeViolation(violation, allowed))
  )
  throw new Error(
    `Accessibility violations in screenshot "${screenshot}" beyond scripts/a11y-baseline.json:\n\n${details.join('\n\n')}`
  )
}

chai.util.overwriteMethod(
  chai.Assertion.prototype,
  'toMatchScreenshot',
  (original: (...args: unknown[]) => unknown) =>
    async function (this: object, name?: string, options?: object) {
      // The comparison first, the audit second. `expect.element` polls the matcher until the
      // screenshot matches, so a DOM that is still settling is retried rather than reported; audit
      // it before that and the audit sees a half-rendered screen, which made a disabled button's
      // contrast come and go between runs. After the comparison passes, the DOM is the one the
      // reference image was taken of.
      const result = await original.call(this, name, options)
      const target: Element | Locator = chai.util.flag(this, 'object')
      const element = target instanceof Element ? target : target.element()
      await auditAccessibility(element, name ?? expect.getState().currentTestName ?? 'screenshot')
      return result
    }
)
