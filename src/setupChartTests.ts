import { Globals } from '@react-spring/web'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { registerFormatters } from './i18n/formatters'
import { fi, fiBreed, fiBreedAbbr, fiCountry } from './i18n/locales'

// MUI charts grow their bars and draw their lines with react-spring, so a screenshot taken
// before the springs settle catches a half-drawn chart -- which looks like a layout bug and
// is not one. Turning animation off globally makes every capture deterministic.
//
// Test-only on purpose: the app keeps its animation.
Globals.assign({ skipAnimation: true })

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
  resources: { fi: { breed: fiBreed, breedAbbr: fiBreedAbbr, country: fiCountry, translation: fi } },
})

// The date and span formats the app registers on top of i18next: without these a screenshot shows a
// raw Date.toString() wherever a label formats one, which is not the label anyone gets.
registerFormatters(i18n)
