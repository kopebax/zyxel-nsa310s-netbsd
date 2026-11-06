import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Api, Grupa, Komunikaty, Uzytkownik } from '../api';
import { I18n, TPipe } from '../i18n';

@Component({
  selector: 'app-grupy',
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatTooltipModule, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Grupy' | t }}</h1>
      <div class="siatka">
        @for (g of grupy(); track g.nazwa) {
          <section class="karta">
            <h2><span class="material-symbols-outlined">group</span>{{ g.nazwa }}
              <span class="odstep"></span>
              @if (g.nazwa !== 'users') {
                <button mat-icon-button [matTooltip]="'Usuń grupę' | t" (click)="usun(g.nazwa)"><span class="material-symbols-outlined">delete</span></button>
              }
            </h2>
            @if (g.nazwa === 'users') {
              <p class="podpowiedz">{{ 'Grupa wszystkich użytkowników – należy do niej każde konto.' | t }}</p>
            } @else {
              @for (u of uzytkownicy(); track u.nazwa) {
                <mat-checkbox [checked]="g.czlonkowie.includes(u.nazwa)" (change)="przelacz(g, u.nazwa, $event.checked)">{{ u.nazwa }}</mat-checkbox><br>
              }
              <div class="przyciski"><button mat-stroked-button (click)="zapisz(g)">{{ 'Zapisz członków' | t }}</button></div>
            }
          </section>
        }
      </div>
      <div class="przyciski">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'Nowa grupa' | t }}</mat-label><input matInput [(ngModel)]="nowa" pattern="[a-z][a-z0-9_-]*" autocapitalize="off">
        </mat-form-field>
        <button mat-flat-button (click)="dodaj()" [disabled]="!nowa">{{ 'Dodaj grupę' | t }}</button>
      </div>
      <p class="podpowiedz">{{ 'Grupom nadaje się prawa do udziałów – każdy członek dostaje te prawa.' | t }}</p>
    </div>`,
  styles: `h2 { width: 100%; } .odstep { flex: 1; }`,
})
export class Grupy implements OnInit {
  private readonly api = inject(Api);
  private readonly kom = inject(Komunikaty);
  private readonly i18n = inject(I18n);
  protected readonly grupy = signal<Grupa[]>([]);
  protected readonly uzytkownicy = signal<Uzytkownik[]>([]);
  protected nowa = '';

  ngOnInit(): void {
    this.wczytaj();
  }

  private async wczytaj(): Promise<void> {
    try {
      const [g, u] = await Promise.all([
        this.api.get<{ grupy: Grupa[] }>('grupy'), this.api.get<{ uzytkownicy: Uzytkownik[] }>('uzytkownicy')]);
      this.grupy.set(g.grupy);
      this.uzytkownicy.set(u.uzytkownicy);
    } catch (e) {
      this.kom.blad(e);
    }
  }

  protected przelacz(g: Grupa, u: string, wl: boolean): void {
    g.czlonkowie = wl ? [...g.czlonkowie, u] : g.czlonkowie.filter(x => x !== u);
  }

  async zapisz(g: Grupa): Promise<void> {
    try {
      await this.api.post('grupy', { akcja: 'czlonkowie', nazwa: g.nazwa, czlonkowie: g.czlonkowie.join('\n') });
      this.kom.ok('Zapisano');
      await this.wczytaj();
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async dodaj(): Promise<void> {
    try {
      await this.api.post('grupy', { akcja: 'dodaj', nazwa: this.nowa });
      this.nowa = '';
      this.kom.ok('Dodano');
      await this.wczytaj();
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async usun(nazwa: string): Promise<void> {
    if (!confirm(this.i18n.t('Usunąć grupę {0}?', nazwa))) return;
    try {
      await this.api.post('grupy', { akcja: 'usun', nazwa });
      this.kom.ok('Usunięto');
      await this.wczytaj();
    } catch (e) {
      this.kom.blad(e);
    }
  }
}
