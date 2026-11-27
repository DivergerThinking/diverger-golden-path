// Las reglas del CI siguen funcionando: el lint rechaza código que las incumple y el linter de
// dependencias impide entrar en lo interno de otro contexto (ADR 0003 del harness).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ESLint } from "eslint";
import { cruise, type IConfiguration, type ICruiseResult } from "dependency-cruiser";
import { describe, expect, it } from "vitest";

const RAIZ = join(import.meta.dirname, "..", "..");
const config = createRequire(import.meta.url)(join(RAIZ, ".dependency-cruiser.cjs")) as IConfiguration;

describe("lint", () => {
  it("rechaza un fichero que incumple las reglas", async () => {
    const eslint = new ESLint({ cwd: RAIZ });
    const [resultado] = await eslint.lintText("export const valor: any = 1;\n", { filePath: join(RAIZ, "app", "server.ts") });
    expect(resultado?.errorCount).toBeGreaterThan(0);
    expect(resultado?.messages.map((m) => m.ruleId)).toContain("@typescript-eslint/no-explicit-any");
  });
});

async function violaciones(ficheros: Record<string, string>): Promise<string[]> {
  const base = mkdtempSync(join(tmpdir(), "contextos-"));
  try {
    for (const [ruta, texto] of Object.entries(ficheros)) {
      mkdirSync(join(base, dirname(ruta)), { recursive: true });
      writeFileSync(join(base, ruta), texto);
    }
    const carpetas = ["app", "src", "web"].filter((carpeta) => Object.keys(ficheros).some((ruta) => ruta.startsWith(`${carpeta}/`)));
    const resultado = await cruise(carpetas, {
      baseDir: base,
      validate: true,
      ruleSet: { forbidden: config.forbidden ?? [] },
      tsPreCompilationDeps: true,
      enhancedResolveOptions: { extensions: [".ts", ".tsx"] },
    });
    const salida = resultado.output as ICruiseResult;
    return salida.summary.violations.map((v) => `${v.rule.name}: ${v.from} -> ${v.to}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

describe("dependencias entre contextos", () => {
  it("permite importar el index.ts de otro contexto", async () => {
    expect(
      await violaciones({
        "src/equipos/index.ts": "export const disponible = true;\n",
        "src/prestamos/index.ts": 'import { disponible } from "../equipos/index";\nexport const ok = disponible;\n',
      }),
    ).toEqual([]);
  });

  it("falla si src/prestamos importa un fichero de src/equipos que no es su index.ts", async () => {
    expect(
      await violaciones({
        "src/equipos/index.ts": "export {};\n",
        "src/equipos/interno.ts": "export const secreto = 1;\n",
        "src/prestamos/index.ts": 'import { secreto } from "../equipos/interno";\nexport const mal = secreto;\n',
      }),
    ).toEqual(["solo-index-de-otro-contexto: src/prestamos/index.ts -> src/equipos/interno.ts"]);
  });

  it("falla si un contexto usa el cliente de la base en vez del puerto de lib/datos.ts (HU-GP-01)", async () => {
    expect(
      await violaciones({
        "node_modules/@google-cloud/firestore/package.json": '{"name": "@google-cloud/firestore", "main": "index.js"}\n',
        "node_modules/@google-cloud/firestore/index.js": "exports.Firestore = class {};\n",
        "src/prestamos/index.ts": 'import { Firestore } from "@google-cloud/firestore";\nexport const mal = Firestore;\n',
      }),
    ).toEqual(["datos-solo-por-el-puerto: src/prestamos/index.ts -> node_modules/@google-cloud/firestore/index.js"]);
  });

  it("falla si el servidor entra en lo interno de un contexto", async () => {
    expect(
      await violaciones({
        "src/equipos/interno.ts": "export const secreto = 1;\n",
        "app/server.ts": 'import { secreto } from "../src/equipos/interno";\nexport const mal = secreto;\n',
      }),
    ).toEqual(["app-y-web-solo-por-index: app/server.ts -> src/equipos/interno.ts"]);
  });
});

// EN-GP-14 (ADR 0058 del harness): una pantalla de web/<id>/ usa solo el sistema de diseño de web/kit/.
describe("lint del sistema de diseño en las pantallas", () => {
  const eslint = new ESLint({ cwd: RAIZ });
  // El fichero se escribe de verdad en web/<carpeta de prueba>/: el lint con tipos solo lee ficheros del proyecto.
  const lint = async (ruta: string, texto: string) => {
    const [carpeta = "", ...resto] = ruta.split("/").slice(1);
    const prueba = carpeta === "kit" ? join(RAIZ, "web", "kit") : join(RAIZ, "web", `${carpeta}-lint-${String(process.pid)}`);
    const fichero = join(prueba, ...resto);
    mkdirSync(dirname(fichero), { recursive: true });
    writeFileSync(fichero, texto);
    try {
      const [resultado] = await eslint.lintFiles([fichero]);
      const mensajes = resultado?.messages ?? [];
      expect(mensajes.filter((m) => m.fatal)).toEqual([]);
      return mensajes.filter((m) => ["no-restricted-syntax", "no-restricted-imports"].includes(m.ruleId ?? ""));
    } finally {
      if (carpeta === "kit") rmSync(fichero, { force: true });
      else rmSync(prueba, { recursive: true, force: true });
    }
  };

  it("pasa una pantalla en web/prestamos/ que solo usa el botón y el campo de web/kit/", async () => {
    const pantalla = [
      'import { useState } from "react";',
      'import { Boton, Campo } from "../kit/index.js";',
      "",
      "export function Pedir() {",
      '  const [fecha, setFecha] = useState("");',
      "  return (",
      "    <section>",
      '      <Campo etiqueta="Fecha de devolución" tipo="date" valor={fecha} alCambiar={setFecha} />',
      '      <Boton variante="primario">Pedir</Boton>',
      "    </section>",
      "  );",
      "}",
      "",
    ].join("\n");
    expect(await lint("web/prestamos/Pedir.tsx", pantalla)).toEqual([]);
  });

  it("falla con un button propio y la propiedad style, y nombra la línea de cada uno", async () => {
    const pantalla = [
      "export function Pedir() {",
      "  return (",
      '    <section style={{ color: "red" }}>',
      '      <button type="button">Pedir</button>',
      "    </section>",
      "  );",
      "}",
      "",
    ].join("\n");
    const mensajes = await lint("web/prestamos/Pedir.tsx", pantalla);
    expect(mensajes.map((m) => [m.line, m.message.split(":")[0]])).toEqual([
      [3, "Una pantalla no lleva estilos propios"],
      [4, "Este elemento lo cubre web/kit/"],
    ]);
  });

  it("falla con una hoja de estilos propia y con react-aria-components importado en una pantalla", async () => {
    const pantalla = 'import "./propio.css";\nimport { Button } from "react-aria-components";\nexport const B = Button;\n';
    const mensajes = await lint("web/prestamos/Pedir.tsx", pantalla);
    expect(mensajes.map((m) => [m.line, m.ruleId])).toEqual([
      [1, "no-restricted-syntax"],
      [2, "no-restricted-imports"],
    ]);
  });

  it("no se aplica al propio kit ni a los tests de las pantallas", async () => {
    expect(await lint("web/kit/Otro.tsx", "export const B = () => <button style={{}}>x</button>;\n")).toEqual([]);
    expect(await lint("web/prestamos/Pedir.test.tsx", "export const B = () => <button>x</button>;\n")).toEqual([]);
  });
});

describe("dependencias de las pantallas", () => {
  const kit = {
    "web/kit/index.ts": 'export { Boton } from "./componentes";\n',
    "web/kit/componentes.ts": "export const Boton = 1;\n",
    "web/pantallas.ts": "export const api = 1;\n",
  };

  it("permite a una pantalla importar web/kit/index.ts y web/pantallas.ts", async () => {
    expect(
      await violaciones({
        ...kit,
        "web/prestamos/index.ts": 'import { Boton } from "../kit/index";\nimport { api } from "../pantallas";\nexport const ok = [Boton, api];\n',
      }),
    ).toEqual([]);
  });

  it("falla si una pantalla entra en lo interno del kit", async () => {
    expect(
      await violaciones({ ...kit, "web/prestamos/index.ts": 'import { Boton } from "../kit/componentes";\nexport const mal = Boton;\n' }),
    ).toEqual(["pantallas-solo-con-el-kit: web/prestamos/index.ts -> web/kit/componentes.ts"]);
  });
});
