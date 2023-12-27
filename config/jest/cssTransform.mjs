// This is a custom Jest transformer turning style imports into empty objects.
// http://facebook.github.io/jest/docs/en/webpack.html

function process() {
  return 'module.exports = {};'
}

function getCacheKey() {
  // The output is always the same.
  return 'cssTransform'
}

export default {
  process,
  getCacheKey,
}
