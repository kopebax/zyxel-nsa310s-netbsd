import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { I18n } from './i18n';

export interface Dysk { punkt: string; rozmiar: number; zajete: number; wolne: number; }

export interface Status {
  nazwa: string;
  system: string;
  jadro: string;
  czas: number;
  uruchomiony: number;
  obciazenie: number[];
  pamiec: { calkowita: number; wolna: number };
  dyski: Dysk[];
  siec: { interfejs: string; mac?: string; ip?: string; media?: string; status?: string };
  budzenie: number;
  uslugi: Record<string, boolean>;
}

export interface AtrybutSmart {
  id: number; nazwa: string; wartosc: number; najgorsza: number; prog: number; surowa: string;
}

export interface Smart {
  model?: string; numer?: string; pojemnosc?: string; zdrowie?: string;
  temperatura?: number; atrybuty: AtrybutSmart[];
  testy: { nr: number; opis: string; stan: string }[];
}

export type Prawo = 'rw' | 'ro';
export interface PrawoUdzialu { typ: 'uzytkownik' | 'grupa'; nazwa: string; prawo: Prawo; }
export interface Udzial {
  nazwa: string; sciezka: string; wlasciciel: string; kosz: boolean; smb: boolean;
  prawa: PrawoUdzialu[]; nfs?: { tryb: Prawo; klienci: string[] } | null;
}
export interface Grupa { nazwa: string; gid: number; czlonkowie: string[]; }
export interface Plik { nazwa: string; katalog: boolean; rozmiar: number; zmieniony: number; }

export interface Usluga { nazwa: string; dziala: boolean; autostart: boolean; }

export interface Uzytkownik { nazwa: string; uid: number; grupy: string[]; klucze: number; haslo: boolean; admin: boolean; }

export interface WpisHarmonogramu { typ: 'wlacz' | 'wylacz' | 'restart'; dni: number[]; godzina: string; }

export interface Siec {
  dhcp: boolean; statyczny?: string; brama?: string; dns: string[];
  ip?: string; maska?: number; mac?: string; media?: string; status?: string;
  oczekuje_potwierdzenia: boolean;
}

export interface Czas {
  nazwa: string; strefa: string; czas: number; ntp: string[];
  synchronizacja?: { zrodlo: string; przesuniecie_ms: number };
}

// treść POST jako formularz (tak przyjmuje ją httpd z NetBSD);
// encodeURIComponent, bo HttpParams zostawia „+”, który serwer zamienia na spację
function formularz(dane: Record<string, string>): string {
  const pola = Object.entries(dane).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  pola.push('_=1'); // httpd odrzuca POST bez treści
  return pola.join('&');
}

const FORMULARZ = { 'Content-Type': 'application/x-www-form-urlencoded' };

interface Sesja { csrf: string; uzytkownik: string; admin: boolean; }

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly csrf = signal<string | null>(null);
  readonly uzytkownik = signal('');
  readonly admin = signal(false);
  readonly zalogowany = computed(() => this.csrf() !== null);

  async get<T>(sciezka: string, parametry?: Record<string, string>): Promise<T> {
    try {
      return await firstValueFrom(this.http.get<T>(`/api/${sciezka}`, { params: parametry }));
    } catch (e) {
      this.obsluzBlad(e);
      throw e;
    }
  }

  async post<T>(sciezka: string, dane: Record<string, string> = {}): Promise<T> {
    try {
      return await firstValueFrom(this.http.post<T>(`/api/${sciezka}`, formularz(dane), {
        headers: { ...FORMULARZ, 'X-CSRF-Token': this.csrf() ?? '' },
      }));
    } catch (e) {
      this.obsluzBlad(e);
      throw e;
    }
  }

  // plik kawałkami (base64): httpd z NetBSD przyjmuje tylko formularze
  async wyslijPlik(sciezka: string, plik: Blob, pola: Record<string, string>,
                   postep?: (wyslano: number) => void): Promise<void> {
    const KAWALEK = 384 * 1024;
    const n = Math.max(1, Math.ceil(plik.size / KAWALEK));
    for (let i = 0; i < n; i++) {
      const bajty = new Uint8Array(await plik.slice(i * KAWALEK, (i + 1) * KAWALEK).arrayBuffer());
      let bin = '';
      for (let j = 0; j < bajty.length; j += 0x8000) bin += String.fromCharCode(...bajty.subarray(j, j + 0x8000));
      await this.post(sciezka, { ...pola, nr: String(i), dane: btoa(bin), ...(i === n - 1 ? { ostatni: '1' } : {}) });
      postep?.(Math.min(plik.size, (i + 1) * KAWALEK));
    }
  }

  private ustawSesje(s: Sesja | null): void {
    this.csrf.set(s?.csrf ?? null);
    this.uzytkownik.set(s?.uzytkownik ?? '');
    this.admin.set(s?.admin ?? false);
  }

  async sprawdzSesje(): Promise<boolean> {
    try {
      this.ustawSesje(await firstValueFrom(this.http.get<Sesja>('/api/sesja')));
      return true;
    } catch {
      this.ustawSesje(null);
      return false;
    }
  }

  async zaloguj(uzytkownik: string, haslo: string): Promise<void> {
    this.ustawSesje(await firstValueFrom(this.http.post<Sesja>('/api/login',
      formularz({ uzytkownik, haslo }), { headers: FORMULARZ })));
  }

  async wyloguj(): Promise<void> {
    try {
      await this.post('logout');
    } finally {
      this.ustawSesje(null);
      this.router.navigateByUrl('/logowanie');
    }
  }

  // wygasła sesja → ekran logowania
  private obsluzBlad(e: unknown): void {
    if (e instanceof HttpErrorResponse && e.status === 401) {
      this.ustawSesje(null);
      this.router.navigateByUrl('/logowanie');
    }
  }
}

export function komunikat(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    return e.error?.blad ?? (e.status === 0 ? 'Brak połączenia z NAS-em' : `Błąd ${e.status}`);
  }
  return 'Nieznany błąd';
}

export function bajty(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  const j = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < j.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1).replace('.', ',')} ${j[i]}`;
}

export function czasTrwania(s: number): string {
  const d = Math.floor(s / 86400), g = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d > 0 ? `${d} d ${g} h ${m} min` : g > 0 ? `${g} h ${m} min` : `${m} min`;
}

// wspólne powiadomienia (pasek u dołu ekranu), tłumaczone
@Injectable({ providedIn: 'root' })
export class Komunikaty {
  private readonly pasek = inject(MatSnackBar);
  private readonly i18n = inject(I18n);

  ok(tekst: string, ...parametry: (string | number)[]): void {
    this.pasek.open(this.i18n.t(tekst, ...parametry), 'OK', { duration: 4000 });
  }

  blad(e: unknown): void {
    this.pasek.open(this.i18n.t(komunikat(e)), this.i18n.t('Zamknij'), { duration: 8000, panelClass: 'pasek-blad' });
  }
}
