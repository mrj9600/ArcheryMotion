import { Component, effect, signal } from '@angular/core';
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  /** Light theme reads better in direct sunlight. */
  readonly light = signal(storedLight());

  constructor() {
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

  toggleTheme(): void {
    this.light.update((v) => !v);
  }
}
