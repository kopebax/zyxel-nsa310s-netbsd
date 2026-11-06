import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Api, Grupa, Komunikaty, Prawo, Udzial, Uzytkownik } from '../api';
import { I18n, TPipe } from '../i18n';

const IP = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
type Dostep = Prawo | 'brak';

@Component({
  selector: 'app-udzialy',
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatChipsModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatSlideToggleModule, MatTooltipModule, TPipe],
  template: `
    <div class="strona">
      <h1>{{ 'Udziały' | t }}</h1>
      @if (!samba()) {
        <div class="info">{{ 'Samba (udziały dla Windows/macOS) nie jest zainstalowana – ustawienia SMB nie działają. Udziały są dostępne przez NFS i w przeglądarce plików.' | t }}</div>
      }
      @for (u of lista(); track $index; let i = $index) {
        <section class="karta udzial">
          <div class="naglowek">
            <span class="material-symbols-outlined">folder_shared</span>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nazwa">
              <mat-label>{{ 'Nazwa udziału' | t }}</mat-label>
              <input matInput [(ngModel)]="u.nazwa" pattern="[A-Za-z0-9][A-Za-z0-9._-]*" [readonly]="!nowe.has(u)">
              <mat-hint>/dysk/{{ u.nazwa }}</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="wlasciciel">
              <mat-label>{{ 'Właściciel' | t }}</mat-label>
              <mat-select [(ngModel)]="u.wlasciciel">
                @for (x of uzytkownicy(); track x.nazwa) { <mat-option [value]="x.nazwa">{{ x.nazwa }}</mat-option> }
              </mat-select>
            </mat-form-field>
            <button mat-icon-button [matTooltip]="'Usuń udział (pliki zostają na dysku)' | t" (click)="usun(i)">
              <span class="material-symbols-outlined">delete</span></button>
          </div>

          <h3>{{ 'Prawa dostępu' | t }}</h3>
          <div class="prawa">
            @for (k of kto(); track k.klucz) {
              <div class="prawo">
                <span><span class="material-symbols-outlined">{{ k.grupa ? 'group' : 'person' }}</span>{{ k.nazwa }}</span>
                <mat-button-toggle-group [value]="dostep(u, k.klucz)" (change)="ustawDostep(u, k.klucz, $event.value)" hideSingleSelectionIndicator>
                  <mat-button-toggle value="rw">{{ 'Pełny' | t }}</mat-button-toggle>
                  <mat-button-toggle value="ro">{{ 'Odczyt' | t }}</mat-button-toggle>
                  <mat-button-toggle value="brak">{{ 'Brak' | t }}</mat-button-toggle>
                </mat-button-toggle-group>
              </div>
            }
          </div>
          <p class="podpowiedz">{{ 'Administratorzy mają zawsze pełny dostęp w panelu. Prawa dotyczą Samby i przeglądarki plików.' | t }}</p>

          <div class="opcje">
            <mat-slide-toggle [(ngModel)]="u.smb">{{ 'Udostępniaj przez SMB (Windows, macOS)' | t }}</mat-slide-toggle>
            <mat-slide-toggle [(ngModel)]="u.kosz">{{ 'Kosz (usunięte przez SMB pliki trafiają do .recycle)' | t }}</mat-slide-toggle>
            <mat-slide-toggle [ngModel]="!!u.nfs" (ngModelChange)="u.nfs = $event ? { tryb: 'rw', klienci: [] } : null">
              {{ 'Udostępniaj przez NFS (Linux, dostęp po adresie IP)' | t }}</mat-slide-toggle>
          </div>
          @if (u.nfs; as nfs) {
            <div class="nfs">
              <mat-button-toggle-group [(ngModel)]="nfs.tryb" hideSingleSelectionIndicator>
                <mat-button-toggle value="rw">{{ 'Odczyt i zapis' | t }}</mat-button-toggle>
                <mat-button-toggle value="ro">{{ 'Tylko odczyt' | t }}</mat-button-toggle>
              </mat-button-toggle-group>
              <mat-form-field appearance="outline" class="pelne">
                <mat-label>{{ 'Komputery NFS (IP albo sieć CIDR) – Enter dodaje' | t }}</mat-label>
                <mat-chip-grid #siatka>
                  @for (k of nfs.klienci; track k) {
                    <mat-chip-row (removed)="nfs.klienci = nfs.klienci.filter(x => x !== k)">{{ k }}
                      <button matChipRemove><span class="material-symbols-outlined">cancel</span></button>
                    </mat-chip-row>
                  }
                  <input [matChipInputFor]="siatka" (matChipInputTokenEnd)="dodajKlienta(nfs.klienci, $event)">
                </mat-chip-grid>
              </mat-form-field>
              <div class="podpowiedz mono">mount -t nfs -o vers=3 {{ ip }}:/dysk/{{ u.nazwa }} /mnt/nas</div>
            </div>
          }
        </section>
      }
      <div class="przyciski">
        <button mat-stroked-button (click)="dodaj()"><span class="material-symbols-outlined">add</span> {{ 'Nowy udział' | t }}</button>
        <button mat-flat-button (click)="zapisz()" [disabled]="praca()">{{ 'Zapisz' | t }}</button>
      </div>
    </div>`,
  styles: `
    .udzial { margin-bottom: 16px; }
    .naglowek { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
    .naglowek > .material-symbols-outlined { color: var(--mat-sys-primary); }
    .nazwa { flex: 1; min-width: 180px; } .wlasciciel { width: 170px; }
    h3 { font: var(--mat-sys-title-small); margin: 20px 0 8px; }
    .prawa { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); }
    .prawo { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .prawo > span { display: flex; align-items: center; gap: 6px; }
    .opcje { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
    .nfs { margin-top: 12px; display: flex; flex-direction: column; gap: 12px; }`,
})
export class Udzialy implements OnInit {
  private readonly api = inject(Api);
  private readonly kom = inject(Komunikaty);
  private readonly i18n = inject(I18n);
  protected readonly lista = signal<Udzial[]>([]);
  protected readonly uzytkownicy = signal<Uzytkownik[]>([]);
  protected readonly grupyL = signal<Grupa[]>([]);
  protected readonly samba = signal(true);
  protected readonly praca = signal(false);
  protected readonly nowe = new Set<Udzial>();
  protected readonly ip = location.hostname;

  // wiersze tabeli praw: wszyscy użytkownicy i grupy
  protected kto(): { klucz: string; nazwa: string; grupa: boolean }[] {
    return [
      ...this.uzytkownicy().map(u => ({ klucz: 'u:' + u.nazwa, nazwa: u.nazwa, grupa: false })),
      ...this.grupyL().map(g => ({ klucz: 'g:' + g.nazwa, nazwa: g.nazwa, grupa: true })),
    ];
  }

  async ngOnInit(): Promise<void> {
    try {
      const [d, u, g] = await Promise.all([
        this.api.get<{ udzialy: Udzial[]; samba: boolean }>('udzialy'),
        this.api.get<{ uzytkownicy: Uzytkownik[] }>('uzytkownicy'),
        this.api.get<{ grupy: Grupa[] }>('grupy')]);
      this.lista.set(d.udzialy);
      this.samba.set(d.samba);
      this.uzytkownicy.set(u.uzytkownicy);
      this.grupyL.set(g.grupy);
    } catch (e) {
      this.kom.blad(e);
    }
  }

  protected dostep(u: Udzial, klucz: string): Dostep {
    const [t, n] = klucz.split(':');
    return u.prawa.find(p => p.nazwa === n && p.typ === (t === 'g' ? 'grupa' : 'uzytkownik'))?.prawo ?? 'brak';
  }

  protected ustawDostep(u: Udzial, klucz: string, d: Dostep): void {
    const [t, n] = klucz.split(':');
    const typ = t === 'g' ? 'grupa' : 'uzytkownik';
    u.prawa = u.prawa.filter(p => !(p.nazwa === n && p.typ === typ));
    if (d !== 'brak') u.prawa.push({ typ, nazwa: n, prawo: d });
  }

  protected dodaj(): void {
    const u: Udzial = { nazwa: 'Nowy', sciezka: '', wlasciciel: this.api.uzytkownik() || 'admin', kosz: true, smb: true,
      prawa: [{ typ: 'uzytkownik', nazwa: this.api.uzytkownik() || 'admin', prawo: 'rw' }], nfs: null };
    this.nowe.add(u);
    this.lista.update(l => [...l, u]);
  }

  protected usun(i: number): void {
    if (!confirm(this.i18n.t('Usunąć udział? Pliki zostają na dysku w /dysk.'))) return;
    this.lista.update(l => l.filter((_, j) => j !== i));
  }

  protected dodajKlienta(k: string[], e: MatChipInputEvent): void {
    const v = (e.value || '').trim();
    if (!v) return;
    if (!IP.test(v)) { this.kom.ok('Podaj adres IP albo sieć CIDR, np. 192.168.0.0/24'); return; }
    if (!k.includes(v)) k.push(v);
    e.chipInput.clear();
  }

  async zapisz(): Promise<void> {
    const l = this.lista();
    if (l.some(u => u.nfs && u.nfs.klienci.length === 0)) { this.kom.ok('Udział z NFS musi mieć co najmniej jeden adres'); return; }
    const w: string[] = [];
    for (const u of l) {
      w.push(`udzial ${u.nazwa} wlasciciel=${u.wlasciciel} kosz=${u.kosz ? 'tak' : 'nie'} smb=${u.smb ? 'tak' : 'nie'}`);
      if (u.prawa.length) w.push(`prawa ${u.nazwa} ` + u.prawa.map(p => `${p.typ === 'grupa' ? 'g' : 'u'}:${p.nazwa}=${p.prawo}`).join(' '));
      if (u.nfs) w.push(`nfs ${u.nazwa} ${u.nfs.tryb} ${u.nfs.klienci.join(',')}`);
    }
    this.praca.set(true);
    try {
      await this.api.post('udzialy', { dane: w.join('\n') });
      this.nowe.clear();
      this.kom.ok('Zapisano udziały');
    } catch (e) {
      this.kom.blad(e);
    } finally {
      this.praca.set(false);
    }
  }
}
