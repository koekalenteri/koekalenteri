import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const fi = require('./fi/translation.json')
const fiBreed = require('./fi/breed.json')

const en = require('./en/translation.json')
const enBreed = require('./en/breed.json')

export {fi, en, fiBreed, enBreed}
