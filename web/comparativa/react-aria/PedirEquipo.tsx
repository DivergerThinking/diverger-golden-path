// Candidato B1: React Aria Components (Adobe), sin estilos de serie: el aspecto lo ponen los mismos tokens de CSS que el
// kit, sobre los atributos data-* que publica cada componente.
import { Button, FieldError, Form, Input, Label, ListBox, ListBoxItem, Popover, Select, SelectValue, Text, TextField } from "react-aria-components";
import { MARCA, type PedirEquipoProps } from "../contrato.js";
import { usePedirEquipo } from "../estado.js";

const ESTILOS = `.rac-boton { background: ${MARCA.primario}; color: ${MARCA.primarioTexto}; border-radius: ${MARCA.radio}; }
.rac-boton[data-focus-visible] { outline: 2px solid ${MARCA.primario}; outline-offset: 2px; }
.rac-error { color: ${MARCA.error}; } form { font-family: ${MARCA.fuente}; }`;

export function PedirEquipo(props: PedirEquipoProps) {
  const p = usePedirEquipo(props);
  return (
    <main>
      <style>{ESTILOS}</style>
      <h1>Pedir un equipo</h1>
      <Form onSubmit={(e) => void p.enviar(e)}>
        <Select selectedKey={p.equipo} onSelectionChange={(k) => p.setEquipo(String(k))}>
          <Label>Equipo</Label>
          <Button><SelectValue /></Button>
          <Popover>
            <ListBox items={p.disponibles}>
              {(e) => <ListBoxItem id={e.id}>{e.nombre}</ListBoxItem>}
            </ListBox>
          </Popover>
        </Select>
        <TextField type="date" isRequired value={p.fecha} onChange={p.setFecha} isInvalid={Boolean(p.error)}>
          <Label>Fecha de devolución</Label>
          <Input />
          {p.error && <Text slot="errorMessage" className="rac-error">{p.error}</Text>}
          <FieldError />
        </TextField>
        <Button type="submit" className="rac-boton" isDisabled={p.enviando}>Pedir</Button>
      </Form>
      {p.error && <div role="alert" className="rac-error">{p.error}</div>}
      {p.hecho && <div role="status">{p.hecho}</div>}
    </main>
  );
}
