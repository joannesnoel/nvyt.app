export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  if (config.public.enableGtm !== 'true') return

  const gtagScript = document.createElement('script')
  gtagScript.async = true
  gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-56XD48QPN8'
  document.head.appendChild(gtagScript)

  window.dataLayer = window.dataLayer || []
  function gtag(...args: any[]) {
    window.dataLayer.push(args)
  }
  gtag('js', new Date())
  gtag('config', 'G-56XD48QPN8')

  window.gtag = gtag
})

declare global {
  interface Window {
    dataLayer: any[]
    gtag: (...args: any[]) => void
  }
}
