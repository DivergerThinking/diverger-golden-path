// Worker de cada tarea (EN-EJE-02, contrato del ADR 0016 del harness): lo que se puede comprobar del
// workflow sin GitHub. Primero su forma (lanzamiento, permisos, topes, orden de los pasos) y después
// los pasos que no necesitan GitHub ni a Claude, ejecutados con bash sobre un repositorio de juguete.
// Los que usan jq se saltan donde no está (en el runner del CI sí está).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

const RAIZ = join(import.meta.dirname, "..", "..");
const TEXTO = readFileSync(join(RAIZ, ".github", "workflows", "diverger-worker.yml"), "utf8");
const SIN_COMENTARIOS = TEXTO.split("\n").filter((linea) => !linea.trimStart().startsWith("#")).join("\n");

interface Paso {
  name?: string;
  uses?: string;
  id?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string | boolean>;
  "timeout-minutes"?: number;
  "working-directory"?: string;
}

const WF = parse(TEXTO) as {
  "run-name": string;
  on: { workflow_dispatch: { inputs: Record<string, { required: boolean; type: string }> } };
  permissions: Record<string, string>;
  jobs: Record<string, { permissions: Record<string, string>; "timeout-minutes": number; env: Record<string, string>; steps: Paso[] }>;
};
const JOB = WF.jobs.worker ?? { permissions: {}, "timeout-minutes": 0, env: {}, steps: [] };
const PASOS = JOB.steps;

function indice(nombre: string): number {
  const i = PASOS.findIndex((p) => p.name === nombre || p.id === nombre);
  expect(i, `falta el paso «${nombre}»`).toBeGreaterThanOrEqual(0);
  return i;
}

function paso(nombre: string): Paso {
  const p = PASOS[indice(nombre)];
  if (!p) throw new Error(`Falta el paso «${nombre}»`);
  return p;
}

describe("forma del workflow del worker", () => {
  it("se lanza solo con workflow_dispatch y las entradas initiative, task y run", () => {
    expect(Object.keys(WF.on)).toEqual(["workflow_dispatch"]);
    const entradas = WF.on.workflow_dispatch.inputs;
    expect(Object.keys(entradas)).toEqual(["initiative", "task", "run"]);
    for (const entrada of Object.values(entradas)) expect(entrada).toMatchObject({ required: true, type: "string" });
  });

  it("el job se llama diverger-worker <task> <run>, para encontrarlo al conciliar", () => {
    expect(WF["run-name"]).toBe("diverger-worker ${{ inputs.task }} ${{ inputs.run }}");
  });

  it("el token del job solo lee el contenido: sin id-token, sin actions y sin escritura", () => {
    expect(WF.permissions).toEqual({ contents: "read" });
    expect(Object.keys(WF.jobs)).toEqual(["worker"]);
    expect(JOB.permissions).toEqual({ contents: "read" });
    expect(SIN_COMENTARIOS).not.toMatch(/id-token/);
  });

  it("no tiene credenciales de despliegue: solo la clave de Anthropic y la de la App", () => {
    const secretos = new Set([...TEXTO.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]));
    expect([...secretos].sort()).toEqual(["ANTHROPIC_API_KEY", "DIVERGER_HARNESS_APP_KEY"]);
    expect(SIN_COMENTARIOS).not.toMatch(/google-github-actions|GCP_|workload_identity|service_account/);
  });

  it("el token de la App se pide después del worker y solo puede escribir contenido y PR", () => {
    const token = paso("token");
    expect(token.uses).toMatch(/^actions\/create-github-app-token@[0-9a-f]{40}$/);
    expect(indice("token")).toBeGreaterThan(indice("Worker"));
    const permisos = Object.entries(token.with ?? {}).filter(([clave]) => clave.startsWith("permission-"));
    expect(Object.fromEntries(permisos)).toEqual({ "permission-contents": "write", "permission-pull-requests": "write" });
    expect(token.with?.repositories).toBe("${{ github.event.repository.name }}");
  });

  it("el checkout no guarda credenciales en .git", () => {
    const checkout = PASOS.find((p) => p.uses?.startsWith("actions/checkout@"));
    expect(checkout?.with?.["persist-credentials"]).toBe(false);
  });

  it("el modelo solo recibe la clave de Anthropic, ningún token de GitHub", () => {
    const worker = paso("Worker");
    expect(Object.keys(worker.env ?? {}).sort()).toEqual(["ANTHROPIC_API_KEY", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"]);
    for (const anterior of PASOS.slice(0, indice("Worker"))) {
      expect(JSON.stringify(anterior.env ?? {})).not.toMatch(/token|GH_TOKEN|GITHUB_TOKEN/i);
    }
  });

  it("el worker corre en dontAsk, con herramientas permitidas y sin saltarse los permisos", () => {
    const orden = paso("Worker").run ?? "";
    expect(orden).toMatch(/--permission-mode dontAsk/);
    expect(orden).toMatch(/--allowedTools "Read" "Glob" "Grep" "Edit\(\.\/\$FICHERO_TAREA\)" "Edit\(\.\/pruebas\/worker\/\*\*\)"/);
    expect(orden).toMatch(/--setting-sources user --strict-mcp-config/);
    expect(orden).not.toMatch(/dangerously|bypassPermissions|acceptEdits/);
    // Sin herramientas de red: el modelo solo sale a la API de Anthropic.
    const herramientas = /--tools "([^"]+)"/.exec(orden)?.[1]?.split(",");
    expect(herramientas).toEqual(["Read", "Glob", "Grep", "Edit", "Write", "Bash"]);
    // Bash existe solo para comprobar la denegación: la regla ask lo deniega siempre en dontAsk.
    expect(orden).toMatch(/--settings '\{"permissions":\{"ask":\["Bash"\]\}\}'/);
    expect(orden).not.toMatch(/--allowedTools[^\n]*"Bash/);
  });

  it("tiene topes de turnos, de gasto y de tiempo, con valores por defecto pequeños", () => {
    const orden = paso("Worker").run ?? "";
    expect(orden).toMatch(/--max-turns "\$MAX_TURNOS"/);
    expect(orden).toMatch(/--max-budget-usd "\$MAX_USD"/);
    expect(JOB.env.MAX_TURNOS).toBe("${{ vars.DIVERGER_WORKER_MAX_TURNS || '10' }}");
    expect(JOB.env.MAX_USD).toBe("${{ vars.DIVERGER_WORKER_MAX_BUDGET_USD || '0.50' }}");
    const delWorker = paso("Worker")["timeout-minutes"] ?? Infinity;
    expect(delWorker).toBeLessThan(JOB["timeout-minutes"]);
    expect(JOB["timeout-minutes"]).toBeLessThanOrEqual(30);
  });

  it("instala una versión fija de Claude Code y fija las acciones por su commit", () => {
    expect(TEXTO).toMatch(/npm install -g @anthropic-ai\/claude-code@\d+\.\d+\.\d+\n/);
    const usos = TEXTO.split("\n").filter((linea) => /^\s*(- )?uses:/.test(linea));
    expect(usos).toHaveLength(PASOS.filter((p) => p.uses).length);
    for (const linea of usos) expect(linea).toMatch(/@[0-9a-f]{40} # v\d/);
  });

  it("las entradas nunca se pegan en un script", () => {
    for (const p of PASOS) expect(p.run ?? "").not.toMatch(/\$\{\{\s*(inputs|github\.event)/);
  });

  it("la rama es diverger/<iniciativa>/<tarea> y la PR lleva la marca de la tarea y la ejecución", () => {
    expect(paso("Comprobar las entradas").run).toContain('echo "RAMA=diverger/$INICIATIVA/$TAREA"');
    const pr = paso("Rama y PR").run ?? "";
    expect(pr).toContain('echo "<!-- diverger:task=$TAREA;run=$EJECUCION -->"');
    expect(pr).toContain('--head "$RAMA"');
    expect(pr).toContain('--base "$GITHUB_REF_NAME"');
  });

  it("el commit lleva los trailers de autoría y no ejecuta hooks del repositorio", () => {
    const commit = paso("Commit con los trailers").run ?? "";
    for (const trailer of ["Diverger-Rol: Desarrollador", "Diverger-Modelo: $MODELO", "Diverger-Tarea: $TAREA", "Diverger-Iniciado-por: $LANZADO_POR"]) {
      expect(commit).toContain(`--trailer "${trailer}"`);
    }
    expect(commit).toContain("core.hooksPath=/dev/null");
    expect(paso("Rama y PR").run).toContain("core.hooksPath=/dev/null");
  });

  it("elimina el worktree y escribe el resumen siempre, al final", () => {
    const n = PASOS.length;
    expect(PASOS[n - 2]).toMatchObject({ name: "Eliminar el worktree", if: "always()" });
    expect(PASOS[n - 1]).toMatchObject({ name: "Resumen", if: "always()" });
  });
});

// Pasos ejecutados de verdad, como los ejecuta GitHub: bash -eo pipefail.
const HAY_BASH = spawnSync("bash", ["-c", "true"]).status === 0;
const HAY_JQ = HAY_BASH && spawnSync("bash", ["-c", "command -v jq"]).status === 0;

const TAREA_PENDIENTE = { schemaVersion: 1, id: "TA-001", title: "Tarea de prueba", status: "pending" };
const FICHERO = ".diverger/demo/tasks/TA-001.json";

let dir = "";
let repo = "";
let temp = "";
let entorno: Record<string, string> = {};

function git(...args: string[]): string {
  const r = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function escribir(base: string, ruta: string, contenido: unknown): void {
  mkdirSync(join(base, dirname(ruta)), { recursive: true });
  writeFileSync(join(base, ruta), typeof contenido === "string" ? contenido : `${JSON.stringify(contenido, null, 2)}\n`);
}

function ejecutar(nombre: string, extra: Record<string, string> = {}): { codigo: number | null; salida: string; motivo: string } {
  const p = paso(nombre);
  const cwd = p["working-directory"] === "${{ env.WORKTREE }}" ? valor("WORKTREE") : repo;
  const r = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", p.run ?? ""], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...entorno, ...extra },
  });
  const motivo = existsSync(join(temp, "motivo")) ? readFileSync(join(temp, "motivo"), "utf8").trim() : "";
  return { codigo: r.status, salida: r.stdout + r.stderr, motivo };
}

/** Variables que el paso «Comprobar las entradas» deja en GITHUB_ENV. */
function cargarGithubEnv(): void {
  for (const linea of readFileSync(valor("GITHUB_ENV"), "utf8").split("\n").filter(Boolean)) {
    const i = linea.indexOf("=");
    entorno[linea.slice(0, i)] = linea.slice(i + 1);
  }
}

function valor(clave: string): string {
  const v = entorno[clave];
  if (v === undefined) throw new Error(`Falta ${clave} en el entorno de la prueba`);
  return v;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "worker-"));
  repo = join(dir, "repo");
  temp = join(dir, "temp");
  mkdirSync(repo);
  mkdirSync(temp);
  entorno = {
    INICIATIVA: "demo",
    TAREA: "TA-001",
    EJECUCION: "run-20261030-01",
    MODELO: "claude-haiku-5-5",
    MAX_TURNOS: "10",
    MAX_USD: "0.50",
    RUNNER_TEMP: temp,
    GITHUB_ENV: join(temp, "github_env"),
    GITHUB_STEP_SUMMARY: join(temp, "resumen.md"),
    GITHUB_REF_NAME: "main",
  };
  writeFileSync(valor("GITHUB_ENV"), "");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!HAY_BASH)("comprobación de las entradas", () => {
  it("acepta entradas válidas y fija la rama, el fichero de la tarea y el worktree", () => {
    expect(ejecutar("Comprobar las entradas").codigo).toBe(0);
    cargarGithubEnv();
    expect(entorno.RAMA).toBe("diverger/demo/TA-001");
    expect(entorno.FICHERO_TAREA).toBe(FICHERO);
    expect(entorno.WORKTREE).toBe(`${temp}/worktree`);
  });

  it.each([
    [{ TAREA: "../TA-001" }, "La tarea «../TA-001» no es válida"],
    [{ TAREA: "TA-001.json" }, "La tarea «TA-001.json» no es válida"],
    [{ INICIATIVA: "Demo; rm -rf /" }, "La iniciativa «Demo; rm -rf /» no es válida"],
    [{ EJECUCION: "$(id)" }, "La ejecución «$(id)» no es válida"],
    [{ MAX_USD: "diez" }, "DIVERGER_WORKER_MAX_BUDGET_USD tiene que ser un importe en USD, como 0.50"],
    [{ MAX_TURNOS: "0" }, "DIVERGER_WORKER_MAX_TURNS tiene que ser un entero entre 1 y 999"],
  ])("rechaza %o sin lanzar nada y deja el motivo para el resumen", (extra, motivo) => {
    const r = ejecutar("Comprobar las entradas", extra);
    expect(r.codigo).toBe(1);
    expect(r.motivo).toBe(motivo);
    expect(readFileSync(valor("GITHUB_ENV"), "utf8")).toBe("");
  });
});

describe.skipIf(!HAY_BASH)("worktree del worker", () => {
  beforeEach(() => {
    git("init", "-q", "-b", "main");
    escribir(repo, FICHERO, TAREA_PENDIENTE);
    git("add", "-A");
    git("-c", "user.name=prueba", "-c", "user.email=prueba@example.com", "commit", "-qm", "inicio");
    expect(ejecutar("Comprobar las entradas").codigo).toBe(0);
    cargarGithubEnv();
  });

  it("se crea en su rama y se elimina al cerrar el job", () => {
    expect(ejecutar("Crear el worktree").codigo).toBe(0);
    expect(existsSync(join(valor("WORKTREE"), FICHERO))).toBe(true);
    expect(git("worktree", "list")).toContain("[diverger/demo/TA-001]");
    escribir(valor("WORKTREE"), "pruebas/worker/TA-001.md", "sin guardar\n");

    const r = ejecutar("Eliminar el worktree");
    expect(r.codigo).toBe(0);
    expect(existsSync(valor("WORKTREE"))).toBe(false);
    expect(git("worktree", "list").trim().split("\n")).toHaveLength(1);
  });

  it("eliminarlo no falla si el job se cortó antes de crearlo", () => {
    expect(ejecutar("Eliminar el worktree").codigo).toBe(0);
  });

  describe.skipIf(!HAY_JQ)("con jq", () => {
    it("no lanza el worker si la tarea no existe o ya está hecha", () => {
      expect(ejecutar("Comprobar la tarea").codigo).toBe(0);
      expect(ejecutar("Comprobar la tarea", { FICHERO_TAREA: ".diverger/demo/tasks/TA-999.json" }).motivo)
        .toBe("No existe .diverger/demo/tasks/TA-999.json en main");
      escribir(repo, FICHERO, { ...TAREA_PENDIENTE, status: "done" });
      expect(ejecutar("Comprobar la tarea").motivo).toBe("La tarea TA-001 no está pendiente en main (status: done)");
    });

    it("acepta el resultado si la tarea pasa a done y no cambia nada más de ella", () => {
      expect(ejecutar("Crear el worktree").codigo).toBe(0);
      escribir(valor("WORKTREE"), FICHERO, { ...TAREA_PENDIENTE, status: "done" });
      escribir(valor("WORKTREE"), "pruebas/worker/TA-001.md", "Cambio de prueba\n");
      const r = ejecutar("Comprobar el resultado");
      expect(r.motivo).toBe("");
      expect(r.codigo).toBe(0);
    });

    it.each([
      ["sin cambios", () => {}, "El worker no ha cambiado nada"],
      ["sin marcar la tarea", (wt: string) => {
        escribir(wt, "pruebas/worker/TA-001.md", "x\n");
      }, "El worker no ha marcado su tarea como hecha o ha cambiado otros campos"],
      ["cambiando otro campo", (wt: string) => {
        escribir(wt, FICHERO, { ...TAREA_PENDIENTE, status: "done", title: "Otra" });
      }, "El worker no ha marcado su tarea como hecha o ha cambiado otros campos"],
      ["marcando otra tarea", (wt: string) => {
        escribir(wt, FICHERO, { ...TAREA_PENDIENTE, status: "done" });
        escribir(wt, ".diverger/demo/tasks/TA-002.json", { ...TAREA_PENDIENTE, id: "TA-002", status: "done" });
      }, "El worker ha cambiado otras tareas: .diverger/demo/tasks/TA-002.json"],
      ["tocando los workflows", (wt: string) => {
        escribir(wt, FICHERO, { ...TAREA_PENDIENTE, status: "done" });
        escribir(wt, ".github/workflows/otro.yml", "on: push\n");
      }, "El worker ha cambiado .github/workflows/"],
    ])("rechaza el resultado %s", (_caso, cambio, motivo) => {
      expect(ejecutar("Crear el worktree").codigo).toBe(0);
      cambio(valor("WORKTREE"));
      const r = ejecutar("Comprobar el resultado");
      expect(r.codigo).toBe(1);
      expect(r.motivo).toBe(motivo);
    });

    it("el resumen dice por qué no hay PR, o enlaza la PR", () => {
      writeFileSync(join(temp, "motivo"), "El worker no ha cambiado nada\n");
      writeFileSync(join(temp, "salida.json"), JSON.stringify({
        subtype: "success", is_error: false, num_turns: 4, total_cost_usd: 0.01,
        permission_denials: [{ tool_name: "Bash", tool_use_id: "x", tool_input: { command: "curl -sI https://example.com" } }],
      }));
      expect(ejecutar("Resumen").codigo).toBe(0);
      const resumen = readFileSync(valor("GITHUB_STEP_SUMMARY"), "utf8");
      expect(resumen).toContain("**Resultado:** sin PR. El worker no ha cambiado nada");
      expect(resumen).toContain("Herramientas denegadas: 1\n- Bash");

      writeFileSync(valor("GITHUB_STEP_SUMMARY"), "");
      writeFileSync(join(temp, "pr"), "https://github.com/o/r/pull/7\n");
      expect(ejecutar("Resumen").codigo).toBe(0);
      expect(readFileSync(valor("GITHUB_STEP_SUMMARY"), "utf8")).toContain("**Resultado:** PR abierta, https://github.com/o/r/pull/7");
    });
  });
});
