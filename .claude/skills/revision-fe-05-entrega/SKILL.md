---
name: revision-fe-05-entrega
description: Filtro 5 de 5 de revision-frontend. Git y entrega: commit único convencional sin atribución de IA, rama al día, observaciones corregidas en todo el proyecto, y exclusión de archivos de IA hacia GitLab. Úsalo solo dentro de revision-frontend.
---

# Filtro FE-05 · Entrega (reglas 28-32, 66-71)

## Verifica

- `.gitignore` cubre `.vscode/`, `.idea/`, `.DS_Store`, `.env.local` (28).
- Commits convencionales, en español, con el autor del usuario y **sin** atribución de IA; mensaje corto (29, 69).
- Una rama y un merge request por entrega con un solo commit; correcciones con `--amend` y `--force-with-lease`; sin ramas nuevas sin consultar; rama destino traída y rebase con respaldo previo (30-32, 67, 68).
- Una observación de revisión se corrigió en **todo** el proyecto, partiendo de un inventario de apariciones (66). Un cambio grande va por pasos: primero la interfaz con sus pruebas (70).

## Destino GitHub vs GitLab (regla 71, actualizada 2026-10-14)

- **GitHub**: `CLAUDE.md`, `AGENTS.md` y `.claude/skills/` **sí se versionan**.
- **GitLab (institucional)**: no deben llegar `CLAUDE.md`, `AGENTS.md` ni `.claude/`; verificar el diff antes de preparar el envío.

## Comandos

```bash
git log --format=%B <destino>..HEAD | rg -i "co-authored|generated with"
git rev-list --count <destino>..HEAD
git diff --name-only <destino>...HEAD | rg "^(CLAUDE\.md|AGENTS\.md|\.claude/)"
```

La última debe quedar vacía solo para el envío a GitLab.

## Veredicto

PASA / FALLA con la regla violada. Los 5 filtros en PASA → ejecutar el cierre de `revision-frontend`.
