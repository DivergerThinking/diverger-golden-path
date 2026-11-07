// La PR de una tarea solo marca su propia tarea como hecha (EN-EJE-04, RQ.017, ADR 0045 del harness).
// Uso en el CI: node scripts/tareas.mjs <base>..<head>.
// Cada tarea tiene su fichero, .diverger/<iniciativa>/tasks/<id>.json, y su PR lo pasa de pending a done. Con varios
// workers a la vez, el fichero propio evita que dos editen el mismo, pero no que uno marque una tarea ajena o reabra
// una integrada. La tarea de la PR es la del trailer Diverger-Tarea de sus commits (EN-OPS-02), con las mismas
// excepciones que la comprobación de la suite: las ramas de mantenimiento del kit de evaluación y la del plan, que no
// son de una tarea (scripts/suite.mjs). En la rama de un worker, diverger/<iniciativa>/<tarea>, el fichero propio es
// el de esa iniciativa.
// La PR de una tarea falla si:
// - cambia, añade o borra el fichero de otra tarea;
// - no pasa el suyo de pending a done, o lo devuelve a pending;
// - cambia en su fichero algo más que status y failures (los fallos que corrigió, HU-NUC-20).
// Los ficheros se comparan desde el ancestro común con la rama base: lo que cambió en la base después no es de la PR.
import { appendFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { tareas } from "./suite.mjs";
import { commits, ramaDelWorker } from "./trailers.mjs";

/** Un fichero de tarea: .diverger/<iniciativa>/tasks/<id>.json. */
const FICHERO = /^\.diverger\/([^/]+)\/tasks\/([^/]+)\.json$/;

/** Los campos que la PR de una tarea puede cambiar en su fichero. */
export const CAMPOS = ["status", "failures"];

/** Lo que había en un fichero en un commit: el texto, o undefined si no existía. */
function leer(ref, ruta, cwd) {
  const r = spawnSync("git", ["show", `${ref}:${ruta}`], { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout : undefined;
}

/** El JSON de un fichero de tarea: el objeto, undefined si no existe o null si no es un objeto JSON. */
function json(texto) {
  if (texto === undefined) return undefined;
  try {
    const valor = JSON.parse(texto);
    return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : null;
  } catch {
    return null;
  }
}

/**
 * Ficheros de tareas que cambia la PR, desde el ancestro común de la base y la cabeza, con su contenido antes y
 * después: { ruta, iniciativa, tarea, antes, despues }. antes y despues son el objeto, undefined si el fichero no
 * existe o null si no es un objeto JSON.
 */
export function cambiosDeTareas(rango, cwd = process.cwd()) {
  const [base, cabeza] = rango.split("..");
  if (!base || !cabeza) throw new Error(`El rango «${rango}» no es <base>..<head>`);
  const ancestro = execFileSync("git", ["merge-base", base, cabeza], { cwd, encoding: "utf8" }).trim();
  const salida = execFileSync("git", ["diff", "--name-only", "--no-renames", ancestro, cabeza, "--", ".diverger/"],
    { cwd, encoding: "utf8" });
  return salida.split("\n").map((linea) => linea.trim()).filter(Boolean).flatMap((ruta) => {
    const partes = FICHERO.exec(ruta);
    if (!partes) return [];
    return [{ ruta, iniciativa: partes[1], tarea: partes[2], antes: json(leer(ancestro, ruta, cwd)),
      despues: json(leer(cabeza, ruta, cwd)) }];
  });
}

/** El valor en un texto que no depende del orden de las claves, para comparar dos campos. */
function canonico(valor) {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  if (valor && typeof valor === "object") {
    return `{${Object.keys(valor).sort().map((clave) => `${JSON.stringify(clave)}:${canonico(valor[clave])}`).join(",")}}`;
  }
  return JSON.stringify(valor);
}

/** Campos que cambian entre dos versiones del fichero de una tarea, salvo status y failures. */
function otrosCampos(antes, despues) {
  const claves = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  return [...claves].filter((clave) => !CAMPOS.includes(clave) && canonico(antes[clave]) !== canonico(despues[clave]))
    .sort();
}

/**
 * Qué pasa con la PR: si falla y los mensajes para quien la lee. `tareasDeLaPR` son las tareas de sus trailers;
 * `iniciativa`, la de la rama del worker, si lo es.
 */
export function veredicto(cambios, tareasDeLaPR, iniciativa) {
  if (tareasDeLaPR.length === 0) {
    return { falla: false, mensajes: ["No es la PR de una tarea: la comprobación de los ficheros de tareas no aplica."] };
  }
  if (tareasDeLaPR.length > 1) {
    return { falla: true, mensajes: [`La PR nombra varias tareas en el trailer Diverger-Tarea (${tareasDeLaPR.join(", ")}). `
      + "La PR de una tarea es de una sola, y solo marca esa."] };
  }
  const [tarea] = tareasDeLaPR;
  const propio = `tasks/${tarea}.json`;
  const esPropio = (cambio) => cambio.tarea === tarea && (!iniciativa || cambio.iniciativa === iniciativa);
  const propios = cambios.filter(esPropio);
  const errores = [];
  for (const cambio of cambios.filter((c) => !esPropio(c))) {
    errores.push(`El PR de ${tarea} solo puede cambiar ${propio}: también cambia ${cambio.ruta}.`);
    if (cambio.antes?.status === "done" && cambio.despues?.status !== "done") {
      errores.push(`Una tarea hecha no vuelve a pending: ${cambio.tarea}`);
    }
  }
  if (propios.length > 1) {
    errores.push(`El PR de ${tarea} solo puede cambiar un fichero de su tarea: cambia ${propios.map((c) => c.ruta).join(", ")}.`);
  } else if (propios.length === 0) {
    errores.push(`El PR de ${tarea} no marca su tarea como hecha: no cambia ${propio}.`);
  } else {
    const [{ ruta, antes, despues }] = propios;
    if (despues === undefined) {
      errores.push(`El PR de ${tarea} no marca su tarea como hecha: borra ${ruta}.`);
    } else if (despues === null) {
      errores.push(`El PR de ${tarea} no marca su tarea como hecha: ${ruta} no es un objeto JSON.`);
    } else if (antes?.status === "done" && despues.status !== "done") {
      errores.push(`Una tarea hecha no vuelve a pending: ${tarea}`);
    } else if (antes === undefined || antes === null) {
      errores.push(`El PR de ${tarea} solo puede marcar una tarea que ya está en la rama base: ${ruta} no existía `
        + "o no era un objeto JSON.");
    } else if (antes.status !== "pending") {
      errores.push(`El PR de ${tarea} solo puede pasar ${ruta} de pending a done: en la rama base estaba en `
        + `${JSON.stringify(antes.status)}.`);
    } else if (despues.status !== "done") {
      errores.push(`El PR de ${tarea} no marca su tarea como hecha: ${ruta} queda en ${JSON.stringify(despues.status)}.`);
    }
    if (antes && despues) {
      const otros = otrosCampos(antes, despues);
      if (otros.length) errores.push(`El PR de ${tarea} solo puede cambiar ${CAMPOS.join(" y ")} de ${ruta}: también cambia ${otros.join(", ")}.`);
    }
  }
  if (errores.length) return { falla: true, mensajes: errores };
  return { falla: false, mensajes: [`La PR de ${tarea} solo marca su tarea como hecha.`] };
}

export function comprobar(rango, rama = "", cwd = process.cwd()) {
  return veredicto(cambiosDeTareas(rango, cwd), tareas(commits(rango, cwd), rama), ramaDelWorker(rama)?.iniciativa);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const rango = process.argv[2] ?? "";
  let resultado;
  try {
    resultado = comprobar(rango, process.env.PR_RAMA ?? "");
  } catch (error) {
    console.error(`No se pueden comprobar los ficheros de tareas: ${error.message}`);
    process.exit(1);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## Ficheros de tareas\n\n${resultado.mensajes.map((m) => `- ${m}`).join("\n")}\n`);
  }
  if (resultado.falla) {
    for (const mensaje of resultado.mensajes) console.error(`::error::${mensaje}`);
    process.exit(1);
  }
  for (const mensaje of resultado.mensajes) console.log(mensaje);
}
