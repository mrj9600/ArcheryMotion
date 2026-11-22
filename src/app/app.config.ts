import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDa from '@angular/common/locales/da';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

registerLocaleData(localeDa);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: LOCALE_ID, useValue: 'da' },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
