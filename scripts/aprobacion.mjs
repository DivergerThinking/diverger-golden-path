// Política de aprobación «otra persona» (EN-OPS-10 y TA-172 del harness, RQ.067, ADR 0008 del harness): la PR del
// harness la aprueba una persona distinta de quien lo lanzó. El ruleset de esa política pide una aprobación y la de
// CODEOWNERS, pero GitHub deja que la dé quien lanzó el harness, porque la PR la abre la identidad del harness y no él.
// Quien lo lanzó es el Diverger-Iniciado-por de los commits del harness, que el job trailers ya compara con quien
// lanzó la ejecución (EN-OPS-06). Con otra política, o en una PR sin commits del harness, no hay nada que comprobar.
// Uso en el workflow aprobacion.yml: node scripts/aprobacion.mjs, con GH_TOKEN, GITHUB_REPOSITORY y PR_NUMERO. La
// política la lee de .diverger/settings.json de la rama base, que es la que tiene el workflow en la carpeta.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { apiDeGitHub, esBot } from "./lanzador.mjs";

export const MENSAJE = "La aprobación tiene que ser de una persona distinta de quien lanzó el harness";
const INICIADO_POR = /^Diverger-Iniciado-por:[ \t]*([A-Za-z0-9][A-Za-z0-9-]{0,38})[ \t]*$/gim;

/** Quiénes lanzaron el harness según los trailers de los commits de la PR, en minúsculas. */
export function lanzadores(commits) {
  const logins = new Set();
  for (const commit of commits) {
    for (const coincidencia of String(commit?.commit?.message ?? "").matchAll(INICIADO_POR)) {
      logins.add(coincidencia[1].toLowerCase());
    }
  }
  return logins;
}

// Solo cuenta quien tiene acceso al repositorio: en uno público, cualquiera puede dejar una aprobación (revisión de
// seguridad de la PR #63).
const CON_ACCESO = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/** Quiénes tienen aprobado el último commit de la PR: la última revisión de cada persona que no sea un comentario, si
 * es una aprobación de ese commit y la persona tiene acceso al repositorio. Las cuentas de GitHub Apps no cuentan. */
export function aprobadores(revisiones, cabeza) {
  const ultima = new Map();
  for (const revision of revisiones) {
    const login = String(revision?.user?.login ?? "");
    if (!login || esBot(login) || revision?.user?.type === "Bot" || revision?.state === "COMMENTED") continue;
    ultima.set(login.toLowerCase(), revision);
  }
  return [...ultima].filter(([, revision]) => revision.state === "APPROVED" && revision.commit_id === cabeza
    && CON_ACCESO.has(revision.author_association)).map(([login]) => login);
}

/** El veredicto: { ok, mensaje }. */
export const MAX_COMMITS = 250; // Lo más que devuelve la API de los commits de una PR.

export function decidir({ politica, pr, commits, revisiones }) {
  if (politica !== "otra-persona") {
    return { ok: true, mensaje: `La política de aprobación es «${politica ?? "sin fijar"}»: no hay nada que comprobar` };
  }
  // Con los datos incompletos no se da por buena (revisión de seguridad de la PR #63).
  if ((pr?.commits ?? 0) > commits.length || commits.length >= MAX_COMMITS) {
    return { ok: false, mensaje: `No se pueden leer todos los commits de la PR (${pr?.commits ?? commits.length}): ${MENSAJE}` };
  }
  const quienes = lanzadores(commits);
  if (quienes.size === 0) {
    // La abre una GitHub App, como la identidad del harness, y no dice quién la lanzó: no se sabe a quién excluir.
    if (esBot(pr?.user?.login) || pr?.user?.type === "Bot") {
      return { ok: false, mensaje: `La PR la abre ${pr.user.login} y ningún commit dice quién lanzó el harness: ${MENSAJE}` };
    }
    return { ok: true, mensaje: "La PR no tiene commits del harness: no hay nada que comprobar" };
  }
  const otros = aprobadores(revisiones, pr?.head?.sha).filter((login) => !quienes.has(login));
  if (otros.length) {
    return { ok: true, mensaje: `Aprobada por ${otros.map((l) => `@${l}`).join(", ")}, distinta de quien lanzó el harness`
      + ` (${[...quienes].map((l) => `@${l}`).join(", ")})` };
  }
  return { ok: false, mensaje: MENSAJE };
}

/** Todas las páginas de una lista de la API, hasta un tope. */
async function todas(api, ruta, tope = 10) {
  const elementos = [];
  for (let pagina = 1; pagina <= tope; pagina++) {
    const lote = await api(`${ruta}?per_page=100&page=${pagina}`);
    if (!Array.isArray(lote)) throw new Error(`La API de GitHub no devuelve una lista en ${ruta}`);
    elementos.push(...lote);
    if (lote.length < 100) return elementos;
  }
  return elementos;
}

function politicaDeLaRamaBase() {
  try {
    return JSON.parse(readFileSync(".diverger/settings.json", "utf8"))?.approvalPolicy;
  } catch {
    return undefined;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  const numero = process.env.PR_NUMERO ?? "";
  if (!repo || !/^[0-9]+$/.test(numero)) {
    console.error("Uso: GITHUB_REPOSITORY=<dueño>/<repo> PR_NUMERO=<n> node scripts/aprobacion.mjs");
    process.exit(2);
  }
  try {
    const politica = politicaDeLaRamaBase();
    const api = apiDeGitHub();
    const [pr, commits, revisiones] = politica === "otra-persona"
      ? await Promise.all([api(`repos/${repo}/pulls/${numero}`), todas(api, `repos/${repo}/pulls/${numero}/commits`, 3),
        todas(api, `repos/${repo}/pulls/${numero}/reviews`)])
      : [undefined, [], []];
    const { ok, mensaje } = decidir({ politica, pr, commits, revisiones });
    if (ok) console.log(mensaje);
    else console.error(`::error::${mensaje}`);
    process.exit(ok ? 0 : 1);
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
