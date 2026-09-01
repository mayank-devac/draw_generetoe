import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

/** Static SPA for WebMCP judge / ChatGPT Sites — no Cloudflare Worker. */
export default defineConfig({
	root: '.',
	plugins: [react()],
	define: {
		'import.meta.env.VITE_JUDGE_MODE': JSON.stringify('true'),
	},
	build: {
		outDir: 'dist-judge',
		emptyOutDir: true,
	},
	preview: {
		host: '127.0.0.1',
		port: 4173,
		strictPort: false,
	},
})
