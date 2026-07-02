import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cartoteca.app',
  appName: 'Cartoteca',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
