import { Injectable, Pipe, PipeTransform, computed, effect, inject, signal } from '@angular/core';
import { EN } from './i18n-en';

export type Jezyk = 'pl' | 'en';

export const JEZYKI: { kod: Jezyk; nazwa: string }[] = [
  { kod: 'pl', nazwa: 'Polski' },
  { kod: 'en', nazwa: 'English' },
];

const SLOWNIKI: Record<Jezyk, Record<string, string> | null> = { pl: null, en: EN };

function poczatkowy(): Jezyk {
  try {
    const z = localStorage.getItem('nas-jezyk');
    if (z === 'pl' || z === 'en') return z;
  } catch { /* prywatne okno */ }
  return navigator.language?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

// Teksty w kodzie są po polsku; słownik tłumaczy je na wybrany język.
// {0}, {1}… w tekście zastępowane są parametrami.
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly jezyk = signal<Jezyk>(poczatkowy());
  readonly lokalizacja = computed(() => (this.jezyk() === 'pl' ? 'pl-PL' : 'en-GB'));

  constructor() {
    effect(() => {
      const j = this.jezyk();
      document.documentElement.lang = j;
      try { localStorage.setItem('nas-jezyk', j); } catch { /* prywatne okno */ }
    });
  }

  t(tekst: string, ...parametry: (string | number)[]): string {
    const s = SLOWNIKI[this.jezyk()];
    let w = (s && s[tekst]) || tekst;
    parametry.forEach((p, i) => (w = w.replace(`{${i}}`, String(p))));
    return w;
  }

  data(t: number, opcje?: Intl.DateTimeFormatOptions): string {
    return new Date(t * 1000).toLocaleString(this.lokalizacja(), opcje);
  }
}

@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform {
  private readonly i18n = inject(I18n);

  transform(tekst: string, ...parametry: (string | number)[]): string {
    return this.i18n.t(tekst, ...parametry);
  }
}
