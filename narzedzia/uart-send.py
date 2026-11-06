#!/usr/bin/env python3
"""uart-send.py plik nazwa_na_nas – wysyła plik base64 (format uuencode -m) do 'cat > /tmp/x.b64' na konsoli."""
import os, sys, termios, time, select, base64
fd = os.open("/dev/ttyUSB0", os.O_RDWR | os.O_NOCTTY)
a = termios.tcgetattr(fd)
a[0] = a[1] = a[3] = 0; a[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
a[4] = a[5] = termios.B115200; a[6][termios.VMIN] = 0; a[6][termios.VTIME] = 0
termios.tcsetattr(fd, termios.TCSANOW, a)
def drain(t=0.0):
    end = time.time() + t
    while True:
        r, _, _ = select.select([fd], [], [], max(0, end - time.time()))
        if not r: break
        os.read(fd, 65536)
dane = open(sys.argv[1], "rb").read()
b = base64.b64encode(dane).decode()
linie = ["begin-base64 644 " + sys.argv[2]] + [b[i:i+76] for i in range(0, len(b), 76)] + ["===="]
os.write(fd, b"cat > /tmp/x.b64\r"); drain(1)
t0 = time.time()
for n, l in enumerate(linie):
    os.write(fd, l.encode() + b"\r")
    termios.tcdrain(fd)
    drain(0.004)
    if n % 2000 == 0:
        print(f"{n}/{len(linie)} {time.time()-t0:.0f}s", flush=True)
os.write(fd, b"\x04"); drain(2)
print("wysłano", len(linie), "linii w", round(time.time()-t0), "s")
