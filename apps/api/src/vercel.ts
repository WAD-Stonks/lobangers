import { createApp } from '@api/app'
import { loadConfig } from '@api/config'

const app = createApp(loadConfig())
export default app
