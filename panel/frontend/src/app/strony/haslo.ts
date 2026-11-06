import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Api, Komunikaty } from '../api';
import { TPipe } from '../i18n';

@Component({
  selector: 'app-haslo',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Moje hasło' | t }}</h1>
      <section class="karta waska">
        <h2><span class="material-symbols-outlined">key</span>{{ 'Zmiana hasła' | t }}: {{ api.uzytkownik() }}</h2>
        <mat-form-field appearance="outline" class="pelne">
          <mat-label>{{ 'Obecne hasło' | t }}</mat-label>
          <input matInput type="password" [(ngModel)]="stare" autocomplete="current-password">
        </mat-form-field>
        <mat-form-field appearance="outline" class="pelne">
          <mat-label>{{ 'Nowe hasło (min. 8 znaków)' | t }}</mat-label>
          <input matInput type="password" [(ngModel)]="nowe" autocomplete="new-password">
        </mat-form-field>
        <mat-form-field appearance="outline" class="pelne">
          <mat-label>{{ 'Powtórz nowe hasło' | t }}</mat-label>
          <input matInput type="password" [(ngModel)]="powtorz" autocomplete="new-password">
        </mat-form-field>
        @if (nowe && powtorz && nowe !== powtorz) { <p class="zle">{{ 'Hasła się różnią' | t }}</p> }
        <div class="przyciski">
          <button mat-flat-button (click)="zmien()" [disabled]="praca() || !stare || nowe.length < 8 || nowe !== powtorz">
            {{ 'Zmień hasło' | t }}</button>
        </div>
        <p class="podpowiedz">{{ 'Hasło dotyczy panelu i udziałów Samby.' | t }}</p>
      </section>
    </div>`,
  styles: `.waska { max-width: 480px; }`,
})
export class Haslo {
  protected readonly api = inject(Api);
  private readonly kom = inject(Komunikaty);
  protected readonly praca = signal(false);
  protected stare = '';
  protected nowe = '';
  protected powtorz = '';

  async zmien(): Promise<void> {
    this.praca.set(true);
    try {
      await this.api.post('haslo', { stare: this.stare, nowe: this.nowe });
      this.kom.ok('Hasło zmienione');
      this.stare = this.nowe = this.powtorz = '';
    } catch (e) {
      this.kom.blad(e);
    } finally {
      this.praca.set(false);
    }
  }
}
