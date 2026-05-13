"""
Exemplo de chamada às APIs de bets do RapidAPI em Python.

Requer: pip install requests
Uso:    RAPIDAPI_KEY=sua_chave python python-example.py

O catálogo completo das 302 APIs está em ../catalog.json (+ part2/part3).
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests

RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY")
if not RAPIDAPI_KEY:
    sys.exit("Defina a variável RAPIDAPI_KEY antes de executar.")

CATALOG_DIR = Path(__file__).resolve().parent.parent


def load_catalog() -> list[dict]:
    """Carrega o catálogo completo das 302 APIs (3 arquivos JSON combinados)."""
    parts = ["catalog.json", "catalog-part2.json", "catalog-part3.json"]
    apis: list[dict] = []
    for filename in parts:
        with (CATALOG_DIR / filename).open(encoding="utf-8") as fp:
            apis.extend(json.load(fp)["apis"])
    return apis


def call_rapidapi(host: str, path: str, params: dict | None = None) -> dict:
    """Faz uma chamada GET autenticada para uma API do RapidAPI."""
    url = f"https://{host}{path}"
    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": host,
    }
    response = requests.get(url, headers=headers, params=params, timeout=10)
    response.raise_for_status()
    return response.json()


def find_apis_by_name(catalog: list[dict], query: str) -> list[dict]:
    """Busca parcial case-insensitive no nome da API."""
    q = query.lower()
    return [api for api in catalog if q in api["name"].lower()]


def top_freemium(catalog: list[dict], min_popularity: float = 9.5) -> list[dict]:
    """Retorna as APIs Freemium acima do threshold, ordenadas por popularidade."""
    filtered = [
        api
        for api in catalog
        if api["pricing"] == "Freemium" and api["popularity"] >= min_popularity
    ]
    return sorted(filtered, key=lambda a: a["popularity"], reverse=True)


def exemplo_pinnacle():
    """Chama a Pinnacle Odds API e imprime os esportes disponíveis."""
    data = call_rapidapi("pinnacle-odds-api.p.rapidapi.com", "/v1/sports")
    print("Pinnacle sports:", json.dumps(data, indent=2)[:400], "...")


def exemplo_listar_pinnacle(catalog: list[dict]):
    """Lista todas as APIs do catálogo que mencionam 'pinnacle' no nome."""
    apis = find_apis_by_name(catalog, "pinnacle")
    print(f"Encontradas {len(apis)} APIs Pinnacle:")
    for api in apis:
        print(f"  [{api['id']:>3}] {api['name']:<50} → {api['rapidapi_host']}")


def exemplo_top_freemium(catalog: list[dict]):
    """Mostra o top freemium do catálogo."""
    top = top_freemium(catalog, min_popularity=9.5)
    print(f"\nTop {len(top)} APIs Freemium (popularidade >= 9.5):")
    for api in top[:20]:
        print(
            f"  {api['popularity']:<4} {api['name']:<45} "
            f"{api['subcategory']:<35} {api['rapidapi_host']}"
        )


if __name__ == "__main__":
    catalog = load_catalog()
    print(f"Catálogo carregado: {len(catalog)} APIs\n")

    exemplo_listar_pinnacle(catalog)
    exemplo_top_freemium(catalog)
    # Descomente para chamar a API real (consome cota):
    # exemplo_pinnacle()
