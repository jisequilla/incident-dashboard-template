# /// script
# requires-python = ">=3.10"
# dependencies = ["scrapling[fetchers]"]
# ///
"""fetch-boja.py — hijo de fetch-boja.mjs: consulta el buscador del BOJA.

El buscador de la sede del BOJA es Solr detrás de un GET plano (search.do):
la paginación expone fq/sort/start, así que esto es casi una API no documentada.
Se usa el Fetcher ligero de Scrapling (HTTP puro, sin navegador); si algún día
la Junta añade protección anti-bot, la escalera es StealthyFetcher/DynamicFetcher.

Este script NO decide qué es relevante ni qué es nuevo: trae la ventana completa
y emite JSON por stdout. El contrato, los invariantes y el filtro viven en el
padre Node. Los errores también viajan en el JSON ({ok:false,kind,msg}) — el
exit code del proceso lo interpreta el padre, no este script.

kinds de fallo: net (red/HTTP) · gone (search.do ya no existe) · shape (la
página responde pero su estructura ya no es la esperada — rediseño).

Este módulo encapsula el BOJA (Andalucía). Para otro boletín oficial (BOCM,
DOGC, BOE…) se reescribe SOLO este fichero — BASE, parámetros del buscador y
selectores — manteniendo el contrato JSON de salida; el padre Node no cambia.
"""
import json
import logging
import re
import sys
from urllib.parse import urlencode

logging.getLogger("scrapling").setLevel(logging.ERROR)
from scrapling.fetchers import Fetcher  # noqa: E402

BASE = "https://www.juntadeandalucia.es/eboja/buscador/search.do"
PAGE_SIZE = 10  # tamaño fijo del listado del buscador


def fail(kind, msg):
    print(json.dumps({"ok": False, "kind": kind, "msg": msg}, ensure_ascii=False))
    sys.exit(0)


def get(params):
    try:
        return Fetcher.get(BASE + "?" + urlencode(params), timeout=30)
    except Exception as e:  # scrapling ya reintenta 3 veces por dentro
        fail("net", f"{type(e).__name__}: {e}")


def parse_total(page):
    """'1 a 10 de 23 resultados' → 23. None si no hay paginado (0 resultados… o rediseño)."""
    pag = page.css("div.paginado")
    if not pag:
        return None
    m = re.search(r"de\s+([\d.]+)\s+resultados", " ".join(pag[0].get_all_text().split()))
    return int(m.group(1).replace(".", "")) if m else None


def scan(q, start_date, max_pages):
    items, total, scanned = [], None, 0
    for pageno in range(max_pages):
        page = get({
            "eboja": "on",
            "q": q,
            "startDate": start_date,
            "ordenacion": "bojaDateNormalized",
            "sentido_ordenacion": "descendente",
            "start": pageno * PAGE_SIZE,
        })
        if page.status == 404:
            fail("gone", "search.do devuelve 404 — el buscador del BOJA ya no está donde estaba")
        if page.status != 200:
            fail("net", f"HTTP {page.status} en q={q!r}")
        lis = page.css("ul.listado_resultados > li")
        if pageno == 0:
            total = parse_total(page)
        if not lis:
            break
        for li in lis:
            a = li.css("a")
            items.append({
                "text": " ".join(li.get_all_text().split()),
                "link": (a[0].attrib.get("href") or "").strip() if a else None,
            })
        scanned += len(lis)
        if total is not None and scanned >= total:
            break
    # el paginado promete resultados que el listado no entrega: estructura rota
    if total and not items:
        fail("shape", f"el paginado dice {total} resultados pero el listado está vacío (q={q!r})")
    return {"q": q, "total": total if total is not None else scanned, "scanned": scanned, "items": items}


cfg = json.loads(sys.argv[1])
out = [scan(q, cfg["startDate"], cfg.get("maxPages", 5)) for q in cfg["queries"]]

# Cero en TODAS las consultas: ¿silencio real o buscador rediseñado? La página de
# cero resultados es idéntica a una rota (sin listado ni paginado), así que lo
# decide una consulta de control que siempre tiene resultados — mismo principio
# que la cuenta de control de fetch-x.mjs.
if all(r["scanned"] == 0 for r in out):
    control = scan(cfg.get("controlQuery", "decreto"), cfg["startDate"], 1)
    if control["scanned"] == 0:
        fail("shape", "todas las consultas Y la de control devuelven 0 items — se asume rediseño del buscador, no silencio real")

print(json.dumps({"ok": True, "queries": out}, ensure_ascii=False))
