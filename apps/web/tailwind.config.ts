import type { Config } from 'tailwindcss'

export default {
  content: [], // Nuxt UI handles content paths
  theme: {
    extend: {
      // Custom colors
      colors: {
        secondary: '#5a54d8', // Purple secondary color
      },
      // Add wider container options for large screens
      maxWidth: {
        '8xl': '88rem', // 1408px
        '9xl': '100rem', // 1600px
      },
      screens: {
        // Add a 4K breakpoint
        '3xl': '1920px',
      },
    },
  },
} satisfies Config
