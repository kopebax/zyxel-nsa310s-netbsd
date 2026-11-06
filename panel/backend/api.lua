-- API panelu NAS NSA310S dla httpd(8) z NetBSD (bozohttpd, tryb Lua).
-- Uruchomienie: httpd ... -L api /usr/pkg/share/nas-panel/api.lua
-- Adresy: /api/<handler>, np. /api/status. Każde żądanie obsługuje osobny
-- proces potomny httpd (stan trzymamy w plikach, nie w zmiennych).
--
-- Bezpieczeństwo:
--  * hasło: PBKDF2-HMAC-SHA256 z solą w /etc/nas-panel/haslo,
--  * sesja: losowy token w ciasteczku HttpOnly; Secure; SameSite=Strict,
--    na dysku tylko jego skrót (/var/run/nas-panel),
--  * każde żądanie zmieniające stan (POST) wymaga nagłówka X-CSRF-Token,
--  * operacje roota wyłącznie przez nas-panel-priv (doas), bez argumentów
--    pochodzących wprost od użytkownika.

local httpd = require 'httpd'

package.path = "/usr/pkg/share/nas-panel/?.lua;" .. package.path
local sha = require 'sha256'

local HASLO = "/etc/nas-panel/haslo"
local SESJE = "/var/run/nas-panel"
local SESJA_CZAS = 8 * 3600		-- ważność sesji (s)
local BLOKADA = SESJE .. "/nieudane"	-- licznik nieudanych logowań

------------------------------------------------------------------ narzędzia

local function czytaj(plik)
	local f = io.open(plik, "r")
	if not f then return nil end
	local s = f:read("a")
	f:close()
	return s
end

local function zapisz(plik, tresc)
	local f = io.open(plik, "w")
	if not f then return false end
	f:write(tresc)
	f:close()
	return true
end

-- uruchamia polecenie (bez danych od użytkownika) i zwraca wyjście
local function polecenie(cmd)
	local p = io.popen(cmd .. " 2>/dev/null", "r")
	if not p then return "" end
	local s = p:read("a") or ""
	p:close()
	return s
end

local function trim(s)
	return (s or ""):match("^%s*(.-)%s*$")
end

local function losowe(n)
	local f = io.open("/dev/urandom", "rb")
	local b = f:read(n)
	f:close()
	return b
end

-- porównanie w stałym czasie
local function rowne(a, b)
	if #a ~= #b then return false end
	local r = 0
	for i = 1, #a do
		r = r | (a:byte(i) ~ b:byte(i))
	end
	return r == 0
end

------------------------------------------------------------------ nas-panel-priv

local PRIV_BIN = "/usr/pkg/bin/doas /usr/pkg/libexec/nas-panel/nas-panel-priv"
local BEZPIECZNY = "^[A-Za-z0-9._:/,@+-]+$"

-- uruchamia polecenie roota; argumenty tylko z bezpiecznego alfabetu
-- (bez cudzysłowów i spacji), dane wielowierszowe przez stdin
-- zwraca: ok (bool), wyjście (stdout+stderr)
local function priv(argumenty, wejscie)
	for _, a in ipairs(argumenty) do
		if not tostring(a):match(BEZPIECZNY) then
			return false, "Niedozwolone znaki w parametrze"
		end
	end
	-- nazwa z /dev/urandom: procesy potomne httpd dziedziczą ten sam stan
	-- math.random, więc równoległe żądania dostawałyby tę samą nazwę
	local wyj = SESJE .. "/priv." .. sha.hex(losowe(8))
	-- httpd ignoruje SIGCHLD, więc close() nie zna kodu wyjścia –
	-- dopisujemy go na końcu wyjścia
	local cmd = "{ " .. PRIV_BIN .. " " .. table.concat(argumenty, " ") ..
		"; echo \"@@kod=$?\"; } >" .. wyj .. " 2>&1"
	local p = io.popen(cmd, "w")
	if wejscie then p:write(wejscie) end
	p:close()
	local out = czytaj(wyj) or ""
	os.remove(wyj)
	local kod = tonumber(out:match("@@kod=(%d+)%s*$"))
	out = out:gsub("@@kod=%d+%s*$", "")
	return kod == 0, out
end

------------------------------------------------------------------ JSON

local function json(v)
	local t = type(v)
	if t == "nil" then
		return "null"
	elseif t == "boolean" then
		return v and "true" or "false"
	elseif t == "number" then
		if v ~= v or v == math.huge or v == -math.huge then return "null" end
		if math.type(v) == "integer" then return tostring(v) end
		return string.format("%.3f", v)
	elseif t == "string" then
		return '"' .. v:gsub('[%c"\\]', function(c)
			local m = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n',
				['\r'] = '\\r', ['\t'] = '\\t' }
			return m[c] or string.format("\\u%04x", c:byte())
		end) .. '"'
	elseif t == "table" then
		if #v > 0 or next(v) == nil and getmetatable(v) == "lista" then
			local o = {}
			for i = 1, #v do o[i] = json(v[i]) end
			return "[" .. table.concat(o, ",") .. "]"
		end
		local o, klucze = {}, {}
		for k in pairs(v) do klucze[#klucze + 1] = tostring(k) end
		table.sort(klucze)
		for _, k in ipairs(klucze) do
			o[#o + 1] = json(k) .. ":" .. json(v[k])
		end
		return "{" .. table.concat(o, ",") .. "}"
	end
	return "null"
end

local function lista(t)
	return setmetatable(t or {}, { __metatable = "lista" })
end

------------------------------------------------------------------ HTTP

local STATUSY = { [200] = "OK", [400] = "Bad Request", [401] = "Unauthorized",
	[403] = "Forbidden", [404] = "Not Found", [405] = "Method Not Allowed",
	[429] = "Too Many Requests", [500] = "Internal Server Error" }

local function odpowiedz(kod, dane, dodatkowe)
	local body = json(dane)
	httpd.write("HTTP/1.1 " .. kod .. " " .. (STATUSY[kod] or "") .. "\r\n")
	httpd.write("Content-Type: application/json; charset=utf-8\r\n")
	httpd.write("Content-Length: " .. #body .. "\r\n")
	httpd.write("Cache-Control: no-store\r\n")
	httpd.write("X-Content-Type-Options: nosniff\r\n")
	httpd.write("X-Frame-Options: DENY\r\n")
	for _, h in ipairs(dodatkowe or {}) do
		httpd.write(h .. "\r\n")
	end
	httpd.write("\r\n")
	httpd.write(body)
end

local function blad(kod, tekst)
	odpowiedz(kod, { blad = tekst })
end

-- nagłówki od bozohttpd: nazwy jak w żądaniu, więc szukamy bez wielkości liter
local function naglowek(headers, nazwa)
	nazwa = nazwa:lower()
	for k, v in pairs(headers or {}) do
		if k:lower() == nazwa then return v end
	end
	return nil
end

local function ciasteczko(headers, nazwa)
	local c = naglowek(headers, "cookie") or ""
	for k, v in c:gmatch("([^=;%s]+)=([^;]*)") do
		if k == nazwa then return v end
	end
	return nil
end

------------------------------------------------------------------ sesje

local function sesja_plik(token)
	return SESJE .. "/" .. sha.hexdigest(token)
end

-- zwraca tabelę sesji albo nil
local function sesja(headers)
	local token = ciasteczko(headers, "nas_sesja")
	if not token or not token:match("^%x+$") or #token ~= 64 then return nil end
	local s = czytaj(sesja_plik(token))
	if not s then return nil end
	local wygasa, csrf, kto, admin = s:match("^(%d+) (%x+) (%S+) (%d)")
	if not wygasa or tonumber(wygasa) < os.time() then
		os.remove(sesja_plik(token))
		return nil
	end
	return { token = token, csrf = csrf, uzytkownik = kto, admin = admin == "1" }
end

-- zalogowany + (POST) poprawny token CSRF + (domyślnie) konto administratora;
-- dla_wszystkich = true: także zwykli użytkownicy (pliki, własne hasło)
local function wymagaj(env, headers, post, dla_wszystkich)
	local s = sesja(headers)
	if not s then
		blad(401, "Wymagane logowanie")
		return nil
	end
	if not s.admin and not dla_wszystkich then
		blad(403, "Tylko dla administratora")
		return nil
	end
	if post then
		if env.REQUEST_METHOD ~= "POST" then
			blad(405, "Wymagany POST")
			return nil
		end
		local t = naglowek(headers, "x-csrf-token") or ""
		if not rowne(t, s.csrf) then
			blad(403, "Zły token CSRF")
			return nil
		end
	end
	return s
end

------------------------------------------------------------------ dane systemu

local function df(punkt)
	local out = polecenie("/bin/df -k " .. punkt)
	local _, rozmiar, zajete, wolne = out:match("\n(%S+)%s+(%d+)%s+(%d+)%s+(%d+)")
	if not rozmiar then return nil end
	return { punkt = punkt, rozmiar = tonumber(rozmiar) * 1024,
		zajete = tonumber(zajete) * 1024, wolne = tonumber(wolne) * 1024 }
end

local function siec()
	local out = polecenie("/sbin/ifconfig mvgbe0")
	return {
		interfejs = "mvgbe0",
		mac = out:match("address: (%x+:%x+:%x+:%x+:%x+:%x+)"),
		ip = out:match("inet (%d+%.%d+%.%d+%.%d+)"),
		maska = tonumber(out:match("inet %d+%.%d+%.%d+%.%d+/(%d+)")),
		media = out:match("media: [^(]*%(([^)]+)%)") or out:match("media: (%S+)"),
		status = out:match("status: (%S+)"),
	}
end

-- ps pokazuje argv[0] (np. /usr/sbin/nfsd, "sshd: /usr/sbin/sshd [listener]")
local procesy
local function dziala(nazwa)
	procesy = procesy or polecenie("/bin/ps -axo comm=")
	for linia in procesy:gmatch("[^\n]+") do
		local prog = linia:match("^(%S+)")
		if prog and (prog:match("/" .. nazwa .. "$") or prog == nazwa .. ":") then
			return true
		end
	end
	return false
end

local function pamiec()
	local fizyczna = tonumber(trim(polecenie("/sbin/sysctl -n hw.physmem64"))) or 0
	local vs = polecenie("/usr/bin/vmstat -s")
	local strona = tonumber(vs:match("(%d+) bytes per page")) or 4096
	local wolne = tonumber(vs:match("(%d+) pages free")) or 0
	return { calkowita = fizyczna, wolna = wolne * strona }
end

------------------------------------------------------------------ handlery

local H = {}

-- wspólne: wynik operacji roota jako odpowiedź
local function wynik(ok, out, dane)
	if ok then
		return odpowiedz(200, dane or { ok = true })
	end
	out = trim(out)
	return blad(400, out ~= "" and out or "Operacja nie powiodła się")
end

-- linie z pola formularza (dane wielowierszowe)
local function linie(tekst)
	local t = {}
	for wiersz in (tekst or ""):gmatch("[^\r\n]+") do
		local l = trim(wiersz)
		if l ~= "" then t[#t + 1] = l end
	end
	return t
end

local function pole(query, nazwa)
	return query and query[nazwa] or ""
end

local HASLA = "/etc/nas-panel/hasla"

-- wpis PBKDF2 użytkownika z /etc/nas-panel/hasla
local function wpis_hasla(kto)
	for linia in (czytaj(HASLA) or ""):gmatch("[^\n]+") do
		local u, w = linia:match("^(%S+) (%S+)$")
		if u == kto then return w end
	end
	return nil
end

local function haslo_pasuje(kto, haslo)
	local iter, sol, skrot = (wpis_hasla(kto) or ""):match("^pbkdf2%$(%d+)%$(%x+)%$(%x+)$")
	return iter ~= nil and haslo ~= "" and rowne(sha.pbkdf2(haslo, sol, tonumber(iter)), skrot)
end

local function nowy_wpis_hasla(haslo)
	local sol = sha.hex(losowe(16))
	return string.format("pbkdf2$300$%s$%s", sol, sha.pbkdf2(haslo, sol, 300))
end

local function grupy_uzytkownika(kto)
	local g = {}
	for x in polecenie("/usr/bin/id -Gn " .. kto):gmatch("%S+") do g[x] = true end
	return g
end

function H.login(env, headers, query)
	if env.REQUEST_METHOD ~= "POST" then return blad(405, "Wymagany POST") end
	-- prosta blokada: po 5 nieudanych próbach 60 s przerwy
	local nieudane = czytaj(BLOKADA) or ""
	local ile, od = nieudane:match("(%d+) (%d+)")
	ile, od = tonumber(ile) or 0, tonumber(od) or 0
	if ile >= 5 and os.time() - od < 60 then
		return blad(429, "Za dużo prób – spróbuj za minutę")
	end
	local kto = pole(query, "uzytkownik")
	if kto == "" then kto = "admin" end
	if not kto:match("^[a-z][a-z0-9_-]*$") or not haslo_pasuje(kto, pole(query, "haslo")) then
		zapisz(BLOKADA, string.format("%d %d", ile + 1, os.time()))
		os.execute("sleep 1")
		return blad(401, "Zła nazwa użytkownika lub hasło")
	end
	os.remove(BLOKADA)
	local admin = grupy_uzytkownika(kto).wheel and 1 or 0
	local token = sha.hex(losowe(32))
	local csrf = sha.hex(losowe(16))
	zapisz(sesja_plik(token), string.format("%d %s %s %d\n", os.time() + SESJA_CZAS, csrf, kto, admin))
	odpowiedz(200, { csrf = csrf, uzytkownik = kto, admin = admin == 1 }, {
		"Set-Cookie: nas_sesja=" .. token ..
		"; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=" .. SESJA_CZAS })
end

function H.logout(env, headers, query)
	local s = wymagaj(env, headers, true, true)
	if not s then return end
	os.remove(sesja_plik(s.token))
	odpowiedz(200, { ok = true }, {
		"Set-Cookie: nas_sesja=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0" })
end

function H.sesja(env, headers, query)
	local s = sesja(headers)
	if not s then return blad(401, "Wymagane logowanie") end
	odpowiedz(200, { csrf = s.csrf, uzytkownik = s.uzytkownik, admin = s.admin })
end

------------------------------------------------------------------ stan

function H.status(env, headers, query)
	if not wymagaj(env, headers, false) then return end
	local boot = tonumber(trim(polecenie("/sbin/sysctl -n kern.boottime")):match("^(%d+)")) or 0
	local load = trim(polecenie("/sbin/sysctl -n vm.loadavg"))
	local l1, l5, l15 = load:match("([%d.]+)%s+([%d.]+)%s+([%d.]+)")
	local wake = tonumber(trim(polecenie("/sbin/sysctl -n hw.htrtc0.wakeup"))) or 0
	odpowiedz(200, {
		nazwa = trim(polecenie("/bin/hostname")),
		system = trim(polecenie("/usr/bin/uname -sr")),
		jadro = trim(polecenie("/usr/bin/uname -v")),
		czas = os.time(),
		strefa = trim(polecenie("/bin/date +%Z")),
		uruchomiony = boot,
		obciazenie = { tonumber(l1), tonumber(l5), tonumber(l15) },
		pamiec = pamiec(),
		dyski = lista({ df("/"), df("/dysk") }),
		siec = siec(),
		budzenie = wake,
		uslugi = {
			sshd = dziala("sshd"), nfsd = dziala("nfsd"), mountd = dziala("mountd"),
			ntpd = dziala("ntpd"), powerd = dziala("powerd"),
		},
	})
end

function H.diody(env, headers, query)
	if not wymagaj(env, headers, false) then return end
	local d = {}
	for nazwa, stan in select(2, priv({ "leds" })):gmatch("pin (%S+): state (%d)") do
		d[nazwa] = stan == "1"
	end
	odpowiedz(200, d)
end

------------------------------------------------------------------ dysk

function H.smart(env, headers, query)
	if not wymagaj(env, headers, false) then return end
	local _, out = priv({ "smart" })
	-- format atactl(8): "%3d %3d  %3d     %-3s %-7s %stive    %-27s raw"
	local atrybuty = lista()
	for linia in out:gmatch("[^\n]+") do
		local id, wartosc, prog, reszta =
		    linia:match("^%s*(%d+)%s+(%d+)%s+(%d+)%s+%a+%s+%a+%s+%a+tive    (.*)$")
		if id then
			atrybuty[#atrybuty + 1] = { id = tonumber(id), nazwa = trim(reszta:sub(1, 27)),
				wartosc = tonumber(wartosc), prog = tonumber(prog),
				surowa = trim(reszta:sub(29)) }
		end
	end
	local temp
	for _, a in ipairs(atrybuty) do
		if a.id == 194 then temp = tonumber(a.surowa:match("^(%d+)")) end
	end
	local testy = lista()
	for nr, opis, stan in out:gmatch("Log entry: (%d+)\n\tName: ([^\n]+)\n\tStatus: ([^\n]+)") do
		testy[#testy + 1] = { nr = tonumber(nr), opis = opis, stan = stan }
	end
	local zdrowie
	if out:find("SMART supported, SMART enabled", 1, true) then
		zdrowie = out:find("Threshold exceeds condition", 1, true) and "FAILED" or "PASSED"
	end
	odpowiedz(200, {
		model = out:match("Model: ([^,\n]+)"),
		numer = out:match("Serial #:%s*([^\n]+)"),
		pojemnosc = out:match("Capacity ([^,\n]+)"),
		zdrowie = zdrowie,
		temperatura = temp,
		atrybuty = atrybuty,
		testy = testy,
	})
end

function H.smart_test(env, headers, query)
	if not wymagaj(env, headers, true) then return end
	wynik(priv({ "smart-test" }))
end

function H.fsck(env, headers, query)
	if env.REQUEST_METHOD == "POST" then
		if not wymagaj(env, headers, true) then return end
		return wynik(priv({ "fsck-dysk" }))
	end
	if not wymagaj(env, headers, false) then return end
	local _, out = priv({ "fsck-stan" })
	local stan, reszta = out:match("^(%S+)\n?(.*)$")
	odpowiedz(200, { trwa = stan == "trwa", dziennik = reszta or "" })
end

------------------------------------------------------------------ udziały i zapora

-- model udziałów (/etc/nas-panel/udzialy) -> lista
local function wczytaj_model()
	local u, wg = lista(), {}
	for typ, n, reszta in (czytaj("/etc/nas-panel/udzialy") or ""):gmatch("(%a+) (%S+) ?([^\n]*)") do
		local x = wg[n]
		if typ == "udzial" then
			x = { nazwa = n, sciezka = "/dysk/" .. n, wlasciciel = reszta:match("wlasciciel=(%S+)") or "admin",
				kosz = reszta:match("kosz=tak") ~= nil, smb = reszta:match("smb=tak") ~= nil,
				prawa = lista(), nfs = nil }
			wg[n] = x
			u[#u + 1] = x
		elseif x and typ == "prawa" then
			for kind, kto, p in reszta:gmatch("([ug]):(%S-)=(r[wo])") do
				x.prawa[#x.prawa + 1] = { typ = kind == "u" and "uzytkownik" or "grupa", nazwa = kto, prawo = p }
			end
		elseif x and typ == "nfs" then
			local tryb, kl = reszta:match("^(%S+) (%S+)")
			local k = lista()
			for c in (kl or ""):gmatch("[^,]+") do k[#k + 1] = c end
			x.nfs = { tryb = tryb, klienci = k }
		end
	end
	return u, wg
end

-- prawo użytkownika do udziału: "rw", "ro" albo nil (administrator: rw)
local function prawo(s, udzial)
	if s.admin then return "rw" end
	local _, wg = wczytaj_model()
	local x = wg[udzial]
	if not x then return nil end
	local grupy = grupy_uzytkownika(s.uzytkownik)
	local najlepsze
	for _, p in ipairs(x.prawa) do
		if (p.typ == "uzytkownik" and p.nazwa == s.uzytkownik) or (p.typ == "grupa" and grupy[p.nazwa]) then
			if p.prawo == "rw" then return "rw" end
			najlepsze = "ro"
		end
	end
	return najlepsze
end

function H.udzialy(env, headers, query)
	if env.REQUEST_METHOD == "POST" then
		if not wymagaj(env, headers, true) then return end
		-- dane: gotowe wiersze modelu (udzial/prawa/nfs) – sprawdza nas-panel-priv
		return wynik(priv({ "udzialy-model-ustaw" }, table.concat(linie(pole(query, "dane")), "\n") .. "\n"))
	end
	if not wymagaj(env, headers, false) then return end
	odpowiedz(200, { udzialy = (wczytaj_model()),
		samba = io.open("/usr/pkg/sbin/smbd", "r") ~= nil })
end

------------------------------------------------------------------ przeglądarka plików

-- polecenie pliki-* z udziałem i ścieżką na stdin (nazwy mogą mieć spacje)
local function sciezka_ok(p)
	return not p:find("[\n\r%z]") and not ("/" .. p .. "/"):find("/%.%.?/")
end

function H.pliki(env, headers, query)
	local post = env.REQUEST_METHOD == "POST"
	local s = wymagaj(env, headers, post, true)
	if not s then return end
	local udz, sc = pole(query, "udzial"), pole(query, "sciezka"):gsub("^/+", ""):gsub("/+$", "")
	if udz == "" and not post then
		-- lista udziałów dostępnych dla użytkownika
		local l = lista()
		for _, x in ipairs((wczytaj_model())) do
			local p = prawo(s, x.nazwa)
			if p then l[#l + 1] = { nazwa = x.nazwa, prawo = p } end
		end
		return odpowiedz(200, { udzialy = l })
	end
	local p = prawo(s, udz)
	if not p then return blad(403, "Brak dostępu do tego udziału") end
	if not sciezka_ok(sc) then return blad(400, "Zła ścieżka") end
	local naglowek_sciezki = udz .. "\n" .. sc .. "\n"
	if not post then
		local ok, out = priv({ "pliki-lista" }, naglowek_sciezki)
		if not ok then return wynik(ok, out) end
		local l = lista()
		for t, rozm, czas, nazwa in out:gmatch("([df])\t(%d+)\t(%d+)\t([^\n]+)") do
			l[#l + 1] = { nazwa = nazwa, katalog = t == "d", rozmiar = tonumber(rozm), zmieniony = tonumber(czas) }
		end
		return odpowiedz(200, { pliki = l, prawo = p })
	end
	if p ~= "rw" then return blad(403, "Masz tylko prawo odczytu") end
	local akcja = pole(query, "akcja")
	if akcja == "folder" then return wynik(priv({ "pliki-folder" }, naglowek_sciezki)) end
	if akcja == "usun" then return wynik(priv({ "pliki-usun" }, naglowek_sciezki)) end
	if akcja == "zmien" then
		local nowa = pole(query, "nowa"):gsub("^/+", "")
		if not sciezka_ok(nowa) or nowa == "" then return blad(400, "Zła nowa nazwa") end
		return wynik(priv({ "pliki-zmien" }, naglowek_sciezki .. nowa .. "\n"))
	end
	if akcja == "wgraj" then
		-- kawałek pliku: nr (od 0), dane (base64, jeden wiersz), ostatni=1 na końcu
		local nr = pole(query, "nr")
		if not nr:match("^%d+$") then return blad(400, "Zły numer kawałka") end
		local dane = pole(query, "dane")
		if dane:find("[^%w+/=]") then return blad(400, "Złe dane") end
		local ok, out = priv({ "pliki-dopisz" }, naglowek_sciezki .. nr .. "\n" .. dane)
		if not ok then return wynik(ok, out) end
		if pole(query, "ostatni") == "1" then
			return wynik(priv({ "pliki-zakoncz" }, naglowek_sciezki))
		end
		return odpowiedz(200, { rozmiar = tonumber(out:match("(%d+)")) })
	end
	blad(400, "Zła akcja")
end

-- pobranie pliku (strumieniem, kawałkami po 64 KB)
function H.pobierz(env, headers, query)
	local s = wymagaj(env, headers, false, true)
	if not s then return end
	local udz, sc = pole(query, "udzial"), pole(query, "sciezka"):gsub("^/+", "")
	if not prawo(s, udz) then return blad(403, "Brak dostępu do tego udziału") end
	if not sciezka_ok(sc) or sc == "" then return blad(400, "Zła ścieżka") end
	local ok, out = priv({ "pliki-info" }, udz .. "\n" .. sc .. "\n")
	local rozmiar = tonumber(out:match("^(%d+)"))
	if not ok or not rozmiar then return wynik(false, out) end
	local wej = SESJE .. "/pobierz." .. sha.hex(losowe(8))
	zapisz(wej, udz .. "\n" .. sc .. "\n")
	local p = io.popen(PRIV_BIN .. " pliki-czytaj <" .. wej .. " 2>/dev/null", "r")
	local nazwa = sc:match("([^/]+)$"):gsub('"', "")
	httpd.write("HTTP/1.1 200 OK\r\n")
	httpd.write("Content-Type: application/octet-stream\r\n")
	httpd.write("Content-Disposition: attachment; filename*=UTF-8''" ..
		nazwa:gsub("[^%w%-%._~]", function(c) return string.format("%%%02X", c:byte()) end) .. "\r\n")
	httpd.write("Content-Length: " .. rozmiar .. "\r\n")
	httpd.write("Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n")
	while true do
		local k = p:read(65536)
		if not k then break end
		httpd.write(k)
	end
	p:close()
	os.remove(wej)
end

function H.zapora(env, headers, query)
	if env.REQUEST_METHOD == "POST" then
		if not wymagaj(env, headers, true) then return end
		local klient = env.REMOTE_ADDR or ""
		local wej = table.concat(linie(pole(query, "dom")), "\n") .. "\n"
		return wynik(priv({ "zapora-ustaw", klient }, wej))
	end
	if not wymagaj(env, headers, false) then return end
	local _, out = priv({ "firewall" })
	local dom, nfs = lista(), lista()
	local cel
	for l in out:gmatch("[^\n]+") do
		if l == "--- dom" then cel = dom
		elseif l == "--- nfs" then cel = nfs
		elseif cel then cel[#cel + 1] = trim(l) end
	end
	odpowiedz(200, { aktywna = out:match("filtering:%s*active") ~= nil,
		dom = dom, nfs = nfs, klient = env.REMOTE_ADDR })
end

------------------------------------------------------------------ usługi

local USLUGI = { nfs = true, ntpd = true, sshd = true, powerd = true, cron = true, naspanel = true }

function H.uslugi(env, headers, query)
	if env.REQUEST_METHOD == "POST" then
		if not wymagaj(env, headers, true) then return end
		local nazwa, akcja = pole(query, "nazwa"), pole(query, "akcja")
		if not USLUGI[nazwa] then return blad(400, "Nieznana usługa") end
		if akcja == "wlacz_autostart" or akcja == "wylacz_autostart" then
			return wynik(priv({ "usluga-autostart", nazwa, akcja == "wlacz_autostart" and "YES" or "NO" }))
		end
		if akcja ~= "start" and akcja ~= "stop" and akcja ~= "restart" then
			return blad(400, "Zła akcja")
		end
		return wynik(priv({ "usluga", nazwa, akcja }))
	end
	if not wymagaj(env, headers, false) then return end
	local u = lista()
	for n, dz, wl in select(2, priv({ "uslugi" })):gmatch("(%S+) (%d) (%d)") do
		u[#u + 1] = { nazwa = n, dziala = dz == "1", autostart = wl == "1" }
	end
	odpowiedz(200, { uslugi = u })
end

------------------------------------------------------------------ system

function H.czas(env, headers, query)
	if env.REQUEST_METHOD == "POST" then
		if not wymagaj(env, headers, true) then return end
		local nazwa, strefa = pole(query, "nazwa"), pole(query, "strefa")
		local ntp = linie(pole(query, "ntp"))
		if nazwa ~= "" then
			local ok, out = priv({ "nazwa-ustaw", nazwa })
			if not ok then return wynik(ok, out) end
		end
		if strefa ~= "" then
			local ok, out = priv({ "strefa-ustaw", strefa })
			if not ok then return wynik(ok, out) end
		end
		if #ntp > 0 then
			local ok, out = priv({ "ntp-ustaw" }, table.concat(ntp, "\n") .. "\n")
			if not ok then return wynik(ok, out) end
		end
		-- harmonogram liczony w czasie lokalnym – przelicz budzik
		priv({ "harmonogram-uzbroj" })
		return odpowiedz(200, { ok = true })
	end
	if not wymagaj(env, headers, false) then return end
	local _, out = priv({ "czas" })
	local serwery = lista()
	for s in out:gmatch("\n?%a+ ([%w.-]+) iburst") do serwery[#serwery + 1] = s end
	if #serwery == 0 then
		for s in out:gmatch("\n?pool ([%w.-]+)") do serwery[#serwery + 1] = s end
		for s in out:gmatch("\n?server ([%w.-]+)") do serwery[#serwery + 1] = s end
	end
	local zrodlo, przesuniecie = out:match("synchronizacja (%S+) (%S+)")
	odpowiedz(200, {
		nazwa = out:match("nazwa (%S+)"),
		strefa = out:match("strefa (%S+)"),
		czas = os.time(),
		ntp = serwery,
		synchronizacja = zrodlo and { zrodlo = zrodlo, przesuniecie_ms = tonumber(przesuniecie) } or nil,
	})
end

function H.strefy(env, headers, query)
	if not wymagaj(env, headers, false) then return end
	local l = lista()
	for z in polecenie("cd /usr/share/zoneinfo && /usr/bin/find . -type f | /usr/bin/sed 's|^./||' | /usr/bin/grep -E '^[A-Z][A-Za-z_]+/[A-Za-z_+-]' | /usr/bin/grep -v -E '^(posix|right|Etc|SystemV)/' | /usr/bin/sort"):gmatch("[^\n]+") do
		l[#l + 1] = z
	end
	l[#l + 1] = "UTC"
	odpowiedz(200, { strefy = l })
end

function H.siec(env, headers, query)
	if env.REQUEST_METHOD == "POST" then
		if not wymagaj(env, headers, true) then return end
		local tryb = pole(query, "tryb")
		if tryb == "potwierdz" then return wynik(priv({ "siec-potwierdz" })) end
		if tryb == "dhcp" then return wynik(priv({ "siec-ustaw", "dhcp" })) end
		if tryb == "static" then
			return wynik(priv({ "siec-ustaw", "static", pole(query, "adres"),
				pole(query, "brama"), pole(query, "dns") }))
		end
		return blad(400, "Zły tryb")
	end
	if not wymagaj(env, headers, false) then return end
	local _, out = priv({ "siec" })
	local dns = lista()
	for d in out:gmatch("nameserver (%S+)") do dns[#dns + 1] = d end
	local s = siec()
	odpowiedz(200, {
		dhcp = out:match("dhcp (%d)") == "1",
		statyczny = out:match("statyczny inet (%S+)"),
		brama = out:match("brama (%S+)"),
		dns = dns,
		ip = s.ip, maska = s.maska, mac = s.mac, media = s.media, status = s.status,
		oczekuje_potwierdzenia = out:match("oczekuje_potwierdzenia (%d+)") ~= nil,
	})
end

function H.uzytkownicy(env, headers, query)
	if env.REQUEST_METHOD == "POST" then
		if not wymagaj(env, headers, true) then return end
		local akcja, nazwa = pole(query, "akcja"), pole(query, "nazwa")
		if akcja == "dodaj" then
			local haslo = pole(query, "haslo")
			if #haslo < 8 then return blad(400, "Hasło musi mieć co najmniej 8 znaków") end
			local ok, out = priv({ "uzytkownik-dodaj", nazwa })
			if not ok then return wynik(ok, out) end
			ok, out = priv({ "uzytkownik-haslo", nazwa }, nowy_wpis_hasla(haslo) .. "\n" .. haslo .. "\n")
			if not ok then return wynik(ok, out) end
			if pole(query, "admin") == "1" then priv({ "uzytkownik-typ", nazwa, "admin" }) end
			return odpowiedz(200, { ok = true })
		end
		if akcja == "haslo" then
			local haslo = pole(query, "haslo")
			if #haslo < 8 then return blad(400, "Hasło musi mieć co najmniej 8 znaków") end
			return wynik(priv({ "uzytkownik-haslo", nazwa }, nowy_wpis_hasla(haslo) .. "\n" .. haslo .. "\n"))
		end
		if akcja == "typ" then return wynik(priv({ "uzytkownik-typ", nazwa, pole(query, "typ") })) end
		if akcja == "usun" then return wynik(priv({ "uzytkownik-usun", nazwa })) end
		if akcja == "klucze" then
			return wynik(priv({ "uzytkownik-klucze", nazwa }, table.concat(linie(pole(query, "klucze")), "\n") .. "\n"))
		end
		return blad(400, "Zła akcja")
	end
	if not wymagaj(env, headers, false) then return end
	local nazwa = query and query.klucze
	if nazwa then
		local ok, out = priv({ "uzytkownik-klucze-pokaz", nazwa })
		return odpowiedz(200, { klucze = ok and out or "" })
	end
	local u = lista()
	for n, id, g, k, h in select(2, priv({ "uzytkownicy" })):gmatch("(%S+) (%d+) (%S+) (%d+) (%d)") do
		local grupy = lista()
		local admin = false
		for x in g:gmatch("[^,]+") do
			grupy[#grupy + 1] = x
			if x == "wheel" then admin = true end
		end
		u[#u + 1] = { nazwa = n, uid = tonumber(id), grupy = grupy, klucze = tonumber(k),
			haslo = h == "1", admin = admin }
	end
	odpowiedz(200, { uzytkownicy = u })
end

function H.grupy(env, headers, query)
	if env.REQUEST_METHOD == "POST" then
		if not wymagaj(env, headers, true) then return end
		local akcja, nazwa = pole(query, "akcja"), pole(query, "nazwa")
		if akcja == "dodaj" then return wynik(priv({ "grupa-dodaj", nazwa })) end
		if akcja == "usun" then return wynik(priv({ "grupa-usun", nazwa })) end
		if akcja == "czlonkowie" then
			return wynik(priv({ "grupa-czlonkowie", nazwa }, table.concat(linie(pole(query, "czlonkowie")), "\n") .. "\n"))
		end
		return blad(400, "Zła akcja")
	end
	if not wymagaj(env, headers, false) then return end
	local g = lista()
	for n, id, cz in select(2, priv({ "grupy" })):gmatch("(%S+) (%d+) (%S+)") do
		local c = lista()
		if cz ~= "-" then for x in cz:gmatch("[^,]+") do c[#c + 1] = x end end
		g[#g + 1] = { nazwa = n, gid = tonumber(id), czlonkowie = c }
	end
	odpowiedz(200, { grupy = g })
end

------------------------------------------------------------------ zasilanie i harmonogram

function H.zasilanie(env, headers, query)
	if not wymagaj(env, headers, true) then return end
	local akcja = pole(query, "akcja")
	if akcja ~= "shutdown" and akcja ~= "reboot" then return blad(400, "Nieznana akcja") end
	wynik(priv({ akcja }), nil, { ok = true, akcja = akcja })
end

function H.budzenie(env, headers, query)
	if not wymagaj(env, headers, true) then return end
	local t = pole(query, "czas")
	if not t:match("^%d+$") then return blad(400, "Zły czas") end
	priv({ "wakeup", t })
	local wake = tonumber(trim(polecenie("/sbin/sysctl -n hw.htrtc0.wakeup"))) or 0
	if tostring(wake) ~= t then
		return blad(400, "Nie ustawiono (maks. 27 dni naprzód, nie w przeszłości)")
	end
	odpowiedz(200, { budzenie = wake })
end

function H.usypianie(env, headers, query)
	if env.REQUEST_METHOD == "POST" then
		if not wymagaj(env, headers, true) then return end
		local ok, out = priv({ "dysk-usypianie", pole(query, "minuty") })
		if not ok then return wynik(ok, out) end
	elseif not wymagaj(env, headers, false) then
		return
	end
	odpowiedz(200, { minuty = tonumber(trim(czytaj("/etc/nas-panel/usypianie") or "")) or 0 })
end

function H.harmonogram(env, headers, query)
	if env.REQUEST_METHOD == "POST" then
		if not wymagaj(env, headers, true) then return end
		local wej = {}
		for _, l in ipairs(linie(pole(query, "dane"))) do
			local typ, dni, godz = l:match("^(%a+)%s+([%d,]+)%s+(%d%d:%d%d)$")
			if not typ then return blad(400, "Zły wiersz: " .. l) end
			wej[#wej + 1] = typ .. " " .. dni .. " " .. godz
		end
		local ok, out = priv({ "harmonogram-ustaw" }, table.concat(wej, "\n") .. "\n")
		if not ok then return wynik(ok, out) end
	elseif not wymagaj(env, headers, false) then
		return
	end
	local wpisy = lista()
	for typ, dni, godz in (czytaj("/etc/nas-panel/harmonogram") or ""):gmatch("(%a+) ([%d,]+) (%d%d:%d%d)") do
		local d = lista()
		for x in dni:gmatch("%d") do d[#d + 1] = tonumber(x) end
		wpisy[#wpisy + 1] = { typ = typ, dni = d, godzina = godz }
	end
	odpowiedz(200, { wpisy = wpisy,
		budzenie = tonumber(trim(polecenie("/sbin/sysctl -n hw.htrtc0.wakeup"))) or 0 })
end

------------------------------------------------------------------ przycisk COPY

function H.copy(env, headers, query)
	if env.REQUEST_METHOD == "POST" then
		if not wymagaj(env, headers, true) then return end
		if pole(query, "akcja") == "uruchom" then return wynik(priv({ "copy-uruchom" })) end
		return wynik(priv({ "copy-ustaw", pole(query, "cel"), pole(query, "tryb") }))
	end
	if not wymagaj(env, headers, false) then return end
	local k = czytaj("/etc/nas-panel/copy.conf") or ""
	local _, log = priv({ "log", "copy", "40" })
	odpowiedz(200, { cel = k:match("cel=([^\n]+)") or "/dysk/USB-kopie",
		tryb = k:match("tryb=([^\n]+)") or "kopia", dziennik = log })
end

------------------------------------------------------------------ bezpieczeństwo

function H.certyfikat(env, headers, query)
	if env.REQUEST_METHOD == "POST" then
		if not wymagaj(env, headers, true) then return end
		return wynik(priv({ "cert-nowy" }))
	end
	if not wymagaj(env, headers, false) then return end
	local _, out = priv({ "cert" })
	odpowiedz(200, {
		podmiot = out:match("subject=([^\n]+)"),
		wazny_do = out:match("notAfter=([^\n]+)"),
		nazwy = trim(out:match("Subject Alternative Name:%s*\n%s*([^\n]+)") or ""),
		odcisk = out:match("Fingerprint=([%x:]+)"),
	})
end

function H.haslo(env, headers, query)
	local s = wymagaj(env, headers, true, true)
	if not s then return end
	local stare, nowe = pole(query, "stare"), pole(query, "nowe")
	if not haslo_pasuje(s.uzytkownik, stare) then
		os.execute("sleep 1")
		return blad(400, "Obecne hasło jest niepoprawne")
	end
	if #nowe < 8 then return blad(400, "Nowe hasło musi mieć co najmniej 8 znaków") end
	wynik(priv({ "uzytkownik-haslo", s.uzytkownik }, nowy_wpis_hasla(nowe) .. "\n" .. nowe .. "\n"))
end

------------------------------------------------------------------ konserwacja

function H.aktualizacje(env, headers, query)
	if env.REQUEST_METHOD == "POST" then
		if not wymagaj(env, headers, true) then return end
		local a = pole(query, "akcja")
		if a == "sprawdz" then return wynik(priv({ "aktualizacje-sprawdz" })) end
		if a == "aktualizuj" then return wynik(priv({ "aktualizuj" })) end
		return blad(400, "Zła akcja")
	end
	if not wymagaj(env, headers, false) then return end
	local stan = czytaj("/var/log/nas-panel/aktualizacje-stan.txt") or ""
	local _, log = priv({ "log", "aktualizacja", "60" })
	local do_akt, audyt, bledy = lista(), lista(), lista()
	local cel
	for l in stan:gmatch("[^\n]+") do
		if l == "--- do aktualizacji" then cel = do_akt
		elseif l == "--- audyt" then cel = audyt
		elseif l == "--- blad" then cel = bledy
		elseif l:match("^%-%-%-") then cel = nil
		elseif cel then cel[#cel + 1] = l end
	end
	odpowiedz(200, {
		sprawdzono = stan:match("^sprawdzono (%d+)") and tonumber(stan:match("^sprawdzono (%d+)")) or 0,
		trwa = stan:match("^trwa") ~= nil and os.time() - (tonumber(stan:match("^trwa (%d+)")) or 0) < 1800,
		do_aktualizacji = do_akt, audyt = audyt, bledy = bledy,
		system = trim(polecenie("/usr/bin/uname -sr")),
		dziennik = log,
	})
end

function H.dziennik(env, headers, query)
	if not wymagaj(env, headers, false) then return end
	local rodzaj = query and query.rodzaj or "messages"
	local DOZWOLONE = { messages = true, authlog = true, fsck = true, copy = true, aktualizacja = true }
	if not DOZWOLONE[rodzaj] then return blad(400, "Nieznany dziennik") end
	local n = tonumber(query and query.n or "") or 200
	n = math.max(1, math.min(2000, math.floor(n)))
	local l = lista()
	for x in select(2, priv({ "log", rodzaj, tostring(n) })):gmatch("[^\n]+") do
		l[#l + 1] = x
	end
	odpowiedz(200, { linie = l })
end

-- wgrywanie pliku kawałkami: id (32 hex), nr (od 0), dane (base64);
-- plik trafia do katalogu sesji (właściciel nasweb), max 20 MB
local WGRANE_MAX = 20 * 1024 * 1024

function H.wgraj(env, headers, query)
	if not wymagaj(env, headers, true) then return end
	local id, nr = pole(query, "id"), tonumber(pole(query, "nr"))
	if not id:match("^%x+$") or #id ~= 32 or not nr then return blad(400, "Złe parametry") end
	local dane = pole(query, "dane")
	if dane:find("[^%w+/=]") then return blad(400, "Złe dane (base64)") end
	local plik = SESJE .. "/wgrane-" .. id:lower()
	if nr == 0 then os.remove(plik) end
	-- dekodowanie base64 w C (openssl) – kilka razy szybciej niż w Lua
	local p = io.popen("/usr/bin/openssl base64 -d -A >> " .. plik, "w")
	p:write(dane)
	p:close()
	local f = io.open(plik, "rb")
	local rozmiar = f and f:seek("end") or 0
	if f then f:close() end
	if rozmiar > WGRANE_MAX then
		os.remove(plik)
		return blad(400, "Plik za duży (maks. 20 MB)")
	end
	odpowiedz(200, { rozmiar = rozmiar })
end

-- weryfikacja i przywracanie wgranej kopii konfiguracji
local function raport_kopii(out)
	local zm = lista()
	for typ, f in out:gmatch("\n(%a+) ([^\n]+)") do
		if typ == "zmieniony" or typ == "nowy" then zm[#zm + 1] = { typ = typ, plik = f } end
	end
	return {
		nazwa = out:match("nazwa (%S+)"),
		data = tonumber(out:match("\ndata (%d+)")),
		system = out:match("\nsystem ([^\n]+)"),
		plikow = tonumber(out:match("plikow (%d+)")),
		zmiany = zm,
		przywrocono = tonumber(out:match("przywrocono (%d+)")),
		kopia_poprzedniej = out:match("\nkopia (%S+)"),
	}
end

function H.kopia_sprawdz(env, headers, query)
	if not wymagaj(env, headers, true) then return end
	local ok, out = priv({ "kopia-sprawdz", pole(query, "id"):lower() })
	if not ok then
		priv({ "wgrane-usun", pole(query, "id"):lower() })
		return wynik(ok, out)
	end
	odpowiedz(200, raport_kopii(out))
end

function H.kopia_przywroc(env, headers, query)
	if not wymagaj(env, headers, true) then return end
	local ok, out = priv({ "kopia-przywroc", pole(query, "id"):lower() })
	if not ok then return wynik(ok, out) end
	odpowiedz(200, raport_kopii(out))
end

-- kopia konfiguracji (tar.gz, bez sekretów) do pobrania
function H.kopia(env, headers, query)
	if not wymagaj(env, headers, false) then return end
	local wyj = SESJE .. "/kopia." .. sha.hex(losowe(8))
	os.execute("/usr/pkg/bin/doas /usr/pkg/libexec/nas-panel/nas-panel-priv kopia-konfiguracji >" .. wyj .. " 2>/dev/null")
	local dane = czytaj(wyj) or ""
	os.remove(wyj)
	local nazwa = "nsa310s-konfiguracja-" .. os.date("%Y-%m-%d") .. ".tar.gz"
	httpd.write("HTTP/1.1 200 OK\r\n")
	httpd.write("Content-Type: application/gzip\r\n")
	httpd.write("Content-Disposition: attachment; filename=\"" .. nazwa .. "\"\r\n")
	httpd.write("Content-Length: " .. #dane .. "\r\n")
	httpd.write("Cache-Control: no-store\r\n\r\n")
	httpd.write(dane)
end

for nazwa, f in pairs(H) do
	httpd.register_handler(nazwa, f)
end
