import { transformSync } from "esbuild"

export default {
  /**
   *
   * @param {string} input
   * @param {string} file
   * @returns
   */
  process(input, file) {
    const options = {
      loader: 'ts',
      format: 'esm',
      platform: 'node',
      target: 'node16',
      sourcemap: 'inline',
      sourcefile: file,
    }
    const {code, map} = transformSync(input, options)
    return {code, map}
  },
}
