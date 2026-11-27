// Test del contrato del kit (ADR 0058 del harness): lee con el compilador de TypeScript lo que exporta web/kit/index.ts
// y comprueba que cada componente de CONTRATO existe y tiene sus propiedades. Si falta algo, el fallo nombra el
// componente y la propiedad, para que quien cambió el kit sepa qué ha roto.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { CONTRATO } from "./contrato.js";

/** Los incumplimientos del contrato del kit cuyo índice es «indice», como «Campo: falta la propiedad «etiqueta»». */
function incumplimientos(indice: string, contrato: Record<string, readonly string[]>): string[] {
  const programa = ts.createProgram([indice], {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  });
  const comprobador = programa.getTypeChecker();
  const fuente = programa.getSourceFile(indice);
  if (!fuente) return [`No se encuentra ${indice}.`];
  const modulo = comprobador.getSymbolAtLocation(fuente);
  const exportados = new Map((modulo ? comprobador.getExportsOfModule(modulo) : []).map((s) => [s.getName(), s]));
  const fallos: string[] = [];
  for (const [componente, propiedades] of Object.entries(contrato)) {
    const simbolo = exportados.get(componente);
    if (!simbolo) {
      fallos.push(`${componente}: web/kit/index.ts no lo exporta.`);
      continue;
    }
    const tipo = comprobador.getTypeOfSymbolAtLocation(simbolo, fuente);
    const firma = tipo.getCallSignatures()[0];
    const parametro = firma?.getParameters()[0];
    const props = parametro ? comprobador.getTypeOfSymbolAtLocation(parametro, fuente) : undefined;
    for (const propiedad of propiedades) {
      if (!props?.getProperty(propiedad)) fallos.push(`${componente}: falta la propiedad «${propiedad}».`);
    }
  }
  return fallos;
}

describe("contrato del kit", () => {
  it("web/kit/index.ts exporta cada componente del contrato con todas sus propiedades", () => {
    expect(incumplimientos(join(import.meta.dirname, "index.ts"), CONTRATO)).toEqual([]);
  }, 60000);

  it("si a un componente le falta una propiedad, el fallo nombra el componente y la propiedad", () => {
    const carpeta = mkdtempSync(join(tmpdir(), "kit-"));
    try {
      const indice = join(carpeta, "index.ts");
      // Un kit sustituto cuyo campo ha perdido la etiqueta, y sin el aviso.
      writeFileSync(indice, "export function Campo(p: { valor: string; alCambiar: (v: string) => void }) { return p.valor; }\n");
      expect(incumplimientos(indice, { Campo: ["etiqueta", "valor"], Aviso: ["tipo"] })).toEqual([
        "Campo: falta la propiedad «etiqueta».",
        "Aviso: web/kit/index.ts no lo exporta.",
      ]);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  }, 60000);
});
