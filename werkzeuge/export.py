#!/usr/bin/env python3
"""Export aus der Wissensbasis wissensbasis-mmk in die Daten des Funktionsdummys.

Aufruf (im Repository-Ordner):

    python3 werkzeuge/export.py "<pfad-zur-wissensbasis-mmk>"

- liest nur; in der Wissensbasis wird nichts geschrieben
- Auswahl und Reihenfolge: werkzeuge/auswahl.json
- von Hand gepflegte Zusatzinhalte: inhalte/glossar.json, inhalte/zusatzinfos.json, inhalte/platzhalter.json
- schreibt daten/elemente.json und daten/wortlaut/<veranstaltung>.json
- prüft am Ende, dass kein ausgeschlossenes Feld in daten/ steht

Benötigt Python 3.8+ und PyYAML.
"""
import datetime
import difflib
import json
import pathlib
import re
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATEN = ROOT / "daten"
INHALTE = ROOT / "inhalte"

# Felder der Wissensbasis, die nie in daten/ stehen dürfen (interne redaktionelle Angaben)
AUSGESCHLOSSEN = {
    "hinweis", "einwilligung", "bearbeitung", "transkripthinweise", "interessenkonflikt",
    "sponsorenbereich", "funktion", "anrede_korrespondenz", "aliases", "website",
    "deepgram_request_id", "deepgram_modell", "deepgram_speaker", "master_version",
    "dauer_geprueft", "vokabular_stand", "patient_journey", "krebsarten", "kernaussagen",
}

TYP_LABEL = {
    "expertenwissen": "Expertenwissen",
    "erfahrung": "Erfahrung",
    "moderation": "Moderation",
    "publikumsfrage": "Publikumsfrage",
    "unklar": "",
}
ROLLE_ZU_TYP = {"moderation": "moderation", "experte": "expertenwissen",
                "betroffen": "erfahrung", "angehoerig": "erfahrung"}

ARTEFAKT = re.compile(r"^(S1|S2|[A-Za-zÄÖÜäöüß]+\.\d+)$")


def norm(s):
    s = s.lower().replace("ß", "ss")
    return re.sub(r"[^0-9a-zäöü]", "", s)


def lies_md(pfad):
    text = pfad.read_text(encoding="utf-8")
    teile = text.split("\n---", 1)
    if not text.startswith("---") or len(teile) < 2:
        raise SystemExit(f"Kein YAML-Kopf: {pfad}")
    kopf = yaml.safe_load(teile[0][3:])
    rumpf = teile[1].split("\n", 1)[1] if "\n" in teile[1] else ""
    return kopf, rumpf


def abschnitt(rumpf, titel):
    m = re.search(r"^## " + re.escape(titel) + r"\s*$(.*?)(?=^## |^<!-- verknuepfungen|\Z)", rumpf, re.M | re.S)
    return m.group(1).strip() if m else ""


def lies_themen(kb):
    themen = {}
    for zeile in (kb / "vokabular" / "themen.md").read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\|\s*([a-z0-9-]+)\s*\|\s*([^|]+?)\s*\|", zeile)
        if m and m.group(1) != "slug":
            themen[m.group(1)] = m.group(2)
    return themen


def lies_personen(kb, ids):
    personen, namen = {}, {}
    for pid in ids:
        kopf, _ = lies_md(kb / "personen" / f"{pid}.md")
        bez = str(kopf.get("bezeichnung_im_text", kopf["name"])).split(";")[0].strip()
        personen[pid] = bez
        for n in [kopf["name"], bez] + list(kopf.get("aliases") or []):
            namen[norm(str(n))] = pid
    return personen, namen


def deepgram_woerter(pfad):
    d = json.loads(pfad.read_text(encoding="utf-8"))
    alt = d["results"]["channels"][0]["alternatives"][0]
    woerter = []
    for w in alt["words"]:
        pw = w.get("punctuated_word", w["word"])
        if ARTEFAKT.match(pw.strip(".,;:!?")):
            continue
        n = norm(pw)
        if n:
            woerter.append((n, float(w["start"]), float(w["end"])))
    return woerter, float(d["metadata"]["duration"])


def wortlaut_absaetze(rumpf):
    absaetze = []
    for block in re.split(r"\n\s*\n", abschnitt(rumpf, "Wortlaut")):
        block = " ".join(block.split())
        if not block:
            continue
        m = re.match(r"^\*\*(.+?):\*\*\s*(.*)$", block)
        if m:
            absaetze.append({"label": m.group(1).strip(), "text": m.group(2)})
        elif absaetze:
            absaetze[-1]["text"] += " " + block
        else:
            absaetze.append({"label": "[Sprecher unklar]", "text": block})
    return absaetze


def zuordnen(tokens, woerter, seg_start, seg_ende, bericht, seg_id):
    """Ordnet jedem Token eine Startzeit zu. Gibt Liste der Zeiten zurück."""
    idx = [i for i, t in enumerate(tokens) if norm(t)]
    a = [norm(tokens[i]) for i in idx]
    fenster = [w for w in woerter if seg_start - 4 <= w[1] <= seg_ende + 4]
    b = [w[0] for w in fenster]
    zeiten_a = [None] * len(a)
    gleich = 0
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            for k in range(i2 - i1):
                zeiten_a[i1 + k] = fenster[j1 + k][1]
            gleich += i2 - i1
        elif op == "replace":
            t0, t1 = fenster[j1][1], fenster[j2 - 1][2]
            n = i2 - i1
            for k in range(n):
                zeiten_a[i1 + k] = t0 + (t1 - t0) * k / n
            if max(n, j2 - j1) >= 4 and abs(n - (j2 - j1)) >= 3:
                bericht["stellen"].append((seg_id, t0, "ersetzt", " ".join(tokens[idx[i]] for i in range(i1, i2))[:120]))
        elif op == "insert" and i2 - i1 >= 4:
            bericht["stellen"].append((seg_id, None, "ohne Entsprechung", " ".join(tokens[idx[i]] for i in range(i1, i2))[:120]))
    # Lücken linear auffüllen
    bekannt = [(k, t) for k, t in enumerate(zeiten_a) if t is not None]
    for k in range(len(zeiten_a)):
        if zeiten_a[k] is None:
            vor = max((p for p in bekannt if p[0] < k), default=(-1, seg_start), key=lambda p: p[0])
            nach = min((p for p in bekannt if p[0] > k), default=(len(zeiten_a), seg_ende), key=lambda p: p[0])
            anteil = (k - vor[0]) / (nach[0] - vor[0])
            zeiten_a[k] = vor[1] + (nach[1] - vor[1]) * anteil
    # monoton machen
    for k in range(1, len(zeiten_a)):
        zeiten_a[k] = max(zeiten_a[k], zeiten_a[k - 1])
    # auf alle Tokens übertragen (Satzzeichen-Tokens erben die Zeit des Vorgängers)
    zeiten, letzte, z = [], seg_start, dict(zip(idx, zeiten_a))
    for i in range(len(tokens)):
        if i in z:
            letzte = z[i]
        zeiten.append(letzte)
    bericht["segmente"].append((seg_id, len(a), gleich))
    return zeiten


def finde_muster(absaetze, muster_liste):
    """Fundstellen (Absatz, Token, Anzahl) für Suchmuster, Vergleich ohne Leer- und Satzzeichen."""
    treffer = []
    muster = sorted({norm(m) for m in muster_liste}, key=len, reverse=True)
    for ai, ab in enumerate(absaetze):
        normen = [norm(t) for t in ab["w"]]
        i = 0
        while i < len(normen):
            gefunden = None
            for m in muster:
                kette, n = "", 0
                while i + n < len(normen) and len(kette) < len(m):
                    kette += normen[i + n]
                    n += 1
                if normen[i] and kette.startswith(m):
                    gefunden = n
                    break
            if gefunden:
                treffer.append((ai, i, gefunden))
                i += gefunden
            else:
                i += 1
    return treffer


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    kb = pathlib.Path(sys.argv[1]).expanduser()
    auswahl = json.loads((ROOT / "werkzeuge" / "auswahl.json").read_text(encoding="utf-8"))
    glossar = json.loads((INHALTE / "glossar.json").read_text(encoding="utf-8"))
    zusatz = json.loads((INHALTE / "zusatzinfos.json").read_text(encoding="utf-8"))
    platzhalter = json.loads((INHALTE / "platzhalter.json").read_text(encoding="utf-8"))
    themen = lies_themen(kb)

    veranst, seg_dateien, person_ids, sponsoren, interne_texte = {}, {}, set(), set(), set()
    for vid in auswahl["veranstaltungen"]:
        kopf, rumpf = lies_md(kb / "veranstaltungen" / f"{vid}.md")
        if kopf.get("erfassungsstufe") != 3:
            raise SystemExit(f"{vid}: erfassungsstufe ist nicht 3")
        veranst[vid] = (kopf, rumpf)
        sponsoren.update(str(s) for s in (kopf.get("sponsorenbereich") or []))
        for t in kopf.get("teilnehmer") or []:
            if t["person"] not in ("moderation", "publikum"):
                person_ids.add(t["person"])
            for feld in ("interessenkonflikt",):
                if t.get(feld) and t[feld] not in ("keiner bekannt", "nicht erfasst"):
                    interne_texte.add(str(t[feld]))
        interne_texte.add(abschnitt(rumpf, "Transkripthinweise")[:80])
        seg_dateien[vid] = sorted((kb / "segmente").glob(f"{vid}_s*.md"))
        for sd in seg_dateien[vid]:
            skopf, _ = lies_md(sd)
            for s in skopf.get("sprecher") or []:
                if s["person"] not in ("moderation", "publikum"):
                    person_ids.add(s["person"])
            if skopf.get("hinweis"):
                interne_texte.add(str(skopf["hinweis"]))
    personen, namen = lies_personen(kb, sorted(person_ids))

    bericht = {"segmente": [], "stellen": [], "sponsor_maskiert": 0, "unbekannte_labels": set()}
    sponsor_normen = {norm(s) for s in sponsoren}
    out_v, out_e = {}, {}
    (DATEN / "wortlaut").mkdir(parents=True, exist_ok=True)

    for vid, (kopf, _) in veranst.items():
        woerter, dauer = deepgram_woerter(kb / kopf["deepgram_json"])
        rolle = {t["person"]: t["rolle"] for t in kopf.get("teilnehmer") or []}
        vimeo = str(kopf["video_vimeo"]).split("/")
        wl_segmente, tabelle = {}, []
        for sd in seg_dateien[vid]:
            skopf, srumpf = lies_md(sd)
            sid = skopf["id"]
            s0, s1 = float(skopf["start"]), float(skopf["ende"])
            typ_von = {s["person"]: s["typ"] for s in skopf.get("sprecher") or []}
            absaetze, alle_tokens, grenzen = [], [], []
            for ab in wortlaut_absaetze(srumpf):
                label = ab["label"]
                kern = re.sub(r"\s*\(.*?\)\s*$", "", label)
                if kern == "[Sprecher unklar]":
                    pid, name, typ = "unklar", "Sprecher unklar", "unklar"
                elif kern == "[Publikum]":
                    pid, name = "publikum", "Publikum"
                    typ = typ_von.get("publikum", "publikumsfrage")
                elif kern == "[Moderation]":
                    pid, name = "moderation", "Moderation"
                    typ = typ_von.get("moderation", "moderation")
                elif kern.startswith("[Sprachausgabe"):
                    pid, name, typ = "sprachausgabe", kern.strip("[]"), "unklar"
                else:
                    pid = namen.get(norm(kern))
                    if not pid:
                        bericht["unbekannte_labels"].add(f"{sid}: {label}")
                        pid, typ = "unklar", "unklar"
                    else:
                        typ = typ_von.get(pid) or ROLLE_ZU_TYP.get(rolle.get(pid, ""), "unklar")
                    name = label
                tokens = ab["text"].split()
                for k, t in enumerate(tokens):
                    if norm(t) in sponsor_normen:
                        tokens[k] = "[Sponsor]" + re.sub(r"^[\wÄÖÜäöüß-]+", "", t)
                        bericht["sponsor_maskiert"] += 1
                grenzen.append((len(alle_tokens), len(alle_tokens) + len(tokens)))
                alle_tokens += tokens
                absaetze.append({"name": name, "person": pid, "typ": typ, "w": tokens})
            zeiten = zuordnen(alle_tokens, woerter, s0, s1, bericht, sid)
            for ab, (g0, g1) in zip(absaetze, grenzen):
                ab["t"] = [int(round(z * 100)) for z in zeiten[g0:g1]]
            marker = []
            for quelle in (glossar, zusatz):
                for item in quelle:
                    if item.get("suchmuster"):
                        for ai, ti, n in finde_muster(absaetze, item["suchmuster"]):
                            marker.append({"ref": item["id"], "a": ai, "i": ti, "n": n,
                                           "t": absaetze[ai]["t"][ti]})
                    elif item.get("segment") == sid:
                        marker.append({"ref": item["id"], "a": 0, "i": 0, "n": 0,
                                       "t": int(round((s0 + item.get("zeit_relativ", 0)) * 100))})
            marker.sort(key=lambda m: m["t"])
            wl_segmente[sid] = {"absaetze": absaetze, "marker": marker}
            tabelle.append({"id": sid, "start": round(s0, 2), "ende": round(s1, 2), "titel": skopf["titel"]})
            typen = {t for p, t in typ_von.items() if t in ("expertenwissen", "erfahrung")}
            out_e[sid] = {
                "id": sid,
                "typ": "videosegment",
                "typ_label": "Videosegment",
                "veranstaltung": vid,
                "start": round(s0, 2),
                "ende": round(s1, 2),
                "titel": skopf["titel"],
                "zusammenfassung": abschnitt(srumpf, "Zusammenfassung"),
                "themen": [themen[t] for t in skopf.get("themen") or [] if t in themen],
                "schwerpunkt": "gemischt" if len(typen) == 2 else (typen.pop() if typen else "moderation"),
                "sprecher": [{"person": p, "name": personen.get(p, TYP_LABEL.get(p, p.capitalize())), "typ": t}
                             for p, t in typ_von.items()],
            }
        (DATEN / "wortlaut" / f"{vid}.json").write_text(
            json.dumps({"veranstaltung": vid, "segmente": wl_segmente}, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")
        out_v[vid] = {
            "id": vid,
            "titel": kopf["titel"],
            "reihe": kopf["reihe"],
            "anzeigename": kopf["titel"] if str(kopf["titel"]).startswith(str(kopf["reihe"])) else f'{kopf["reihe"]}: {kopf["titel"]}',
            "format": kopf["format"],
            "aufnahmedatum": str(kopf["aufnahmedatum"]),
            "dauer": round(float(kopf["dauer_sekunden"]), 2),
            "vimeo": {"id": vimeo[0], "h": vimeo[1] if len(vimeo) > 1 else ""},
            "beitrag_url": kopf["beitrag_url"],
            "wortlaut": f"daten/wortlaut/{vid}.json",
            "teilnehmer": [{"person": t["person"], "name": personen.get(t["person"], "Moderation"),
                            "rolle": t["rolle"]} for t in kopf.get("teilnehmer") or []],
            "segmente": tabelle,
        }
        if abs(dauer - float(kopf["dauer_sekunden"])) > 0.5:
            print(f"WARNUNG {vid}: Dauer im JSON {dauer} weicht von dauer_sekunden ab")

    for p in platzhalter:
        out_e[p["id"]] = p
    fehlend = [e for e in [auswahl["start"]] + auswahl["reihenfolge"] if e not in out_e]
    if fehlend:
        raise SystemExit(f"Unbekannte Elemente in auswahl.json: {fehlend}")

    ergebnis = {
        "info": "Erzeugt mit werkzeuge/export.py aus der Wissensbasis wissensbasis-mmk. Nicht von Hand bearbeiten.",
        "stand": datetime.date.today().isoformat(),
        "typen": {k: v for k, v in TYP_LABEL.items() if v},
        "start": auswahl["start"],
        "reihenfolge": auswahl["reihenfolge"],
        "veranstaltungen": out_v,
        "elemente": out_e,
        "glossar": {g["id"]: {k: v for k, v in g.items() if k != "suchmuster"} for g in glossar},
        "zusatzinfos": {z["id"]: {k: v for k, v in z.items() if k not in ("suchmuster", "segment", "zeit_relativ")} for z in zusatz},
    }
    (DATEN / "elemente.json").write_text(json.dumps(ergebnis, ensure_ascii=False, indent=1), encoding="utf-8")

    # ---- Bericht
    print("Export abgeschlossen:", len(out_v), "Veranstaltungen,",
          sum(1 for e in out_e.values() if e.get("typ") == "videosegment"), "Segmente")
    gesamt = sum(s[1] for s in bericht["segmente"])
    gleich = sum(s[2] for s in bericht["segmente"])
    print(f"Wortzeiten: {gleich} von {gesamt} Wörtern direkt aus Deepgram ({100 * gleich / max(gesamt, 1):.1f} %), Rest interpoliert")
    schwach = [s for s in bericht["segmente"] if s[1] and s[2] / s[1] < 0.9]
    for sid, n, g in schwach:
        print(f"  Zuordnung unter 90 %: {sid}: {g}/{n}")
    print("Sponsorennamen im Wortlaut maskiert:", bericht["sponsor_maskiert"])
    if bericht["unbekannte_labels"]:
        print("Nicht zugeordnete Sprecherbezeichnungen:", sorted(bericht["unbekannte_labels"]))
    print("Stellen ohne direkte Zuordnung (ab 4 Wörtern):", len(bericht["stellen"]))
    for sid, t, art, txt in bericht["stellen"]:
        print(f"  {sid} {'' if t is None else f'{t:.1f}s '}{art}: {txt}")

    # ---- Prüfung ausgeschlossener Felder
    verstoesse = []

    def pruefe(obj, pfad):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k.lower() in AUSGESCHLOSSEN:
                    verstoesse.append(f"Feld {k} in {pfad}")
                pruefe(v, pfad)
        elif isinstance(obj, list):
            for v in obj:
                pruefe(v, pfad)
        elif isinstance(obj, str):
            for t in interne_texte:
                if len(t) > 20 and t in obj:
                    verstoesse.append(f"interner Text in {pfad}: {t[:50]}")
            if "liegt vor (Angabe" in obj:
                verstoesse.append(f"Einwilligungsvermerk in {pfad}")

    for datei in sorted(DATEN.rglob("*.json")):
        inhalt = datei.read_text(encoding="utf-8")
        pruefe(json.loads(inhalt), datei.relative_to(ROOT))
        for s in sponsoren:
            if re.search(r"\b" + re.escape(s) + r"\b", inhalt):
                verstoesse.append(f"Sponsorenname {s} in {datei.relative_to(ROOT)}")
    if verstoesse:
        print("PRÜFUNG FEHLGESCHLAGEN:")
        for v in sorted(set(verstoesse)):
            print("  ", v)
        sys.exit(1)
    print("Prüfung: kein ausgeschlossenes Feld, kein interner Vermerk, kein Sponsorenname in daten/")


if __name__ == "__main__":
    main()
