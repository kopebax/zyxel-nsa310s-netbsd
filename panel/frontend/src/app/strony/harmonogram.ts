import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Api, Komunikaty, WpisHarmonogramu } from '../api';
import { I18n, TPipe } from '../i18n';

const DNI = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

@Component({
  selector: 'app-harmonogram',
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatTooltipModule, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Harmonogram zasilania' | t }}</h1>
      <div class="info">{{ 'Najbliższe automatyczne włączenie' | t }}:
        <b>{{ budzenie() ? data(budzenie()) : ('brak' | t) }}</b>.
        {{ 'Włączenie działa z zegara RTC, gdy NAS jest wyłączony. Czas w strefie ustawionej w „Nazwa i czas”.' | t }}</div>

      @for (w of wpisy(); track $index; let i = $index) {
        <section class="karta wpis">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="typ">
            <mat-label>{{ 'Akcja' | t }}</mat-label>
            <mat-select [(ngModel)]="w.typ">
              <mat-option value="wlacz">{{ 'Włącz' | t }}</mat-option>
              <mat-option value="wylacz">{{ 'Wyłącz' | t }}</mat-option>
              <mat-option value="restart">{{ 'Uruchom ponownie' | t }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-button-toggle-group multiple [(ngModel)]="w.dni" hideMultipleSelectionIndicator>
            @for (d of dni; track d; let n = $index) {
              <mat-button-toggle [value]="n + 1">{{ d | t }}</mat-button-toggle>
            }
          </mat-button-toggle-group>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="godz">
            <mat-label>{{ 'Godzina' | t }}</mat-label>
            <input matInput type="time" [(ngModel)]="w.godzina">
          </mat-form-field>
          <button mat-icon-button [matTooltip]="'Usuń' | t" (click)="usun(i)"><span class="material-symbols-outlined">delete</span></button>
        </section>
      } @empty {
        <p class="podpowiedz">{{ 'Brak wpisów – NAS działa bez harmonogramu.' | t }}</p>
      }

      <div class="przyciski">
        <button mat-stroked-button (click)="dodaj()"><span class="material-symbols-outlined">add</span> {{ 'Dodaj wpis' | t }}</button>
        <button mat-flat-button (click)="zapisz()" [disabled]="praca()">{{ 'Zapisz harmonogram' | t }}</button>
      </div>
      <p class="podpowiedz">{{ 'Przykład: włącz Pn–Pt 07:30, wyłącz Pn–Pt 23:00, włącz So–Nd 09:00. Przed każdym wyłączeniem (także przyciskiem lub z panelu) NAS ustawia budzik na najbliższe „Włącz”.' | t }}</p>
    </div>`,
  styles: `
    .wpis { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
    .typ { width: 190px; } .godz { width: 130px; }`,
})
export class Harmonogram implements OnInit {
  private readonly api = inject(Api);
  private readonly kom = inject(Komunikaty);
  private readonly i18n = inject(I18n);
  protected readonly wpisy = signal<WpisHarmonogramu[]>([]);
  protected readonly budzenie = signal(0);
  protected readonly praca = signal(false);
  protected readonly dni = DNI;

  ngOnInit(): void {
    this.wczytaj();
  }

  protected data(t: number): string {
    return this.i18n.data(t, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  }

  private async wczytaj(): Promise<void> {
    try {
      const r = await this.api.get<{ wpisy: WpisHarmonogramu[]; budzenie: number }>('harmonogram');
      this.wpisy.set(r.wpisy);
      this.budzenie.set(r.budzenie);
    } catch (e) {
      this.kom.blad(e);
    }
  }

  protected dodaj(): void {
    this.wpisy.update(w => [...w, { typ: 'wlacz', dni: [1, 2, 3, 4, 5], godzina: '07:00' }]);
  }

  protected usun(i: number): void {
    this.wpisy.update(w => w.filter((_, j) => j !== i));
  }

  async zapisz(): Promise<void> {
    const w = this.wpisy();
    if (w.some(x => x.dni.length === 0 || !x.godzina)) { this.kom.ok('Każdy wpis potrzebuje dni i godziny'); return; }
    this.praca.set(true);
    try {
      const dane = w.map(x => `${x.typ} ${[...x.dni].sort().join(',')} ${x.godzina}`).join('\n');
      const r = await this.api.post<{ wpisy: WpisHarmonogramu[]; budzenie: number }>('harmonogram', { dane });
      this.wpisy.set(r.wpisy);
      this.budzenie.set(r.budzenie);
      this.kom.ok('Zapisano harmonogram');
    } catch (e) {
      this.kom.blad(e);
    } finally {
      this.praca.set(false);
    }
  }
}
