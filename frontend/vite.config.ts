import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Custom plugin to generate routeManifest.json
const routeManifestPlugin = () => {
  return {
    name: 'route-manifest',
    buildStart() {
      try {
        const routesPath = path.resolve(__dirname, 'src/routes.ts');
        const content = fs.readFileSync(routesPath, 'utf-8');
        // Extract the object body
        const match = content.match(/export const ROUTES = ({[\s\S]*?}) as const;/);

        if (match) {
          const body = match[1];
          const routes: Record<string, string> = {};

          body.split('\n').forEach(line => {
            // Match key: 'value'
            const lineMatch = line.match(/^\s*([a-zA-Z0-9_]+):\s*'([^']+)'/);
            if (lineMatch) {
              routes[lineMatch[1]] = lineMatch[2];
            }
          });

          // Write to public folder so it's available at runtime/deploy
          const publicDir = path.resolve(__dirname, 'public');
          if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir);
          }

          fs.writeFileSync(
            path.join(publicDir, 'routeManifest.json'),
            JSON.stringify(routes, null, 2)
          );
          console.log('✅ Generated public/routeManifest.json');
        }
      } catch (error) {
        console.error('❌ Failed to generate route manifest:', error);
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), routeManifestPlugin()],
  define: {
    __BUILD_ID__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev"),
    __ENV__: JSON.stringify(process.env.NODE_ENV ?? "development"),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-core': ['lucide-react'],
          'charts': ['recharts', 'html-to-image', 'html2canvas'],
          'crm-brain': ['./src/pages/AdminCRM.tsx']
        }
      }
    },
    chunkSizeWarningLimit: 600
  }
})
