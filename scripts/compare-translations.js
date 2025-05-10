const fs = require('fs')
const path = require('path')

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function getAllKeys(obj, prefix = '') {
  let keys = []

  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      keys = keys.concat(getAllKeys(obj[key], fullKey))
    } else {
      keys.push(fullKey)
    }
  }

  return keys
}

function compareKeys(mainKeys, otherKeys) {
  const missing = mainKeys.filter((key) => !otherKeys.includes(key))
  const excess = otherKeys.filter((key) => !mainKeys.includes(key))
  return { missing, excess }
}

// Usage: node compare-translations.js main.json other.json
if (process.argv.length !== 4) {
  console.error('Usage: node compare-translations.js <main.json> <other.json>')
  process.exit(1)
}

const mainFile = path.resolve(process.argv[2])
const otherFile = path.resolve(process.argv[3])

try {
  const main = loadJSON(mainFile)
  const other = loadJSON(otherFile)

  const mainKeys = getAllKeys(main)
  const otherKeys = getAllKeys(other)

  const { missing, excess } = compareKeys(mainKeys, otherKeys)

  console.log(`\nMissing keys in second file:\n${missing.join('\n') || '(none)'}`)
  console.log(`\nExcess keys in second file:\n${excess.join('\n') || '(none)'}`)
} catch (err) {
  console.error(`Error: ${err.message}`)
  process.exit(1)
}
