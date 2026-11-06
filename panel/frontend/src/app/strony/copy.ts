import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { Api, Komunikaty } from '../api';
import { TPipe } from '../i18n';

interface Konf { cel: string; tryb: 'kopia' | 'synchronizacja'; dziennik: string; }

@Component({
  selector: 'app-copy',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatRadioModule, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Przycisk COPY' | t }}</h1>
      <div class="siatka">
        <section class="karta">
          <h2><span class="material-symbols-outlined">usb</span>{{ 'Kopiowanie z USB' | t }}</h2>
          <p>{{ 'Po włożeniu pendrive’a lub dysku USB do portu z przodu naciśnij przycisk COPY – zawartość zostanie skopiowana na NAS. Dioda COPY miga w trakcie, świeci na zielono po sukcesie, na czerwono po błędzie.' | t }}</p>
          <mat-form-field appearance="outline" class="pelne">
            <mat-label>{{ 'Katalog docelowy' | t }}</mat-label>
            <span matTextPrefix>/dysk/</span>
            <input matInput [(ngModel)]="cel" pattern="[A-Za-z0-9._/-]+">
          </mat-form-field>
          <mat-radio-group [(ngModel)]="tryb" class="radio">
            <mat-radio-button value="kopia">{{ 'Kopia – za każdym razem nowy katalog z datą' | t }}</mat-radio-button>
            <mat-radio-button value="synchronizacja">{{ 'Synchronizacja – lustro w jednym katalogu (usunięte z USB znikają)' | t }}</mat-radio-button>
          </mat-radio-group>
          <div class="przyciski">
            <button mat-flat-button (click)="zapisz()">{{ 'Zapisz' | t }}</button>
            <button mat-stroked-button (click)="uruchom()">{{ 'Kopiuj teraz' | t }}</button>
          </div>
        </section>
        <section class="karta">
          <h2><span class="material-symbols-outlined">receipt_long</span>{{ 'Ostatnie kopiowania' | t }}</h2>
          <pre class="mono log">{{ dziennik() || ('brak' | t) }}</pre>
          <div class="przyciski"><button mat-button (click)="wczytaj()">{{ 'Odśwież' | t }}</button></div>
        </section>
      </div>
    </div>`,
  styles: `.radio { display: flex; flex-direction: column; gap: 4px; }
    .log { white-space: pre-wrap; max-height: 320px; overflow: auto; font-size: 12px; margin: 0; }`,
})
export class CopyStrona implements OnInit {
  private readonly api = inject(Api);
  private readonly kom = inject(Komunikaty);
  protected readonly dziennik = signal('');
  protected cel = 'USB-kopie';
  protected tryb: 'kopia' | 'synchronizacja' = 'kopia';

  ngOnInit(): void {
    this.wczytaj();
  }

  async wczytaj(): Promise<void> {
    try {
      const k = await this.api.get<Konf>('copy');
      this.cel = k.cel.replace(/^\/dysk\//, '');
      this.tryb = k.tryb;
      this.dziennik.set(k.dziennik);
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async zapisz(): Promise<void> {
    try {
      await this.api.post('copy', { cel: '/dysk/' + this.cel, tryb: this.tryb });
      this.kom.ok('Zapisano');
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async uruchom(): Promise<void> {
    try {
      await this.api.post('copy', { akcja: 'uruchom' });
      this.kom.ok('Kopiowanie rozpoczęte');
      setTimeout(() => this.wczytaj(), 5000);
    } catch (e) {
      this.kom.blad(e);
    }
  }
}
