export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  if (!config.public.enableGtm || config.public.enableGtm === 'false') return

  useHead({
    script: [
      {
        src: 'https://www.googletagmanager.com/gtag/js?id=G-56XD48QPN8',
        async: true,
      },
      {
        innerHTML: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-56XD48QPN8');
        `,
      },
    ],
  })
})
