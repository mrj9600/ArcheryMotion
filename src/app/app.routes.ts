import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./live/live-page').then((m) => m.LivePage) },
  { path: 'skud', loadComponent: () => import('./shots/shot-replay-page').then((m) => m.ShotReplayPage) },
  { path: 'ble', loadComponent: () => import('./ble-explorer/ble-explorer-page').then((m) => m.BleExplorerPage) },
  { path: '**', redirectTo: '' },
];
