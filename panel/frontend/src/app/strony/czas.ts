import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Api, Czas, Komunikaty } from '../api';
import { I18n, TPipe } from '../i18n';

@Component({
  selector: 'app-czas',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Nazwa i czas' | t }}</h1>
      @if (c(); as c) {
        <div class="siatka">
          <section class="karta">
            <h2><span class="material-symbols-outlined">dns</span>{{ 'Nazwa urządzenia' | t }}</h2>
            <mat-form-field appearance="outline" class="pelne">
              <mat-label>{{ 'Nazwa (hostname)' | t }}</mat-label>
              <input matInput [(ngModel)]="nazwa" pattern="[a-z][a-z0-9-]*" maxlength="31">
              <mat-hint>{{ 'Małe litery, cyfry i myślnik.' | t }}</mat-hint>
            </mat-form-field>
          </section>

          <section class="karta">
            <h2><span class="material-symbols-outlined">schedule</span>{{ 'Czas' | t }}</h2>
            <div class="wiersz"><span>{{ 'Czas na NAS-ie' | t }}</span><span>{{ zegar() }}</span></div>
            <div class="wiersz"><span>{{ 'Synchronizacja NTP' | t }}</span>
              <span [class.ok]="!!c.synchronizacja">{{ c.synchronizacja
                ? ('tak' | t) + ' (' + c.synchronizacja.zrodlo.replace('*', '') + ', ' + c.synchronizacja.przesuniecie_ms + ' ms)'
                : ('jeszcze nie' | t) }}</span></div>
            <mat-form-field appearance="outline" class="pelne odstep-gora">
              <mat-label>{{ 'Strefa czasowa' | t }} ({{ strefy().length }})</mat-label>
              <mat-select [(ngModel)]="strefa" (openedChange)="$event && szukaj.set('')">
                <div class="szukaj" (click)="$event.stopPropagation()">
                  <input [placeholder]="'Szukaj strefy…' | t" [ngModel]="szukaj()" (ngModelChange)="szukaj.set($event)"
                         (keydown)="$event.stopPropagation()">
                </div>
                @for (g of grupy(); track g.region) {
                  <mat-optgroup [label]="g.region">
                    @for (z of g.strefy; track z) { <mat-option [value]="z">{{ z.split('/').slice(1).join(' / ').replaceAll('_', ' ') || z }}</mat-option> }
                  </mat-optgroup>
                }
              </mat-select>
              <mat-hint>{{ 'Zmiana czasu letniego/zimowego jest automatyczna.' | t }}</mat-hint>
            </mat-form-field>
            <p class="podpowiedz odstep-gora">{{ 'Harmonogram zasilania działa w czasie tej strefy. Zegar RTC trzyma czas UTC.' | t }}</p>
          </section>

          <section class="karta">
            <h2><span class="material-symbols-outlined">public</span>{{ 'Serwery czasu (NTP)' | t }}</h2>
            <mat-form-field appearance="outline" class="pelne">
              <mat-label>{{ 'Serwery – jeden w wierszu' | t }}</mat-label>
              <textarea matInput class="mono" rows="4" [(ngModel)]="ntp"></textarea>
            </mat-form-field>
          </section>
        </div>
        <div class="przyciski">
          <button mat-flat-button (click)="zapisz()" [disabled]="praca()">{{ 'Zapisz' | t }}</button>
        </div>
      }
    </div>`,
  styles: `.szukaj { position: sticky; top: 0; z-index: 2; background: var(--mat-sys-surface-container); padding: 8px 12px; }
    .szukaj input { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px;
      border: 1px solid var(--mat-sys-outline-variant); background: var(--mat-sys-surface); color: inherit; font: inherit; }`,
})
export class CzasStrona implements OnInit, OnDestroy {
  private readonly api = inject(Api);
  private readonly kom = inject(Komunikaty);
  private readonly i18n = inject(I18n);
  protected readonly c = signal<Czas | null>(null);
  protected readonly strefy = signal<string[]>([]);
  protected readonly szukaj = signal('');
  protected readonly praca = signal(false);
  protected readonly teraz = signal(Date.now());
  protected nazwa = '';
  protected strefa = '';
  protected ntp = '';
  private timer?: ReturnType<typeof setInterval>;

  // strefy pogrupowane wg regionu (Europe, America…), filtrowane wyszukiwarką
  protected readonly grupy = computed(() => {
    const f = this.szukaj().toLowerCase().replace(/ /g, '_');
    const m = new Map<string, string[]>();
    for (const z of this.strefy()) {
      if (f && !z.toLowerCase().includes(f) && z !== this.strefa) continue;
      const r = z.includes('/') ? z.split('/')[0] : 'UTC';
      if (!m.has(r)) m.set(r, []);
      m.get(r)!.push(z);
    }
    return [...m.entries()].map(([region, strefy]) => ({ region, strefy }));
  });

  async ngOnInit(): Promise<void> {
    await this.wczytaj();
    this.timer = setInterval(() => this.teraz.set(Date.now()), 1000);
    try {
      this.strefy.set((await this.api.get<{ strefy: string[] }>('strefy')).strefy);
    } catch (e) {
      this.kom.blad(e);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  protected zegar(): string {
    const c = this.c();
    if (!c) return '';
    try {
      return new Date(this.teraz()).toLocaleString(this.i18n.lokalizacja(), { timeZone: c.strefa });
    } catch {
      return new Date(this.teraz()).toLocaleString(this.i18n.lokalizacja());
    }
  }

  private async wczytaj(): Promise<void> {
    try {
      const c = await this.api.get<Czas>('czas');
      this.c.set(c);
      this.nazwa = c.nazwa;
      this.strefa = c.strefa;
      this.ntp = c.ntp.join('\n');
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async zapisz(): Promise<void> {
    this.praca.set(true);
    try {
      await this.api.post('czas', { nazwa: this.nazwa, strefa: this.strefa, ntp: this.ntp });
      this.kom.ok('Zapisano');
      await this.wczytaj();
    } catch (e) {
      this.kom.blad(e);
    } finally {
      this.praca.set(false);
    }
  }
}
