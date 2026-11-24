// SPK-GP-01 (harness#928): la pantalla «Pedir un equipo» del nivel 1 (P-06 a P-08 de evaluacion/nivel-1/pantallas.md),
// la misma con cada candidato a sistema de diseño. Solo cambia con qué se dibuja: el contrato y el test son comunes.

export interface Equipo {
  id: string;
  nombre: string;
  estado: "disponible" | "reservado" | "prestado";
}

export type Resultado = { ok: true } | { ok: false; error: string };

export interface PedirEquipoProps {
  equipos: Equipo[];
  pedir: (equipo: string, fechaDevolucion: string) => Promise<Resultado>;
}

// La imagen de Diverger para el tematizado [SUPUESTO: el repositorio no tiene guía de marca; son valores provisionales
// para comprobar que cada candidato se tematiza con unos tokens, no los colores reales].
export const MARCA = {
  primario: "#4b2bd6",
  primarioTexto: "#ffffff",
  error: "#b42318",
  fuente: "'Inter', system-ui, sans-serif",
  radio: "6px",
};
