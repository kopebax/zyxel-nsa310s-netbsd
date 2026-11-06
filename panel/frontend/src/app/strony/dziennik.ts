import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Api, komunikat } from '../api';
import { TPipe } from '../i18n';

@Component({
  selector: 'app-dziennik',
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Dziennik systemowy' | t }}</h1>
      <div class="narzedzia">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ 'Dziennik' | t }}</mat-label>
          <mat-select [value]="rodzaj()" (selectionChange)="rodzaj.set($event.value); wczytaj()">
            <mat-option value="messages">{{ 'System (messages)' | t }}</mat-option>
            <mat-option value="authlog">{{ 'Logowania (authlog)' | t }}</mat-option>
            <mat-option value="copy">{{ 'Przycisk COPY' | t }}</mat-option>
            <mat-option value="fsck">{{ 'Sprawdzanie dysku' | t }}</mat-option>
            <mat-option value="aktualizacja">{{ 'Aktualizacje' | t }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="filtr">
          <mat-label>{{ 'Szukaj' | t }}</mat-label>
          <input matInput [ngModel]="filtr()" (ngModelChange)="filtr.set($event)">
        </mat-form-field>
        <mat-button-toggle-group [value]="ile()" (change)="ile.set($event.value); wczytaj()">
          <mat-button-toggle [value]="100">100</mat-button-toggle>
          <mat-button-toggle [value]="300">300</mat-button-toggle>
          <mat-button-toggle [value]="1000">1000</mat-button-toggle>
        </mat-button-toggle-group>
        <button mat-stroked-button (click)="wczytaj()">
          <span class="material-symbols-outlined">refresh</span> {{ 'Odśwież' | t }}</button>
      </div>
      @if (blad()) { <p class="zle">{{ blad() | t }}</p> }
      <pre class="karta mono log">@for (l of widoczne(); track $index) {{{ l }}
}</pre>
    </div>`,
  styles: `
    .narzedzia { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
    .narzedzia .material-symbols-outlined { vertical-align: middle; }
    .filtr { flex: 1; min-width: 200px; }
    .log { white-space: pre-wrap; word-break: break-word; max-height: calc(100vh - 260px); overflow: auto; margin: 0; }`,
})
export class Dziennik implements OnInit {
  private readonly api = inject(Api);
  protected readonly linie = signal<string[]>([]);
  protected readonly filtr = signal('');
  protected readonly ile = signal(300);
  protected readonly rodzaj = signal('messages');
  protected readonly blad = signal('');
  protected readonly widoczne = computed(() => {
    const f = this.filtr().toLowerCase();
    const l = [...this.linie()].reverse(); // najnowsze na górze
    return f ? l.filter(x => x.toLowerCase().includes(f)) : l;
  });

  ngOnInit(): void {
    this.wczytaj();
  }

  async wczytaj(): Promise<void> {
    try {
      this.linie.set((await this.api.get<{ linie: string[] }>('dziennik', { n: String(this.ile()), rodzaj: this.rodzaj() })).linie);
      this.blad.set('');
    } catch (e) {
      this.blad.set(komunikat(e));
    }
  }
}
