# Word Runner — Feature Backlog

Format: `ID · Titel · Kurzbeschreibung · Effort [S/M/L/XL]`  
Status-Tags: `[ ]` offen · `[~]` in Arbeit · `[x]` fertig  
Anforderungen werden pro Feature in einem eigenen Abschnitt ergänzt.

---

## 1 · Leserlebnis

### F-001 · Satzkontext-Anzeige
**Beschreibung:** Unter dem aktuellen Wort wird der vollständige Satz angezeigt, in dem das Wort steht, damit der Leser den Zusammenhang nicht verliert.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-002 · Vorschau nächstes Wort
**Beschreibung:** Das nächste Wort (oder die nächsten N Wörter) wird kleiner und ausgegraut unter dem aktuellen Wort eingeblendet.  
**Effort:** S  
**Anforderungen:**
- [ ] Neue CSS-Klasse `.wr-preview-word` für kleinere, hellere Schrift (z. B. 60% Größe, 0.5 Opazität)
- [ ] In `renderChunkInOverlay()`: vor Animation das nächste Wort der queue anzeigen
- [ ] Optional: Checkbox in popup.js "Nächstes Wort anzeigen" (toggle)
- [ ] Standard: an im Overlay

---

### F-003 · Sanfter Geschwindigkeits-Rampe
**Beschreibung:** Beim Start einer Sitzung steigt die Lesegeschwindigkeit automatisch von 60 % auf die Ziel-WPM innerhalb der ersten 10 Wörter (Warm-up).  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-004 · Leserythmusindikatoren
**Beschreibung:** Optionale animierte Punkte (ähnlich einem Metronom) zeigen den Lesetakt visuell an, um den Rhythmus zu halten.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-005 · Leseschwerigkeit-Score
**Beschreibung:** Vor dem Start wird die Flesch-Reading-Ease-Punktzahl (oder ähnlich) des Textes berechnet und angezeigt, sodass der Nutzer die WPM anpassen kann.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-006 · Silbentrennung bei langen Wörtern
**Beschreibung:** Wörter, die länger als eine konfigurierbare Schwelle sind (z. B. >15 Zeichen), werden automatisch mit Silbentrennungspunkten angezeigt.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-007 · Fortschrittsprozentzahl
**Beschreibung:** Neben der aktuellen Wortposition (z. B. „240 / 1200") wird der prozentuale Fortschritt angezeigt (z. B. „20 %").  
**Effort:** S  
**Status:** [x] Fertig  
**Anforderungen:**
- [x] Prozentberechnung: `(current / total) * 100`
- [x] Display: "240 / 1200 (20%)" in `.wr-progress-text`
- [x] Nur im Overlay-Modus (nicht Highlight)

---

### F-008 · Absatz-Vorschau
**Beschreibung:** Beim Absatz-Pause-Token (`¶`) wird kurz der erste Satz des nächsten Absatzes als Vorschau eingeblendet.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-009 · Automatische Spracherkennung
**Beschreibung:** Die Sprache des Seiteninhalts wird erkannt (`<html lang>` oder heuristische Erkennung), und sprachspezifische Regeln für Silben, Satzzeichen und Pausen werden angewendet.  
**Effort:** L  
**Anforderungen:**
- TBD

---

### F-010 · Kapitel-/Abschnitts-Erkennung
**Beschreibung:** Überschriften (`<h1>`–`<h6>`) im Text werden als Kapitelmarken erkannt und im Popup als Sprungpunkte aufgelistet.  
**Effort:** M  
**Anforderungen:**
- TBD

---

## 2 · Anzeigemodi & Design

### F-011 · Positions-Voreinstellungen für Overlay
**Beschreibung:** Nutzer können das Overlay an eine von fünf vordefinierten Positionen andocken: oben-links, oben-Mitte, Mitte, unten-Mitte, unten-rechts.  
**Effort:** S  
**Status:** [x] Fertig  
**Anforderungen:**
- [x] Fünf Position-Buttons oder Dropdown in Popup-Einstellungen
- [x] CSS Klassen für Position (e.g., `.wr-pos-top-left`, `.wr-pos-center`, etc.)
- [x] Storage key: `overlayPosition` (default: 'center')
- [x] Update im Overlay-HTML: `<div class="wr-overlay wr-pos-${position}">`

---

### F-012 · Benutzerdefinierte Hintergrundfarbe
**Beschreibung:** Neben den Themes Dark/Light/Auto kann der Nutzer eine eigene Hintergrundfarbe für den Overlay-Modus frei wählen.  
**Effort:** S  
**Status:** [x] Fertig  
**Anforderungen:**
- [x] Color-Input im Popup (nur im Overlay-Modus)
- [x] Storage key: `overlayBgColor` (default: rgba)
- [x] Validator für hex oder rgba
- [x] CSS Variable: --wr-bg-custom auf .wr-overlay anwenden

---

### F-013 · Kompakter Mini-Overlay-Modus
**Beschreibung:** Durch Doppelklick auf das Overlay oder eine Tastenkombination schrumpft die Overlay-Ansicht auf ein kleines schwebendes Fenster (ca. 300 × 80 px).  
**Effort:** L  
**Anforderungen:**
- TBD

---

### F-014 · Benutzerdefinierte Farbthemen
**Beschreibung:** Ein Theme-Editor im Popup erlaubt die Auswahl von Hintergrund-, Text- und ORP-Farbe. Themes können benannt und gespeichert werden.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-015 · OpenDyslexic-Schriftart
**Beschreibung:** Die Schriftart „OpenDyslexic" wird als vierte Option in der Schriftartenauswahl aufgenommen (Font-Datei wird per CDN oder lokal gebündelt).  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-016 · Wort-Hintergrundkarte
**Beschreibung:** Statt des reinen Wort-Displays erscheint das aktuelle Wort auf einer sichtbaren Karte (abgerundetes Rechteck mit Schatten), die visuell aus dem Overlay-Hintergrund heraussticht.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-017 · Vollbild-Modus
**Beschreibung:** Ein Button im Overlay-Toolbar ermöglicht es, den Browser in den nativen Vollbild-Modus zu schalten, während die Lesesitzung läuft.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-018 · Picture-in-Picture-Modus
**Beschreibung:** Das Wort-Display wird in einem nativen PiP-Fenster geöffnet, sodass der Nutzer gleichzeitig die Originalseite lesen kann.  
**Effort:** XL  
**Anforderungen:**
- TBD

---

### F-019 · Wort-Positions-Ausrichtung wählen
**Beschreibung:** Der Nutzer kann wählen, ob das Wort im Overlay oben, mittig oder unten vertikal positioniert wird.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-020 · Drei-Wörter-Modus
**Beschreibung:** Erweiterung des bestehenden 1/2-Wort-Modus auf 3 gleichzeitige Wörter mit entsprechender ORP-Markierung auf dem mittleren Wort.  
**Effort:** M  
**Anforderungen:**
- TBD

---

## 3 · Inhaltsquellen

### F-021 · PDF-Lesemodus
**Beschreibung:** Im PDF-Viewer von Firefox wird der Seitentext extrahiert und direkt für Word Runner bereitgestellt.  
**Effort:** L  
**Anforderungen:**
- TBD

---

### F-022 · EPUB-Unterstützung
**Beschreibung:** EPUB-Dateien können lokal per Datei-Upload oder URL geöffnet und der Text der aktuellen Kapitelseite extrahiert werden.  
**Effort:** XL  
**Anforderungen:**
- TBD

---

### F-023 · Zwischenablage lesen
**Beschreibung:** Ein Schaltfläche im Popup liest direkt den Inhalt der Zwischenablage aus und startet die Lesesitzung damit (kein manuelles Einfügen nötig).  
**Effort:** S  
**Status:** [x] Fertig  
**Anforderungen:**
- [x] Button "Paste from clipboard" unter Custom-Text-Textarea
- [x] navigator.clipboard.readText() API
- [x] Text in Textfield einfügen + custom-Quelle auswählen
- [x] Fehlerbehandlung (leere Clipboard, keine Berechtigung)

---

### F-024 · Textdatei hochladen
**Beschreibung:** Im Bereich „Eigener Text" kann statt des Textfeldes eine `.txt`- oder `.md`-Datei hochgeladen werden.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-025 · Code-Blöcke überspringen
**Beschreibung:** `<pre>`, `<code>` und Elemente mit `data-lang`-Attribut werden automatisch aus dem extrahierten Text ausgeschlossen.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-026 · Klammern/Parenthesen-Inhalt-Option
**Beschreibung:** Optionale Einstellung: Inhalte in Klammern, eckigen Klammern oder Fußnotenverweisen werden beim Lesen übersprungen.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-027 · URL- und E-Mail-Filter
**Beschreibung:** URLs (`https://…`) und E-Mail-Adressen werden beim Lesen automatisch übersprungen oder auf eine lesbare Kurzform reduziert.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-028 · Zitat-Erkennung und Ausblendung
**Beschreibung:** Blockquotes (`<blockquote>`) können optional ausgeblendet oder mit einer visuell unterschiedlichen Pause-Dauer behandelt werden.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-029 · Tabellen-Inhalte
**Beschreibung:** Tabelleninhalte werden durch zeilenweises Lesen (`<tr>` = Zeilenumbruch) sinnvoll in den Lesefluss integriert statt ignoriert.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-030 · Browser-Lesemodus-Integration
**Beschreibung:** Ist der Firefox Reader View aktiv, werden dessen bereits bereinigten Textinhalte bevorzugt als Quelle genutzt.  
**Effort:** M  
**Anforderungen:**
- TBD

---

## 4 · Navigation & Sprungfunktionen

### F-031 · Kapitel-Sprung-Buttons
**Beschreibung:** Im Overlay-Toolbar erscheinen Vor/Zurück-Buttons zum Springen von Kapitel zu Kapitel (basierend auf H2/H3-Überschriften).  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-032 · Satz-Navigation
**Beschreibung:** Tastenkürzel `Strg+→`/`Strg+←` springen zum Anfang des nächsten bzw. vorherigen Satzes (erkannt durch `.!?`-Zeichen).  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-033 · Prozent-Sprung
**Beschreibung:** Im Fortschrittsbalken kann durch Klick auf eine Stelle direkt zu jedem Prozentpunkt des Textes gesprungen werden.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-034 · Wortsuche im aktuellen Text
**Beschreibung:** Eine Suchfunktion (Tastenkürzel `Strg+F` im Overlay) ermöglicht das Suchen nach einem Wort im geladenen Text und springt zur ersten Fundstelle.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-035 · Letzte 5 Positionen
**Beschreibung:** Eine Verlaufsliste der letzten 5 Pausepositionen (innerhalb einer Sitzung) erlaubt es, zu einer kürzlich verlassenen Stelle zurückzuspringen.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-036 · Smart-Skip (Interpunktions-Aware)
**Beschreibung:** Der `→`-Sprung überspringt nicht nur 10 Wörter, sondern springt zum Beginn des nächsten Sinnabschnitts (nächster Satz oder Absatz).  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-037 · Lesezeichen mit Namen
**Beschreibung:** Beim Setzen eines Lesezeichens (Taste B) kann der Nutzer einen optionalen Namen eingeben (kurze Text-Eingabe erscheint für 3 Sekunden).  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-038 · Lesezeichen-Verwaltung im Popup
**Beschreibung:** Ein eigener Tab im Popup listet alle gespeicherten Lesezeichen aller Seiten mit Titel, Wort-Index und Datum auf; einzelne können gelöscht werden.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-039 · Automatischer Neustart nach X Stunden
**Beschreibung:** Wenn der Nutzer zu einer Seite zurückehrt, auf der er vor weniger als 24 h gelesen hat, bietet das Extension-Icon einen „Weiterlesen"-Badge an.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-040 · Sprache/Kapitel-Dropdown im Popup
**Beschreibung:** Erkannte Überschriften der aktuellen Seite werden im Popup als Dropdown aufgelistet; Auswahl setzt den Lesestartpunkt auf diese Stelle.  
**Effort:** M  
**Anforderungen:**
- TBD

---

## 5 · Statistiken & Analyse

### F-041 · Tages-Heatmap-Kalender
**Beschreibung:** Im Statistik-Bereich erscheint ein GitHub-ähnlicher Kalender der letzten 12 Wochen, der Leseaktivität pro Tag farblich visualisiert.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-042 · Beste Tageszeit
**Beschreibung:** Die Uhrzeit der Sessions wird ausgewertet und die produktivste Lesezeit (höchste Ø-WPM) pro Tageszeit angezeigt.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-043 · Statistiken nach Domain
**Beschreibung:** Die Statistiken werden nach Domain gruppiert und zeigen, auf welchen Seiten der Nutzer am meisten und am schnellsten liest.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-044 · Persönliche Rekorde
**Beschreibung:** Die schnellste WPM-Session, die längste Sitzung und die meisten Wörter an einem Tag werden als persönliche Bestleistungen im Popup hervorgehoben.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-045 · 30-Tage-Trendlinie
**Beschreibung:** Die Sparkline im Statistik-Bereich zeigt eine 7-Tage-Glättungskurve als gestrichelte Linie zusätzlich zur Rohkurve.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-046 · Wörter pro Woche / Monat
**Beschreibung:** Neben den täglichen Statistiken erscheinen kumulierte Zahlen für die aktuelle Woche und den aktuellen Monat.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-047 · Statistik-PDF-Bericht
**Beschreibung:** Ein „Als PDF exportieren"-Button generiert einen einseiten Lesebericht (Statistiken + Diagramm) als druckbares PDF.  
**Effort:** L  
**Anforderungen:**
- TBD

---

### F-048 · WPM-Vergleich nach Inhaltstyp
**Beschreibung:** Sessions werden automatisch nach Inhaltstyp getaggt (Nachricht, Wikipedia, Blog, etc.) und die Ø-WPM pro Typ verglichen.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-049 · Lesezeit-Schätzung vor dem Start (per Domain)
**Beschreibung:** Die WPM-Vorschau im Popup nutzt die historische Durchschnitts-WPM für die aktuelle Domain statt der Einstellung für eine genauere Schätzung.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-050 · Verbesserungsrate
**Beschreibung:** Die Statistiken zeigen, wie sich die Lese-WPM im Vergleich zum Vormonat verändert hat (z. B. „+12 % schneller als letzten Monat").  
**Effort:** S  
**Anforderungen:**
- TBD

---

## 6 · Produktivität & Workflow

### F-051 · Pomodoro-Timer-Integration
**Beschreibung:** Ein optionaler Pomodoro-Modus pausiert die Lesesitzung automatisch nach 25 Minuten und zeigt einen 5-minütigen Countdown.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-052 · Sitzungsziel (Zeitbasiert)
**Beschreibung:** Der Nutzer kann ein Ziel „Ich möchte X Minuten lesen" setzen; nach Ablauf der Zeit wird automatisch pausiert.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-053 · Automatischer Start auf bestimmten Seiten
**Beschreibung:** Eine Whitelist von Domains/URL-Mustern kann konfiguriert werden; auf diesen Seiten startet Word Runner automatisch beim Öffnen.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-054 · Leseliste-Import aus Pocket
**Beschreibung:** Über OAuth mit der Pocket-API kann die Pocket-Liste importiert und als Reading List in Word Runner gespeichert werden.  
**Effort:** L  
**Anforderungen:**
- TBD

---

### F-055 · Leseliste-Export zu Pocket/Instapaper
**Beschreibung:** Artikel aus der Word-Runner-Leseliste können mit einem Klick an Pocket oder Instapaper weitergeleitet werden.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-056 · Artikel als gelesen markieren
**Beschreibung:** Nach Abschluss einer Lesesitzung wird der Artikel in der Leseliste automatisch als „gelesen" markiert und visuell ausgegraut.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-057 · Leseliste-Tags / Kategorien
**Beschreibung:** Einträge in der Leseliste können mit benutzerdefinierten Tags versehen und nach Tags gefiltert werden.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-058 · Lesenotizen
**Beschreibung:** Während einer Lesesitzung kann mit einem Tastenkürzel (`N`) eine kurze Notiz zum aktuellen Wort-Index hinterlegt werden.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-059 · Mehrere benannte Profile
**Beschreibung:** Nutzer können mehrere Einstellungs-Profile erstellen (z. B. „Arbeit 400 WPM", „Abend 250 WPM") und per Popup schnell wechseln.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-060 · Fokus-Modus (Sperr-Overlay)
**Beschreibung:** Beim Start einer Lesesitzung wird der Browser-Tab-Bereich durch eine Warnung gesperrt, die Ablenkungen reduziert (ähnlich einer Pomodoro-App).  
**Effort:** L  
**Anforderungen:**
- TBD

---

## 7 · Barrierefreiheit

### F-061 · Screen-Reader-Ankündigungen
**Beschreibung:** Das aktuell angezeigte Wort wird an ARIA-Live-Regions übergeben, sodass Screen-Reader es vorlesen können (konfigurierbare Lautstärke).  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-062 · Hochkontrast-Modus (WCAG AAA)
**Beschreibung:** Ein Hochkontrast-Theme erfüllt WCAG 2.1 AAA (Kontrastverhältnis ≥ 7:1) für alle Textfarben.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-063 · Reduzierte Bewegung (Erweitert)
**Beschreibung:** Wenn `prefers-reduced-motion` aktiv ist, werden nicht nur Animationen, sondern auch das Wort-Flash-Feedback durch eine statische Unterstreichung ersetzt.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-064 · Spracheingabe-Steuerung
**Beschreibung:** Grundlegende Sprachbefehle wie „pause", „stop", „schneller", „langsamer" werden über die Web Speech API erkannt.  
**Effort:** L  
**Anforderungen:**
- TBD

---

### F-065 · Mindestwortlängen-Filter (Erweiterung)
**Beschreibung:** Erweiterung des bestehenden „kurze Wörter überspringen": konfigurierbare Mindestlänge (1–5 Buchstaben) statt fest auf ≤2.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-066 · RTL-Sprach-Unterstützung
**Beschreibung:** Bei arabischen, hebräischen oder anderen RTL-Texten wird das Wort-Display und die ORP-Ausrichtung gespiegelt.  
**Effort:** L  
**Anforderungen:**
- TBD

---

### F-067 · Tastaturnavigation für alle Popup-Elemente
**Beschreibung:** Alle Elemente im Popup (Slider, Checkboxen, Buttons, Dropdowns) sind vollständig mit der Tastatur bedienbar und haben sichtbare Fokusindikatoren.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-068 · Zahlen und Datumsangaben überspringen
**Beschreibung:** Optionaler Filter: reine Ziffern-Tokens (z. B. „2024", „42") werden beim Lesen übersprungen oder durch gesprochene Form ersetzt.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-069 · Vergrößerte Steuerelemente für Mobil/Touchscreen
**Beschreibung:** Auf Touch-Geräten werden alle Buttons mindestens 44 × 44 px groß und durch Wischen steuerbar (Swipe links = pause, Swipe rechts = skip).  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-070 · Farbblindheits-sichere Palette
**Beschreibung:** Die Standard-ORP-Farbe und alle UI-Akzentfarben werden auf gängige Farbblindheits-Typen (Deuteranopie, Protanopie) geprüft und entsprechend adjustiert.  
**Effort:** S  
**Anforderungen:**
- TBD

---

## 8 · Wörterbuch & Sprache

### F-071 · Wörterbuch-Popup bei Pause
**Beschreibung:** Wenn der Nutzer beim pausierten Overlay auf das aktuelle Wort klickt, öffnet sich eine kurze Wörterbuchdefinition (via freie API wie Wiktionary).  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-072 · Wikipedia-Schnellsuche für Eigennamen
**Beschreibung:** Großgeschriebene Wörter, die als Eigennamen erkannt werden, erhalten beim Klick im pausierten Zustand einen Wikipedia-Vorschau-Tooltip.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-073 · Übersetzungs-Overlay
**Beschreibung:** Eine Einstellung erlaubt die Anzeige einer Übersetzung des aktuellen Wortes in die Sprache der Browser-UI unterhalb des Wort-Displays.  
**Effort:** L  
**Anforderungen:**
- TBD

---

### F-074 · Unbekannte Wörter speichern
**Beschreibung:** Tastenkürzel `U` im Overlay markiert das aktuelle Wort als „unbekannt" und speichert es in einer lokalen Liste, die exportiert werden kann (z. B. für Anki).  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-075 · Anki-Integration
**Beschreibung:** Als unbekannt markierte Wörter können direkt per AnkiConnect-API in ein Anki-Deck als Karteikarten exportiert werden.  
**Effort:** L  
**Anforderungen:**
- TBD

---

### F-076 · Benutzerdefinierte Wort-Ersetzungen
**Beschreibung:** Eine Liste von Wort-Ersetzungen (z. B. „&" → „und", Abkürzungen) wird vor dem Lesen auf den Text angewendet.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-077 · Wort-Aussprache-Leitfaden
**Beschreibung:** Für technische oder fremdsprachige Wörter wird beim Pausieren eine phonetische Umschrift (IPA) aus einer Wörterbuch-API abgerufen und eingeblendet.  
**Effort:** L  
**Anforderungen:**
- TBD

---

### F-078 · Text-zu-Sprache für pausiertes Wort
**Beschreibung:** Im pausierten Zustand kann das aktuelle Wort mit einem Klick vorgelesen werden (Web Speech API `SpeechSynthesis`).  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-079 · Benutzerdefinierte Skip-Patterns (Regex)
**Beschreibung:** Nutzer können eigene reguläre Ausdrücke konfigurieren, deren Treffer beim Lesen übersprungen werden (z. B. Hashtags, @-Erwähnungen).  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-080 · Sprach-spezifische Pausenregeln
**Beschreibung:** Für Sprachen mit anderen Satzendezeichen (z. B. `。` im Japanischen, `।` im Hindi) werden separate Pausenregeln angewendet.  
**Effort:** M  
**Anforderungen:**
- TBD

---

## 9 · Integration & Sync

### F-081 · Einstellungs-Backup zu Google Drive
**Beschreibung:** Ein Button im Popup exportiert alle Einstellungen und die Leseliste als JSON direkt in eine Datei auf Google Drive (OAuth-Flow).  
**Effort:** L  
**Anforderungen:**
- TBD

---

### F-082 · Leseliste-Bulk-Import (URL-Liste)
**Beschreibung:** Eine Textarea im Popup akzeptiert eine Liste von URLs (eine pro Zeile) und fügt alle zur Leseliste hinzu.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-083 · OS-Benachrichtigung bei Sitzungsende
**Beschreibung:** Nach Abschluss einer Lesesitzung erscheint eine native Browser-Benachrichtigung mit Wortanzahl und WPM.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-084 · Webhook bei Sitzungsende
**Beschreibung:** Optionaler konfigurierbarer HTTP-POST-Webhook wird nach jeder abgeschlossenen Sitzung mit Session-Daten (JSON) aufgerufen.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-085 · Lesestatus per URL teilen
**Beschreibung:** Der aktuelle Lesefortschritt (Word-Index) kann als URL-Fragment-Hash encodiert und geteilt werden, sodass ein Empfänger direkt an der richtigen Stelle einsteigt.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-086 · Zwischenablage-Beobachtungsmodus
**Beschreibung:** Ein optionaler Hintergrundmodus startet automatisch eine Lesesitzung mit benutzerdefiniertem Text, sobald neuer Text in die Zwischenablage kopiert wird.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-087 · Sync-Status-Anzeige im Popup
**Beschreibung:** Im Einstellungs-Bereich wird angezeigt, ob `browser.storage.sync` verfügbar ist, wann die letzte Synchronisierung stattfand und wie viel Quota verbraucht ist.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-088 · Leseliste-Import aus OPML/RSS
**Beschreibung:** OPML-Dateien (RSS-Feedlisten) können importiert werden; alle Feed-URLs werden als Leseliste-Einträge gespeichert.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-089 · Mehrgerätiges Session-Handoff
**Beschreibung:** Wird eine Seite auf Gerät A pausiert (via Sync), kann auf Gerät B die Lesesitzung an exakt derselben Position fortgesetzt werden.  
**Effort:** L  
**Anforderungen:**
- TBD

---

### F-090 · API für externe Automatisierung
**Beschreibung:** Eine dokumentierte lokale HTTP-API (localhost-Port) ermöglicht externen Programmen (z. B. Alfred, Raycast, Shell-Scripts), Lesesitzungen zu starten und zu stoppen.  
**Effort:** XL  
**Anforderungen:**
- TBD

---

## 10 · Entwickler & Qualität

### F-091 · Einstellungen JSON-Schema
**Beschreibung:** Ein maschinenlesbares JSON-Schema aller Einstellungsschlüssel wird unter `lib/settings-schema.json` bereitgestellt und für Importvalidierung genutzt.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-092 · End-to-End-Tests mit Playwright
**Beschreibung:** Eine Playwright-Testsuite testet das vollständige Nutzungszenario: Popup öffnen → Text auswählen → Lesesitzung starten → Pause → Stop in einer simulierten Firefox-Umgebung.  
**Effort:** L  
**Anforderungen:**
- TBD

---

### F-093 · Performance-Budget für content.js
**Beschreibung:** Ein automatischer CI-Check stellt sicher, dass `content.js` nach dem Bundling unter 100 KB (unkomprimiert) bleibt.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-094 · Manifest V3 Migration
**Beschreibung:** Migration von MV2 auf MV3 für zukünftige Chrome/Firefox-Kompatibilität: Service Worker statt Background Page, neue Permission-Modelle.  
**Effort:** XL  
**Anforderungen:**
- TBD

---

### F-095 · Lokalisierung in weitere Sprachen
**Beschreibung:** Erweiterung der Lokalisierung über `en`/`de` hinaus: Französisch (`fr`), Spanisch (`es`), Niederländisch (`nl`), Polnisch (`pl`).  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-096 · Fehlerbericht-Mechanismus
**Beschreibung:** Bei einem JavaScript-Fehler in `content.js` wird ein diskreter Toast angezeigt mit der Option, einen anonymisierten Fehlerbericht zu senden.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-097 · Einstellungs-Migrations-System
**Beschreibung:** Versionierte Einstellungen (`_settingsVersion`) mit automatischen Migrationsfunktionen, wenn neue Keys hinzukommen oder umbenannt werden.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-098 · Automatisiertes AMO-Submission-Script
**Beschreibung:** Das `npm run build`-Skript wird erweitert: nach dem Zip-Bau wird die Extension automatisch per AMO-API zur Review eingereicht.  
**Effort:** M  
**Anforderungen:**
- TBD

---

### F-099 · Content Security Policy verschärfen
**Beschreibung:** Die CSP in `manifest.json` wird auf `script-src 'self'; object-src 'none'` eingeschränkt und alle Inline-Skripte aus Popup-HTML werden ausgelagert.  
**Effort:** S  
**Anforderungen:**
- TBD

---

### F-100 · Interaktives Onboarding beim ersten Start
**Beschreibung:** Beim ersten Installieren öffnet sich automatisch eine Onboarding-Seite (`onboarding.html`), die in drei Schritten die Grundfunktionen erklärt und eine erste Beispiel-Lesesitzung startet.  
**Effort:** L  
**Anforderungen:**
- TBD

---

## Zusammenfassung

| Kategorie | Features | S | M | L | XL |
|---|---|---|---|---|---|
| Leserlebnis | F-001–F-010 | 2 | 5 | 2 | 1 |
| Anzeigemodi & Design | F-011–F-020 | 3 | 3 | 2 | 2 |
| Inhaltsquellen | F-021–F-030 | 5 | 2 | 2 | 1 |
| Navigation | F-031–F-040 | 3 | 6 | 1 | 0 |
| Statistiken & Analyse | F-041–F-050 | 5 | 4 | 1 | 0 |
| Produktivität & Workflow | F-051–F-060 | 2 | 5 | 2 | 1 |
| Barrierefreiheit | F-061–F-070 | 3 | 4 | 2 | 1 |
| Wörterbuch & Sprache | F-071–F-080 | 2 | 4 | 4 | 0 |
| Integration & Sync | F-081–F-090 | 3 | 4 | 2 | 1 |
| Entwickler & Qualität | F-091–F-100 | 3 | 4 | 2 | 1 |
| **Gesamt** | **100** | **31** | **41** | **20** | **8** |
