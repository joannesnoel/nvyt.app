// https://nuxt.com/docs/api/configuration/nuxt-config
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env from monorepo root
config({ path: resolve(__dirname, '../../.env') })

export default defineNuxtConfig({
  devtools: { enabled: true },
  telemetry: false,
  app: {
    head: {
      viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
    },
  },

  modules: [
    '@vite-pwa/nuxt',
    '@nuxt/ui',
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxt/eslint',
    '@sentry/nuxt/module',
  ],

  pwa: {
    strategies: 'injectManifest',
    srcDir: 'public',
    filename: 'sw.js',
    registerType: 'autoUpdate',
    manifest: {
      name: 'nvyt - Event & Ticketing Platform',
      short_name: 'nvyt',
      description: 'Create events, sell tickets, and manage everything.',
      theme_color: '#6366f1',
      background_color: '#ffffff',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    injectManifest: {
      // SSR app: no precaching — pages are server-rendered, JS chunks change every deploy
      injectionPoint: undefined,
    },
    client: {
      installPrompt: true,
    },
    devOptions: {
      enabled: true,
    },
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'system',
    fallback: 'light',
  },

  runtimeConfig: {
    // Private keys (server-side only)
    // IMPORTANT: All values MUST have a fallback default (even '') so that
    // Nuxt's automatic NUXT_* env var mapping works at runtime in Docker.
    vapidPublicKey: process.env.NUXT_VAPID_PUBLIC_KEY || '',
    vapidPrivateKey: process.env.NUXT_VAPID_PRIVATE_KEY || '',
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    databaseUrl: process.env.DATABASE_URL || '',
    // Admin access (comma-separated list of emails)
    adminEmails: process.env.ADMIN_EMAILS || '',
    paymongoSecretKey: process.env.PAYMONGO_SECRET_KEY || '',
    paymongoWebhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET || '',
    // PayMongo payment methods (comma-separated, e.g., 'gcash,paymaya,card,grab_pay,qrph')
    paymongoPaymentMethods: process.env.PAYMONGO_PAYMENT_METHODS || '',
    // Email - SMTP (Mailtrap in development)
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: process.env.SMTP_PORT || '587',
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    smtpSecure: process.env.SMTP_SECURE || 'false',
    smtpFrom: process.env.SMTP_FROM || 'nvyt <noreply@nvyt.app>',
    // Email - API (Resend in production)
    resendApiKey: process.env.RESEND_API_KEY || '',
    // Pusher (server-side)
    pusherAppId: process.env.PUSHER_APP_ID || '',
    pusherSecret: process.env.PUSHER_SECRET || '',
    // S3 Storage (Garage, MinIO, or AWS S3)
    s3Endpoint: process.env.S3_ENDPOINT || '',
    s3Region: process.env.S3_REGION || 'garage',
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    s3Bucket: process.env.S3_BUCKET || 'nvyt-uploads',
    // PayPal
    paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
    paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    paypalMode: process.env.PAYPAL_MODE || 'sandbox',
    paypalWebhookId: process.env.PAYPAL_WEBHOOK_ID || '',
    // Cron job authentication
    cronSecret: process.env.CRON_SECRET || '',

    // Public keys (exposed to client)
    public: {
      vapidPublicKey: process.env.NUXT_PUBLIC_VAPID_PUBLIC_KEY || '',
      appName: 'nvyt',
      appUrl: process.env.APP_URL || 'http://localhost:3000',
      paymongoPublicKey: process.env.PAYMONGO_PUBLIC_KEY || '',
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
      // Pusher (client-side)
      pusherKey: process.env.PUSHER_KEY || '',
      pusherCluster: process.env.PUSHER_CLUSTER || 'ap1',
      // S3 public URL for images
      s3PublicUrl: process.env.S3_PUBLIC_URL || '',
      // PayPal (client-side)
      paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
      paypalMode: process.env.PAYPAL_MODE || 'sandbox',
      enableGtm: process.env.ENABLE_GTM || 'false',
      sentryDsn: process.env.NUXT_PUBLIC_SENTRY_DSN || '',
    },
  },

  sentry: {
    sourceMapsUploadOptions: {
      enabled: false,
    },
  },

  sourcemap: {
    client: 'hidden',
  },

  nitro: {
    preset: 'node-server',
  },

  future: {
    compatibilityVersion: 4,
  },

  compatibilityDate: '2024-12-01',

  typescript: {
    strict: true,
    typeCheck: false, // Disable during dev, run separately with `pnpm typecheck`
  },

  vite: {
    server: {
      allowedHosts: ['dev.nvyt.app'],
    },
  },
})
