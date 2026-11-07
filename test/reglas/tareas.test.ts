// La PR de una tarea solo marca su propia tarea como hecha (EN-EJE-04, ADR 0045 del harness). Se prueba el script
// del CI sobre un repositorio git real y el job «tareas» de ci.yml.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

const RAIZ = join(import.meta.dirname, "..", "..");
const SCRIPT = join(RAIZ, "scripts", "tareas.mjs");
// Las comprobaciones del worker corren en un contenedor sin git (harness#533): ahí estas pruebas se saltan.
const HAY_GIT = spawnSync("git", ["--version"]).status === 0;
const RAMA = "diverger/prestamos/TA-004";
const CARPETA = ".diverger/prestamos/tasks";

let repo = "";
let resumen = "";

function trailers(tarea: string): string[] {
  return ["--trailer", "Diverger-Rol: Desarrollador", "--trailer", "Diverger-Modelo: claude-sonnet-5-5",
    "--trailer", `Diverger-Tarea: ${tarea}`];
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" });
}

function escribir(ruta: string, texto: string): void {
  mkdirSync(join(repo, dirname(ruta)), { recursive: true });
  writeFileSync(join(repo, ruta), texto);
}

function tarea(id: string, campos: Record<string, unknown> = {}, iniciativa = "prestamos"): void {
  escribir(`.diverger/${iniciativa}/tasks/${id}.json`, `${JSON.stringify({ id, title: `Tarea ${id}`, status: "pending",
    dependsOn: [], modules: ["src/prestamos"], ...campos }, null, 2)}\n`);
}

function commit(mensaje: string, extra: string[] = []): void {
  git(["add", "-A"]);
  git(["commit", "-q", "-m", mensaje, ...extra]);
}

function codigo(): void {
  escribir("src/prestamos/servicio.ts", `export const x = ${Math.random()};\n`);
}

function comprobar(rama = RAMA): { codigo: number | null; errores: string; salida: string; resumen: string } {
  const env = { ...process.env, GITHUB_STEP_SUMMARY: resumen, PR_RAMA: rama };
  writeFileSync(resumen, "");
  const r = spawnSync(process.execPath, [SCRIPT, "base..HEAD"], { cwd: repo, encoding: "utf8", env });
  return { codigo: r.status, errores: r.stderr, salida: r.stdout, resumen: readFileSync(resumen, "utf8") };
}

beforeEach(() => {
  const carpeta = mkdtempSync(join(tmpdir(), "tareas-salida-"));
  resumen = join(carpeta, "resumen");
  if (!HAY_GIT) return;
  repo = mkdtempSync(join(tmpdir(), "tareas-"));
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.name", "Prueba"]);
  git(["config", "user.email", "prueba@example.com"]);
  git(["config", "commit.gpgsign", "false"]);
  git(["config", "core.autocrlf", "false"]);
  tarea("TA-003", { status: "done" });
  tarea("TA-004");
  tarea("TA-005");
  escribir("src/prestamos/servicio.ts", "export const x = 1;\n");
  commit("inicio");
  git(["tag", "base"]);
});

afterEach(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
  rmSync(dirname(resumen), { recursive: true, force: true });
  repo = "";
});

describe.skipIf(!HAY_GIT)("la PR de una tarea y los ficheros de tareas", () => {
  it("criterio positivo: la PR de TA-004 que cambia su código y pasa su tarea de pending a done pasa", () => {
    codigo();
    tarea("TA-004", { status: "done" });
    commit("feat: TA-004", trailers("TA-004"));
    const r = comprobar();
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain("La PR de TA-004 solo marca su tarea como hecha.");
    expect(r.resumen).toContain("## Ficheros de tareas");
  });

  it("criterio negativo: la PR de TA-004 que también pasa TA-005 de pending a done falla", () => {
    codigo();
    tarea("TA-004", { status: "done" });
    tarea("TA-005", { status: "done" });
    commit("feat: TA-004", trailers("TA-004"));
    const r = comprobar();
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain("El PR de TA-004 solo puede cambiar tasks/TA-004.json");
    expect(r.errores).toContain(`${CARPETA}/TA-005.json`);
  });

  it("criterio negativo: la PR de TA-004 que pasa su tarea de done a pending falla", () => {
    git(["checkout", "-q", "main"]);
    tarea("TA-004", { status: "done" });
    commit("chore: TA-004 hecha");
    git(["tag", "-f", "base"]);
    tarea("TA-004", { status: "pending" });
    codigo();
    commit("feat: TA-004 otra vez", trailers("TA-004"));
    const r = comprobar();
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain("Una tarea hecha no vuelve a pending: TA-004");
  });

  it("criterio negativo: la PR de TA-004 que no toca ningún fichero de tasks/ falla", () => {
    codigo();
    commit("feat: TA-004", trailers("TA-004"));
    const r = comprobar();
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain("El PR de TA-004 no marca su tarea como hecha");
  });

  it("la PR de una tarea que reabre una tarea ajena falla por las dos razones", () => {
    codigo();
    tarea("TA-004", { status: "done" });
    tarea("TA-003", { status: "pending" });
    commit("feat: TA-004", trailers("TA-004"));
    const r = comprobar();
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain(`El PR de TA-004 solo puede cambiar tasks/TA-004.json: también cambia ${CARPETA}/TA-003.json.`);
    expect(r.errores).toContain("Una tarea hecha no vuelve a pending: TA-003");
  });

  it.each([
    ["añade", () => { tarea("TA-099"); }, `${CARPETA}/TA-099.json`],
    ["borra", () => { rmSync(join(repo, CARPETA, "TA-005.json")); }, `${CARPETA}/TA-005.json`],
  ])("la PR de una tarea que %s el fichero de otra tarea falla", (_, cambiar, fichero) => {
    codigo();
    tarea("TA-004", { status: "done" });
    cambiar();
    commit("feat: TA-004", trailers("TA-004"));
    const r = comprobar();
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain(`también cambia ${fichero}`);
  });

  it("puede guardar los fallos que corrigió en failures (HU-NUC-20)", () => {
    codigo();
    tarea("TA-004", { status: "done", failures: ["El test de préstamos falló por la fecha"] });
    commit("feat: TA-004", trailers("TA-004"));
    expect(comprobar().codigo).toBe(0);
  });

  it("no puede cambiar otros campos de su tarea, como sus dependencias", () => {
    codigo();
    tarea("TA-004", { status: "done", dependsOn: ["TA-003"], modules: ["src/prestamos", "src/equipos"] });
    commit("feat: TA-004", trailers("TA-004"));
    const r = comprobar();
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain(`El PR de TA-004 solo puede cambiar status y failures de ${CARPETA}/TA-004.json: `
      + "también cambia dependsOn, modules.");
  });

  it("el orden de las claves del fichero no cuenta como un cambio", () => {
    codigo();
    escribir(`${CARPETA}/TA-004.json`, `${JSON.stringify({ status: "done", modules: ["src/prestamos"], dependsOn: [],
      title: "Tarea TA-004", id: "TA-004" })}\n`);
    commit("feat: TA-004", trailers("TA-004"));
    expect(comprobar().codigo).toBe(0);
  });

  it.each([
    ["la borra", () => { rmSync(join(repo, CARPETA, "TA-004.json")); }, "borra"],
    ["la deja sin JSON", () => { escribir(`${CARPETA}/TA-004.json`, "no es json\n"); }, "no es un objeto JSON"],
    ["la deja pendiente con otro texto", () => { escribir(`${CARPETA}/TA-004.json`,
      `${JSON.stringify({ id: "TA-004", title: "Tarea TA-004", status: "pending", dependsOn: [], modules: ["src/prestamos"] })}\n`); },
    "queda en \"pending\""],
  ])("la PR de una tarea que %s no la marca como hecha", (_, cambiar, motivo) => {
    codigo();
    cambiar();
    commit("feat: TA-004", trailers("TA-004"));
    const r = comprobar();
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain("El PR de TA-004 no marca su tarea como hecha");
    expect(r.errores).toContain(motivo);
  });

  it("no puede crear su propia tarea, que tiene que existir en la rama base", () => {
    codigo();
    tarea("TA-010", { status: "done" });
    commit("feat: TA-010", trailers("TA-010"));
    const r = comprobar("diverger/prestamos/TA-010");
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain("solo puede marcar una tarea que ya está en la rama base");
  });

  it("en la rama de un worker, el fichero propio es el de su iniciativa", () => {
    codigo();
    tarea("TA-004", { status: "done" }, "otra");
    commit("feat: TA-004", trailers("TA-004"));
    const r = comprobar();
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain("también cambia .diverger/otra/tasks/TA-004.json");
    expect(r.errores).toContain("no marca su tarea como hecha");
  });

  it("la PR que nombra dos tareas falla", () => {
    codigo();
    tarea("TA-004", { status: "done" });
    commit("feat: TA-004", trailers("TA-004"));
    tarea("TA-005", { status: "done" });
    commit("feat: TA-005", trailers("TA-005"));
    const r = comprobar();
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain("La PR nombra varias tareas en el trailer Diverger-Tarea (TA-004, TA-005)");
  });

  it("basta un commit de la tarea entre otros de una persona", () => {
    codigo();
    tarea("TA-004", { status: "done" });
    commit("feat: TA-004", trailers("TA-004"));
    tarea("TA-005", { status: "done" });
    commit("arreglo a mano");
    expect(comprobar().codigo).toBe(1);
  });

  it("la PR de una persona, la del plan o una de mantenimiento no es de una tarea y pasa", () => {
    tarea("TA-003", { status: "pending" });
    tarea("TA-005", { status: "done" });
    commit("chore: reabrir TA-003 a mano");
    const r = comprobar();
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain("No es la PR de una tarea");
    tarea("TA-020");
    commit("chore: el plan nuevo", ["--trailer", "Diverger-Rol: Arquitecto", "--trailer", "Diverger-Tarea: harness#212"]);
    expect(comprobar("plan/prestamos").codigo).toBe(0);
    expect(comprobar("diverger/reinicio/12345").codigo).toBe(0);
    expect(comprobar("diverger/prestamos/TA-020").codigo).toBe(1);
  });

  it("una tarea marcada en main después de abrir la PR no cuenta como de la PR", () => {
    git(["checkout", "-q", "-b", "tarea"]);
    codigo();
    tarea("TA-004", { status: "done" });
    commit("feat: TA-004", trailers("TA-004"));
    git(["checkout", "-q", "main"]);
    tarea("TA-005", { status: "done" });
    commit("feat: TA-005", trailers("TA-005"));
    git(["tag", "-f", "base"]);
    git(["checkout", "-q", "tarea"]);
    expect(comprobar().codigo).toBe(0);
  });

  it("falla con un rango que no es <base>..<head>", () => {
    const r = spawnSync(process.execPath, [SCRIPT, "base"], { cwd: repo, encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no es <base>..<head>");
  });
});

describe("job «tareas» de ci.yml", () => {
  type Paso = { name?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, string> };
  type Job = { if?: string; permissions: Record<string, string>; steps: Paso[] };
  const CI = parse(readFileSync(join(RAIZ, ".github", "workflows", "ci.yml"), "utf8")) as { jobs: Record<string, Job | undefined> };
  const job = CI.jobs.tareas as Job;

  it("corre en cada PR con el script de la rama base y sin permisos de escritura", () => {
    expect(job.if).toBe("github.event_name == 'pull_request'");
    expect(job.permissions).toEqual({ contents: "read" });
    expect(job.steps[0]?.with?.ref).toBe("${{ github.event.pull_request.base.sha }}");
    expect(job.steps[0]?.with?.["fetch-depth"]).toBe(0);
    const paso = job.steps.find((p) => p.name === "Ficheros de tareas");
    expect(paso?.run).toBe('node scripts/tareas.mjs "$RANGO"');
    expect(paso?.env?.RANGO).toBe("${{ github.event.pull_request.base.sha }}..${{ github.event.pull_request.head.sha }}");
    expect(paso?.env?.PR_RAMA).toBe("${{ github.head_ref }}");
    expect(paso?.env).not.toHaveProperty("GH_TOKEN");
  });
});
