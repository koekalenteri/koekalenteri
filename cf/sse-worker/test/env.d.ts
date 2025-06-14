declare module 'cloudflare:test' {
  // ProvidedEnv controls the type of `import("cloudflare:test").env`
  interface ProvidedEnv extends Env {
    API_TOKEN: string // Secret token for authenticating broadcast requests
    SSE_CHANNEL: DurableObjectNamespace
  }
}
