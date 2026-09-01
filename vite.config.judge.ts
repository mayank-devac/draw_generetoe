import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

/** Static SPA for WebMCP judge / ChatGPT Sites — no Cloudflare Worker. */
export default defineConfig({
	plugins: [react()],
	define: {
		'import.meta.env.VITE_JUDGE_MODE': JSON.stringify('true'),
	},
	build: {
		outDir: 'dist-judge',
		emptyOutDir: true,
	},
})
