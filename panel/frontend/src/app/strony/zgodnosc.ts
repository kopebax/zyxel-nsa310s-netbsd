import { Component, computed, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { RouterLink } from '@angular/router';
import { TPipe } from '../i18n';

type Stan = 'jest' | 'czesciowo' | 'zamiennik' | 'pominiete';
interface Pozycja { zyxel: string; stan: Stan; gdzie?: string; link?: string; uwagi: string; }
interface Grupa { nazwa: string; pozycje: Pozycja[]; }

// Menu panelu Zyxela (firmware 4.81, adv,/admin/frame_left_menu.html) i odpowiedniki
const ZYXEL: Grupa[] = [
  { nazwa: 'Stan (Home)', pozycje: [
    { zyxel: 'Status: system, dyski, użycie CPU, obroty wentylatora, procesy', stan: 'czesciowo', gdzie: 'Pulpit', link: '/',
      uwagi: 'Obciążenie, RAM, dyski, sieć, usługi, diody, temperatura dysku. Brak obrotów wentylatora (steruje nim mikrokontroler płyty) i listy procesów.' },
  ] },
  { nazwa: 'System Setting', pozycje: [
    { zyxel: 'Firmware/Packages', stan: 'zamiennik', gdzie: 'Aktualizacje', link: '/aktualizacje',
      uwagi: 'Pakiety pkgin z audytem podatności. Firmware Zyxela nie dotyczy NetBSD.' },
    { zyxel: 'Server Name (nazwa, grupa robocza)', stan: 'czesciowo', gdzie: 'Nazwa i czas', link: '/czas',
      uwagi: 'Nazwa urządzenia. Grupa robocza Samby: WORKGROUP (stała).' },
    { zyxel: 'Date/Time (ręcznie, NTP, strefa, czas letni)', stan: 'czesciowo', gdzie: 'Nazwa i czas', link: '/czas',
      uwagi: 'NTP, pełna lista stref, automatyczny czas letni. Bez ręcznego ustawiania zegara (NTP jest dokładniejszy).' },
  ] },
  { nazwa: 'Storage', pozycje: [
    { zyxel: 'Volume (RAID0/1, JBOD, skanowanie, naprawa, dyski zewnętrzne)', stan: 'czesciowo', gdzie: 'Dysk i SMART', link: '/dysk',
      uwagi: 'Jeden dysk FFS z kroniką, SMART, test, fsck. RAID nie ma sensu przy jednym dysku. Brak listy i wysuwania dysków USB.' },
  ] },
  { nazwa: 'Network', pozycje: [
    { zyxel: 'TCP/IP (DHCP/statyczny, DNS, Jumbo Frames, IPv6, ping)', stan: 'czesciowo', gdzie: 'Sieć TCP/IP', link: '/siec',
      uwagi: 'DHCP lub adres statyczny z automatycznym cofnięciem. Brak drugiego DNS, Jumbo Frames, ustawień IPv6 i narzędzia ping.' },
    { zyxel: 'UPnP Port Mapping', stan: 'pominiete', uwagi: 'Celowo: otwieranie portów na routerze jest niebezpieczne (router ma UPnP wyłączone).' },
    { zyxel: 'PPPoE', stan: 'pominiete', uwagi: 'NAS działa za routerem.' },
    { zyxel: 'Telnet Service', stan: 'zamiennik', gdzie: 'Usługi (SSH)', link: '/uslugi', uwagi: 'SSH z kluczami zamiast nieszyfrowanego telnetu.' },
  ] },
  { nazwa: 'Applications', pozycje: [
    { zyxel: 'FTP Server', stan: 'zamiennik', uwagi: 'SFTP przez SSH (szyfrowane). Klasyczny FTP pominięty.' },
    { zyxel: 'Media Server (DLNA/Twonky)', stan: 'pominiete', uwagi: 'Robi to Plex na Raspberry Pi.' },
    { zyxel: 'iTunes Server (DAAP)', stan: 'pominiete', uwagi: 'Wygasły standard Apple.' },
    { zyxel: 'Download Service (HTTP/FTP/BitTorrent)', stan: 'pominiete', uwagi: 'Transmission działa na Raspberry Pi.' },
    { zyxel: 'Web Publishing (MyWeb)', stan: 'pominiete', uwagi: 'Nieużywane.' },
    { zyxel: 'Broadcatching (RSS)', stan: 'pominiete', uwagi: 'Nieużywane.' },
    { zyxel: 'Print Server', stan: 'pominiete', uwagi: 'Nieużywane.' },
    { zyxel: 'Copy/Sync Button', stan: 'jest', gdzie: 'Przycisk COPY', link: '/copy', uwagi: 'Kopia z datą albo synchronizacja, dioda COPY, dziennik.' },
    { zyxel: 'Auto Upload (Flickr, YouTube, FTP)', stan: 'pominiete', uwagi: 'Serwisy i API się zmieniły; nieużywane.' },
    { zyxel: 'Dropbox', stan: 'pominiete', uwagi: 'Nieużywane.' },
    { zyxel: 'Time Machine', stan: 'pominiete', uwagi: 'Brak komputerów Mac.' },
  ] },
  { nazwa: 'Sharing', pozycje: [
    { zyxel: 'Users (typ konta, grupy, limit miejsca)', stan: 'czesciowo', gdzie: 'Użytkownicy', link: '/uzytkownicy',
      uwagi: 'Konta z hasłem, typ administrator/użytkownik, klucze SSH. Bez limitów miejsca (quota).' },
    { zyxel: 'Groups', stan: 'jest', gdzie: 'Grupy', link: '/grupy', uwagi: 'Tworzenie, usuwanie, członkowie.' },
    { zyxel: 'Shares (właściciel, prawa Full/Read Only/Deny, kosz, Share Browser)', stan: 'jest', gdzie: 'Udziały', link: '/udzialy',
      uwagi: 'Prawa dla użytkowników i grup, właściciel, kosz (Samba), dodatkowo NFS po adresie IP.' },
    { zyxel: 'Przeglądarka plików dla użytkowników (wysyłanie, pobieranie)', stan: 'jest', gdzie: 'Przeglądarka plików', link: '/pliki',
      uwagi: 'Według praw do udziałów; foldery, zmiana nazwy, usuwanie, wysyłanie przeciąganiem.' },
  ] },
  { nazwa: 'Maintenance', pozycje: [
    { zyxel: 'Power (usypianie dysku, harmonogram, WOL, po zaniku prądu, UPS)', stan: 'czesciowo', gdzie: 'Zasilanie / Harmonogram', link: '/zasilanie',
      uwagi: 'Usypianie dysku, harmonogram włącz/wyłącz/restart, Wake-on-LAN (zawsze włączony), jednorazowe budzenie. Brak: zachowanie po zaniku prądu (ustawienie mikrokontrolera, nieznane rejestry), UPS.' },
    { zyxel: 'Log (kategorie, powiadomienia e-mail)', stan: 'czesciowo', gdzie: 'Dziennik', link: '/dziennik',
      uwagi: 'Dzienniki: system, logowania, COPY, fsck, aktualizacje, z wyszukiwaniem. Bez powiadomień e-mail.' },
    { zyxel: 'Configuration (kopia, przywracanie, ustawienia fabryczne)', stan: 'jest', gdzie: 'Kopia konfiguracji', link: '/kopia',
      uwagi: 'Pobieranie i przywracanie z weryfikacją i podglądem zmian. Ustawienia fabryczne Zyxela: wyjęcie pendrive’a.' },
    { zyxel: 'SSL (wymuszenie HTTPS, import certyfikatu, CSR)', stan: 'czesciowo', gdzie: 'Certyfikat SSL', link: '/certyfikat',
      uwagi: 'Tylko HTTPS, własny certyfikat, generowanie nowego. Bez importu certyfikatu i CSR.' },
    { zyxel: 'Shutdown (restart, wyłączenie)', stan: 'jest', gdzie: 'Zasilanie', link: '/zasilanie', uwagi: 'Także przyciski na obudowie.' },
  ] },
  { nazwa: 'Ogólne', pozycje: [
    { zyxel: 'Języki interfejsu (12)', stan: 'czesciowo', uwagi: 'Polski i angielski; kolejne łatwo dodać (słownik w i18n-*.ts).' },
  ] },
];

const NOWE = [
  'Zapora npf z ochroną przed odcięciem samego siebie',
  'Zarządzanie usługami (start, stop, autostart)',
  'Udziały NFS dla Linuksa',
  'Klucze SSH i administracja przez doas',
  'SMART, test dysku i fsck z panelu',
  'Strażnik temperatury dysku',
  'Aktualizacje i audyt podatności pakietów',
];

const OPIS: Record<Stan, { tekst: string; ikona: string; klasa: string }> = {
  jest: { tekst: 'jest', ikona: 'check_circle', klasa: 'ok' },
  czesciowo: { tekst: 'częściowo', ikona: 'adjust', klasa: 'czesc' },
  zamiennik: { tekst: 'zamiennik', ikona: 'swap_horiz', klasa: 'zam' },
  pominiete: { tekst: 'pominięte', ikona: 'block', klasa: 'pom' },
};

@Component({
  selector: 'app-zgodnosc',
  imports: [MatButtonToggleModule, RouterLink, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Zgodność z panelem Zyxel' | t }}</h1>
      <p class="podpowiedz">{{ 'Każda pozycja menu oryginalnego panelu NSA310S i jej odpowiednik tutaj.' | t }}</p>
      <div class="legenda">
        @for (s of stany; track s) {
          <span [class]="opis[s].klasa"><span class="material-symbols-outlined">{{ opis[s].ikona }}</span>
            {{ opis[s].tekst | t }}: {{ licz()[s] }}</span>
        }
      </div>
      <mat-button-toggle-group [value]="filtr()" (change)="filtr.set($event.value)" hideSingleSelectionIndicator class="filtr">
        <mat-button-toggle value="">{{ 'wszystkie' | t }}</mat-button-toggle>
        @for (s of stany; track s) { <mat-button-toggle [value]="s">{{ opis[s].tekst | t }}</mat-button-toggle> }
      </mat-button-toggle-group>

      @for (g of widoczne(); track g.nazwa) {
        <section class="karta grupa">
          <h2>{{ g.nazwa | t }}</h2>
          @for (p of g.pozycje; track p.zyxel) {
            <div class="pozycja">
              <span class="stan" [class]="opis[p.stan].klasa"><span class="material-symbols-outlined">{{ opis[p.stan].ikona }}</span>{{ opis[p.stan].tekst | t }}</span>
              <div>
                <b>{{ p.zyxel | t }}</b>
                @if (p.gdzie) { → @if (p.link) { <a [routerLink]="p.link">{{ p.gdzie | t }}</a> } @else { {{ p.gdzie | t }} } }
                <div class="podpowiedz">{{ p.uwagi | t }}</div>
              </div>
            </div>
          }
        </section>
      }

      <section class="karta grupa">
        <h2><span class="material-symbols-outlined">add_circle</span>{{ 'Nowe – nie było w Zyxelu' | t }}</h2>
        @for (n of nowe; track n) { <div class="pozycja"><span class="stan ok"><span class="material-symbols-outlined">star</span></span><div>{{ n | t }}</div></div> }
      </section>
    </div>`,
  styles: `
    .legenda { display: flex; gap: 20px; flex-wrap: wrap; margin: 8px 0 12px; }
    .legenda > span, .stan { display: inline-flex; align-items: center; gap: 4px; }
    .filtr { margin-bottom: 16px; flex-wrap: wrap; }
    .grupa { margin-bottom: 16px; }
    .pozycja { display: grid; grid-template-columns: 130px 1fr; gap: 12px; padding: 8px 0;
      border-top: 1px solid var(--mat-sys-outline-variant); }
    .pozycja:first-of-type { border-top: 0; }
    .stan { font: var(--mat-sys-label-large); }
    .czesc { color: #b26a00; } .zam { color: var(--mat-sys-primary); } .pom { color: var(--mat-sys-on-surface-variant); }
    @media (prefers-color-scheme: dark) { .czesc { color: #ffb74d; } }
    @media (max-width: 600px) { .pozycja { grid-template-columns: 1fr; gap: 2px; } }`,
})
export class Zgodnosc {
  protected readonly opis = OPIS;
  protected readonly stany: Stan[] = ['jest', 'czesciowo', 'zamiennik', 'pominiete'];
  protected readonly nowe = NOWE;
  protected readonly filtr = signal<Stan | ''>('');
  protected readonly licz = computed(() => {
    const w: Record<Stan, number> = { jest: 0, czesciowo: 0, zamiennik: 0, pominiete: 0 };
    ZYXEL.forEach(g => g.pozycje.forEach(p => w[p.stan]++));
    return w;
  });
  protected readonly widoczne = computed(() => {
    const f = this.filtr();
    return ZYXEL.map(g => ({ ...g, pozycje: g.pozycje.filter(p => !f || p.stan === f) })).filter(g => g.pozycje.length);
  });
}
