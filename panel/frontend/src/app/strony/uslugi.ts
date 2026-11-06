import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Api, Komunikaty, Usluga } from '../api';
import { TPipe } from '../i18n';

const OPISY: Record<string, { nazwa: string; opis: string }> = {
  nfs: { nazwa: 'NFS', opis: 'udziały plików dla Linuksa (rpcbind, mountd, nfsd)' },
  samba: { nazwa: 'Samba (SMB)', opis: 'udziały plików dla Windows i macOS' },
  ntpd: { nazwa: 'NTP', opis: 'synchronizacja czasu' },
  sshd: { nazwa: 'SSH', opis: 'zdalne logowanie (tylko restart)' },
  powerd: { nazwa: 'powerd', opis: 'obsługa przycisków power/reset/copy' },
  cron: { nazwa: 'cron', opis: 'harmonogram, strażnik temperatury' },
  naspanel: { nazwa: 'Panel WWW', opis: 'ten panel (tylko restart)' },
};

@Component({
  selector: 'app-uslugi',
  imports: [MatButtonModule, MatSlideToggleModule, MatTableModule, MatTooltipModule, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Usługi' | t }}</h1>
      <section class="karta">
        <table mat-table [dataSource]="u()">
          <ng-container matColumnDef="nazwa"><th mat-header-cell *matHeaderCellDef>{{ 'Usługa' | t }}</th>
            <td mat-cell *matCellDef="let x"><b>{{ opis(x).nazwa | t }}</b><br><small>{{ opis(x).opis | t }}</small></td></ng-container>
          <ng-container matColumnDef="stan"><th mat-header-cell *matHeaderCellDef>{{ 'Stan' | t }}</th>
            <td mat-cell *matCellDef="let x"><span [class.ok]="x.dziala" [class.zle]="!x.dziala">
              {{ (x.dziala ? 'działa' : 'zatrzymana') | t }}</span></td></ng-container>
          <ng-container matColumnDef="autostart"><th mat-header-cell *matHeaderCellDef>{{ 'Przy starcie' | t }}</th>
            <td mat-cell *matCellDef="let x">
              <mat-slide-toggle [checked]="x.autostart" [disabled]="staly(x) || praca()"
                (change)="autostart(x, $event.checked)" /></td></ng-container>
          <ng-container matColumnDef="akcje"><th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let x" class="akcje">
              @if (!x.dziala) {
                <button mat-icon-button [matTooltip]="'Uruchom' | t" (click)="akcja(x, 'start')" [disabled]="praca()">
                  <span class="material-symbols-outlined">play_arrow</span></button>
              } @else if (!staly(x)) {
                <button mat-icon-button [matTooltip]="'Zatrzymaj' | t" (click)="akcja(x, 'stop')" [disabled]="praca()">
                  <span class="material-symbols-outlined">stop</span></button>
              }
              <button mat-icon-button [matTooltip]="'Uruchom ponownie' | t" (click)="akcja(x, 'restart')" [disabled]="praca()">
                <span class="material-symbols-outlined">restart_alt</span></button>
            </td></ng-container>
          <tr mat-header-row *matHeaderRowDef="kolumny"></tr>
          <tr mat-row *matRowDef="let r; columns: kolumny"></tr>
        </table>
      </section>
    </div>`,
  styles: `.akcje { text-align: right; white-space: nowrap; } small { color: var(--mat-sys-on-surface-variant); }`,
})
export class Uslugi implements OnInit {
  private readonly api = inject(Api);
  private readonly kom = inject(Komunikaty);
  protected readonly u = signal<Usluga[]>([]);
  protected readonly praca = signal(false);
  protected readonly kolumny = ['nazwa', 'stan', 'autostart', 'akcje'];

  ngOnInit(): void {
    this.wczytaj();
  }

  protected opis(x: Usluga) {
    return OPISY[x.nazwa] ?? { nazwa: x.nazwa, opis: '' };
  }

  protected staly(x: Usluga): boolean {
    return x.nazwa === 'sshd' || x.nazwa === 'naspanel';
  }

  private async wczytaj(): Promise<void> {
    try {
      this.u.set((await this.api.get<{ uslugi: Usluga[] }>('uslugi')).uslugi);
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async akcja(x: Usluga, a: 'start' | 'stop' | 'restart'): Promise<void> {
    this.praca.set(true);
    try {
      await this.api.post('uslugi', { nazwa: x.nazwa, akcja: a });
      this.kom.ok(a === 'start' ? 'Uruchomiono' : a === 'stop' ? 'Zatrzymano' : 'Uruchomiono ponownie');
      if (x.nazwa === 'naspanel') await new Promise(r => setTimeout(r, 3000));
      await this.wczytaj();
    } catch (e) {
      this.kom.blad(e);
    } finally {
      this.praca.set(false);
    }
  }

  async autostart(x: Usluga, wl: boolean): Promise<void> {
    try {
      await this.api.post('uslugi', { nazwa: x.nazwa, akcja: wl ? 'wlacz_autostart' : 'wylacz_autostart' });
      this.kom.ok(wl ? 'Usługa będzie uruchamiana przy starcie' : 'Usługa nie będzie uruchamiana przy starcie');
      await this.wczytaj();
    } catch (e) {
      this.kom.blad(e);
    }
  }
}
