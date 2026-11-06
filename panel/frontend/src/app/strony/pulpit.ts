import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Api, Status, bajty, czasTrwania, komunikat } from '../api';
import { I18n, TPipe } from '../i18n';

// fizyczne diody na obudowie – każda dwukolorowa albo jednokolorowa
interface Dioda { nazwa: string; opis: string; zielona: string; druga?: { klucz: string; kolor: string; opis: string } }
const DIODY: Dioda[] = [
  { nazwa: 'System', opis: 'działa', zielona: 'sys_green',
    druga: { klucz: 'sys_orange', kolor: '#f08c00', opis: 'uruchamianie / wyłączanie' } },
  { nazwa: 'HDD', opis: 'dysk gotowy (miga przy pracy)', zielona: 'hdd_green',
    druga: { klucz: 'hdd_red', kolor: '#d93025', opis: 'przegrzanie dysku' } },
  { nazwa: 'USB', opis: 'pamięć USB podłączona', zielona: 'usb_green' },
  { nazwa: 'COPY', opis: 'kopiowanie z USB', zielona: 'copy_green',
    druga: { klucz: 'copy_red', kolor: '#d93025', opis: 'błąd kopiowania' } },
];

// sygnały błędów pokazywane osobno (czerwone diody)
const BLEDY = [
  { klucz: 'hdd_red', nazwa: 'Temperatura dysku', ok: 'w normie', zle: 'za wysoka – sprawdź wentylator' },
  { klucz: 'copy_red', nazwa: 'Kopiowanie COPY', ok: 'bez błędów', zle: 'ostatnie kopiowanie nie powiodło się' },
];

const USLUGI: Record<string, string> = {
  sshd: 'SSH', nfsd: 'NFS', mountd: 'NFS mountd', ntpd: 'Czas (NTP)', powerd: 'Przyciski (powerd)', smbd: 'Samba',
};

@Component({
  selector: 'app-pulpit',
  imports: [MatProgressBarModule, MatChipsModule, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Pulpit' | t }}</h1>
      @if (blad()) { <p class="zle">{{ blad() | t }}</p> }
      @if (s(); as s) {
        <div class="siatka">
          <section class="karta">
            <h2><span class="material-symbols-outlined">memory</span>{{ 'System' | t }}</h2>
            <div class="wiersz"><span>{{ 'Nazwa' | t }}</span><span>{{ s.nazwa }}</span></div>
            <div class="wiersz"><span>{{ 'System' | t }}</span><span>{{ s.system }}</span></div>
            <div class="wiersz"><span>{{ 'Jądro' | t }}</span><span>{{ jadro() }}</span></div>
            <div class="wiersz"><span>{{ 'Działa od' | t }}</span><span>{{ dzialanie() }}</span></div>
            <div class="wiersz"><span>{{ 'Obciążenie' | t }}</span><span>{{ s.obciazenie.join(' · ') }}</span></div>
            <div class="wiersz"><span>{{ 'Pamięć RAM' | t }}</span>
              <span>{{ b(s.pamiec.calkowita - s.pamiec.wolna) }} / {{ b(s.pamiec.calkowita) }}</span></div>
            <mat-progress-bar class="pasek" [value]="100 * (1 - s.pamiec.wolna / s.pamiec.calkowita)" />
          </section>

          <section class="karta">
            <h2><span class="material-symbols-outlined">hard_drive</span>{{ 'Przestrzeń' | t }}</h2>
            @for (d of s.dyski; track d.punkt) {
              <div class="wiersz"><span>{{ (d.punkt === '/' ? 'System (pendrive)' : 'Dane') | t }} {{ d.punkt === '/' ? '' : d.punkt }}</span>
                <span>{{ b(d.zajete) }} / {{ b(d.rozmiar) }}</span></div>
              <mat-progress-bar class="pasek" [value]="100 * d.zajete / (d.zajete + d.wolne)" />
            }
          </section>

          <section class="karta">
            <h2><span class="material-symbols-outlined">lan</span>{{ 'Sieć' | t }}</h2>
            <div class="wiersz"><span>{{ 'Adres IP' | t }}</span><span>{{ s.siec.ip ?? '—' }}</span></div>
            <div class="wiersz"><span>MAC</span><span class="mono">{{ s.siec.mac }}</span></div>
            <div class="wiersz"><span>{{ 'Łącze' | t }}</span><span>{{ s.siec.media }}</span></div>
            <div class="wiersz"><span>{{ 'Stan' | t }}</span>
              <span [class.ok]="s.siec.status === 'active'">{{ (s.siec.status === 'active' ? 'połączono' : 'brak łącza') | t }}</span></div>
          </section>

          <section class="karta">
            <h2><span class="material-symbols-outlined">settings</span>{{ 'Usługi' | t }}</h2>
            <mat-chip-set>
              @for (u of uslugi(); track u.klucz) {
                <mat-chip [highlighted]="u.dziala">
                  <span matChipAvatar class="material-symbols-outlined">{{ u.dziala ? 'check_circle' : 'cancel' }}</span>
                  {{ u.nazwa | t }}
                </mat-chip>
              }
            </mat-chip-set>
          </section>

          <section class="karta">
            <h2><span class="material-symbols-outlined">lightbulb</span>{{ 'Diody na obudowie' | t }}</h2>
            @for (d of diody; track d.nazwa) {
              <div class="wiersz">
                <span class="dioda"><i [style.background]="kolor(d)"></i>{{ d.nazwa }}</span>
                <span>{{ opisDiody(d) | t }}</span>
              </div>
            }
          </section>

          <section class="karta">
            <h2><span class="material-symbols-outlined">report</span>{{ 'Sygnały błędów' | t }}</h2>
            @for (b of bledy; track b.klucz) {
              <div class="wiersz">
                <span>{{ b.nazwa | t }}</span>
                <span [class.ok]="!led()[b.klucz]" [class.zle]="led()[b.klucz]">{{ (led()[b.klucz] ? b.zle : b.ok) | t }}</span>
              </div>
            }
            <p class="podpowiedz">{{ 'Czerwona dioda HDD lub COPY na obudowie oznacza jeden z tych błędów.' | t }}</p>
          </section>

          <section class="karta">
            <h2><span class="material-symbols-outlined">alarm</span>{{ 'Najbliższe włączenie' | t }}</h2>
            <div class="wiersz"><span>{{ 'Następne włączenie' | t }}</span>
              <span>{{ s.budzenie ? i18n.data(s.budzenie) : ('brak (harmonogram pusty)' | t) }}</span></div>
            <p class="podpowiedz">{{ 'Zegar RTC włączy NAS o tej porze, jeśli będzie wyłączony.' | t }}</p>
          </section>
        </div>
      }
    </div>`,
  styles: `
    .dioda { display: flex !important; align-items: center; gap: 10px; color: var(--mat-sys-on-surface) !important; }
    .dioda i { width: 12px; height: 12px; border-radius: 50%; background: var(--mat-sys-outline-variant);
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); }`,
})
export class Pulpit implements OnInit, OnDestroy {
  private readonly api = inject(Api);
  protected readonly i18n = inject(I18n);
  protected readonly s = signal<Status | null>(null);
  protected readonly led = signal<Record<string, boolean>>({});
  protected readonly blad = signal('');
  protected readonly diody = DIODY;
  protected readonly bledy = BLEDY;
  protected readonly b = bajty;
  private timer?: ReturnType<typeof setInterval>;

  protected readonly jadro = computed(() => this.s()?.jadro.match(/#\d+/)?.[0] ?? '');
  protected readonly dzialanie = computed(() => {
    const s = this.s();
    return s ? czasTrwania(s.czas - s.uruchomiony) : '';
  });
  protected readonly uslugi = computed(() =>
    Object.entries(this.s()?.uslugi ?? {}).map(([klucz, dziala]) => ({ klucz, dziala, nazwa: USLUGI[klucz] ?? klucz })));

  ngOnInit(): void {
    this.odswiez();
    this.timer = setInterval(() => this.odswiez(), 15000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  protected kolor(d: Dioda): string | null {
    const l = this.led();
    if (d.druga && l[d.druga.klucz]) return d.druga.kolor;
    return l[d.zielona] ? '#2fb35a' : null;
  }

  protected opisDiody(d: Dioda): string {
    const l = this.led();
    if (d.druga && l[d.druga.klucz]) return d.druga.opis;
    return l[d.zielona] ? d.opis : 'zgaszona';
  }

  private async odswiez(): Promise<void> {
    try {
      const [s, l] = await Promise.all([
        this.api.get<Status>('status'), this.api.get<Record<string, boolean>>('diody')]);
      this.s.set(s);
      this.led.set(l);
      this.blad.set('');
    } catch (e) {
      this.blad.set(komunikat(e));
    }
  }
}
