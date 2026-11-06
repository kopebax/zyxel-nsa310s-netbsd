import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Api, Komunikaty } from '../api';
import { I18n, TPipe } from '../i18n';

interface Cert { podmiot?: string; wazny_do?: string; nazwy?: string; odcisk?: string; }

@Component({
  selector: 'app-certyfikat',
  imports: [MatButtonModule, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Certyfikat SSL' | t }}</h1>
      @if (c(); as c) {
        <section class="karta">
          <h2><span class="material-symbols-outlined">verified_user</span>{{ 'Certyfikat panelu (własny)' | t }}</h2>
          <div class="wiersz"><span>{{ 'Podmiot' | t }}</span><span>{{ c.podmiot }}</span></div>
          <div class="wiersz"><span>{{ 'Nazwy' | t }}</span><span>{{ c.nazwy }}</span></div>
          <div class="wiersz"><span>{{ 'Ważny do' | t }}</span><span>{{ c.wazny_do }}</span></div>
          <div class="wiersz"><span>{{ 'Odcisk SHA-256' | t }}</span><span class="mono odcisk">{{ c.odcisk }}</span></div>
          <p class="podpowiedz">{{ 'Certyfikat jest wystawiony przez sam NAS, dlatego przeglądarka pokazuje ostrzeżenie. Porównaj odcisk z tym w przeglądarce. Nowy certyfikat jest potrzebny po zmianie adresu IP lub nazwy.' | t }}</p>
          <p class="podpowiedz">{{ 'Panel działa wyłącznie przez HTTPS – adres http:// przekierowuje na https://.' | t }}</p>
          <div class="przyciski"><button mat-stroked-button (click)="nowy()">{{ 'Wygeneruj nowy certyfikat' | t }}</button></div>
        </section>
      }
    </div>`,
  styles: `.odcisk { word-break: break-all; font-size: 11px; max-width: 60%; }`,
})
export class Certyfikat implements OnInit {
  private readonly api = inject(Api);
  private readonly kom = inject(Komunikaty);
  private readonly i18n = inject(I18n);
  protected readonly c = signal<Cert | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.c.set(await this.api.get<Cert>('certyfikat'));
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async nowy(): Promise<void> {
    if (!confirm(this.i18n.t('Wygenerować nowy certyfikat? Panel uruchomi się ponownie, a przeglądarka znów pokaże ostrzeżenie.'))) return;
    try {
      await this.api.post('certyfikat');
      this.kom.ok('Nowy certyfikat – odśwież stronę za kilka sekund');
    } catch (e) {
      this.kom.blad(e);
    }
  }
}
