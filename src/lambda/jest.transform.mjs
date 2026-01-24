import { transformSync } from 'esbuild'

export default {
  /**
   *
   * @param {string} input
   * @param {string} file
   * @returns
   */
  process(input, file, cfg) {
    const isTs = file.endsWith('.ts') || file.endsWith('.tsx')
    const loader = isTs ? 'ts' : 'js'
    const options = {
      loader,
      format: 'esm',
      platform: 'node',
      target: 'node24',
      sourcemap: 'inline',
      ...cfg.transformerConfig,
      sourcefile: file,
    }
    const { code, map } = transformSync(input, options)
    if (code.indexOf('.json') !== -1 || code.indexOf('assert { type:') !== -1) {
      // Node 22+ uses import attributes (`with { type: "json" }`) for JSON modules.
      // Some deps still emit import assertions (`assert { type: "json" }`) or bare JSON imports.
      // Normalize to `with { type: "json" }`.
      let patched = code
        // Convert legacy import assertions -> import attributes
        .replaceAll(/\s+assert\s*\{\s*type:\s*['"]json['"]\s*\}/g, ' with { type: "json" }')
        // Append missing attributes to bare JSON imports
        .replaceAll(/(import\s+[^;]+?\s+from\s+['"][^'"]+\.json['"])(?!\s+with\s*\{)/g, '$1 with { type: "json" }')
      return { code: patched, map }
    }
    return { code, map }
  },
}
