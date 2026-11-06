#!/usr/bin/env python3
"""Przerywa autoboot U-Boota i wpisuje komendy; między komendami czeka na ciszę (zachęta bywa przekłamana)."""
import os, sys, termios, time, select
KOMENDY = sys.argv[2:]
fd = os.open("/dev/ttyUSB0", os.O_RDWR | os.O_NOCTTY)
a = termios.tcgetattr(fd)
a[0] = a[1] = a[3] = 0; a[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
a[4] = a[5] = termios.B115200; a[6][termios.VMIN] = 0; a[6][termios.VTIME] = 0
termios.tcsetattr(fd, termios.TCSANOW, a)
log = open(os.path.expanduser("~/nsa310s-uart.log"), "ab", buffering=0)
koniec = time.time() + float(sys.argv[1]); buf = b""; ost = time.time()
def czytaj(t):
    global buf, ost
    r, _, _ = select.select([fd], [], [], t)
    if r:
        d = os.read(fd, 4096); log.write(d); buf = (buf + d)[-8000:]; ost = time.time()
while time.time() < koniec and b"autoboot" not in buf.lower():
    czytaj(0.1)
for _ in range(5):
    os.write(fd, b"\r"); time.sleep(0.05)
for k in KOMENDY:
    while time.time() - ost < 3:          # cisza = U-Boot skończył poprzednią komendę
        czytaj(0.1)
    if b"fatload" in k.encode() and False: pass
    os.write(fd, k.encode() + b"\r"); log.write(b"\n>>> " + k.encode() + b"\n"); ost = time.time()
    czytaj(0.5)
while time.time() < koniec:
    czytaj(0.5)
    t = buf.lower()
    if b"login:" in t[-300:] or b"panic" in t or b"root device" in t:
        time.sleep(2); czytaj(1); break
print("KONIEC")
