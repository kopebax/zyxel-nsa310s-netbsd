import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { Api, Komunikaty, Status } from '../api';
import { I18n, TPipe } from '../i18n';

type Akcja = 'shutdown' | 'reboot';

@Component({
  selector: 'app-zasilanie',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, RouterLink, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Zasilanie' | t }}</h1>
      @if (info()) { <div class="info">{{ info() | t }}</div> }
      <div class="siatka">
        <section class="karta">
          <h2><span class="material-symbols-outlined">power_settings_new</span>{{ 'Wyłącz lub uruchom ponownie' | t }}</h2>
          @if (potwierdz(); as a) {
            <p>{{ (a === 'shutdown' ? 'Wyłączyć NAS?' : 'Uruchomić NAS ponownie?') | t }} {{ 'Udziały przestaną działać.' | t }}</p>
            <div class="przyciski">
              <button mat-flat-button class="niebezpieczny" (click)="wykonaj(a)">{{ (a === 'shutdown' ? 'Wyłącz' : 'Uruchom ponownie') | t }}</button>
              <button mat-button (click)="potwierdz.set(null)">{{ 'Anuluj' | t }}</button>
            </div>
          } @else {
            <div class="przyciski">
              <button mat-stroked-button (click)="potwierdz.set('reboot')"><span class="material-symbols-outlined">restart_alt</span> {{ 'Uruchom ponownie' | t }}</button>
              <button mat-stroked-button (click)="potwierdz.set('shutdown')"><span class="material-symbols-outlined">power_settings_new</span> {{ 'Wyłącz' | t }}</button>
            </div>
          }
          <p class="podpowiedz">{{ 'Przycisk zasilania: przytrzymaj 2 s, aby wyłączyć. RESET: 5 s – restart. Wyłączony NAS obudzi pakiet Wake-on-LAN (zawsze włączony) albo zegar RTC.' | t }}</p>
        </section>

        <section class="karta">
          <h2><span class="material-symbols-outlined">bedtime</span>{{ 'Usypianie dysku' | t }}</h2>
          <mat-form-field appearance="outline" class="pelne">
            <mat-label>{{ 'Uśpij dysk po bezczynności' | t }}</mat-label>
            <mat-select [(ngModel)]="usypianie" (selectionChange)="zapiszUsypianie()">
              @for (m of [0, 5, 10, 15, 20, 30, 60, 120]; track m) {
                <mat-option [value]="m">{{ m === 0 ? ('nigdy' | t) : m + ' min' }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <p class="podpowiedz">{{ 'Uśpiony dysk jest cichszy i zużywa mniej prądu; pierwsze odwołanie po uśpieniu trwa kilka sekund.' | t }}</p>
        </section>

        <section class="karta">
          <h2><span class="material-symbols-outlined">alarm</span>{{ 'Jednorazowe włączenie' | t }}</h2>
          <div class="wiersz"><span>{{ 'Ustawione' | t }}</span><span>{{ budzenie() ? i18n.data(budzenie()) : ('wyłączone' | t) }}</span></div>
          <mat-form-field appearance="outline" class="pelne pole">
            <mat-label>{{ 'Włącz NAS o' | t }}</mat-label>
            <input matInput type="datetime-local" [(ngModel)]="kiedy" [min]="minimum()">
            <mat-hint>{{ 'Najwyżej 27 dni naprzód. Ustaw, a potem wyłącz NAS.' | t }}</mat-hint>
          </mat-form-field>
          <div class="przyciski">
            <button mat-flat-button (click)="ustawBudzenie()" [disabled]="!kiedy">{{ 'Ustaw budzenie' | t }}</button>
            <button mat-button (click)="budz(0)" [disabled]="!budzenie()">{{ 'Wyłącz budzenie' | t }}</button>
            <a mat-button routerLink="/harmonogram">{{ 'Harmonogram' | t }}…</a>
          </div>
        </section>
      </div>
    </div>`,
  styles: `.pole { margin-top: 12px; margin-bottom: 16px; }`,
})
export class Zasilanie implements OnInit {
  private readonly api = inject(Api);
  private readonly kom = inject(Komunikaty);
  protected readonly i18n = inject(I18n);
  protected readonly potwierdz = signal<Akcja | null>(null);
  protected readonly budzenie = signal(0);
  protected readonly info = signal('');
  protected kiedy = '';
  protected usypianie = 0;

  async ngOnInit(): Promise<void> {
    try {
      this.budzenie.set((await this.api.get<Status>('status')).budzenie);
      this.usypianie = (await this.api.get<{ minuty: number }>('usypianie')).minuty;
    } catch (e) {
      this.kom.blad(e);
    }
  }

  protected minimum(): string {
    const d = new Date(Date.now() + 5 * 60000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  async wykonaj(a: Akcja): Promise<void> {
    this.potwierdz.set(null);
    try {
      await this.api.post('zasilanie', { akcja: a });
      this.info.set(a === 'shutdown' ? 'NAS się wyłącza…' : 'NAS uruchamia się ponownie – panel wróci za ok. 2 minuty.');
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async zapiszUsypianie(): Promise<void> {
    try {
      await this.api.post('usypianie', { minuty: String(this.usypianie) });
      this.kom.ok('Zapisano');
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async ustawBudzenie(): Promise<void> {
    await this.budz(Math.floor(new Date(this.kiedy).getTime() / 1000));
  }

  async budz(t: number): Promise<void> {
    try {
      const r = await this.api.post<{ budzenie: number }>('budzenie', { czas: String(t) });
      this.budzenie.set(r.budzenie);
      this.kom.ok(t ? 'Budzenie ustawione' : 'Budzenie wyłączone');
    } catch (e) {
      this.kom.blad(e);
    }
  }
}
