# Word Runner

RSVP-Schnellleseerweiterung für Firefox. Zeigt einen Text Wort für Wort in der Bildschirmmitte an – so liest das Auge schneller, weil es nicht mehr über Zeilen wandern muss.

---

## Funktionsweise

Word Runner nutzt die **RSVP-Methode** (Rapid Serial Visual Presentation): Jedes Wort erscheint an einer festen Position im Sichtfeld. Der optimale Erkennungspunkt (ORP) wird rot hervorgehoben, sodass das Gehirn das Wort sofort erfassen kann, ohne die Augen zu bewegen.

Kurze Wörter werden etwas schneller, lange Wörter etwas langsamer angezeigt. Nach einem Satzende oder Komma entsteht automatisch eine kurze Pause – das entspricht dem natürlichen Leserhythmus.

---

## Installation

1. Repository klonen oder als ZIP herunterladen
2. In Firefox `about:debugging` öffnen
3. **„Diese Firefox-Version"** → **„Temporäres Add-on laden"**
4. Die Datei `manifest.json` im Projektordner auswählen

Für eine dauerhafte Installation ohne Signierung kann Firefox ESR im Developer-Modus oder Firefox Developer Edition genutzt werden.

---

## Verwendung

### Popup

Klick auf das Word-Runner-Symbol in der Toolbar öffnet das Popup.

| Bereich | Beschreibung |
|---------|-------------|
| **Textquelle** | Welcher Text vorgelesen wird (s. u.) |
| **Lesegeschwindigkeit** | Schieberegler von 100 bis 1 000 WPM (Wörter pro Minute), Standard 300 WPM |
| **Lesen starten** | Startet die Sitzung; ein weiterer Klick pausiert/setzt fort |
| **Erweitert** | Weitere Einstellungen (aufklappbar) |
| **Leseliste** | Gespeicherte Seiten verwalten |
| **Statistiken** | Gesamtzahl gelesener Wörter und Sitzungen |

### Textquellen

| Option | Verhalten |
|--------|-----------|
| **Ausgewählter Text** | Nur die aktuell markierte Textstelle |
| **Ganze Seite** | Hauptinhalt der Seite (`<article>`, `<main>` o. Ä.) |
| **Eigener Text** | Frei eingegebener Text im Textarea-Feld |

### Tastenkürzel

| Taste | Aktion |
|-------|--------|
| `Alt + W` | Lesen der aktuellen Seite sofort starten |
| `Leertaste` | Pausieren / Fortsetzen |
| `Esc` | Sitzung beenden |
| `→` | 10 Wörter vorspringen |
| `←` | 10 Wörter zurückspringen |
| `Tab` / `Shift+Tab` | Fokus innerhalb des Overlays wechseln |

### Kontextmenü

Einen Text auf einer Seite markieren → Rechtsklick → **„Mit Word Runner lesen"** startet die Sitzung sofort mit dem markierten Text.

---

## Anzeigemodi

### Overlay (Standard)

Ein dunkles Vollbild-Overlay überlagert die Seite. In der Mitte erscheint das aktuelle Wort groß, der ORP-Buchstabe ist farbig markiert. Oben ein Fortschrittsbalken mit verbleibender Lesezeit, unten ein WPM-Regler zum Nachregeln während des Lesens.

### Seiten-Modus (Highlight)

Kein Overlay – stattdessen wird das aktuelle Wort direkt auf der Seite farbig hinterlegt und die Seite scrollt automatisch mit. Eine kleine Steuerleiste am oberen Rand zeigt Fortschritt und Steuerknöpfe.

---

## Einstellungen

Alle Einstellungen werden automatisch in `browser.storage.local` gespeichert.

| Einstellung | Optionen | Standard |
|-------------|----------|---------|
| Anzeigemodus | Overlay / Seite | Overlay |
| Wörter pro Anzeige | 1 / 2 | 1 |
| Schriftgröße | 24–96 px | 48 px |
| Schriftart | System / Serif / Mono | System |
| Thema | Dunkel / Hell | Dunkel |
| ORP-Farbe | Farbwähler | Rot (`#ef5350`) |
| Kurze Wörter überspringen | An / Aus | Aus |

---

## Leseposition

Beim Pausieren oder Beenden wird die aktuelle Position automatisch pro URL gespeichert (bis zu 50 Einträge). Beim nächsten Öffnen derselben Seite wird an der gespeicherten Stelle fortgefahren. Query-Parameter und Fragmente werden dabei ignoriert, sodass `example.com/artikel?utm=x` und `example.com/artikel` dieselbe Position teilen.

---

## Leseliste

Seiten können über **„Seite zur Leseliste hinzufügen"** für später gespeichert werden. Die Liste zeigt Titel und URL und erlaubt das direkte Öffnen oder Entfernen einzelner Einträge.

---

## Entwicklung

```bash
# Abhängigkeiten installieren (nur für Tests und Linting)
npm install

# Lint + Tests
npm run check
```

Anforderungen: Node.js ≥ 18, Firefox ≥ 78.

Die reine Erweiterung hat keine Laufzeit-Abhängigkeiten – `node_modules` wird nur für Jest und ESLint benötigt.

### Projektstruktur

```
manifest.json          Erweiterungs-Manifest
background.js          Kontextmenü + Tastenkürzel (Service Worker)
content.js             Haupt-Logik (Overlay, Highlight, Timing, Keyboard)
content.css            Styles für Overlay-Host und Highlight-Box
popup.html / popup.js  Toolbar-Popup
lib/wordprocessor.js   Reine Textverarbeitungsfunktionen (testbar ohne Browser)
tests/                 Jest-Tests für wordprocessor.js
_locales/de|en/        Lokalisierungsstrings
icons/                 SVG-Icons
```

---

## Lizenz

MIT
