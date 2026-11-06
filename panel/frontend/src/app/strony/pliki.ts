import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Api, Komunikaty, Plik, Prawo, bajty } from '../api';
import { I18n, TPipe } from '../i18n';

interface Wysylanie { nazwa: string; rozmiar: number; wyslano: number; }

@Component({
  selector: 'app-pliki',
  imports: [MatButtonModule, MatProgressBarModule, MatTooltipModule, TPipe],
  template: `
    <div class="strona" (dragover)="$event.preventDefault(); przeciaganie.set(!!udzial() && prawo() === 'rw')"
         (dragleave)="przeciaganie.set(false)" (drop)="upusc($event)">
      <h1>{{ 'Przeglądarka plików' | t }}</h1>

      <nav class="sciezka">
        <button mat-button (click)="otworzUdzial('')"><span class="material-symbols-outlined">home</span> {{ 'Udziały' | t }}</button>
        @if (udzial()) {
          <span>›</span><button mat-button (click)="idz('')">{{ udzial() }}</button>
          @for (c of czesci(); track $index; let i = $index) {
            <span>›</span><button mat-button (click)="idz(czesci().slice(0, i + 1).join('/'))">{{ c }}</button>
          }
        }
      </nav>

      @if (!udzial()) {
        <div class="siatka">
          @for (u of udzialy(); track u.nazwa) {
            <button class="karta kafel" (click)="otworzUdzial(u.nazwa)">
              <span class="material-symbols-outlined">folder_shared</span>
              <b>{{ u.nazwa }}</b>
              <small>{{ (u.prawo === 'rw' ? 'pełny dostęp' : 'tylko odczyt') | t }}</small>
            </button>
          } @empty { <p class="podpowiedz">{{ 'Nie masz dostępu do żadnego udziału. Poproś administratora o nadanie praw.' | t }}</p> }
        </div>
      } @else {
        <div class="narzedzia">
          @if (prawo() === 'rw') {
            <button mat-flat-button (click)="wybor.click()"><span class="material-symbols-outlined">upload</span> {{ 'Wyślij pliki' | t }}</button>
            <input #wybor type="file" multiple hidden (change)="wyslij(wybor.files); wybor.value = ''">
            <button mat-stroked-button (click)="nowyFolder()"><span class="material-symbols-outlined">create_new_folder</span> {{ 'Nowy folder' | t }}</button>
          } @else {
            <span class="podpowiedz"><span class="material-symbols-outlined">lock</span> {{ 'tylko odczyt' | t }}</span>
          }
          <span class="odstep"></span>
          <button mat-icon-button [matTooltip]="'Odśwież' | t" (click)="wczytaj()"><span class="material-symbols-outlined">refresh</span></button>
        </div>

        @for (w of wysylane(); track w.nazwa) {
          <div class="wysylanie">
            <span>{{ w.nazwa }} – {{ b(w.wyslano) }} / {{ b(w.rozmiar) }}</span>
            <mat-progress-bar [value]="100 * w.wyslano / (w.rozmiar || 1)" />
          </div>
        }
        @if (przeciaganie()) { <div class="upusc">{{ 'Upuść pliki, aby je wysłać' | t }}</div> }

        <section class="karta tabela">
          @if (ladowanie()) { <mat-progress-bar mode="indeterminate" /> }
          <table>
            <thead><tr><th>{{ 'Nazwa' | t }}</th><th class="liczba">{{ 'Rozmiar' | t }}</th>
              <th class="data">{{ 'Zmieniony' | t }}</th><th></th></tr></thead>
            <tbody>
              @if (sciezka()) {
                <tr class="klik" (click)="idz(czesci().slice(0, -1).join('/'))">
                  <td><span class="material-symbols-outlined">arrow_upward</span> ..</td><td></td><td class="data"></td><td></td></tr>
              }
              @for (p of posortowane(); track p.nazwa) {
                <tr [class.klik]="p.katalog" (click)="p.katalog && idz(pelna(p.nazwa))">
                  <td><span class="material-symbols-outlined" [class.folder]="p.katalog">{{ p.katalog ? 'folder' : ikona(p.nazwa) }}</span> {{ p.nazwa }}</td>
                  <td class="liczba">{{ p.katalog ? '' : b(p.rozmiar) }}</td>
                  <td class="data">{{ i18n.data(p.zmieniony, { dateStyle: 'short', timeStyle: 'short' }) }}</td>
                  <td class="akcje" (click)="$event.stopPropagation()">
                    @if (!p.katalog) {
                      <a mat-icon-button [href]="link(p.nazwa)" [matTooltip]="'Pobierz' | t"><span class="material-symbols-outlined">download</span></a>
                    }
                    @if (prawo() === 'rw') {
                      <button mat-icon-button [matTooltip]="'Zmień nazwę' | t" (click)="zmienNazwe(p)"><span class="material-symbols-outlined">drive_file_rename_outline</span></button>
                      <button mat-icon-button [matTooltip]="'Usuń' | t" (click)="usun(p)"><span class="material-symbols-outlined">delete</span></button>
                    }
                  </td>
                </tr>
              } @empty {
                @if (!ladowanie()) { <tr><td colspan="4" class="podpowiedz">{{ 'Folder jest pusty.' | t }}</td></tr> }
              }
            </tbody>
          </table>
        </section>
      }
    </div>`,
  styles: `
    .sciezka { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; margin-bottom: 12px; }
    .kafel { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; cursor: pointer; text-align: left;
      font: inherit; color: inherit; }
    .kafel:hover { background: var(--mat-sys-surface-container); }
    .kafel .material-symbols-outlined { font-size: 36px; color: var(--mat-sys-primary); }
    .kafel small { color: var(--mat-sys-on-surface-variant); }
    .narzedzia { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
    .odstep { flex: 1; }
    .tabela { padding: 0; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font: var(--mat-sys-title-small); padding: 12px 16px; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    td { padding: 6px 16px; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    td .material-symbols-outlined { vertical-align: middle; margin-right: 8px; color: var(--mat-sys-on-surface-variant); }
    td .folder { color: #e8a317; }
    tr.klik { cursor: pointer; } tr.klik:hover, tr:hover { background: var(--mat-sys-surface-container-low); }
    .liczba { text-align: right; white-space: nowrap; } .data { white-space: nowrap; color: var(--mat-sys-on-surface-variant); }
    .akcje { text-align: right; white-space: nowrap; }
    .wysylanie { margin-bottom: 10px; font: var(--mat-sys-body-small); }
    .upusc { border: 2px dashed var(--mat-sys-primary); border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 12px; }
    @media (max-width: 600px) { .data { display: none; } }`,
})
export class Pliki implements OnInit {
  private readonly api = inject(Api);
  private readonly kom = inject(Komunikaty);
  protected readonly i18n = inject(I18n);
  protected readonly b = bajty;
  protected readonly udzialy = signal<{ nazwa: string; prawo: Prawo }[]>([]);
  protected readonly udzial = signal('');
  protected readonly sciezka = signal('');
  protected readonly pliki = signal<Plik[]>([]);
  protected readonly prawo = signal<Prawo>('ro');
  protected readonly ladowanie = signal(false);
  protected readonly wysylane = signal<Wysylanie[]>([]);
  protected readonly przeciaganie = signal(false);

  protected readonly czesci = computed(() => this.sciezka().split('/').filter(Boolean));
  protected readonly posortowane = computed(() =>
    [...this.pliki()].sort((a, b) => (+b.katalog - +a.katalog) || a.nazwa.localeCompare(b.nazwa, this.i18n.lokalizacja())));

  async ngOnInit(): Promise<void> {
    try {
      this.udzialy.set((await this.api.get<{ udzialy: { nazwa: string; prawo: Prawo }[] }>('pliki')).udzialy);
    } catch (e) {
      this.kom.blad(e);
    }
  }

  protected pelna(nazwa: string): string {
    return this.sciezka() ? `${this.sciezka()}/${nazwa}` : nazwa;
  }

  protected link(nazwa: string): string {
    return `/api/pobierz?udzial=${encodeURIComponent(this.udzial())}&sciezka=${encodeURIComponent(this.pelna(nazwa))}`;
  }

  protected ikona(nazwa: string): string {
    const r = nazwa.toLowerCase().split('.').pop() ?? '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp'].includes(r)) return 'image';
    if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(r)) return 'movie';
    if (['mp3', 'flac', 'ogg', 'wav', 'm4a'].includes(r)) return 'music_note';
    if (['zip', 'gz', 'tgz', 'xz', '7z', 'rar', 'tar'].includes(r)) return 'folder_zip';
    if (['pdf'].includes(r)) return 'picture_as_pdf';
    return 'description';
  }

  async otworzUdzial(nazwa: string): Promise<void> {
    this.udzial.set(nazwa);
    this.sciezka.set('');
    if (nazwa) await this.wczytaj();
  }

  async idz(sciezka: string): Promise<void> {
    this.sciezka.set(sciezka);
    await this.wczytaj();
  }

  async wczytaj(): Promise<void> {
    this.ladowanie.set(true);
    try {
      const r = await this.api.get<{ pliki: Plik[]; prawo: Prawo }>('pliki', { udzial: this.udzial(), sciezka: this.sciezka() });
      this.pliki.set(r.pliki);
      this.prawo.set(r.prawo);
    } catch (e) {
      this.kom.blad(e);
    } finally {
      this.ladowanie.set(false);
    }
  }

  protected upusc(e: DragEvent): void {
    e.preventDefault();
    this.przeciaganie.set(false);
    if (this.udzial() && this.prawo() === 'rw') this.wyslij(e.dataTransfer?.files ?? null);
  }

  async wyslij(pliki: FileList | null): Promise<void> {
    if (!pliki) return;
    for (const f of Array.from(pliki)) {
      const w: Wysylanie = { nazwa: f.name, rozmiar: f.size, wyslano: 0 };
      this.wysylane.update(l => [...l, w]);
      try {
        await this.api.wyslijPlik('pliki', f, { akcja: 'wgraj', udzial: this.udzial(), sciezka: this.pelna(f.name) },
          n => { w.wyslano = n; this.wysylane.update(l => [...l]); });
        this.kom.ok('Wysłano: {0}', f.name);
      } catch (e) {
        this.kom.blad(e);
      } finally {
        this.wysylane.update(l => l.filter(x => x !== w));
      }
    }
    await this.wczytaj();
  }

  async nowyFolder(): Promise<void> {
    const n = prompt(this.i18n.t('Nazwa nowego folderu'));
    if (!n) return;
    try {
      await this.api.post('pliki', { akcja: 'folder', udzial: this.udzial(), sciezka: this.pelna(n) });
      await this.wczytaj();
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async zmienNazwe(p: Plik): Promise<void> {
    const n = prompt(this.i18n.t('Nowa nazwa'), p.nazwa);
    if (!n || n === p.nazwa) return;
    try {
      await this.api.post('pliki', { akcja: 'zmien', udzial: this.udzial(), sciezka: this.pelna(p.nazwa), nowa: this.pelna(n) });
      await this.wczytaj();
    } catch (e) {
      this.kom.blad(e);
    }
  }

  async usun(p: Plik): Promise<void> {
    if (!confirm(this.i18n.t(p.katalog ? 'Usunąć folder {0} razem z zawartością?' : 'Usunąć plik {0}?', p.nazwa))) return;
    try {
      await this.api.post('pliki', { akcja: 'usun', udzial: this.udzial(), sciezka: this.pelna(p.nazwa) });
      await this.wczytaj();
    } catch (e) {
      this.kom.blad(e);
    }
  }
}
