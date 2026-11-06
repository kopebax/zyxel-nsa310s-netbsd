import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { Api } from './api';

// inject() tylko przed pierwszym await (kontekst wstrzykiwania)
const zalogowany: CanActivateFn = async () => {
  const api = inject(Api);
  const router = inject(Router);
  if (api.zalogowany() || await api.sprawdzSesje()) return true;
  return router.parseUrl('/logowanie');
};

// ekrany administracyjne – zwykły użytkownik trafia do przeglądarki plików
const administrator: CanActivateFn = async () => {
  const api = inject(Api);
  const router = inject(Router);
  if (!api.zalogowany() && !await api.sprawdzSesje()) return router.parseUrl('/logowanie');
  return api.admin() ? true : router.parseUrl('/pliki');
};

const admin = (path: string, ladowanie: () => Promise<any>) =>
  ({ path, title: 'NSA310S', canActivate: [administrator], loadComponent: ladowanie });

export const routes: Routes = [
  { path: 'logowanie', title: 'NSA310S', loadComponent: () => import('./strony/logowanie').then(m => m.Logowanie) },
  { path: 'pliki', title: 'NSA310S', canActivate: [zalogowany], loadComponent: () => import('./strony/pliki').then(m => m.Pliki) },
  { path: 'haslo', title: 'NSA310S', canActivate: [zalogowany], loadComponent: () => import('./strony/haslo').then(m => m.Haslo) },
  admin('', () => import('./strony/pulpit').then(m => m.Pulpit)),
  admin('czas', () => import('./strony/czas').then(m => m.CzasStrona)),
  admin('siec', () => import('./strony/siec').then(m => m.SiecStrona)),
  admin('uslugi', () => import('./strony/uslugi').then(m => m.Uslugi)),
  admin('uzytkownicy', () => import('./strony/uzytkownicy').then(m => m.Uzytkownicy)),
  admin('grupy', () => import('./strony/grupy').then(m => m.Grupy)),
  admin('udzialy', () => import('./strony/udzialy').then(m => m.Udzialy)),
  admin('dysk', () => import('./strony/dysk').then(m => m.DyskStrona)),
  admin('copy', () => import('./strony/copy').then(m => m.CopyStrona)),
  admin('zapora', () => import('./strony/zapora').then(m => m.Zapora)),
  admin('certyfikat', () => import('./strony/certyfikat').then(m => m.Certyfikat)),
  admin('zasilanie', () => import('./strony/zasilanie').then(m => m.Zasilanie)),
  admin('harmonogram', () => import('./strony/harmonogram').then(m => m.Harmonogram)),
  admin('aktualizacje', () => import('./strony/aktualizacje').then(m => m.Aktualizacje)),
  admin('kopia', () => import('./strony/kopia').then(m => m.Kopia)),
  admin('dziennik', () => import('./strony/dziennik').then(m => m.Dziennik)),
  admin('zgodnosc', () => import('./strony/zgodnosc').then(m => m.Zgodnosc)),
  { path: '**', redirectTo: '' },
];
