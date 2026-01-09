// https://nuxt.com/docs/api/configuration/nuxt-config
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env from monorepo root
config({ path: resolve(__dirname, '../../.env') })

export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: [
    '@nuxt/ui',
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxt/eslint',
  ],

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'system',
    fallback: 'light',
  },

  runtimeConfig: {
    // Private keys (server-side only)
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    paymongoSecretKey: process.env.PAYMONGO_SECRET_KEY,
    paymongoWebhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET,
    // Email - SMTP (Mailtrap in development)
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT || '587',
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpSecure: process.env.SMTP_SECURE || 'false',
    smtpFrom: process.env.SMTP_FROM || 'nvyt <noreply@nvyt.app>',
    // Email - API (Resend in production)
    resendApiKey: process.env.RESEND_API_KEY,

    // Public keys (exposed to client)
    public: {
      appName: 'nvyt',
      appUrl: process.env.APP_URL || 'http://localhost:3000',
      paymongoPublicKey: process.env.PAYMONGO_PUBLIC_KEY,
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    },
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
