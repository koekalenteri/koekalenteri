/**
 * The browser build of Handlebars. The package's main entry reads partials through `fs`, which
 * the frontend bundle cannot provide, so both the client and the shared code import this file
 * instead; it has the same API, only without a type declaration of its own.
 */
declare module 'handlebars/dist/cjs/handlebars.js' {
  import Handlebars from 'handlebars'

  export default Handlebars
}
