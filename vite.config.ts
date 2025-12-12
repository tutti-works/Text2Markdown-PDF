import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // The third parameter '' tells Vite to load all env vars, not just VITE_*
  const env = loadEnv(mode, '.', '')
  
  return {
    plugins: [react()],
    define: {
      // This bridges the gap between Vercel's API_KEY and the code's process.env.API_KEY
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.GOOGLE_CLIENT_ID': JSON.stringify(env.GOOGLE_CLIENT_ID),
      'process.env.ALLOWED_EMAILS': JSON.stringify(env.ALLOWED_EMAILS),
    },
  }
})