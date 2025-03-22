const path = require('path')
const fs = require('fs')

const args = process.argv.slice(2)
if (args.length !== 1) {
  console.log('usage: node split.js <file.json>')
  return
}

const file = path.resolve(args[0])

const json = JSON.parse(fs.readFileSync(file))
const table = Object.keys(json)[0]
const data = json[table]

const num = Math.ceil(data.length / 25)

for (let i = 0; i < num; i++) {
  const start = i * 25
  fs.writeFileSync(file.replace('.json', `${i}.json`), JSON.stringify({ [table]: data.slice(start, start + 25) }))
}
