import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Api, Komunikaty } from '../api';
import { I18n, TPipe } from '../i18n';

interface Stan {
  sprawdzono: number; trwa: boolean; do_aktualizacji: string[]; audyt: string[]; bledy: string[];
  system: string; dziennik: string;
}

@Component({
  selector: 'app-aktualizacje',
  imports: [MatButtonModule, MatProgressBarModule, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Aktualizacje' | t }}</h1>
      @if (s(); as s) {
        @for (b of s.bledy; track b) { <div class="ostrzezenie"><span class="material-symbols-outlined">error</span>{{ b | t }}</div> }
        <div class="siatka">
          <section class="karta">
            <h2><span class="material-symbols-outlined">inventory_2</span>{{ 'Pakiety (pkgin)' | t }}</h2>
            <div class="wiersz"><span>{{ 'Ostatnie sprawdzenie' | t }}</span>
              <span>{{ s.sprawdzono ? i18n.data(s.sprawdzono) : ('nigdy' | t) }}</span></div>
            @if (s.trwa) { <mat-progress-bar mode="indeterminate" /> <p class="podpowiedz">{{ 'Sprawdzanie trwa kilka minut…' | t }}</p> }
            <div class="wiersz"><span>{{ 'Do aktualizacji' | t }}</span><span>{{ s.do_aktualizacji.length }}</span></div>
            @for (p of s.do_aktualizacji; track p) { <div class="mono">{{ p }}</div> }
            <div class="przyciski">
              <button mat-stroked-button (click)="akcja('sprawdz')" [disabled]="s.trwa">{{ 'Sprawdź teraz' | t }}</button>
              <button mat-flat-button (click)="akcja('aktualizuj')" [disabled]="s.trwa || s.do_aktualizacji.length === 0">{{ 'Aktualizuj pakiety' | t }}</button>
            </div>
          </section>
          <section class="karta">
            <h2><span class="material-symbols-outlined">gpp_maybe</span>{{ 'Podatności (pkg_admin audit)' | t }}</h2>
            @for (a of s.audyt; track a) { <div class="zle mono">{{ a }}</div> }
            @empty { <p class="ok">{{ 'Brak znanych podatności w zainstalowanych pakietach.' | t }}</p> }
            <p class="podpowiedz">{{ 'Lista podatności pobierana jest też codziennie automatycznie.' | t }}</p>
          </section>
          <section class="karta">
            <h2><span class="material-symbols-outlined">memory</span>{{ 'System' | t }}</h2>
            <div class="wiersz"><span>{{ 'Wersja' | t }}</span><span>{{ s.system }}</span></div>
            <p class="podpowiedz">{{ 'System bazowy i jądro NSA310S aktualizuje się z nowych zbiorów NetBSD i przebudowanego jądra (opis w dokumentacji projektu) – nie z panelu.' | t }}</p>
          </section>
        </div>
        @if (s.dziennik) {
          <section class="karta odstep-gora">
            <h2><span class="material-symbols-outlined">receipt_long</span>{{ 'Ostatnia aktualizacja' | t }}</h2>
            <pre class="mono log">{{ s.dziennik }}</pre>
          </section>
        }
      }
    </div>`,
  styles: `.log { white-space: pre-wrap; max-height: 300px; overflow: auto; font-size: 12px; margin: 0; }`,
})
export class Aktualizacje implements OnInit, OnDestroy {
  private readonly api = inject(Api);
  private readonly kom = inject(Komunikaty);
  protected readonly i18n = inject(I18n);
  protected readonly s = signal<Stan | null>(null);
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.wczytaj();
    this.timer = setInterval(() => this.wczytaj(), 10000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  private async wczytaj(): Promise<void> {
    try {
      this.s.set(await this.api.get<Stan>('aktualizacje'));
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async akcja(a: 'sprawdz' | 'aktualizuj'): Promise<void> {
    if (a === 'aktualizuj' && !confirm(this.i18n.t('Zaktualizować pakiety?'))) return;
    try {
      await this.api.post('aktualizacje', { akcja: a });
      this.kom.ok(a === 'sprawdz' ? 'Sprawdzanie rozpoczęte' : 'Aktualizacja rozpoczęta');
      setTimeout(() => this.wczytaj(), 2000);
    } catch (e) {
      this.kom.blad(e);
    }
  }
}
