import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Api, Komunikaty, Uzytkownik } from '../api';
import { I18n, TPipe } from '../i18n';

@Component({
  selector: 'app-uzytkownicy',
  imports: [FormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatTableModule,
    MatTooltipModule, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Użytkownicy' | t }}</h1>
      <section class="karta">
        <table mat-table [dataSource]="u()">
          <ng-container matColumnDef="nazwa"><th mat-header-cell *matHeaderCellDef>{{ 'Nazwa' | t }}</th>
            <td mat-cell *matCellDef="let x"><b>{{ x.nazwa }}</b></td></ng-container>
          <ng-container matColumnDef="typ"><th mat-header-cell *matHeaderCellDef>{{ 'Typ konta' | t }}</th>
            <td mat-cell *matCellDef="let x">{{ (x.admin ? 'Administrator' : 'Użytkownik') | t }}</td></ng-container>
          <ng-container matColumnDef="grupy"><th mat-header-cell *matHeaderCellDef>{{ 'Grupy' | t }}</th>
            <td mat-cell *matCellDef="let x">{{ grupy(x) }}</td></ng-container>
          <ng-container matColumnDef="uid"><th mat-header-cell *matHeaderCellDef>UID</th>
            <td mat-cell *matCellDef="let x">{{ x.uid }}</td></ng-container>
          <ng-container matColumnDef="haslo"><th mat-header-cell *matHeaderCellDef>{{ 'Hasło' | t }}</th>
            <td mat-cell *matCellDef="let x">@if (x.haslo) { <span class="ok">✓</span> } @else { <span class="zle">{{ 'brak' | t }}</span> }</td></ng-container>
          <ng-container matColumnDef="akcje"><th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let x" class="akcje">
              <button mat-icon-button [matTooltip]="'Edytuj' | t" (click)="edytuj(x)"><span class="material-symbols-outlined">edit</span></button>
              @if (x.nazwa !== 'admin') {
                <button mat-icon-button [matTooltip]="'Usuń konto' | t" (click)="usun(x.nazwa)">
                  <span class="material-symbols-outlined">delete</span></button>
              }
            </td></ng-container>
          <tr mat-header-row *matHeaderRowDef="kolumny"></tr>
          <tr mat-row *matRowDef="let r; columns: kolumny"></tr>
        </table>
        <div class="przyciski"><button mat-stroked-button (click)="nowy()"><span class="material-symbols-outlined">person_add</span> {{ 'Dodaj użytkownika' | t }}</button></div>
        <p class="podpowiedz">{{ 'Hasło służy do logowania w panelu (przeglądarka plików) i do udziałów Samby. Administrator ma dostęp do całego panelu i wszystkich udziałów. SSH działa tylko z kluczem.' | t }}</p>
      </section>

      @if (edycja(); as e) {
        <section class="karta odstep-gora">
          <h2><span class="material-symbols-outlined">person</span>{{ (e.nowy ? 'Nowy użytkownik' : 'Edycja') | t }}{{ e.nowy ? '' : ': ' + e.nazwa }}</h2>
          <div class="siatka">
            <div>
              @if (e.nowy) {
                <mat-form-field appearance="outline" class="pelne">
                  <mat-label>{{ 'Nazwa użytkownika' | t }}</mat-label>
                  <input matInput [(ngModel)]="e.nazwa" pattern="[a-z][a-z0-9_-]*" maxlength="31" autocapitalize="off">
                  <mat-hint>{{ 'Pierwsza litera, potem małe litery, cyfry, _ i -.' | t }}</mat-hint>
                </mat-form-field>
              }
              <mat-form-field appearance="outline" class="pelne">
                <mat-label>{{ (e.nowy ? 'Hasło' : 'Nowe hasło (puste = bez zmiany)') | t }}</mat-label>
                <input matInput type="password" [(ngModel)]="e.haslo" autocomplete="new-password">
              </mat-form-field>
              @if (e.nazwa !== 'admin') {
                <mat-checkbox [(ngModel)]="e.admin">{{ 'Administrator (cały panel, wszystkie udziały, doas)' | t }}</mat-checkbox>
              }
            </div>
            <div>
              <mat-form-field appearance="outline" class="pelne">
                <mat-label>{{ 'Klucze SSH – jeden w wierszu (opcjonalne)' | t }}</mat-label>
                <textarea matInput class="mono" rows="5" [(ngModel)]="e.klucze"></textarea>
              </mat-form-field>
            </div>
          </div>
          <div class="przyciski">
            <button mat-flat-button (click)="zapisz()" [disabled]="praca()">{{ 'Zapisz' | t }}</button>
            <button mat-button (click)="edycja.set(null)">{{ 'Anuluj' | t }}</button>
          </div>
        </section>
      }
    </div>`,
  styles: `.akcje { text-align: right; white-space: nowrap; }`,
})
export class Uzytkownicy implements OnInit {
  private readonly api = inject(Api);
  private readonly kom = inject(Komunikaty);
  private readonly i18n = inject(I18n);
  protected readonly u = signal<Uzytkownik[]>([]);
  protected readonly edycja = signal<{ nowy: boolean; nazwa: string; haslo: string; admin: boolean; klucze: string; kluczePrzed: string } | null>(null);
  protected readonly praca = signal(false);
  protected readonly kolumny = ['nazwa', 'typ', 'grupy', 'uid', 'haslo', 'akcje'];

  ngOnInit(): void {
    this.wczytaj();
  }

  protected grupy(x: Uzytkownik): string {
    return x.grupy.filter(g => g !== 'wheel').join(', ');
  }

  private async wczytaj(): Promise<void> {
    try {
      this.u.set((await this.api.get<{ uzytkownicy: Uzytkownik[] }>('uzytkownicy')).uzytkownicy);
    } catch (e) {
      this.kom.blad(e);
    }
  }

  protected nowy(): void {
    this.edycja.set({ nowy: true, nazwa: '', haslo: '', admin: false, klucze: '', kluczePrzed: '' });
  }

  async edytuj(x: Uzytkownik): Promise<void> {
    try {
      const k = (await this.api.get<{ klucze: string }>('uzytkownicy', { klucze: x.nazwa })).klucze.trim();
      this.edycja.set({ nowy: false, nazwa: x.nazwa, haslo: '', admin: x.admin, klucze: k, kluczePrzed: k });
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async zapisz(): Promise<void> {
    const e = this.edycja();
    if (!e) return;
    this.praca.set(true);
    try {
      if (e.nowy) {
        await this.api.post('uzytkownicy', { akcja: 'dodaj', nazwa: e.nazwa, haslo: e.haslo, admin: e.admin ? '1' : '0' });
      } else {
        if (e.haslo) await this.api.post('uzytkownicy', { akcja: 'haslo', nazwa: e.nazwa, haslo: e.haslo });
        const byl = this.u().find(x => x.nazwa === e.nazwa)?.admin;
        if (e.nazwa !== 'admin' && byl !== e.admin) {
          await this.api.post('uzytkownicy', { akcja: 'typ', nazwa: e.nazwa, typ: e.admin ? 'admin' : 'uzytkownik' });
        }
      }
      if (e.klucze.trim() !== e.kluczePrzed) {
        await this.api.post('uzytkownicy', { akcja: 'klucze', nazwa: e.nazwa, klucze: e.klucze });
      }
      this.kom.ok('Zapisano');
      this.edycja.set(null);
      await this.wczytaj();
    } catch (err) {
      this.kom.blad(err);
    } finally {
      this.praca.set(false);
    }
  }

  async usun(nazwa: string): Promise<void> {
    if (!confirm(this.i18n.t('Usunąć konto {0}? Jego katalog domowy zostanie.', nazwa))) return;
    try {
      await this.api.post('uzytkownicy', { akcja: 'usun', nazwa });
      this.kom.ok('Usunięto');
      await this.wczytaj();
    } catch (e) {
      this.kom.blad(e);
    }
  }
}
