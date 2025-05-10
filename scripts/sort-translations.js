const fs = require('fs')
const path = require('path')

function deepSort(obj) {
  if (Array.isArray(obj)) {
    return obj.map(deepSort)
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = deepSort(obj[key])
        return sorted
      }, {})
  } else {
    return obj
  }
}

if (process.argv.length !== 3) {
  console.error('Usage: node sort-translation.js <translation.json>')
  process.exit(1)
}

const fileName = path.resolve(process.argv[2])

try {
  const inputJson = JSON.parse(fs.readFileSync(fileName, 'utf-8'))
  const sortedJson = deepSort(inputJson)
  fs.writeFileSync(fileName, JSON.stringify(sortedJson, null, 2))
  console.log(`✅ Sorted JSON written to ${fileName}`)
} catch (err) {
  console.error(`❌ Error: ${err.message}`)
  process.exit(1)
}
