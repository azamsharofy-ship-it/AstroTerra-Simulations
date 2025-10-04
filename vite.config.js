import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [cesium()],
  server: {
    proxy: {
      '/nasa-api': {
        target: 'https://ssd-api.jpl.nasa.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nasa-api/, ''),
      },
      '/usgs-api': {
        target: 'https://earthquake.usgs.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/usgs-api/, ''),
      },
      // We are no longer using the external elevation API, so the proxy is removed.
    },
  },
});