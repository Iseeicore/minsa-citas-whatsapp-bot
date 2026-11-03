---
name: revision-be-10-git-entrega
description: Filtro 10 de 10 de revision-backend. Commit convencional sin atribución de IA, rama al día, observaciones con inventario completo y corrección limitada al diff, y exclusión de archivos de asistentes de IA al repositorio institucional (GitLab). Úsalo solo dentro de revision-backend.
---

# Filtro BE-10 · Git y entrega (G16-G18, G33-G40, G64-G74; R123-R127, R145-R146)

## Verifica

- `.gitignore` cubre `.vscode/`, `.idea/`, `.DS_Store`, `.env`, `.env.local`.
- Commits convencionales, en español, con el autor del usuario y **sin** `Co-Authored-By` ni atribución de IA (G35). Mensaje corto: título y pocas líneas, sin describir pruebas (G74).
- En GitLab va un solo commit; las correcciones lo enmiendan y se suben con `--force-with-lease` atado al commit esperado (G18, G74). En GitHub, un commit por corrección (G74).
- Antes de subir, la rama es la esperada y el PR o MR sigue abierto (G16, G17). Lo que se informa a otro equipo sale de la rama de destino actualizada (G38).
- Una observación empieza por el inventario completo y la corrección se limita al diff del MR (R123, G22, G65). Cambios que tocan los mismos archivos van en serie (R126). Lo encontrado y no pedido se reporta, no se arregla de paso (R125). Todo trabajo delegado se reverifica (R112, G20). Lo pendiente se escribe con sus pasos (R127).
- Antes de quitar un archivo de herramientas se busca quién lo llama (R145).

## Destino GitHub vs GitLab (G35, R146)

- **GitHub (`Iseeicore/minsa-citas-whatsapp-bot`)**: `CLAUDE.md`, `AGENTS.md` y `.claude/skills/` **sí se versionan**.
- **GitLab (repositorio institucional, `oidt/minsa-digital-bot`)**: **no** deben llegar `CLAUDE.md`, `AGENTS.md` ni `.claude/`. Antes de preparar cualquier commit o MR hacia GitLab, verificar que el diff no los incluye (G37).

## Comandos

```bash
git log --format=%B <destino>..HEAD | rg -i "co-authored|generated with"
git rev-list --count <destino>..HEAD
git diff --name-only <destino>...HEAD | rg "^(CLAUDE\.md|AGENTS\.md|\.claude/)"
```

La última línea debe estar vacía **al preparar el envío a GitLab**; en un PR de GitHub es esperado que aparezcan.

## Veredicto

PASA / FALLA con la regla violada. Los 10 filtros en PASA → ejecutar el cierre de `revision-backend`.
