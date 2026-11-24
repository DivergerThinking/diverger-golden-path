import type { PedirEquipoProps } from "../contrato.js";
import { usePedirEquipo } from "../estado.js";
import { Aviso, Boton, Campo, Fecha, Selector, TOKENS_CSS } from "./kit.js";

export function PedirEquipo(props: PedirEquipoProps) {
  const p = usePedirEquipo(props);
  return (
    <main>
      <style>{TOKENS_CSS}</style>
      <h1>Pedir un equipo</h1>
      <form onSubmit={(e) => void p.enviar(e)}>
        <Campo etiqueta="Equipo">
          {(id) => (
            <Selector id={id} value={p.equipo} onChange={(e) => p.setEquipo(e.target.value)}>
              {p.disponibles.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </Selector>
          )}
        </Campo>
        <Campo etiqueta="Fecha de devolución" error={p.error}>
          {(id, descripcion) => (
            <Fecha id={id} required value={p.fecha} aria-invalid={p.error ? true : undefined}
              aria-describedby={descripcion} onChange={(e) => p.setFecha(e.target.value)} />
          )}
        </Campo>
        <Boton type="submit" disabled={p.enviando}>Pedir</Boton>
      </form>
      {p.error && <Aviso tipo="error">{p.error}</Aviso>}
      {p.hecho && <Aviso tipo="exito">{p.hecho}</Aviso>}
    </main>
  );
}
