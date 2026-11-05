import type { BetterAuthPlugin } from 'better-auth'

export const awaitAuthTasks = () =>
  ({
    id: 'await-auth-tasks',
    init: (context) => {
      if (context.options.advanced?.backgroundTasks?.handler)
        throw new Error('await-auth-tasks requires no background handler')
      return {
        context: {
          runInBackgroundOrAwait: async (promise) => {
            await promise
          },
        },
      }
    },
  }) satisfies BetterAuthPlugin
