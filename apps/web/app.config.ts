export default defineAppConfig({
  ui: {
    primary: 'green',
    button: {
      slots: {
        base: '',
      },
      variants: {
        color: {
          primary: {
            solid: `
              bg-gradient-to-b from-green-400 via-green-500 to-green-600
              shadow-[inset_0_1px_0_0_rgba(134,239,172,0.5),inset_0_-1px_0_0_rgba(20,83,45,0.5),0_2px_4px_rgba(0,0,0,0.2),0_4px_8px_rgba(22,163,74,0.3)]
              hover:from-green-300 hover:via-green-400 hover:to-green-500
              hover:shadow-[inset_0_1px_0_0_rgba(187,247,208,0.5),inset_0_-1px_0_0_rgba(22,101,52,0.5),0_4px_8px_rgba(0,0,0,0.25),0_6px_12px_rgba(22,163,74,0.4)]
              hover:-translate-y-0.5
              active:from-green-500 active:via-green-600 active:to-green-700
              active:shadow-[inset_0_1px_0_0_rgba(74,222,128,0.3),inset_0_-1px_0_0_rgba(10,61,31,0.5),0_1px_2px_rgba(0,0,0,0.2)]
              active:translate-y-0.5
              transition-all duration-150
            `,
          },
        },
      },
    },
  },
})
