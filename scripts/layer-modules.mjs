#!/usr/bin/env node

import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

// Resolve directory paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')

const paths = {
  lambda: join(projectRoot, 'src', 'lambda'),
  lib: join(projectRoot, 'src', 'lambda', 'lib'),
  utils: join(projectRoot, 'src', 'lambda', 'utils'),
  projectLib: join(projectRoot, 'src', 'lib'),
  i18n: join(projectRoot, 'src', 'i18n'),
  nodeModules: join(projectRoot, 'node_modules'),
  layerNodeModules: join(projectRoot, 'dist', 'layer', 'nodejs', 'node_modules'),
}

const excludeFiles = ['src/i18n/index.ts', 'src/lambda/jest.config.ts']
const dependencies = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')).dependencies

function findTsFiles(dir) {
  const result = []

  for (const file of readdirSync(dir)) {
    const fullPath = join(dir, file)
    const stat = lstatSync(fullPath)

    if (stat.isDirectory()) {
      if (/test-utils|coverage|__tests__|__mocks__/.test(file)) continue
      result.push(...findTsFiles(fullPath))
    } else if (
      fullPath.endsWith('.ts') &&
      !fullPath.endsWith('.test.ts') &&
      !fullPath.endsWith('.d.ts') &&
      !excludeFiles.some((ex) => fullPath.endsWith(ex))
    ) {
      result.push(fullPath)
    }
  }

  return result
}

function extractImports(filePath) {
  const content = readFileSync(filePath, 'utf8')
  const regex = /import\s+(?:\{[^}]*\}|\*\s+as\s+[^;]+|[^{}\s*]+)\s+from\s+['"]([^'"]+)['"]/g
  const imports = []

  let match
  while ((match = regex.exec(content)) !== null) {
    imports.push(match[1])
  }

  return imports
}

function isNpmPackage(importPath) {
  if (importPath.startsWith('.') || importPath.startsWith('/')) return false

  const name = importPath.startsWith('@') ? importPath.split('/').slice(0, 2).join('/') : importPath.split('/')[0]

  return name in dependencies
}

function findHandlerFiles(dir) {
  return findTsFiles(dir).filter((path) => path.includes('handlers'))
}

function resolveAllDependencies(entryPackages) {
  const resolved = new Set()
  const toProcess = [...entryPackages]

  while (toProcess.length > 0) {
    const pkg = toProcess.pop()

    if (resolved.has(pkg)) continue
    resolved.add(pkg)

    const pkgPath = join(paths.nodeModules, pkg, 'package.json')
    if (!existsSync(pkgPath)) continue

    try {
      const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf8'))
      const deps = pkgJson.dependencies ? Object.keys(pkgJson.dependencies) : []

      for (const dep of deps) {
        const resolvedName = dep.startsWith('@') ? dep.split('/').slice(0, 2).join('/') : dep.split('/')[0]

        if (!resolved.has(resolvedName)) {
          toProcess.push(resolvedName)
        }
      }
    } catch (err) {
      console.error(`Failed to read ${pkg}/package.json: ${err.message}`)
    }
  }

  return Array.from(resolved).sort()
}

function analyzeHandlerDependencies() {
  const handlerFiles = findHandlerFiles(paths.lambda)
  const supportFiles = [
    ...findTsFiles(paths.lib),
    ...findTsFiles(paths.utils),
    ...findTsFiles(paths.projectLib),
    ...findTsFiles(paths.i18n),
  ]

  console.log(`Found ${handlerFiles.length} lambda handler files`)
  console.log(`Found ${supportFiles.length} supporting files`)

  const packageUsage = {}
  const handlerDependencies = {}

  for (const file of handlerFiles) {
    const imports = extractImports(file).filter(isNpmPackage)
    const functionName = file.split('/').slice(-2)[0]
    handlerDependencies[functionName] = imports

    for (const pkg of imports) {
      const name = pkg.startsWith('@') ? pkg.split('/').slice(0, 2).join('/') : pkg.split('/')[0]
      packageUsage[name] ??= { count: 0, handlers: [], libs: [] }
      packageUsage[name].count++
      if (!packageUsage[name].handlers.includes(functionName)) {
        packageUsage[name].handlers.push(functionName)
      }
    }
  }

  for (const file of supportFiles) {
    const imports = extractImports(file).filter(isNpmPackage)
    const fileName = file.split('/').pop().replace('.ts', '')

    for (const pkg of imports) {
      const name = pkg.startsWith('@') ? pkg.split('/').slice(0, 2).join('/') : pkg.split('/')[0]
      packageUsage[name] ??= { count: 0, handlers: [], libs: [] }
      packageUsage[name].count++
      if (!packageUsage[name].libs.includes(fileName)) {
        packageUsage[name].libs.push(fileName)
      }
    }
  }

  const sortedPackages = Object.entries(packageUsage)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([pkg]) => pkg)

  const allPackages = resolveAllDependencies(sortedPackages)

  console.log('\n=== NPM Packages Used in Lambda Handlers ===\n')

  if (allPackages.length === 0) {
    console.log('No npm packages found')
  } else {
    allPackages.forEach((pkg) => console.log(pkg))
    copyPackagesToLayer(allPackages)
  }
}

async function copyPackagesToLayer(packages) {
  console.log('\n=== Creating symbolic links in layer/nodejs/node_modules ===\n')

  if (!existsSync(paths.layerNodeModules)) {
    console.log(`Creating directory: ${paths.layerNodeModules}`)
    mkdirSync(paths.layerNodeModules, { recursive: true })
  }

  process.chdir(paths.layerNodeModules)
  const linked = []

  for (const pkg of packages) {
    const source = join(paths.nodeModules, pkg)
    const target = join(paths.layerNodeModules, pkg)

    if (pkg.startsWith('@')) {
      const scopeDir = join(paths.layerNodeModules, pkg.split('/')[0])
      if (!existsSync(scopeDir)) mkdirSync(scopeDir, { recursive: true })
    }

    try {
      if (!existsSync(source)) {
        console.error(`Package not found: ${pkg}`)
        continue
      }

      if (existsSync(target)) {
        rmSync(target, { recursive: true, force: true })
      }

      linked.push(pkg)
      symlinkSync(source, target, 'dir')
    } catch (err) {
      console.error(`Error creating symlink for ${pkg}: ${err.message}`)
    }
  }

  console.log(`\nLinked following modules to layer:\n${linked.join(', ')}`)
}

// Run the script
analyzeHandlerDependencies()
