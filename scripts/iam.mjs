// Mínimo privilegio en GCP (EN-GP-05 y TA-146 del harness, RQ.061): la infraestructura como código de infra/ no
// concede a nadie roles/iam.serviceAccountUser a nivel de proyecto, porque con él la cuenta de despliegue podría actuar
// como cualquier cuenta de servicio del proyecto, y no da los roles básicos (Editor, Owner, Viewer). serviceAccountUser
// se concede solo sobre la cuenta de ejecución, con un recurso google_service_account_iam_*. Las cuentas de despliegue
// y de ejecución, y quitar Editor a la de Compute Engine, son de infra/entornos/gcp.sh del harness; esto impide que la
// infraestructura de la aplicación lo deshaga.
// Uso en el CI: node scripts/iam.mjs [carpeta], por defecto infra/. Falla con un mensaje por cada concesión.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

export const SERVICE_ACCOUNT_USER =
  "serviceAccountUser debe concederse solo sobre la cuenta de ejecución, no a nivel de proyecto";
export const ROL_BASICO = "los roles básicos (Editor, Owner, Viewer) no se conceden en la infraestructura del proyecto";

// Los recursos que conceden roles en el proyecto, la carpeta o la organización: los de una cuenta de servicio
// (google_service_account_iam_*) son los que limitan el permiso a esa cuenta.
const A_NIVEL_DE_PROYECTO = /^google_(project|folder|organization)_iam_(member|binding|policy)$/;
const BASICOS = new Set(["roles/editor", "roles/owner", "roles/viewer"]);

// El texto HCL sin comentarios (de línea con # o //, y de bloque), sin tocar lo que va dentro de las cadenas.
export function sinComentarios(texto) {
  let salida = "";
  let cadena = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (cadena) {
      salida += c;
      if (c === "\\") salida += texto[++i] ?? "";
      else if (c === '"') cadena = false;
    } else if (c === '"') {
      cadena = true;
      salida += c;
    } else if (c === "#" || (c === "/" && texto[i + 1] === "/")) {
      const fin = texto.indexOf("\n", i);
      i = (fin === -1 ? texto.length : fin) - 1;
    } else if (c === "/" && texto[i + 1] === "*") {
      const fin = texto.indexOf("*/", i + 2);
      i = fin === -1 ? texto.length : fin + 1;
    } else salida += c;
  }
  return salida;
}

/** Los bloques resource de un texto HCL: tipo, nombre y cuerpo, sin comentarios y contando llaves fuera de las cadenas. */
export function recursos(texto) {
  const limpio = sinComentarios(texto);
  const encontrados = [];
  const inicio = /resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/g;
  let coincidencia;
  while ((coincidencia = inicio.exec(limpio))) {
    let nivel = 1;
    let i = inicio.lastIndex;
    let cadena = false;
    for (; i < limpio.length && nivel > 0; i++) {
      const c = limpio[i];
      if (cadena) {
        if (c === "\\") i++;
        else if (c === '"') cadena = false;
      } else if (c === '"') cadena = true;
      else if (c === "{") nivel++;
      else if (c === "}") nivel--;
    }
    encontrados.push({ tipo: coincidencia[1], nombre: coincidencia[2], cuerpo: limpio.slice(inicio.lastIndex, i - 1) });
    inicio.lastIndex = i;
  }
  return encontrados;
}

/** Los roles que nombra un recurso: role = "…" y, en una política, los de sus bindings. */
function roles(cuerpo) {
  return [...cuerpo.matchAll(/\brole\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** Los errores de una infraestructura (el texto de sus .tf), con el recurso que los causa. */
export function revisar(texto) {
  const errores = [];
  for (const { tipo, nombre, cuerpo } of recursos(texto)) {
    if (!A_NIVEL_DE_PROYECTO.test(tipo)) continue;
    // Una política entera (google_project_iam_policy) también puede llevar los roles en un data.
    const nombrados = roles(cuerpo);
    if (nombrados.some((rol) => rol === "roles/iam.serviceAccountUser")) {
      errores.push(`${tipo}.${nombre}: ${SERVICE_ACCOUNT_USER}`);
    }
    if (nombrados.some((rol) => BASICOS.has(rol))) errores.push(`${tipo}.${nombre}: ${ROL_BASICO}`);
  }
  return errores;
}

function ficheros(carpeta) {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    if (nombre === ".terraform") return [];
    return statSync(ruta).isDirectory() ? ficheros(ruta) : [ruta];
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const carpeta = process.argv[2] ?? "infra";
  const errores = ficheros(carpeta)
    .filter((ruta) => ruta.endsWith(".tf"))
    .flatMap((ruta) => revisar(readFileSync(ruta, "utf8")).map((error) => `${relative(".", ruta)}: ${error}`));
  for (const error of errores) console.error(`::error::${error}`);
  if (errores.length) process.exit(1);
  console.log("IAM de infra/: sin serviceAccountUser a nivel de proyecto ni roles básicos");
}
