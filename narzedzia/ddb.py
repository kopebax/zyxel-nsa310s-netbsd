#!/usr/bin/env python3
"""ddb.py [break] polecenie... – opcjonalnie BREAK (wejście do DDB), potem linie, wypisuje odpowiedź."""
import os, sys, termios, time, select
fd = os.open("/dev/ttyUSB0", os.O_RDWR | os.O_NOCTTY)
a = termios.tcgetattr(fd)
a[0] = a[1] = a[3] = 0; a[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
a[4] = a[5] = termios.B115200; a[6][termios.VMIN] = 0; a[6][termios.VTIME] = 0
termios.tcsetattr(fd, termios.TCSANOW, a)
log = open(os.path.expanduser("~/nsa310s-uart.log"), "ab", buffering=0)
out = b""
def czytaj(t):
    global out
    end = time.time() + t
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            d = os.read(fd, 4096); out += d; log.write(d)
args = sys.argv[1:]
if args and args[0] == "break":
    termios.tcsendbreak(fd, 0); czytaj(1.5); args = args[1:]
for c in args:
    for ch in c.encode() + b"\r":
        os.write(fd, bytes([ch])); time.sleep(0.01)
    czytaj(0.8)
sys.stdout.write(out.decode("latin1").replace("\r", ""))
