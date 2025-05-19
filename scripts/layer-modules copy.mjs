#!/usr/bin/env node

import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Path to the project root
const projectRoot = resolve(__dirname, '..')
const lambdaDir = join(projectRoot, 'src', 'lambda')
const libDir = join(lambdaDir, 'lib')
const utilsDir = join(lambdaDir, 'utils')
const projectLibDir = join(projectRoot, 'src', 'lib')
const i18nDir = join(projectRoot, 'src', 'i18n')
const nodeModulesDir = join(projectRoot, 'node_modules')
// const layerNodeModulesDir = join(projectRoot, 'layer', 'nodejs', 'node_modules')
const layerNodeModulesDir = join(projectRoot, 'dist', 'layer', 'nodejs', 'node_modules')

// Get all package dependencies from package.json and package-layer.json
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const exclude = ['src/i18n/index.ts', 'src/lambda/jest.config.ts']

// Combine dependencies from both files
const allDependencies = packageJson.dependencies

// Function to find TypeScript files
function findTsFiles(dir, pattern = null) {
  const result = []

  for (const file of readdirSync(dir)) {
    const fullPath = join(dir, file)

    if (statSync(fullPath).isDirectory()) {
      // Skip test directories
      if (file === 'test-utils' || file === 'coverage' || file.includes('__tests__') || file.includes('__mocks__')) {
        continue
      }

      // Recursively search subdirectories
      result.push(...findTsFiles(fullPath, pattern))
    } else if (
      statSync(fullPath).isFile() &&
      fullPath.endsWith('.ts') &&
      !fullPath.endsWith('.test.ts') &&
      !fullPath.endsWith('.d.ts') &&
      !exclude.some((ex) => fullPath.endsWith(ex))
    ) {
      // If this is a TypeScript file (not a test or declaration file)
      result.push(fullPath)
    }
  }

  return result
}

// Function to extract imports from a file
function extractImports(filePath) {
  const content = readFileSync(filePath, 'utf8')
  const imports = []

  // Match import statements
  // This regex captures different import patterns:
  // - import X from 'package'
  // - import { X } from 'package'
  // - import * as X from 'package'
  const importRegex = /import\s+(?:(?:\{[^}]*\})|(?:\*\s+as\s+[^;]+)|(?:[^{}\s*]+))\s+from\s+['"]([^'"]+)['"]/g

  let match
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1])
  }

  return imports
}

// Function to determine if an import is an npm package
function isNpmPackage(importPath) {
  // If the import starts with . or /, it's a local import
  if (importPath.startsWith('.') || importPath.startsWith('/')) {
    return false
  }

  // If the import includes a scope (e.g., @aws-sdk/client-dynamodb), extract the package name
  const packageName = importPath.startsWith('@')
    ? importPath.split('/').slice(0, 2).join('/')
    : importPath.split('/')[0]

  // Check if the package is in the dependencies
  return packageName in allDependencies
}

// Function to find handler files
function findHandlerFiles(dir) {
  return findTsFiles(dir, 'handlers')
}

// Main function
function analyzeHandlerDependencies() {
  // Find all relevant files
  const handlerFiles = findHandlerFiles(lambdaDir)
  const libFiles = findTsFiles(libDir)
  const utilsFiles = findTsFiles(utilsDir)
  const projectLibFiles = findTsFiles(projectLibDir)
  const i18nFiles = findTsFiles(i18nDir)

  console.log(`Found ${handlerFiles.length} lambda handler files`)
  console.log(`Found ${libFiles.length} lambda library files`)
  console.log(`Found ${utilsFiles.length} lambda utility files`)
  console.log(`Found ${projectLibFiles.length} project library files`)
  console.log(`Found ${i18nFiles.length} i18n files`)

  // Track package usage
  const packageUsage = {}
  const handlerDependencies = {}
  const libDependencies = {}

  // Process each handler file
  for (const handlerFile of handlerFiles) {
    const imports = extractImports(handlerFile)
    const npmPackages = imports.filter(isNpmPackage)

    // Get the function name from the path
    const functionName = handlerFile.split('/').slice(-2)[0]
    handlerDependencies[functionName] = npmPackages

    // Update package usage count
    for (const pkg of npmPackages) {
      const packageName = pkg.startsWith('@') ? pkg.split('/').slice(0, 2).join('/') : pkg.split('/')[0]

      if (!packageUsage[packageName]) {
        packageUsage[packageName] = {
          count: 0,
          handlers: [],
          libs: [],
        }
      }

      packageUsage[packageName].count++
      if (!packageUsage[packageName].handlers.includes(functionName)) {
        packageUsage[packageName].handlers.push(functionName)
      }
    }
  }

  // Process library files
  for (const libFile of [...libFiles, ...utilsFiles, ...projectLibFiles, ...i18nFiles]) {
    const imports = extractImports(libFile)
    const npmPackages = imports.filter(isNpmPackage)

    // Get the file name from the path
    const fileName = libFile.split('/').pop().replace('.ts', '')
    libDependencies[fileName] = npmPackages

    // Update package usage count
    for (const pkg of npmPackages) {
      const packageName = pkg.startsWith('@') ? pkg.split('/').slice(0, 2).join('/') : pkg.split('/')[0]

      if (!packageUsage[packageName]) {
        packageUsage[packageName] = {
          count: 0,
          handlers: [],
          libs: [],
        }
      }

      packageUsage[packageName].count++
      if (!packageUsage[packageName].libs.includes(fileName)) {
        packageUsage[packageName].libs.push(fileName)
      }
    }
  }

  // Sort packages by usage count
  const sortedPackages = Object.entries(packageUsage)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([pkg, data]) => ({
      package: pkg,
      count: data.count,
      handlers: data.handlers,
      libs: data.libs,
    }))

  // Print results
  console.log('\n=== NPM Packages Used in Lambda Handlers ===\n')

  if (sortedPackages.length === 0) {
    console.log('No npm packages found')
  } else {
    // Extract unique package names and sort them alphabetically
    const uniquePackages = [...new Set(sortedPackages.map((p) => p.package))].sort()

    // Print the list of unique packages
    for (const pkg of uniquePackages) {
      console.log(pkg)
    }

    // Copy packages to layer/nodejs/node_modules
    copyPackagesToLayer(uniquePackages)
  }
}

// Function to create symbolic links from node_modules to layer/nodejs/node_modules
async function copyPackagesToLayer(packages) {
  console.log('\n=== Creating symbolic links in layer/nodejs/node_modules ===\n')

  // Create the target directory if it doesn't exist
  if (!existsSync(layerNodeModulesDir)) {
    console.log(`Creating directory: ${layerNodeModulesDir}`)
    mkdirSync(layerNodeModulesDir, { recursive: true })
  }

  process.chdir(layerNodeModulesDir)

  // Copy each package
  for (const pkg of packages) {
    const sourcePath = join(nodeModulesDir, pkg)
    const targetPath = join(layerNodeModulesDir, pkg)

    // For scoped packages, ensure the scope directory exists
    if (pkg.startsWith('@')) {
      const scopeDir = join(layerNodeModulesDir, pkg.split('/')[0])
      if (!existsSync(scopeDir)) {
        mkdirSync(scopeDir, { recursive: true })
      }
    }

    try {
      if (existsSync(sourcePath)) {
        // Remove existing symlink or directory if it exists
        if (existsSync(targetPath)) {
          console.log(`Removing existing: ${targetPath}`)
          rmSync(targetPath)
        } else {
          try {
            const stat = lstatSync(targetPath)
            if (stat.isSymbolicLink()) {
              console.log(`Removing existing: ${targetPath}`)
              rmSync(targetPath)
            }
          } catch {
            // no op
          }
        }

        console.log(`Creating symlink for ${pkg}...`)
        // Create symlink using absolute paths for reliability
        symlinkSync(sourcePath, targetPath, 'dir')
      } else {
        console.error(`Package not found in node_modules: ${pkg}`)
      }
    } catch (error) {
      console.error(`Error creating symlink for ${pkg}: ${error.message}`)
    }
  }

  console.log('\nAll symbolic links created successfully!')
}

// Run the analysis
analyzeHandlerDependencies()
