// Candidato B2: Mantine, con estilos de serie y un tema: la imagen de Diverger va en createTheme.
import "@mantine/core/styles.css";
import { Alert, Button, createTheme, MantineProvider, NativeSelect, TextInput, Title } from "@mantine/core";
import { MARCA, type PedirEquipoProps } from "../contrato.js";
import { usePedirEquipo } from "../estado.js";

const TEMA = createTheme({
  primaryColor: "diverger",
  colors: { diverger: ["#efeaff", "#dcd2ff", "#b7a3ff", "#9071ff", "#7049fb", "#5b31f8", "#4b2bd6", "#3d22ae", "#311b8c", "#251469"] },
  fontFamily: MARCA.fuente,
  defaultRadius: "sm",
});

export function PedirEquipo(props: PedirEquipoProps) {
  const p = usePedirEquipo(props);
  return (
    <MantineProvider theme={TEMA}>
      <main>
        <Title order={1}>Pedir un equipo</Title>
        <form onSubmit={(e) => void p.enviar(e)}>
          <NativeSelect label="Equipo" value={p.equipo} onChange={(e) => p.setEquipo(e.currentTarget.value)}
            data={p.disponibles.map((e) => ({ value: e.id, label: e.nombre }))} />
          <TextInput type="date" label="Fecha de devolución" required value={p.fecha} error={p.error}
            onChange={(e) => p.setFecha(e.currentTarget.value)} />
          <Button type="submit" loading={p.enviando}>Pedir</Button>
        </form>
        {p.error && <Alert role="alert" color="red">{p.error}</Alert>}
        {p.hecho && <div role="status">{p.hecho}</div>}
      </main>
    </MantineProvider>
  );
}
