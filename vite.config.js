import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Placeholder used in index.html for the site's canonical base URL.
// Replaced at build time (when VITE_CANONICAL_URL is set) or at Express
// server startup (when the URL is only known at runtime).
const CANONICAL_PLACEHOLDER = /__CANONICAL_URL__/g;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const canonicalUrl = env.VITE_CANONICAL_URL || '';

  if (mode === 'production' && !canonicalUrl) {
    console.warn(
      '\x1b[33m⚠️  VITE_CANONICAL_URL is not set. OG image URLs will use a runtime placeholder.\n' +
      '   Set VITE_CANONICAL_URL in your .env to embed an absolute URL at build time,\n' +
      '   or set it in the server environment so the Express server can inject it.\x1b[0m'
    );
  }

  return {
    plugins: [
      react(),
      {
        // Replace the __CANONICAL_URL__ placeholder in index.html.
        // In production builds with VITE_CANONICAL_URL set, the placeholder is
        // replaced at build time.  When the env var is absent the placeholder
        // survives into dist/index.html so the Express server can inject it at
        // runtime from its own VITE_CANONICAL_URL env var.
        // In dev mode the placeholder is always resolved to an empty string
        // (producing a relative URL) so the page renders without stray text.
        name: 'canonical-url-inject',
        transformIndexHtml: {
          order: 'pre',
          handler(html) {
            if (canonicalUrl) {
              return html.replace(CANONICAL_PLACEHOLDER, canonicalUrl);
            }
            if (mode !== 'production') {
              // Dev server: replace with empty string → relative URLs (acceptable in dev)
              return html.replace(CANONICAL_PLACEHOLDER, '');
            }
            // Production without VITE_CANONICAL_URL: leave placeholder for
            // server-side runtime injection.
            return html;
          },
        },
      },
    ],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
