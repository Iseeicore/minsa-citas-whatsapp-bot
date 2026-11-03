---
name: revision-fe-05-entrega
description: Filtro 5 de 5 de revision-frontend. Git y entrega: commit convencional sin atribución de IA, rama al día, observaciones con inventario completo y corrección limitada al diff, y exclusión de archivos de IA hacia GitLab. Úsalo solo dentro de revision-frontend.
---

# Filtro FE-05 · Entrega (F58-F60, F66; G16-G18, G33-G40, G64-G74)

## Verifica

- Los archivos de higiene del repo están (`.gitignore` cubre `.vscode/`, `.idea/`, `.DS_Store`, `.env.local`) (F66).
- Commits convencionales, en español, con el autor del usuario y **sin** atribución de IA (G35); mensaje corto: título y pocas líneas, sin describir pruebas (sin regla vigente que lo cubra: era la regla 69 de las reglas retiradas del frontend).
- En GitLab va un solo commit, enmendado y subido con `--force-with-lease` atado al commit esperado; en GitHub, uno por corrección (G18, G74). La rama es la esperada y el PR o MR sigue abierto antes de subir (G16, G17).
- Una observación de revisión empieza por el inventario completo del patrón, y la corrección se limita al diff del MR; lo de afuera se informa como pendiente (F58, G22, G65). «No cambia el comportamiento» se demuestra (F59); lo que no se pidió se reporta y no se arregla de paso (F60).

## Destino GitHub vs GitLab (G35, R146)

- **GitHub**: `CLAUDE.md`, `AGENTS.md` y `.claude/skills/` **sí se versionan**.
- **GitLab (institucional)**: no deben llegar `CLAUDE.md`, `AGENTS.md` ni `.claude/`; verificar el diff antes de preparar el envío (G37).

## Comandos

```bash
git log --format=%B <destino>..HEAD | rg -i "co-authored|generated with"
git rev-list --count <destino>..HEAD
git diff --name-only <destino>...HEAD | rg "^(CLAUDE\.md|AGENTS\.md|\.claude/)"
```

La última debe quedar vacía solo para el envío a GitLab.

## Veredicto

PASA / FALLA con la regla violada. Los 5 filtros en PASA → ejecutar el cierre de `revision-frontend`.
