import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { Api, Komunikaty, Siec } from '../api';
import { I18n, TPipe } from '../i18n';

@Component({
  selector: 'app-siec',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatRadioModule, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Sieć TCP/IP' | t }}</h1>
      @if (s(); as s) {
        @if (s.oczekuje_potwierdzenia) {
          <div class="ostrzezenie">
            <span class="material-symbols-outlined">timer</span>
            <span>{{ 'Nowa konfiguracja sieci czeka na potwierdzenie. Bez niego NAS wróci do poprzedniej po 3 minutach.' | t }}</span>
            <button mat-flat-button (click)="potwierdz()">{{ 'Potwierdź' | t }}</button>
          </div>
        }
        <div class="siatka">
          <section class="karta">
            <h2><span class="material-symbols-outlined">lan</span>{{ 'Obecnie' | t }}</h2>
            <div class="wiersz"><span>{{ 'Adres IP' | t }}</span><span>{{ s.ip }}/{{ s.maska }}</span></div>
            <div class="wiersz"><span>{{ 'Brama' | t }}</span><span>{{ s.brama }}</span></div>
            <div class="wiersz"><span>DNS</span><span>{{ s.dns.join(', ') }}</span></div>
            <div class="wiersz"><span>{{ 'Adres MAC' | t }}</span><span class="mono">{{ s.mac }}</span></div>
            <div class="wiersz"><span>{{ 'Łącze' | t }}</span><span>{{ s.media }}</span></div>
            <div class="wiersz"><span>{{ 'Konfiguracja' | t }}</span><span>{{ (s.dhcp ? 'automatyczna (DHCP)' : 'statyczna') | t }}</span></div>
          </section>

          <section class="karta">
            <h2><span class="material-symbols-outlined">edit</span>{{ 'Zmień' | t }}</h2>
            <mat-radio-group [(ngModel)]="tryb" class="radio">
              <mat-radio-button value="dhcp">{{ 'Automatycznie (DHCP)' | t }}</mat-radio-button>
              <mat-radio-button value="static">{{ 'Adres statyczny' | t }}</mat-radio-button>
            </mat-radio-group>
            @if (tryb === 'static') {
              <mat-form-field appearance="outline" class="pelne">
                <mat-label>{{ 'Adres IP / prefiks' | t }}</mat-label><input matInput [(ngModel)]="adres" placeholder="192.168.0.2/24">
              </mat-form-field>
              <mat-form-field appearance="outline" class="pelne">
                <mat-label>{{ 'Brama' | t }}</mat-label><input matInput [(ngModel)]="brama">
              </mat-form-field>
              <mat-form-field appearance="outline" class="pelne">
                <mat-label>{{ 'Serwer DNS' | t }}</mat-label><input matInput [(ngModel)]="dns">
              </mat-form-field>
            }
            <p class="podpowiedz">{{ 'Po zapisaniu otwórz panel pod nowym adresem i potwierdź zmianę w ciągu 3 minut – inaczej NAS sam przywróci poprzednie ustawienia.' | t }}</p>
            <div class="przyciski"><button mat-flat-button (click)="zapisz()">{{ 'Zastosuj' | t }}</button></div>
          </section>
        </div>
      }
    </div>`,
  styles: `.radio { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }`,
})
export class SiecStrona implements OnInit {
  private readonly api = inject(Api);
  private readonly kom = inject(Komunikaty);
  private readonly i18n = inject(I18n);
  protected readonly s = signal<Siec | null>(null);
  protected tryb: 'dhcp' | 'static' = 'dhcp';
  protected adres = '';
  protected brama = '';
  protected dns = '';

  async ngOnInit(): Promise<void> {
    await this.wczytaj();
  }

  private async wczytaj(): Promise<void> {
    try {
      const s = await this.api.get<Siec>('siec');
      this.s.set(s);
      this.tryb = s.dhcp ? 'dhcp' : 'static';
      this.adres = s.statyczny ?? `${s.ip}/${s.maska}`;
      this.brama = s.brama ?? '';
      this.dns = s.dns[0] ?? '';
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async zapisz(): Promise<void> {
    if (!confirm(this.i18n.t('Zmienić konfigurację sieci? Połączenie z panelem może się przerwać.'))) return;
    try {
      await this.api.post('siec', this.tryb === 'dhcp' ? { tryb: 'dhcp' }
        : { tryb: 'static', adres: this.adres, brama: this.brama, dns: this.dns });
      this.kom.ok('Zastosowano – potwierdź z nowego adresu w ciągu 3 minut');
      setTimeout(() => this.wczytaj(), 4000);
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async potwierdz(): Promise<void> {
    try {
      await this.api.post('siec', { tryb: 'potwierdz' });
      this.kom.ok('Konfiguracja sieci potwierdzona');
      await this.wczytaj();
    } catch (e) {
      this.kom.blad(e);
    }
  }
}
