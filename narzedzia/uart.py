#!/usr/bin/env python3
"""uart.py czekaj_s [linia...] – wysyła linie (^C = Ctrl+C), czyta przez czekaj_s, dopisuje do logu i wypisuje."""
import os, sys, termios, time, select
fd = os.open("/dev/ttyUSB0", os.O_RDWR | os.O_NOCTTY)
a = termios.tcgetattr(fd)
a[0] = a[1] = a[3] = 0; a[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
a[4] = a[5] = termios.B115200; a[6][termios.VMIN] = 0; a[6][termios.VTIME] = 0
termios.tcsetattr(fd, termios.TCSANOW, a)
log = open(os.path.expanduser("~/nsa310s-uart.log"), "ab", buffering=0)
czekaj = float(sys.argv[1]); wynik = b""
for s in sys.argv[2:]:
    b = b"\x03" if s == "^C" else s.encode() + b"\r"
    os.write(fd, b); log.write(b"\n>>> " + s.encode() + b"\n"); time.sleep(0.3)
koniec = time.time() + czekaj
while time.time() < koniec:
    r, _, _ = select.select([fd], [], [], 0.2)
    if r:
        d = os.read(fd, 4096); log.write(d); wynik += d
sys.stdout.write(wynik.decode("latin1").replace("\r", ""))
