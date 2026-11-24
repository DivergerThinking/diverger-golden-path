// Candidato B3: Radix Themes, con estilos de serie: el tema elige un color de su paleta (accentColor) y el resto se
// cambia con sus variables de CSS (--accent-9, --default-font-family).
import "@radix-ui/themes/styles.css";
import { Button, Callout, Flex, Heading, Select, Text, TextField, Theme } from "@radix-ui/themes";
import { useId } from "react";
import { MARCA, type PedirEquipoProps } from "../contrato.js";
import { usePedirEquipo } from "../estado.js";

const ESTILOS = `.radix-themes { --accent-9: ${MARCA.primario}; --default-font-family: ${MARCA.fuente}; }`;

export function PedirEquipo(props: PedirEquipoProps) {
  const p = usePedirEquipo(props);
  const fecha = useId();
  const equipo = useId();
  return (
    <Theme accentColor="iris" radius="small">
      <style>{ESTILOS}</style>
      <main>
        <Heading as="h1">Pedir un equipo</Heading>
        <form onSubmit={(e) => void p.enviar(e)}>
          <Flex direction="column" gap="2">
            <Text as="label" id={equipo}>Equipo</Text>
            <Select.Root value={p.equipo} onValueChange={p.setEquipo}>
              <Select.Trigger aria-labelledby={equipo} />
              <Select.Content>
                {p.disponibles.map((e) => <Select.Item key={e.id} value={e.id}>{e.nombre}</Select.Item>)}
              </Select.Content>
            </Select.Root>
            <Text as="label" htmlFor={fecha}>Fecha de devolución</Text>
            <TextField.Root id={fecha} type="date" required value={p.fecha} aria-invalid={p.error ? true : undefined}
              onChange={(e) => p.setFecha(e.currentTarget.value)} />
            <Button type="submit" disabled={p.enviando}>Pedir</Button>
          </Flex>
        </form>
        {p.error && <Callout.Root role="alert" color="red"><Callout.Text>{p.error}</Callout.Text></Callout.Root>}
        {p.hecho && <div role="status">{p.hecho}</div>}
      </main>
    </Theme>
  );
}
