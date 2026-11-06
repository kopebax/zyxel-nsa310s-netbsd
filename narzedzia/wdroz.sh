#!/bin/sh
# Wgrywa na NAS (ssh nas-bsd, doas) system/ i panel/ z repozytorium – np. po
# odtworzeniu pendrive'a ze starszego obrazu. Można uruchamiać wielokrotnie.
#   narzedzia/wdroz.sh [host]        (z katalogu głównego repozytorium)
# Wymaga: zbudowanego frontendu (panel/frontend/dist) i nas-httpd (NAS_HTTPD).
set -eu
HOST=${1:-nas-bsd}
NAS_HTTPD=${NAS_HTTPD:-./nas-httpd}
WWW=panel/frontend/dist/frontend/browser
[ -f $WWW/index.html ] || { echo "brak $WWW – najpierw npm run build"; exit 1; }
[ -x "$NAS_HTTPD" ] || { echo "brak $NAS_HTTPD (system/nas-httpd/README.md)"; exit 1; }

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p $T/p/www && cp -R $WWW/. $T/p/www/
cp -R panel/backend system $T/p/ && cp "$NAS_HTTPD" $T/p/nas-httpd

tar -C $T/p -cf - . | ssh "$HOST" 'doas sh -c "
set -eu
P=/tmp/wdroz; rm -rf \$P; mkdir \$P; tar -C \$P -xf -
cd \$P
i() { install -o root -g wheel -m \$1 \$2 \$3; }

# panel
mkdir -p /usr/pkg/share/nas-panel /usr/pkg/libexec/nas-panel /etc/nas-panel /var/log/nas-panel
i 444 backend/api.lua /usr/pkg/share/nas-panel/
i 444 backend/sha256.lua /usr/pkg/share/nas-panel/
i 500 backend/nas-panel-priv /usr/pkg/libexec/nas-panel/
i 555 backend/nas-panel-haslo /usr/pkg/sbin/
i 555 backend/naspanel.rc /etc/rc.d/naspanel
i 555 backend/naspanel80.rc /etc/rc.d/naspanel80
i 555 nas-httpd /usr/pkg/libexec/nas-httpd
mkdir -p /usr/pkg/share/nas-panel/http80
i 444 backend/http80/index.html /usr/pkg/share/nas-panel/http80/
rm -rf /usr/pkg/share/nas-panel/www.new; mkdir /usr/pkg/share/nas-panel/www.new
cp -R www/. /usr/pkg/share/nas-panel/www.new/
chown -R root:wheel /usr/pkg/share/nas-panel/www.new; chmod -R a+rX,go-w /usr/pkg/share/nas-panel/www.new
rm -rf /usr/pkg/share/nas-panel/www.old
[ -d /usr/pkg/share/nas-panel/www ] && mv /usr/pkg/share/nas-panel/www /usr/pkg/share/nas-panel/www.old
mv /usr/pkg/share/nas-panel/www.new /usr/pkg/share/nas-panel/www; rm -rf /usr/pkg/share/nas-panel/www.old

# skrypty i rc.d
i 555 system/usr/pkg/sbin/nas-harmonogram /usr/pkg/sbin/
i 555 system/usr/pkg/sbin/nas-temperatura /usr/pkg/sbin/
i 555 system/usr/pkg/sbin/nas-udzialy-zastosuj /usr/pkg/sbin/
i 555 system/etc/rc.d/leds /etc/rc.d/
i 555 system/etc/rc.d/dysk /etc/rc.d/
mkdir -p /etc/powerd/actions /mnt/usb-copy
i 555 system/etc/powerd/actions/copy /etc/powerd/actions/
for s in hotkey_button power_button reset_button; do i 555 system/etc/powerd/scripts/\$s /etc/powerd/scripts/; done
i 644 system/etc/gpio.conf /etc/
i 644 system/etc/fstab /etc/
i 600 system/usr/pkg/etc/doas.conf /usr/pkg/etc/

# rc.conf: dopisz brakujące zmienne z fragmentu
grep -E \"^[a-z_0-9]+=\" system/etc/rc.conf.nsa310s | while IFS= read -r l; do
	grep -q \"^\${l%%=*}=\" /etc/rc.conf || echo \"\$l\" >> /etc/rc.conf
done

# stan panelu (tylko gdy brak – nie nadpisuje ustawień z panelu)
[ -f /etc/nas-panel/hasla ] || { echo \"admin \$(cat /etc/nas-panel/haslo)\" > /etc/nas-panel/hasla; chown root:nasweb /etc/nas-panel/hasla; chmod 640 /etc/nas-panel/hasla; }
[ -f /etc/nas-panel/udzialy ] || { printf \"udzial Backup wlasciciel=admin kosz=nie smb=tak\nprawa Backup u:admin=rw\nnfs Backup rw 192.168.0.20,192.168.0.30\nudzial Media wlasciciel=admin kosz=nie smb=tak\nprawa Media u:admin=rw\nnfs Media rw 192.168.0.20,192.168.0.30\n\" > /etc/nas-panel/udzialy; chmod 644 /etc/nas-panel/udzialy; }
[ -f /etc/nas-panel/copy.conf ] || printf \"cel=/dysk/USB-kopie\ntryb=kopia\n\" > /etc/nas-panel/copy.conf
touch /etc/nas-panel/harmonogram; chmod 644 /etc/nas-panel/harmonogram /etc/nas-panel/copy.conf
ln -sf /usr/share/zoneinfo/Europe/Warsaw /etc/localtime
crontab -l | grep -v nas-harmonogram > crontab.new || true
grep nas-harmonogram system/crontab-root.nsa310s >> crontab.new; crontab crontab.new

# zapora: tabele <dom>/<nfs>; przy utracie połączenia powrót po 60 s
mkdir -p /etc/npf.d
[ -f /etc/npf.d/dom ] || i 644 system/etc/npf.d/dom /etc/npf.d/
/usr/pkg/sbin/nas-udzialy-zastosuj >/dev/null
/sbin/npfctl validate system/etc/npf.conf >/dev/null
cmp -s system/etc/npf.conf /etc/npf.conf || {
	cp /etc/npf.conf /etc/npf.conf.przed-wdrozeniem; i 644 system/etc/npf.conf /etc/
	rm -f /tmp/npf-ok
	nohup sh -c \"sleep 60; [ -f /tmp/npf-ok ] || { cp /etc/npf.conf.przed-wdrozeniem /etc/npf.conf; /sbin/npfctl reload; }\" </dev/null >/dev/null 2>&1 &
}
/sbin/npfctl reload

# zatrzymanie po pidfile: rc.d stop potrafi czekać bez końca (stary httpd
# z zombie-dziećmi nie kończy się po SIGTERM), a zapora cofa się po 60 s
p=\$(cat /var/run/naspanel.pid 2>/dev/null || true)
if [ -n \"\$p\" ]; then kill \$p 2>/dev/null || true; sleep 3; kill -9 \$p 2>/dev/null || true; fi
rm -f /var/run/naspanel.pid
/etc/rc.d/naspanel start >/dev/null
/etc/rc.d/naspanel80 restart >/dev/null 2>&1 || /etc/rc.d/naspanel80 start >/dev/null
/usr/pkg/sbin/nas-harmonogram uzbroj || true
cd /; rm -rf \$P
echo WDROZONO
"'
# potwierdzenie zapory nowym połączeniem
ssh -o ConnectTimeout=10 "$HOST" 'doas touch /tmp/npf-ok' && echo "zapora potwierdzona"
