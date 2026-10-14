---
name: revision-be-10-git-entrega
description: Filtro 10 de 10 de revision-backend. Commit único convencional sin atribución de IA, rama al día, y exclusión de archivos de asistentes de IA al repositorio institucional (GitLab). Úsalo solo dentro de revision-backend.
---

# Filtro BE-10 · Git y entrega (reglas 54-58, 111-119)

## Verifica

- `.gitignore` cubre `.vscode/`, `.idea/`, `.DS_Store`, `.env`, `.env.local` (54).
- Commits convencionales, en español, con el autor del usuario y **sin** `Co-Authored-By` ni atribución de IA (55). Mensaje corto: título y pocas viñetas, sin describir pruebas (116).
- Una rama y un merge request por entrega, un solo commit; las correcciones reemplazan el commit (`--amend`) y se suben con `--force-with-lease` atado al commit esperado (56, 114). No se crean ramas nuevas sin consultar (57).
- Rama destino traída y rebase si avanzó, con rama de respaldo antes; ante conflicto se avisa (58, 115). Una rama montada sobre otra se revisa contra esa otra (117).
- Cambios que tocan los mismos archivos van en serie, cada tanda verificada (111). Lo encontrado y no pedido se reporta, no se arregla de paso (112). Todo trabajo delegado se reverifica (113). Lo pendiente se escribe con sus pasos (119).

## Destino GitHub vs GitLab (regla 118, actualizada 2026-10-14)

- **GitHub (`Iseeicore/minsa-citas-whatsapp-bot`)**: `CLAUDE.md`, `AGENTS.md` y `.claude/skills/` **sí se versionan**.
- **GitLab (repositorio institucional, `oidt/minsa-digital-bot`)**: **no** deben llegar `CLAUDE.md`, `AGENTS.md` ni `.claude/`. Antes de preparar cualquier commit o MR hacia GitLab, verificar que el diff no los incluye.

## Comandos

```bash
git log --format=%B <destino>..HEAD | rg -i "co-authored|generated with"
git rev-list --count <destino>..HEAD
git diff --name-only <destino>...HEAD | rg "^(CLAUDE\.md|AGENTS\.md|\.claude/)"
```

La última línea debe estar vacía **al preparar el envío a GitLab**; en un PR de GitHub es esperado que aparezcan.

## Veredicto

PASA / FALLA con la regla violada. Los 10 filtros en PASA → ejecutar el cierre de `revision-backend`.
