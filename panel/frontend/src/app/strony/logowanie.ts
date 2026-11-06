import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { Api, komunikat } from '../api';
import { I18n, JEZYKI, TPipe } from '../i18n';

@Component({
  selector: 'app-logowanie',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatButtonToggleModule,
    MatProgressBarModule, TPipe],
  template: `
    <div class="tlo">
      <form class="okno" (ngSubmit)="zaloguj()">
        <div class="naglowek">
          <span class="material-symbols-outlined">dns</span>
          <div><b>NSA310S</b><small>{{ 'Panel NAS · NetBSD' | t }}</small></div>
          <span class="odstep"></span>
          <mat-button-toggle-group [value]="i18n.jezyk()" (change)="i18n.jezyk.set($event.value)" hideSingleSelectionIndicator>
            @for (j of jezyki; track j.kod) { <mat-button-toggle [value]="j.kod">{{ j.kod.toUpperCase() }}</mat-button-toggle> }
          </mat-button-toggle-group>
        </div>
        @if (praca()) { <mat-progress-bar mode="indeterminate" /> }
        <div class="tresc">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'Użytkownik' | t }}</mat-label>
            <input matInput name="uzytkownik" [(ngModel)]="uzytkownik" autocomplete="username" required autocapitalize="off">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'Hasło' | t }}</mat-label>
            <input matInput type="password" name="haslo" [(ngModel)]="haslo" autocomplete="current-password" required>
          </mat-form-field>
          @if (blad()) { <p class="zle">{{ blad() | t }}</p> }
          <button mat-flat-button type="submit" [disabled]="praca() || !haslo || !uzytkownik">{{ 'Zaloguj' | t }}</button>
        </div>
      </form>
    </div>`,
  styles: `
    .tlo { min-height: 100vh; display: grid; place-items: center;
      background: linear-gradient(135deg, #0a3d74, #0b5cad 55%, #1679d4); }
    .okno { width: min(380px, 92vw); background: var(--mat-sys-surface); border-radius: 20px; overflow: hidden;
      box-shadow: 0 12px 40px rgba(0,0,0,.25); }
    .naglowek { display: flex; gap: 12px; align-items: center; padding: 20px 24px; font-size: 20px; }
    .naglowek .material-symbols-outlined { font-size: 36px; color: var(--mat-sys-primary); }
    .naglowek small { display: block; font-size: 13px; color: var(--mat-sys-on-surface-variant); }
    .odstep { flex: 1; }
    .tresc { display: flex; flex-direction: column; padding: 8px 24px 24px; }
    p { margin: 0 0 12px; }`,
})
export class Logowanie {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18n);
  protected readonly jezyki = JEZYKI;
  protected uzytkownik = '';
  protected haslo = '';
  protected readonly praca = signal(false);
  protected readonly blad = signal('');

  async zaloguj(): Promise<void> {
    this.praca.set(true);
    this.blad.set('');
    try {
      await this.api.zaloguj(this.uzytkownik.trim().toLowerCase(), this.haslo);
      this.haslo = '';
      this.router.navigateByUrl(this.api.admin() ? '/' : '/pliki');
    } catch (e) {
      this.blad.set(komunikat(e));
    } finally {
      this.praca.set(false);
    }
  }
}
