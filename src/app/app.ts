import { DatePipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { BUILD_INFO } from './build-info';
import { versionLabel } from './build-info.model';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

const THEME_KEY = 'archery-motion.theme';

function storedLight(): boolean {
  try {
    return localStorage.getItem(THEME_KEY) === 'light';
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-root',
  imports: [DatePipe, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  /** Light theme reads better in direct sunlight. */
  readonly light = signal(storedLight());
  readonly version = versionLabel(BUILD_INFO);
  readonly date = BUILD_INFO.date || undefined;
  /** A newer version has been downloaded and is used after a reload. */
  readonly updateReady = signal(false);
  private readonly updates = inject(SwUpdate, { optional: true });

  constructor() {
    const updates = this.updates;
    if (updates?.isEnabled) {
      updates.versionUpdates.subscribe((e) => {
        if (e.type === 'VERSION_READY') this.updateReady.set(true);
      });
      // Look for a new version when the app is opened again from the background
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void updates.checkForUpdate().catch(() => undefined);
      });
    }
    effect(() => {
      const light = this.light();
      document.documentElement.dataset['theme'] = light ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_KEY, light ? 'light' : 'dark');
      } catch {
        /* storage blocked */
      }
    });
  }

  reload(): void {
    location.reload();
  }

  toggleTheme(): void {
    this.light.update((v) => !v);
  }
}
