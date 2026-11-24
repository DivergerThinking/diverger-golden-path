// Candidato A: un kit generado para Diverger sobre elementos nativos de HTML (ADR 0058, opción A). Sin dependencias: los
// tokens son propiedades personalizadas de CSS y cada componente envuelve un elemento nativo con su etiqueta.
import { useId, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes, type ButtonHTMLAttributes } from "react";
import { MARCA } from "../contrato.js";

export const TOKENS_CSS = `:root {
  --kit-primario: ${MARCA.primario}; --kit-primario-texto: ${MARCA.primarioTexto}; --kit-error: ${MARCA.error};
  --kit-fuente: ${MARCA.fuente}; --kit-radio: ${MARCA.radio}; --kit-espacio: 0.75rem;
}
@media (prefers-color-scheme: dark) { :root { --kit-primario: #8b74ff; } }
.kit-campo { display: grid; gap: 0.25rem; font-family: var(--kit-fuente); }
.kit-boton { background: var(--kit-primario); color: var(--kit-primario-texto); border-radius: var(--kit-radio); }
.kit-error { color: var(--kit-error); }`;

interface CampoProps {
  etiqueta: string;
  error?: string;
  children: (id: string, descripcion: string | undefined) => ReactNode;
}

export function Campo({ etiqueta, error, children }: CampoProps) {
  const id = useId();
  const descripcion = error ? `${id}-error` : undefined;
  return (
    <div className="kit-campo">
      <label htmlFor={id}>{etiqueta}</label>
      {children(id, descripcion)}
      {error && <p id={descripcion} className="kit-error">{error}</p>}
    </div>
  );
}

export function Selector(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} />;
}

export function Fecha(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="date" {...props} />;
}

export function Boton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className="kit-boton" {...props} />;
}

export function Aviso({ tipo, children }: { tipo: "error" | "exito"; children: ReactNode }) {
  return tipo === "error" ? <div role="alert" className="kit-error">{children}</div> : <div role="status">{children}</div>;
}
