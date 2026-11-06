# NetBSD on the Zyxel NSA310S

Run **NetBSD 11.0** on a Zyxel NSA310S home NAS instead of the stock firmware, with a
custom web admin panel. The system boots from a USB stick; the original Zyxel firmware
stays untouched in NAND as a fallback – without the stick the NAS boots as before.

All example addresses below (`192.168.0.2` for the NAS, `192.168.0.0/24` for the home
network) are placeholders – replace them with your own.

## Contents

1. [Hardware](#hardware)
2. [Features](#features)
3. [Repository layout](#repository-layout)
4. [Releases](#releases)
5. [Kernel](#kernel)
6. [Installation on a USB stick](#installation-on-a-usb-stick)
7. [U-Boot](#u-boot)
8. [Web panel](#web-panel)
9. [nas-httpd](#nas-httpd)
10. [Deploying changes](#deploying-changes)
11. [Backup and recovery](#backup-and-recovery)
12. [Hardware reference](#hardware-reference)
13. [Pitfalls](#pitfalls)

## Hardware

| Component | Details |
|---|---|
| SoC | Marvell 88F6702 A1 (Kirkwood), Sheeva ARMv5TE @ 1 GHz, TClk 166 MHz |
| Memory | 256 MB DDR2, 128 MB NAND |
| Network | 1 × Gigabit Ethernet, PHY Marvell 88E1318S (address 1) |
| Storage | 1 × SATA II (mvsata) |
| USB | 1 × USB 2.0 (rear) – system boot device |
| Power / fan | MCU on I²C (0x0a) |
| RTC | Holtek HT1382 (I²C 0x68) with wake-up alarm |
| Bootloader | U-Boot 1.1.4 (Marvell 3.6.0, MitraStar STG-315), `MODEL_ID=AD03` |

## Features

| Feature | Status | How |
|---|---|---|
| Gigabit Ethernet | ✅ | kernel patch – the Zyxel firmware leaves the PHY on register page 3 |
| Power-off (`shutdown -p`) | ✅ | GPIO 27, high → low → high sequence |
| Wake-on-LAN | ✅ | PHY armed before power-off (magic packet → LED[2]/INTn → MCU) |
| Scheduled wake-up | ✅ | new `htrtc` driver, `sysctl hw.htrtc0.wakeup` |
| Buttons | ✅ | POWER 2 s = shut down, RESET 5 s = reboot, COPY = USB copy (`powerd`) |
| LEDs | ✅ | system, HDD (blinks on disk activity), USB, COPY |
| Data disk | ✅ | FFSv2 with WAPBL journal, mounted only when present |
| SMART + temperature guard | ✅ | `atactl`; every 5 min: warning at 55 °C, power-off at 60 °C |
| NFS shares | ✅ | NFSv3, per-host access |
| Firewall | ✅ | npf: ssh and panel only from home networks, NFS only from listed hosts |
| Web panel (HTTPS) | ✅ | Angular + Material 3 frontend, Lua backend inside `httpd(8)` |
| SMB (Windows shares) | ❌ | no Samba binary packages for ARMv5 |
| Fan control | ➖ | handled by the MCU, invisible to NetBSD |

Go does not run on this CPU (Go for NetBSD/arm requires ARMv6), so the panel backend is
written in Lua – both the interpreter and the HTTP server are in the NetBSD base system.

## Repository layout

| Path | Contents |
|---|---|
| `kernel/` | `nsa310s.patch` (NetBSD 11.0 source patch) and `NSA310S.conf` kernel config |
| `system/etc/` | rc.conf, fstab, npf firewall, exports, powerd button scripts, rc.d (`dysk`, `leds`), sshd config |
| `system/usr/pkg/` | `doas.conf`, helper scripts (`nas-temperatura`, `nas-harmonogram`, `nas-udzialy-zastosuj`) |
| `system/nas-httpd/` | `bozohttpd` with a Lua POST fix, built for the panel |
| `panel/backend/` | Lua API, privileged helper, password tool, rc.d scripts, port-80 redirect |
| `panel/frontend/` | Angular application |
| `narzedzia/` | tools: UART helpers for U-Boot / DDB, `wdroz.sh` deploy script |

## Releases

[Releases](../../releases) contain prebuilt binaries:

| File | What it is |
|---|---|
| `nbsd.ub` | kernel image for U-Boot (uncompressed uImage) – goes to the FAT partition |
| `netbsd` | the same kernel as ELF – goes to `/netbsd` on the root file system |
| `nas-httpd` | web server for the panel (earmv5) |
| `nas-panel-www.tar.gz` | built panel frontend |
| `SHA256SUMS` | checksums |

## Kernel

Built on Linux (tested on Arch Linux, GCC 16):

```sh
# NetBSD 11.0 sources: src.tgz, syssrc.tgz, sharesrc.tgz, gnusrc.tgz from cdn.netbsd.org
cd usr/src && patch -p1 < kernel/nsa310s.patch

# toolchain (once, 20–40 min); GCC 16 needs gnu17 forced
./build.sh -U -u -j8 -m evbarm -a earmv5 -O ../obj -T ../tools \
    -V HOST_CC="gcc -std=gnu17" -V HOST_CFLAGS="-O -std=gnu17" tools

# kernel (about 3 min, incremental rebuilds take seconds)
./build.sh -U -u -j8 -m evbarm -a earmv5 -O ../obj -T ../tools \
    -V HOST_CC="gcc -std=gnu17" -V HOST_CFLAGS="-O -std=gnu17" kernel=NSA310S
```

Output in `obj/sys/arch/evbarm/compile/NSA310S/`:

| File | Use |
|---|---|
| `netbsd.ub` | image for U-Boot – **uncompressed**; `netbsd.gz.ub` hangs the old Zyxel U-Boot (no cache flush after decompression) |
| `netbsd` | ELF, copied to `/netbsd` (modules, `savecore`) |
| `netbsd-old.ub` | do not use – entry address bytes swapped for other U-Boots, this one jumps to 0x800000 |

What the patch changes:

| File | Change |
|---|---|
| `sys/arch/evbarm/marvell/marvell_machdep.c` (`-DNSA310S`) | PHY 88E1318S: switch to register page 0, LED setup from the Linux DTS |
| | power-off through GPIO 27 + arming Wake-on-LAN in the PHY |
| | buttons (GPIO 24/25/26) polled every 100 ms → `sysmon_pswitch` → `powerd` |
| | HDD LED (GPIO 16) goes off for 100 ms on `wd0` transfers |
| `sys/dev/i2c/ht1382.c` | new `htrtc` driver (HT1382 clock + wake-up alarm) |
| `sys/arch/evbarm/conf/NSA310S` | kernel configuration |
| `sys/arch/arm/marvell/mvsoc.c` | SoC 88F6702 recognised as 88F6192 |

Updating the kernel on a running NAS:

```sh
scp netbsd.ub netbsd nas:/tmp/
ssh nas 'doas sh -c "cp /tmp/netbsd /netbsd; mount -t msdos /dev/sd0e /boot &&
  cp /boot/nbsd.ub /boot/nbsd-prev.ub && cp /tmp/netbsd.ub /boot/nbsd.ub && umount /boot && reboot"'
```

## Installation on a USB stick

You need a USB stick (≥ 4 GB), a 3.3 V USB-UART adapter and a Linux PC with the NetBSD
toolchain from the [Kernel](#kernel) section (`tools/bin/nbmakefs`, `nbmtree`).

### Partitions

| Partition | Type | NetBSD name | Contents |
|---|---|---|---|
| 1 – 64 MB | FAT32 (0x0c), bootable | `sd0e` | `nbsd.ub` – kernel for U-Boot |
| 2 – rest | NetBSD (0xa9) | `sd0f` | FFSv2 root file system |

Without a BSD disklabel NetBSD names MBR partitions e, f, … – hence `root=sd0f`.

### Root file system image

```sh
# binary sets for evbarm-earmv5: base, etc, modules, text
mkdir rootfs && cd rootfs
for s in base etc modules text; do tar --numeric-owner -xpzf ../sets/$s.tgz; done
cp ../netbsd ./netbsd
# configuration from this repo: system/etc/rc.conf.nsa310s → etc/rc.conf, fstab, npf.conf …
# serial console in etc/ttys:
#   console "/usr/libexec/getty std.115200" vt100 on secure
# your public key → root/.ssh/authorized_keys (first login; later the admin account)

# /dev without a NetBSD root: MAKEDEV can print an mtree spec
T=../tools/bin
$T/nbmtree -c -k type,mode,uid,gid,link,size -p . | $T/nbmtree -C -k type,mode,uid,gid,link,size > ../rootfs.spec
(cd dev && sh ./MAKEDEV -s all) | grep -v '^\. ' | sed 's#^\./#./dev/#' >> ../rootfs.spec

# FFS image (density = enough inodes), grown to the partition later on the NAS
$T/nbmakefs -t ffs -B le -o version=2,bsize=16384,fsize=2048,density=8192 \
    -s 1536m -F ../rootfs.spec -N etc ../rootfs.img .
```

### Writing the stick

```sh
# /dev/sdX = the USB stick – double-check with lsblk!
printf 'label: dos\nstart=2048, size=131072, type=c, bootable\nstart=133120, type=a9\n' | sfdisk /dev/sdX
mkfs.vfat -F 32 -n NBSDBOOT /dev/sdX1
mount /dev/sdX1 /mnt && cp nbsd.ub /mnt/nbsd.ub && umount /mnt
dd if=rootfs.img of=/dev/sdX2 bs=4M conv=fsync
```

Then configure U-Boot ([next section](#u-boot)) and boot.

### Growing the file system

`resize_root` in rc.d only works without the journal and with an immediate reboot
(otherwise the old in-memory superblock overwrites the new one):

```sh
# /etc/fstab: for one boot "rw" instead of "rw,log"; /etc/rc.conf:
resize_root=YES
resize_root_postcmd="/sbin/reboot -n"
# after the reboot: restore "rw,log" and remove both lines
```

Safer by hand in single-user mode (`/` read-only): `resize_ffs -y /dev/rsd0f && reboot -n`.

### Packages

There are no earmv5 binary packages in pkgsrc; **earmv4** packages work (same ABI):

```sh
certctl rehash                                   # CA certificates from the base system
PKG_PATH=https://cdn.netbsd.org/pub/pkgsrc/packages/NetBSD/earmv4/11.0_2026Q2/All \
    pkg_add -m earmv4 pkgin
echo https://cdn.netbsd.org/pub/pkgsrc/packages/NetBSD/earmv4/11.0_2026Q2/All \
    > /usr/pkg/etc/pkgin/repositories.conf
pkgin update && pkgin install doas rsync
```

### Admin account

The panel and the system files use the login **`admin`** as the permanent administrator
(ssh access, `doas`, owner of shared folders):

```sh
useradd -m -G wheel,users admin
# your SSH key → /home/admin/.ssh/authorized_keys
```

`system/etc/ssh-sshd_config.nsa310s` allows only `admin`, keys only, no root login.

### Data disk

```sh
gpt create -f wd0 && gpt add -a 1m -t ffs -l nas-dane wd0
newfs -O 2 -b 65536 -f 8192 -i 131072 /dev/rdk0
# fstab (system/etc/fstab): NAME=nas-dane /dysk ffs rw,log,noatime,noauto 0 0
# rc.d/dysk checks and mounts it at boot only if the disk is present
```

## U-Boot

* Networking in this U-Boot does not work (`egiga0 no link` – wrong PHY address, PHY on
  page 3), so TFTP is out; the kernel is loaded from the USB stick (`usb start` + `fatload`).
* Stop autoboot: Enter within 2 s of “Hit any key to stop autoboot”.
* There are two `phyRead` commands – the first one reads the PCI-Express PHY, not Ethernet.

### UART

Connector J1 on the board, 3.3 V, 115200 8N1:

| Pin | Signal | USB-UART adapter |
|---|---|---|
| 1 (next to Ethernet, triangle) | 3.3 V | **do not connect** |
| 2 | NAS TX | RXD |
| 3 | NAS RX | TXD |
| 4 | – | |
| 5 (next to USB) | GND | GND |

### Boot NetBSD, fall back to Zyxel

```
zyxel_bootargs=console=ttyS0,115200 mtdparts=nand_mtd:0x100000(uboot),0x80000(uboot_env),0x80000(key_store),0x80000(info),0xA00000(etc),0xA00000(kernel_1),0x2FC0000(rootfs1),0xA00000(kernel_2),0x2FC0000(rootfs2) root=/dev/nfs rw init=/init
zyxel_bootcmd=nand read.e 0x2000000 $(kernel_addr) 0xA00000; bootm 0x2000000
nbsd_boot=setenv bootargs root=sd0f; usb start; fatload usb 0:1 0x2000000 nbsd.ub; bootm 0x2000000
zyxel_boot=setenv bootargs $(zyxel_bootargs); nand read.e 0x2000000 $(kernel_addr) 0xA00000; bootm 0x2000000
bootcmd=run nbsd_boot; run zyxel_boot
```

Set each variable with `setenv NAME 'VALUE'` and finish with `saveenv`. Without the stick
(or when `fatload` fails) the Zyxel firmware boots from NAND.

Back to stock behaviour:

```
setenv bootcmd 'nand read.e 0x2000000 $(kernel_addr) 0xA00000; bootm 0x2000000'
setenv bootargs $(zyxel_bootargs)
saveenv
```

Type commands containing `$(...)` and `;` in single quotes. When sending them from a
script, send character by character (`narzedzia/uart-boot2.py`) – the U-Boot input buffer
drops characters.

## Web panel

| Part | Implementation |
|---|---|
| Frontend (`panel/frontend`) | Angular 22 + Angular Material 3, layout modelled on the Zyxel UI, Polish with English translation (`src/app/i18n-en.ts`) |
| Backend (`panel/backend`) | `api.lua` run by `httpd(8)` (`-L api`), HTTPS |
| Privileged operations | `nas-panel-priv` (root, via `doas` only for the `nasweb` account) with a fixed command list |

### Login

| Field | Value |
|---|---|
| Address | `https://192.168.0.2/` (port 80 redirects to HTTPS) |
| Login | `admin` |
| Password | set with `nas-panel-haslo` during installation |

### Build and install

```sh
cd panel/frontend && npm ci && npm run build      # ng build + icon font trimming
# or unpack nas-panel-www.tar.gz from the release into panel/frontend/dist/frontend/browser
```

Once, on the NAS (as root):

```sh
useradd -d /nonexistent -s /sbin/nologin -g =uid nasweb
echo 'permit nopass nasweb as root cmd /usr/pkg/libexec/nas-panel/nas-panel-priv' >> /usr/pkg/etc/doas.conf
# certificate (base openssl has no openssl.cnf – give a minimal one)
printf '[req]\ndistinguished_name=dn\n[dn]\n' > /tmp/o.cnf
openssl req -config /tmp/o.cnf -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
  -days 3650 -nodes -subj /CN=nsa310s -addext subjectAltName=IP:192.168.0.2,DNS:nsa310s \
  -keyout /etc/nas-panel/key.pem -out /etc/nas-panel/cert.pem
nas-panel-haslo                    # set the panel password
```

Files are installed by `narzedzia/wdroz.sh` ([Deploying changes](#deploying-changes)).
`httpd` needs MIME mappings (`-M .js text/javascript …`) or the browser refuses the JS
modules – they are set in `naspanel.rc`.

### Pages

| Group | Page | What it does |
|---|---|---|
| Status | Dashboard | system, space, network, services, LEDs (4 physical, two-colour), error signals, next wake-up |
| System | Name & time | hostname, time zone, NTP servers, sync state |
| | TCP/IP | DHCP / static; a change reverts after 3 min unless confirmed from the new address |
| | Users | accounts (UID matters for NFS), SSH keys |
| | Services | start / stop / restart, autostart (ssh and panel: restart only) |
| Storage | Disk & SMART | SMART, short self-test, fsck (unmounts `/dysk`, stops NFS) |
| | Shares | folders under `/dysk`, read/write, clients (IP/CIDR); firewall updates itself |
| | COPY button | target folder, copy / sync mode, run, log |
| Security | Firewall | networks allowed to reach SSH and the panel (npf table `<dom>`); refuses lock-out changes |
| | SSL certificate | details, new certificate (after an IP or name change) |
| | Panel password | change password |
| Maintenance | Power | shut down, reboot, one-time power-on at a date |
| | Schedule | power on / off / reboot by weekday (`nas-harmonogram`, cron + RTC alarm) |
| | Updates | pkgin (background check, upgrade), vulnerability audit |
| | Config backup | download `/etc` + `/usr/pkg/etc` without secrets |
| | Logs | messages, authlog, COPY, fsck, updates |

### Security

| Area | Measure |
|---|---|
| Transport | HTTPS (self-signed certificate) |
| Passwords | PBKDF2-HMAC-SHA256 |
| Session | `HttpOnly; Secure; SameSite=Strict` cookie + CSRF token |
| Login | locked after 5 failed attempts |
| Privileges | root actions only through `nas-panel-priv` |
| ssh | keys only, no root login, administration through `doas` |
| Secrets | the repository contains no passwords, keys or certificates |

### API

GET reads, POST changes (body `application/x-www-form-urlencoded`, non-empty, header
`X-CSRF-Token`). Every handler is `/api/<name>`.

| Handler | GET | POST |
|---|---|---|
| `login`, `logout`, `sesja` | session | `haslo` (password) |
| `status`, `diody` | system state, LEDs | – |
| `smart`, `smart_test` | SMART | start a short test |
| `fsck` | state + log | run |
| `udzialy` | list of shares | `dane` = lines `FOLDER ro\|rw CLIENT,CLIENT` |
| `zapora` | state, lists, client address | `dom` = networks (lines) |
| `uslugi` | services | `nazwa`, `akcja` = start\|stop\|restart\|wlacz_autostart\|wylacz_autostart |
| `czas` | name, time zone, NTP | `nazwa`, `strefa`, `ntp` |
| `siec` | network config | `tryb` = dhcp\|static\|potwierdz (+ `adres`, `brama`, `dns`) |
| `uzytkownicy` | users (`?klucze=name` – keys) | `akcja` = dodaj\|usun\|klucze |
| `zasilanie` | – | `akcja` = shutdown\|reboot |
| `budzenie` | – | `czas` (UNIX time, 0 = off) |
| `harmonogram` | entries, alarm | `dane` = lines `wlacz\|wylacz\|restart DAYS HH:MM` |
| `copy` | config, log | `cel`, `tryb` or `akcja=uruchom` |
| `certyfikat` | details | new certificate |
| `haslo` | – | `stare`, `nowe` |
| `aktualizacje` | state | `akcja` = sprawdz\|aktualizuj |
| `dziennik` | `?rodzaj=messages\|authlog\|copy\|fsck\|aktualizacja&n=` | – |
| `kopia` | tar.gz archive | – |

`httpd` ignores SIGCHLD, so `close()` in Lua does not know the exit code of a child
process – `api.lua` appends `@@kod=$?` to the output of `nas-panel-priv`.

## nas-httpd

`httpd(8)` (bozohttpd) from NetBSD 11.0 with one fix in `lua-bozo.c`: the POST body for
Lua scripts is read in a loop up to `Content-Length`. The original reads it with a single
`read()`/`SSL_read()`, which over TLS returns at most one record (16 KB), so larger forms
(file uploads) arrived truncated.

Build (cross compiler and a sysroot made from the base + comp sets):

```sh
CC=tools/bin/arm--netbsdelf-eabi-gcc
$CC --sysroot=SYSROOT -O2 -DDO_HTPASSWD -Wno-deprecated-declarations -o nas-httpd \
    bozohttpd.c ssl-bozo.c auth-bozo.c cgi-bozo.c daemon-bozo.c tilde-luzah-bozo.c \
    dir-index-bozo.c content-bozo.c lua-bozo.c main.c \
    -lblocklist -lcrypt -llua -lm -lssl -lcrypto
```

A prebuilt binary is in the release.

## Deploying changes

`narzedzia/wdroz.sh` copies `system/` and `panel/` to the NAS over ssh and installs them
with `doas`. Run it from the repository root; it is safe to re-run:

```sh
NAS_HTTPD=/path/to/nas-httpd narzedzia/wdroz.sh nas      # nas = ssh host alias of the NAS
```

| Step | What it does |
|---|---|
| Panel | `api.lua`, helper scripts, rc.d `naspanel` + `naspanel80`, frontend into `/usr/pkg/share/nas-panel/www` |
| System | helper scripts, rc.d `dysk` and `leds`, powerd scripts, `gpio.conf`, `fstab`, `doas.conf` |
| rc.conf | appends missing variables only |
| Panel state | never overwritten (users, shares, COPY, schedule) – only created if missing |
| Time | time zone (Europe/Warsaw – edit for yours) and the `nas-harmonogram` cron entry; the remaining root cron entries (`nas-temperatura` …) are in `system/crontab-root.nsa310s` |
| Firewall | npf tables and `npf.conf`; a new `npf.conf` is rolled back after 60 s unless confirmed |
| Services | restarts the panel |

It needs a built frontend in `panel/frontend/dist/frontend/browser` and `nas-httpd`.

## Backup and recovery

### Stick image

Full image (MBR + FAT + consistent FFS snapshot via `fss(4)`), gzip-compressed, taken
without stopping the system:

```sh
ssh nas 'doas sh -c "fssconfig -c fss0 / /dysk/.fss-backing &&
  { dd if=/dev/rsd0c bs=512 count=133120; dd if=/dev/rfss0 bs=1m; } | gzip -1;
  fssconfig -u fss0; rm -f /dysk/.fss-backing"' > nsa310s-stick.img.gz
```

Restore to a new stick (≥ 8 GB): `gunzip -c nsa310s-stick.img.gz | dd of=/dev/sdX bs=4M conv=fsync`,
then run `narzedzia/wdroz.sh` to bring the system up to date.

### Emergency boot

| Situation | What to do |
|---|---|
| No stick | the NAS boots the stock Zyxel firmware from NAND (`zyxel_boot`) |
| Bad kernel | over UART: `usb start; fatload usb 0:1 0x2000000 nbsd-prev.ub; setenv bootargs root=sd0f; bootm 0x2000000` |
| Single-user mode | `setenv bootargs root=sd0f -s` before `bootm` |
| Hung system | BREAK on the serial console → DDB (`narzedzia/ddb.py`); `reboot 0x4` = reboot without sync |
| Damaged root file system | do not repair it on the running NAS – attach the stick to another system, or write a saved image |

Cheap USB sticks get corrupted after hard power cuts – keep an image of a working stick.

## Hardware reference

### GPIO

| Pin | Function | Active |
|---|---|---|
| 13 | HDD LED red | high |
| 15 | USB LED green | high |
| 16 | HDD LED green | high |
| 21 | USB power | high |
| 22 / 23 | COPY LED green / red | high |
| 24 | RESET button | low |
| 25 | COPY button | low |
| 26 | POWER button | high |
| 27 | power-off (H → L → H) | high |
| 28 / 29 | system LED green / orange | high |
| 33 | SATA power | high |

GPIO registers: 0xF1010100 (output), 0xF1010104 (direction, 0 = output), 0xF1010110 (input).

### I²C (iic0)

| Address | Device |
|---|---|
| 0x0a | power / fan MCU (the Zyxel firmware reads the MAC address from it) |
| 0x68 | RTC Holtek HT1382 (UTC time in BCD, alarm in 0x0B–0x0D with bit 7, reading 0x08 clears the flag) |
| 0x64 | unknown – **reading it locks the bus**, leave it alone |

### PHY 88E1318S

| Item | Detail |
|---|---|
| After Zyxel firmware | register 22 (page) = 3, so the ID registers read 0 |
| Wake-on-LAN | page 0 reg 0x12 bit 7; page 3 reg 0x12 bit 7 (INTn) + bit 11 (active low) |
| Magic packet | page 0x11: MAC in 0x17–0x19, reg 0x10 bit 14 (magic packet) + bit 12 (clear state) |

### Fan and temperature

The fan is driven by the MCU and invisible to NetBSD. `nas-temperatura` (cron, every
5 min) protects the disk: ≥ 55 °C warning + red HDD LED, ≥ 60 °C power-off.

### Buttons

| Button | Hold | Action |
|---|---|---|
| POWER | 2 s | shut down |
| RESET | 5 s | reboot |
| COPY | short | copy the USB drive to the data disk (configurable in the panel) |
| (no USB stick) | – | boot the stock Zyxel firmware from NAND |

## Pitfalls

| Problem | Symptom | Fix |
|---|---|---|
| Go on ARMv5 | Go for NetBSD/arm needs ARMv6 | panel backend in Lua |
| PHY after Zyxel firmware | no link, PHY ID registers read 0 | kernel patch switches the PHY to page 0 |
| TFTP in U-Boot | `egiga0 no link` | kernel loaded from the USB stick |
| `netbsd.gz.ub` | U-Boot hangs after decompression | use the uncompressed `netbsd.ub` |
| `smartctl` on mvsata | ATA queue stalls (`atafin`), the whole disk blocks (`biowait`), even DDB `reboot` hangs on sync | SMART via `atactl wd0 smart status\|selftest-log\|offline 1` only |
| I²C address 0x64 | reading it locks the bus | leave it alone |
| `fsck` on a mounted root | system directories end up in `lost+found` | full fsck only with the stick attached to another system |
| `resize_root` with WAPBL | new size lost after reboot | disable the journal for that boot, or `resize_ffs` in single-user mode |
| Samba from source (QEMU, earmv5) | `waf configure` hangs after ~900 checks | thread stacks exhaust the 32-bit address space – `PTHREAD_STACKSIZE=512`; abandoned (~5 h build) |
