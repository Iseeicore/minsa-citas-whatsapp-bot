import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const NOMBRE_HOOK = "pre-commit";
export const MARCA_HOOK = "instalado_por=minsa-citas-whatsapp-bot/scripts/instalar-hooks.mjs";
export const CONTENIDO_HOOK = [
  "#!/bin/sh",
  MARCA_HOOK,
  'script="$(git rev-parse --show-toplevel)/scripts/hooks/pre-commit"',
  '[ -f "$script" ] || exit 0',
  'exec sh "$script" "$@"',
  "",
].join("\n");

export const Decision = Object.freeze({
  INSTALAR: "instalar",
  ACTUALIZAR: "actualizar",
  AL_DIA: "al-dia",
  AJENO: "ajeno",
  OMITIDO: "omitido",
  ERROR: "error",
});

export function decidirInstalacion(existente) {
  if (existente === null) return Decision.INSTALAR;
  if (!existente.includes(MARCA_HOOK)) return Decision.AJENO;
  return existente === CONTENIDO_HOOK ? Decision.AL_DIA : Decision.ACTUALIZAR;
}

export function instalarHook(carpetaHooks) {
  const destino = join(carpetaHooks, NOMBRE_HOOK);
  const decision = decidirInstalacion(existsSync(destino) ? readFileSync(destino, "utf8") : null);
  if (decision === Decision.INSTALAR || decision === Decision.ACTUALIZAR) {
    mkdirSync(carpetaHooks, { recursive: true });
    writeFileSync(destino, CONTENIDO_HOOK, { mode: 0o755 });
    chmodSync(destino, 0o755);
  }
  return { decision, destino };
}

export function buscarCarpetaHooksComun(cwd, env) {
  try {
    const [dentroDelArbol, carpetaComun] = execFileSync("git", ["rev-parse", "--is-inside-work-tree", "--git-common-dir"], {
      cwd,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split(/\r?\n/);
    return dentroDelArbol === "true" && carpetaComun ? join(resolve(cwd, carpetaComun), "hooks") : null;
  } catch {
    return null;
  }
}

export function instalar({ cwd = process.cwd(), env = process.env, consola = console } = {}) {
  if (env.CI) return Decision.OMITIDO;
  const carpetaHooks = buscarCarpetaHooksComun(cwd, env);
  if (!carpetaHooks) return Decision.OMITIDO;
  try {
    const { decision, destino } = instalarHook(carpetaHooks);
    if (decision === Decision.AJENO) {
      consola.warn(`[hooks] Ya existe ${destino} y no lo instaló este repositorio: no se modifica y lint-staged no corre al hacer commit.`);
    } else if (decision !== Decision.AL_DIA) {
      consola.log(`[hooks] Hook pre-commit ${decision === Decision.INSTALAR ? "instalado" : "actualizado"} en ${destino}.`);
    }
    return decision;
  } catch (error) {
    consola.warn(`[hooks] No se pudo instalar el hook pre-commit (${error.message}); la instalación de dependencias sigue.`);
    return Decision.ERROR;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  instalar();
}
