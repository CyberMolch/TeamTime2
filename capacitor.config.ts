import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.cybermolch.teamtime',
  appName: 'TeamTime',
  webDir: 'dist',
  backgroundColor: '#f5f6f8',
  android: {
    // Ab Android 15 zeichnen Apps sonst unter die Statusleiste
    adjustMarginsForEdgeToEdge: 'force',
  } as CapacitorConfig['android'],
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_teamtime',
      iconColor: '#0a6b3a',
    },
  },
};

export default config;
