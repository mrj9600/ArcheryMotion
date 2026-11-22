import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./recording/record-page').then((m) => m.RecordPage) },
  { path: 'skytter', loadComponent: () => import('./profiles/archers-page').then((m) => m.ArchersPage) },
  { path: 'optagelser', loadComponent: () => import('./sessions/sessions-page').then((m) => m.SessionsPage) },
  { path: 'analyse', loadComponent: () => import('./workbench/workbench-page').then((m) => m.WorkbenchPage) },
  { path: 'ble', loadComponent: () => import('./ble-explorer/ble-explorer-page').then((m) => m.BleExplorerPage) },
  { path: '**', redirectTo: '' },
];
