# WinOptimizer

Modern, prémium dark UI-os **Windows 10 / 11 optimalizáló alkalmazás** (x64), Electron + React + TypeScript alapon.
Az app egyetlen letisztult felületen teszi átvizsgálhatóvá és karbantarthatóvá a rendszert – **biztonságos,
dokumentált és visszavonható** műveletekkel.

> Az alkalmazás szándékosan **nem ígér irreális teljesítménynövekedést**. Csak olyan beállításokat kínál, amelyek
> ténylegesen indokolhatók, és lehetőség szerint visszavonhatók.

---

## Funkciók

| Oldal | Tartalom |
| --- | --- |
| **Dashboard** | CPU, RAM, Disk, GPU, hálózati aktivitás valós időben, Windows verzió, uptime, Health Score, nagy **Scan & Optimize** gomb animált progress UI-jal és kategorizált eredményekkel |
| **Cleaner** | TEMP mappák, Windows/User temp, Lomtár, böngésző cache, thumbnail cache, Delivery Optimization, crash dumps, Windows Update cache (biztonságosan), logok, Prefetch. **Quick Clean** és **Custom Clean**, törlés előtt pontos kimutatással |
| **Startup** | Indítási elemek (név, publisher, impact, állapot, hely), engedélyezés/letiltás. Rendszer- és biztonsági komponensek védve |
| **Performance** | Power Plan, vizuális effektek, átlátszóság, Game Mode, Storage Sense, háttéralkalmazások, indítási késleltetés, hibernálás, indexelés – mindegyikhez description / current state / recommended state / **Apply** / **Undo** |
| **Network** | Adapterek, IP/DNS konfiguráció, latency, kapcsolat állapota; DNS flush, IP renew, adapter újraindítás, Winsock reset, TCP/IP reset – megerősítéssel |
| **Privacy** | Telemetria, Advertising ID, tevékenységelőzmények, személyre szabott élmények, gépelési adatok; app-, hely-, kamera- és mikrofonengedélyek natív Beállításokon keresztül |
| **Tools** | Disk Cleanup, Task Manager, Device Manager, Services, Event Viewer, System Information, Resource Monitor, Drive Optimization, CMD, PowerShell, Registry Editor, Windows Update – natív Windows eszközök indítása |
| **Restore Center** | Korábbi optimalizációk, módosított beállítások, backupok, Windows visszaállítási pontok, műveleti napló, egykattintásos visszaállítás |
| **Settings** | Start with Windows, Minimize to tray, Automatic scan, Theme, Accent, Language, Restore point optimalizáció előtt, Confirmation dialogs, Logging + export |

---

## Biztonsági elvek

Ezek nem opcionálisak – a kódba vannak építve:

- **Védettlista a Cleanerben** – `C:\Windows`, `System32`, `SysWOW64`, `WinSxS`, `Program Files`, felhasználói
  dokumentum-mappák stb. törlése blokkolt; path-traversal ellenőrzés minden fájlnál.
- **Tiltott kiterjesztések** – `.sys`, `.dll`, `.exe`, `.drv`, `.msi`, `.efi` soha nem kerül törlésre.
- **Rendszerfolyamatok védelme** – a Startup Manager nem tiltja le a Windows rendszer- és a felismert biztonsági
  szoftverek komponenseit.
- **Nincs agresszív registry tweak** – csak dokumentált, Microsoft által támogatott beállítások.
- **Nem nyúlunk a biztonsági funkciókhoz** – Defender, tűzfal, SmartScreen, BitLocker, Secure Boot érintetlen.
- **Backup minden módosítás előtt** – az eredeti érték mentésre kerül, és a Restore Centerből visszaállítható;
  emellett – ha engedélyezett és van jogosultság – rendszer-visszaállítási pont is készül.
- **Confirmation dialog** minden destruktív és rendszermódosító művelet előtt, a pontos technikai részletekkel.
- **Least privilege** – az app `asInvoker` szinten indul; admin jogot csak akkor kér, amikor ténylegesen szükséges.
- **Teljes audit log** – timestamp, action, old value, new value, success/failure; CSV/JSON exporttal.
- **Nincs reklám, bloatware és telemetria.**

---

## Architektúra

```
electron/
  main.ts                  Electron main: ablak, tray, IPC, permission handling, CSP
  preload.ts               contextBridge – szigorúan tipizált, whitelistelt API
  services/
    shell.ts               PowerShell futtató (EncodedCommand, NonInteractive), elevation check
    registry.ts            Registry olvasás/írás/törlés + .reg export
    store.ts               Atomikus JSON tároló (userData)
    logger.ts              Audit log + CSV export
    system.ts              CPU/RAM/Disk/GPU/hálózat/OS pillanatkép
    cleaner.ts             Elemzés és biztonságos törlés védettlistával
    startup.ts             StartupApproved / Startup mappa kezelés
    performance.ts         Tweak definíciók: read / apply / undo
    network.ts             Adapterek, latency, hálózati műveletek
    privacy.ts             Adatvédelmi beállítások
    tools.ts               Natív Windows eszközök indítása (UAC-kal, ha kell)
    restore.ts             Backup registry + Windows System Restore
    scan.ts                Teljes, csak olvasó rendszervizsgálat + Health Score
shared/types.ts            Megosztott típusok (main ↔ renderer)
src/                       React renderer (oldalak, komponensek, design system)
```

**Biztonsági beállítások:** `contextIsolation: true`, `nodeIntegration: false`, szigorú CSP,
külső linkek csak a rendszer böngészőjében, single-instance lock.

**Teljesítmény:** a mérések csak látható ablaknál frissülnek (`document.visibilityState`), a WMI hívások
párhuzamosan futnak, a UI-ban nincs külső ikonkönyvtár vagy nehéz chart library.

---

## Fejlesztés

```bash
npm install

npm run dev           # csak a renderer (böngészős UI-előnézet, demó adatokkal)
npm run dev:electron  # teljes Electron app fejlesztői módban (Windows)
npm run typecheck     # renderer + main típusellenőrzés
npm run build         # main + renderer production build
npm run dist          # Windows x64 NSIS telepítő (release/)
```

### Demó mód

Ha az alkalmazás nem Electron alatt fut (pl. `npm run dev` böngészőben, vagy nem Windows rendszeren), a UI
automatikusan egy **demó backendre** vált (`src/lib/mockApi.ts`), és minden rendszert módosító művelet le van tiltva.
A felület tetején „Demó mód” jelzés látható. Éles Windows buildben ez a réteg soha nem hívódik meg.

### Rendszerkövetelmények

- Windows 10 (1809+) vagy Windows 11, x64
- Windows PowerShell 5.1 (a Windows része)
- Egyes műveletekhez rendszergazdai jogosultság (az app jelzi és kéri, ha szükséges)
