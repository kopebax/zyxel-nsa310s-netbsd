import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Api, Komunikaty } from '../api';
import { I18n, TPipe } from '../i18n';

interface Raport {
  nazwa?: string; data?: number; system?: string; plikow?: number;
  zmiany: { typ: 'nowy' | 'zmieniony'; plik: string }[];
  przywrocono?: number; kopia_poprzedniej?: string;
}

@Component({
  selector: 'app-kopia',
  imports: [MatButtonModule, MatProgressBarModule, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Kopia konfiguracji' | t }}</h1>
      <div class="siatka">
        <section class="karta">
          <h2><span class="material-symbols-outlined">download</span>{{ 'Pobierz kopię' | t }}</h2>
          <p>{{ 'Archiwum .tar.gz z katalogów /etc i /usr/pkg/etc: udziały, zapora, harmonogram, usługi, konta, ustawienia panelu.' | t }}</p>
          <p class="podpowiedz">{{ 'Bez sekretów: kluczy SSH serwera, klucza certyfikatu, haseł panelu i kont.' | t }}</p>
          <div class="przyciski">
            <a mat-flat-button href="/api/kopia" download><span class="material-symbols-outlined">download</span> {{ 'Pobierz' | t }}</a>
          </div>
        </section>

        <section class="karta">
          <h2><span class="material-symbols-outlined">upload</span>{{ 'Przywróć z pliku' | t }}</h2>
          <p>{{ 'Wybierz plik kopii pobrany z tego panelu. Przed przywróceniem zostanie sprawdzony i zobaczysz listę zmian.' | t }}</p>
          <div class="przyciski">
            <button mat-stroked-button (click)="wybor.click()" [disabled]="praca()"><span class="material-symbols-outlined">attach_file</span> {{ 'Wybierz plik…' | t }}</button>
            <input #wybor type="file" accept=".gz,.tgz,application/gzip" hidden (change)="sprawdz(wybor.files?.[0]); wybor.value = ''">
          </div>
          @if (praca()) { <mat-progress-bar mode="indeterminate" class="odstep-gora" /> }
        </section>
      </div>

      @if (raport(); as r) {
        <section class="karta odstep-gora">
          @if (r.przywrocono !== undefined) {
            <h2><span class="material-symbols-outlined ok">check_circle</span>{{ 'Przywrócono' | t }}</h2>
            <p>{{ 'Przywrócono plików: {0}. Kopia poprzednich ustawień:' | t: r.przywrocono }} <span class="mono">{{ r.kopia_poprzedniej }}</span></p>
            <p class="podpowiedz">{{ 'Uruchom NAS ponownie (Zasilanie), aby wszystkie usługi wczytały przywrócone ustawienia.' | t }}</p>
          } @else {
            <h2><span class="material-symbols-outlined ok">verified</span>{{ 'Plik poprawny' | t }}</h2>
            <div class="wiersz"><span>{{ 'Urządzenie' | t }}</span><span>{{ r.nazwa }}</span></div>
            <div class="wiersz"><span>{{ 'Data kopii' | t }}</span><span>{{ r.data ? i18n.data(r.data) : '—' }}</span></div>
            <div class="wiersz"><span>{{ 'System' | t }}</span><span>{{ r.system }}</span></div>
            <div class="wiersz"><span>{{ 'Plików w kopii' | t }}</span><span>{{ r.plikow }}</span></div>
            <h3>{{ 'Zmiany względem obecnych ustawień' | t }} ({{ r.zmiany.length }})</h3>
            @for (z of r.zmiany; track z.plik) {
              <div class="mono"><span [class.ok]="z.typ === 'nowy'">{{ (z.typ === 'nowy' ? 'nowy' : 'zmieniony') | t }}</span> /{{ z.plik }}</div>
            } @empty { <p class="podpowiedz">{{ 'Kopia jest identyczna z obecnymi ustawieniami.' | t }}</p> }
            <p class="podpowiedz">{{ 'Nie są przywracane: konta i hasła, klucze SSH, certyfikat, /etc/fstab. Obecne ustawienia zostaną najpierw zapisane w /var/backups/nas-panel.' | t }}</p>
            <div class="przyciski">
              <button mat-flat-button (click)="przywroc()" [disabled]="praca() || r.zmiany.length === 0">{{ 'Przywróć' | t }}</button>
              <button mat-button (click)="raport.set(null)">{{ 'Anuluj' | t }}</button>
            </div>
          }
        </section>
      }
    </div>`,
  styles: `h3 { font: var(--mat-sys-title-small); margin: 16px 0 8px; }`,
})
export class Kopia {
  private readonly api = inject(Api);
  private readonly kom = inject(Komunikaty);
  protected readonly i18n = inject(I18n);
  protected readonly praca = signal(false);
  protected readonly raport = signal<Raport | null>(null);
  private id = '';

  async sprawdz(plik: File | undefined): Promise<void> {
    if (!plik) return;
    if (plik.size > 20 * 1024 * 1024) { this.kom.ok('Plik za duży (maks. 20 MB)'); return; }
    this.praca.set(true);
    this.raport.set(null);
    try {
      this.id = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
      await this.api.wyslijPlik('wgraj', plik, { id: this.id });
      this.raport.set(await this.api.post<Raport>('kopia_sprawdz', { id: this.id }));
    } catch (e) {
      this.kom.blad(e);
    } finally {
      this.praca.set(false);
    }
  }

  async przywroc(): Promise<void> {
    if (!confirm(this.i18n.t('Przywrócić ustawienia z tej kopii?'))) return;
    this.praca.set(true);
    try {
      this.raport.set(await this.api.post<Raport>('kopia_przywroc', { id: this.id }));
    } catch (e) {
      this.kom.blad(e);
    } finally {
      this.praca.set(false);
    }
  }
}
