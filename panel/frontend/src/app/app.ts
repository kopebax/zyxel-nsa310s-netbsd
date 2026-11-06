import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Api, Status, czasTrwania } from './api';
import { I18n, JEZYKI, TPipe } from './i18n';

interface Pozycja { sciezka: string; nazwa: string; ikona: string; }
interface Grupa { nazwa: string; pozycje: Pozycja[]; }

// układ jak w panelu Zyxela: grupy w drzewie po lewej
const MENU_ADMIN: Grupa[] = [
  { nazwa: 'Stan', pozycje: [{ sciezka: '/', nazwa: 'Pulpit', ikona: 'dashboard' }] },
  { nazwa: 'Pliki', pozycje: [{ sciezka: '/pliki', nazwa: 'Przeglądarka plików', ikona: 'folder_open' }] },
  { nazwa: 'System', pozycje: [
    { sciezka: '/czas', nazwa: 'Nazwa i czas', ikona: 'schedule' },
    { sciezka: '/siec', nazwa: 'Sieć TCP/IP', ikona: 'lan' },
    { sciezka: '/uslugi', nazwa: 'Usługi', ikona: 'settings' },
  ] },
  { nazwa: 'Udostępnianie', pozycje: [
    { sciezka: '/uzytkownicy', nazwa: 'Użytkownicy', ikona: 'person' },
    { sciezka: '/grupy', nazwa: 'Grupy', ikona: 'group' },
    { sciezka: '/udzialy', nazwa: 'Udziały', ikona: 'folder_shared' },
  ] },
  { nazwa: 'Pamięć masowa', pozycje: [
    { sciezka: '/dysk', nazwa: 'Dysk i SMART', ikona: 'hard_drive' },
    { sciezka: '/copy', nazwa: 'Przycisk COPY', ikona: 'usb' },
  ] },
  { nazwa: 'Bezpieczeństwo', pozycje: [
    { sciezka: '/zapora', nazwa: 'Zapora', ikona: 'shield' },
    { sciezka: '/certyfikat', nazwa: 'Certyfikat SSL', ikona: 'verified_user' },
    { sciezka: '/haslo', nazwa: 'Moje hasło', ikona: 'key' },
  ] },
  { nazwa: 'Konserwacja', pozycje: [
    { sciezka: '/zasilanie', nazwa: 'Zasilanie', ikona: 'power_settings_new' },
    { sciezka: '/harmonogram', nazwa: 'Harmonogram', ikona: 'event_repeat' },
    { sciezka: '/aktualizacje', nazwa: 'Aktualizacje', ikona: 'system_update_alt' },
    { sciezka: '/kopia', nazwa: 'Kopia konfiguracji', ikona: 'save' },
    { sciezka: '/dziennik', nazwa: 'Dziennik', ikona: 'receipt_long' },
    { sciezka: '/zgodnosc', nazwa: 'Zgodność z Zyxel', ikona: 'checklist' },
  ] },
];

const MENU_UZYTKOWNIK: Grupa[] = [
  { nazwa: 'Pliki', pozycje: [{ sciezka: '/pliki', nazwa: 'Przeglądarka plików', ikona: 'folder_open' }] },
  { nazwa: 'Konto', pozycje: [{ sciezka: '/haslo', nazwa: 'Moje hasło', ikona: 'key' }] },
];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatSidenavModule,
    MatListModule, MatButtonModule, MatTooltipModule, MatMenuModule, TPipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly api = inject(Api);
  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  protected readonly jezyki = JEZYKI;

  protected readonly menu = computed(() => (this.api.admin() ? MENU_ADMIN : MENU_UZYTKOWNIK));

  private readonly url = toSignal(this.router.events.pipe(
    filter(e => e instanceof NavigationEnd), map(e => (e as NavigationEnd).urlAfterRedirects)), { initialValue: '' });
  protected readonly ekranLogowania = computed(() => this.url().startsWith('/logowanie'));

  protected readonly waski = toSignal(inject(BreakpointObserver).observe('(max-width: 800px)')
    .pipe(map(r => r.matches)), { initialValue: false });

  // pasek stanu: odświeżany co 30 s (tylko administrator ma dostęp do stanu)
  protected readonly stan = signal<Status | null>(null);
  protected readonly teraz = signal(Date.now());
  protected readonly dzialanie = computed(() => {
    const s = this.stan();
    return s ? czasTrwania(Math.floor(this.teraz() / 1000) - s.uruchomiony) : '';
  });

  constructor() {
    effect(onCleanup => {
      const t2 = setInterval(() => this.teraz.set(Date.now()), 1000);
      onCleanup(() => clearInterval(t2));
      if (!this.api.admin()) { this.stan.set(null); return; }
      const odswiez = () => this.api.get<Status>('status').then(s => this.stan.set(s)).catch(() => {});
      odswiez();
      const t1 = setInterval(odswiez, 30000);
      onCleanup(() => clearInterval(t1));
    });
  }

  protected godzina(): string {
    return new Date(this.teraz()).toLocaleTimeString(this.i18n.lokalizacja());
  }
}
