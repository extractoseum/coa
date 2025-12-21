import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.extractoseum.coaviewer',
  appName: 'COA Viewer',
  webDir: 'dist',
  server: {
    // La app carga desde el servidor remoto
    url: 'https://coa.extractoseum.com',
    cleartext: false
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#111827' // Color de fondo oscuro mientras carga
  },
  android: {
    backgroundColor: '#111827'
  }
};

export default config;
