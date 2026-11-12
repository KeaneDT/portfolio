import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const siteUrl = new URL(process.env.SITE_URL || 'https://keanetravasso.com/');
const canonicalBase = `${siteUrl.href.replace(/\/+$/, '')}/`;

// Multi-page static site. Every html file listed here becomes its own entry in dist/.
export default defineConfig({
  plugins: [
    {
      name: 'portfolio-site-url',
      transformIndexHtml(html) {
        return html.replaceAll('%SITE_URL%', canonicalBase);
      },
    },
  ],
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        quick: resolve(import.meta.dirname, 'quick-view.html'),
        case: resolve(import.meta.dirname, 'case-study.html'),
        toyota: resolve(import.meta.dirname, 'projects/toyota-automation.html'),
        ratventure: resolve(import.meta.dirname, 'projects/ratventure.html'),
        optimus: resolve(import.meta.dirname, 'projects/project-optimus.html'),
        resume: resolve(import.meta.dirname, 'resume.html'),
        notFound: resolve(import.meta.dirname, '404.html'),
      },
    },
  },
  server: { host: true, port: 5173 },
});
