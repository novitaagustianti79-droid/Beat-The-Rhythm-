import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.beattherhythm.arcade',
  appName: 'BEAT THE RHYTHM',
  webDir: 'dist',
  android: {
    backgroundColor: '#07080f',
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
