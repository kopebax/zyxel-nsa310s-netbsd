import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { Api, Komunikaty } from '../api';
import { TPipe } from '../i18n';

interface Stan { aktywna: boolean; dom: string[]; nfs: string[]; klient: string; }

@Component({
  selector: 'app-zapora',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, RouterLink, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Zapora (npf)' | t }}</h1>
      @if (s(); as s) {
        <div class="siatka">
          <section class="karta">
            <h2><span class="material-symbols-outlined">shield</span>{{ 'Stan' | t }}</h2>
            <div class="wiersz"><span>{{ 'Zapora' | t }}</span><span [class.ok]="s.aktywna" [class.zle]="!s.aktywna">
              {{ (s.aktywna ? 'włączona' : 'wyłączona') | t }}</span></div>
            <div class="wiersz"><span>{{ 'Twój komputer' | t }}</span><span class="mono">{{ s.klient }}</span></div>
            <p class="podpowiedz">{{ 'Wszystko, czego nie ma na listach, jest blokowane. Ping jest zawsze dozwolony.' | t }}</p>
          </section>

          <section class="karta">
            <h2><span class="material-symbols-outlined">admin_panel_settings</span>{{ 'Dostęp do SSH i panelu' | t }}</h2>
            <mat-form-field appearance="outline" class="pelne">
              <mat-label>{{ 'Sieci i adresy – jeden w wierszu' | t }}</mat-label>
              <textarea matInput class="mono" rows="5" [(ngModel)]="dom"></textarea>
              <mat-hint>{{ 'np. 192.168.0.0/24 albo 192.168.0.20' | t }}</mat-hint>
            </mat-form-field>
            <p class="podpowiedz">{{ 'Zmiana, która odcięłaby Twój komputer, zostanie odrzucona.' | t }}</p>
            <div class="przyciski"><button mat-flat-button (click)="zapisz()">{{ 'Zapisz' | t }}</button></div>
          </section>

          <section class="karta">
            <h2><span class="material-symbols-outlined">folder_shared</span>{{ 'Dostęp do NFS' | t }}</h2>
            @for (a of s.nfs; track a) { <div class="wiersz"><span class="mono">{{ a }}</span><span></span></div> }
            <p class="podpowiedz">{{ 'Lista tworzona automatycznie z adresów NFS w udziałach.' | t }} <a routerLink="/udzialy">{{ 'Udziały' | t }}</a></p>
          </section>
        </div>
      }
    </div>`,
})
export class Zapora implements OnInit {
  private readonly api = inject(Api);
  private readonly kom = inject(Komunikaty);
  protected readonly s = signal<Stan | null>(null);
  protected dom = '';

  ngOnInit(): void {
    this.wczytaj();
  }

  private async wczytaj(): Promise<void> {
    try {
      const s = await this.api.get<Stan>('zapora');
      this.s.set(s);
      this.dom = s.dom.join('\n');
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async zapisz(): Promise<void> {
    try {
      await this.api.post('zapora', { dom: this.dom });
      this.kom.ok('Zapisano reguły zapory');
      await this.wczytaj();
    } catch (e) {
      this.kom.blad(e);
    }
  }
}
