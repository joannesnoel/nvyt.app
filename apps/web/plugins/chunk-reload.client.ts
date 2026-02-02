export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:chunkError', ({ error }) => {
    console.warn('[chunk-reload] Chunk load failed, reloading...', error)
    reloadNuxtApp({ force: true })
  })
})
