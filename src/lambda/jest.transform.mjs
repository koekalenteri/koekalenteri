import { transformSync } from 'esbuild'

export default {
  /**
   *
   * @param {string} input
   * @param {string} file
   * @returns
   */
  process(input, file, cfg) {
    const options = {
      loader: 'ts',
      format: 'esm',
      platform: 'node',
      target: 'node18',
      sourcemap: 'inline',
      ...cfg.transformerConfig,
      sourcefile: file,
    }
    const { code, map } = transformSync(input, options)
    if (code.indexOf('.json') !== -1) {
      // add import assertions to json imports
      return { code: code.replaceAll(/(import .* from ".*\.json")/g, '$1 assert { type: "json" }'), map }
    }
    return { code, map }
  },
}
