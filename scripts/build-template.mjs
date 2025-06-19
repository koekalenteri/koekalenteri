import { watch } from 'fs'
import fs from 'fs/promises'
import path from 'path'

const inputPaths = [
  './template/main.yaml',
  './template/amplify.yaml',
  './template/api.yaml',
  './template/ws-api.yaml',
  './template/cognito.yaml',
  './template/buckets',
  './template/functions',
  './template/layers.yaml',
  './template/policies',
  './template/tables',
  './template/outputs.yaml',
]

const outputFile = './dist/template.yaml'

const isYAML = (filename) => /\.(ya?ml)$/i.test(filename)

async function getYAMLFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await getYAMLFiles(fullPath)))
    } else if (entry.isFile() && isYAML(entry.name)) {
      files.push(fullPath)
    }
  }

  return files
}

async function resolvePaths(paths) {
  const allFiles = []

  for (const inputPath of paths) {
    const stats = await fs.stat(inputPath)
    if (stats.isDirectory()) {
      const files = await getYAMLFiles(inputPath)
      allFiles.push(...files.sort())
    } else if (stats.isFile()) {
      allFiles.push(inputPath)
    }
  }

  return allFiles
}

async function concatYAML() {
  const files = await resolvePaths(inputPaths)

  let output = ''
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8')
    output += `# --- ${path.relative('.', file)} ---\n` + content + '\n\n'
  }

  await fs.writeFile(outputFile, output)
  console.log(`✅ Concatenated ${files.length} files into ${outputFile}`)
}

async function watchTemplates() {
  // First build
  await concatYAML()

  console.log('👀 Watching template files for changes...')

  // Set of directories to watch
  const dirsToWatch = new Set()

  // Add all input paths and their parent directories
  for (const inputPath of inputPaths) {
    const stats = await fs.stat(inputPath)
    if (stats.isDirectory()) {
      dirsToWatch.add(inputPath)
      // Add all subdirectories
      const files = await getYAMLFiles(inputPath)
      for (const file of files) {
        dirsToWatch.add(path.dirname(file))
      }
    } else {
      dirsToWatch.add(path.dirname(inputPath))
    }
  }

  // Watch each directory
  for (const dir of dirsToWatch) {
    watch(dir, { recursive: false }, async (eventType, filename) => {
      if (filename && isYAML(filename)) {
        console.log(`📄 Template file changed: ${path.join(dir, filename)}`)
        try {
          await concatYAML()
        } catch (error) {
          console.error('❌ Error rebuilding template:', error)
        }
      }
    })
  }
}

// Check if watch mode is enabled
const watchMode = process.argv.includes('--watch')

if (watchMode) {
  watchTemplates().catch(console.error)
} else {
  concatYAML().catch(console.error)
}
