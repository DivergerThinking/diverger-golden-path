// Lo que hace la pantalla, igual con cada candidato: elegir un equipo disponible, la fecha y pedirlo.
import { useState, type FormEvent } from "react";
import type { PedirEquipoProps } from "./contrato.js";

export function usePedirEquipo({ equipos, pedir }: PedirEquipoProps) {
  const disponibles = equipos.filter((e) => e.estado === "disponible");
  const [equipo, setEquipo] = useState(disponibles[0]?.id ?? "");
  const [fecha, setFecha] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [hecho, setHecho] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento?: FormEvent) {
    evento?.preventDefault();
    setError(undefined);
    setHecho(undefined);
    setEnviando(true);
    const resultado = await pedir(equipo, fecha);
    setEnviando(false);
    if (resultado.ok) setHecho(`${equipos.find((e) => e.id === equipo)?.nombre ?? equipo} reservado hasta el ${fecha}`);
    else setError(resultado.error);
  }

  return { disponibles, equipo, setEquipo, fecha, setFecha, error, hecho, enviando, enviar };
}
