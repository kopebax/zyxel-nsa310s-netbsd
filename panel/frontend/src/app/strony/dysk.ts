import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { Api, Komunikaty, Smart, komunikat } from '../api';
import { I18n, TPipe } from '../i18n';

@Component({
  selector: 'app-dysk',
  imports: [MatTableModule, MatProgressBarModule, MatButtonModule, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Dysk i SMART' | t }}</h1>
      @if (ladowanie()) { <mat-progress-bar mode="indeterminate" /> }
      @if (blad()) { <p class="zle">{{ blad() | t }}</p> }
      @if (s(); as s) {
        <div class="siatka">
          <section class="karta">
            <h2><span class="material-symbols-outlined">hard_drive</span>{{ 'Dysk SATA' | t }}</h2>
            <div class="wiersz"><span>{{ 'Model' | t }}</span><span>{{ s.model }}</span></div>
            <div class="wiersz"><span>{{ 'Numer seryjny' | t }}</span><span class="mono">{{ s.numer }}</span></div>
            <div class="wiersz"><span>{{ 'Pojemność' | t }}</span><span>{{ s.pojemnosc }}</span></div>
          </section>
          <section class="karta">
            <h2><span class="material-symbols-outlined">health_and_safety</span>{{ 'Stan' | t }}</h2>
            <div class="wiersz"><span>{{ 'Ocena SMART' | t }}</span>
              <span [class.ok]="s.zdrowie === 'PASSED'" [class.zle]="s.zdrowie !== 'PASSED'">
                {{ s.zdrowie === 'PASSED' ? ('dobry (PASSED)' | t) : (s.zdrowie ?? ('brak danych' | t)) }}</span></div>
            <div class="wiersz"><span>{{ 'Temperatura' | t }}</span>
              <span [class.zle]="(s.temperatura ?? 0) >= 50">{{ s.temperatura ?? '—' }} °C</span></div>
          </section>
          <section class="karta">
            <h2><span class="material-symbols-outlined">fact_check</span>{{ 'Testy' | t }}</h2>
            @for (t of s.testy.slice(0, 3); track t.nr) {
              <div class="wiersz"><span>{{ t.opis }}</span><span>{{ t.stan }}</span></div>
            } @empty { <p class="podpowiedz">{{ 'Brak wykonanych testów.' | t }}</p> }
            <div class="przyciski">
              <button mat-stroked-button (click)="testSmart()">{{ 'Krótki test SMART (2 min)' | t }}</button>
            </div>
          </section>
          <section class="karta">
            <h2><span class="material-symbols-outlined">build</span>{{ 'Sprawdzenie systemu plików' | t }}</h2>
            <p class="podpowiedz">{{ 'fsck odmontowuje /dysk i na czas sprawdzania zatrzymuje udziały (kilka–kilkanaście minut).' | t }}</p>
            @if (fsck().trwa) { <mat-progress-bar mode="indeterminate" /> }
            @if (fsck().dziennik) { <pre class="mono log">{{ fsck().dziennik }}</pre> }
            <div class="przyciski">
              <button mat-stroked-button (click)="uruchomFsck()" [disabled]="fsck().trwa">{{ 'Sprawdź dysk (fsck)' | t }}</button>
            </div>
          </section>
        </div>
        <section class="karta tabela">
          <h2><span class="material-symbols-outlined">table</span>{{ 'Atrybuty SMART' | t }}</h2>
          <table mat-table [dataSource]="s.atrybuty">
            <ng-container matColumnDef="id"><th mat-header-cell *matHeaderCellDef>ID</th>
              <td mat-cell *matCellDef="let a">{{ a.id }}</td></ng-container>
            <ng-container matColumnDef="nazwa"><th mat-header-cell *matHeaderCellDef>{{ 'Atrybut' | t }}</th>
              <td mat-cell *matCellDef="let a">{{ a.nazwa.replaceAll('_', ' ') }}</td></ng-container>
            <ng-container matColumnDef="wartosc"><th mat-header-cell *matHeaderCellDef>{{ 'Wartość' | t }}</th>
              <td mat-cell *matCellDef="let a" [class.zle]="a.prog > 0 && a.wartosc <= a.prog">{{ a.wartosc }}</td></ng-container>
            <ng-container matColumnDef="prog"><th mat-header-cell *matHeaderCellDef>{{ 'Próg' | t }}</th>
              <td mat-cell *matCellDef="let a">{{ a.prog }}</td></ng-container>
            <ng-container matColumnDef="surowa"><th mat-header-cell *matHeaderCellDef>{{ 'Surowa' | t }}</th>
              <td mat-cell *matCellDef="let a" class="mono">{{ a.surowa }}</td></ng-container>
            <tr mat-header-row *matHeaderRowDef="kolumny"></tr>
            <tr mat-row *matRowDef="let r; columns: kolumny"></tr>
          </table>
        </section>
      }
    </div>`,
  styles: `.tabela { margin-top: 16px; overflow-x: auto; } .log { white-space: pre-wrap; max-height: 160px; overflow: auto; font-size: 12px; }`,
})
export class DyskStrona implements OnInit, OnDestroy {
  private readonly api = inject(Api);
  protected readonly s = signal<Smart | null>(null);
  protected readonly ladowanie = signal(true);
  protected readonly blad = signal('');
  protected readonly kolumny = ['id', 'nazwa', 'wartosc', 'prog', 'surowa'];

  private readonly kom = inject(Komunikaty);
  private readonly i18n = inject(I18n);
  protected readonly fsck = signal<{ trwa: boolean; dziennik: string }>({ trwa: false, dziennik: '' });
  private timer?: ReturnType<typeof setInterval>;

  async ngOnInit(): Promise<void> {
    try {
      this.s.set(await this.api.get<Smart>('smart'));
      await this.stanFsck();
    } catch (e) {
      this.blad.set(komunikat(e));
    } finally {
      this.ladowanie.set(false);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  private async stanFsck(): Promise<void> {
    const f = await this.api.get<{ trwa: boolean; dziennik: string }>('fsck');
    this.fsck.set(f);
    if (f.trwa && !this.timer) this.timer = setInterval(() => this.stanFsck(), 5000);
    if (!f.trwa && this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }

  async testSmart(): Promise<void> {
    try {
      await this.api.post('smart_test');
      this.kom.ok('Test SMART uruchomiony – wynik za ok. 2 minuty (odśwież stronę)');
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async uruchomFsck(): Promise<void> {
    if (!confirm(this.i18n.t('Sprawdzić dysk? /dysk zostanie odmontowany, a udziały zatrzymane na czas sprawdzania.'))) return;
    try {
      await this.api.post('fsck');
      this.kom.ok('Sprawdzanie rozpoczęte');
      setTimeout(() => this.stanFsck(), 2000);
    } catch (e) {
      this.kom.blad(e);
    }
  }
}
