// Componentes del sistema de diseño (ADR 0058 del harness): React Aria Components envuelto con la interfaz propia del
// kit, que es su contrato (contrato.ts). Las pantallas importan web/kit/, nunca react-aria-components, así que un cliente
// puede cambiar lo de dentro sin tocar ninguna pantalla. La accesibilidad (etiquetas, teclado, anuncios) va de serie.
import type { ReactNode } from "react";
import {
  Button,
  Cell,
  Column,
  Dialog,
  FieldError,
  Form,
  Heading,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Modal,
  ModalOverlay,
  Popover,
  Row,
  Select,
  SelectValue,
  Table,
  TableBody,
  TableHeader,
  Text,
  TextField,
} from "react-aria-components";

/** Una opción de un menú o de un selector. */
export interface Opcion {
  id: string;
  texto: string;
}

export interface PaginaProps {
  /** El título de la página, en su h1. */
  titulo: string;
  /** El menú, normalmente un <Menu>. */
  menu?: ReactNode;
  children?: ReactNode;
}

/** La página de la aplicación: su título, el menú y el contenido. */
export function Pagina({ titulo, menu, children }: PaginaProps) {
  return (
    <main className="kit-pagina">
      <h1>{titulo}</h1>
      {menu}
      {children}
    </main>
  );
}

export interface MenuProps {
  /** El nombre del menú para los lectores de pantalla, por ejemplo «Pantallas». */
  etiqueta: string;
  opciones: Opcion[];
  /** El id de la opción abierta, marcada con aria-current. */
  actual?: string;
  alElegir: (id: string) => void;
}

/** El menú de navegación entre pantallas. */
export function Menu({ etiqueta, opciones, actual, alElegir }: MenuProps) {
  return (
    <nav aria-label={etiqueta} className="kit-menu">
      <ul>
        {opciones.map((o) => (
          <li key={o.id}>
            <Button
              className="kit-boton"
              aria-current={o.id === actual ? "page" : undefined}
              onPress={() => {
                alElegir(o.id);
              }}
            >
              {o.texto}
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export interface BotonProps {
  children: ReactNode;
  /** «primario» para la acción principal de la pantalla, «peligro» para borrar o cancelar algo. */
  variante?: "primario" | "secundario" | "peligro";
  /** Si envía el formulario en el que está. */
  enviar?: boolean;
  desactivado?: boolean;
  alPulsar?: () => void;
}

export function Boton({ children, variante = "secundario", enviar = false, desactivado = false, alPulsar }: BotonProps) {
  return (
    <Button type={enviar ? "submit" : "button"} className={`kit-boton kit-boton-${variante}`} isDisabled={desactivado} onPress={alPulsar}>
      {children}
    </Button>
  );
}

export interface CampoProps {
  /** El texto de la etiqueta, unida al campo: así se encuentra por su nombre. */
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
  tipo?: "text" | "email" | "date" | "number" | "password";
  /** El mensaje de error, que se anuncia y marca el campo como no válido. */
  error?: string;
  descripcion?: string;
  obligatorio?: boolean;
  nombre?: string;
}

/** Un campo de texto con su etiqueta, su descripción y su error. */
export function Campo({ etiqueta, valor, alCambiar, tipo = "text", error, descripcion, obligatorio = false, nombre }: CampoProps) {
  return (
    <TextField
      className="kit-campo"
      type={tipo}
      name={nombre}
      value={valor}
      onChange={alCambiar}
      isRequired={obligatorio}
      isInvalid={Boolean(error)}
      validationBehavior="aria"
    >
      <Label>{etiqueta}</Label>
      <Input />
      {descripcion && (
        <Text slot="description" className="kit-campo-descripcion">
          {descripcion}
        </Text>
      )}
      <FieldError className="kit-campo-error">{error}</FieldError>
    </TextField>
  );
}

export interface SelectorProps {
  etiqueta: string;
  opciones: Opcion[];
  /** El id elegido, o null si no hay ninguno. */
  valor: string | null;
  alCambiar: (id: string) => void;
  error?: string;
  obligatorio?: boolean;
  /** El texto mientras no hay nada elegido. */
  textoVacio?: string;
}

/** Un desplegable para elegir una opción de una lista. */
export function Selector({ etiqueta, opciones, valor, alCambiar, error, obligatorio = false, textoVacio = "Elige una opción" }: SelectorProps) {
  return (
    <Select
      className="kit-campo kit-selector"
      value={valor}
      onChange={(clave) => {
        if (clave !== null) alCambiar(String(clave));
      }}
      isRequired={obligatorio}
      isInvalid={Boolean(error)}
      validationBehavior="aria"
      placeholder={textoVacio}
    >
      <Label>{etiqueta}</Label>
      <Button className="kit-boton">
        <SelectValue />
      </Button>
      <FieldError className="kit-campo-error">{error}</FieldError>
      <Popover>
        <ListBox className="kit-lista-opciones" items={opciones}>
          {(o) => (
            <ListBoxItem className="kit-opcion" id={o.id}>
              {o.texto}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}

export interface FormularioProps {
  /** Se llama al enviar, sin recargar la página. */
  alEnviar: () => void;
  /** El nombre del formulario para los lectores de pantalla. */
  etiqueta?: string;
  children: ReactNode;
}

export function Formulario({ alEnviar, etiqueta, children }: FormularioProps) {
  return (
    <Form
      className="kit-formulario"
      aria-label={etiqueta}
      validationBehavior="aria"
      onSubmit={(evento) => {
        evento.preventDefault();
        alEnviar();
      }}
    >
      {children}
    </Form>
  );
}

export interface Columna {
  id: string;
  titulo: string;
}

export interface Fila {
  id: string;
  [columna: string]: ReactNode;
}

export interface TablaProps {
  /** El nombre de la tabla para los lectores de pantalla. */
  etiqueta: string;
  columnas: Columna[];
  filas: Fila[];
  /** Lo que se enseña cuando no hay filas. */
  vacia?: string;
}

/** Una tabla de datos. Sin filas, enseña el mensaje de «vacia». */
export function Tabla({ etiqueta, columnas, filas, vacia = "No hay nada que enseñar." }: TablaProps) {
  if (filas.length === 0) return <ListaVacia mensaje={vacia} />;
  return (
    <Table aria-label={etiqueta} className="kit-tabla">
      <TableHeader columns={columnas}>
        {(c) => (
          <Column id={c.id} isRowHeader={c.id === columnas[0]?.id}>
            {c.titulo}
          </Column>
        )}
      </TableHeader>
      <TableBody items={filas}>
        {(f) => <Row id={f.id} columns={columnas}>{(c) => <Cell>{f[c.id]}</Cell>}</Row>}
      </TableBody>
    </Table>
  );
}

export interface ListaVaciaProps {
  mensaje: string;
}

/** El aviso de que una lista o una tabla no tiene nada. */
export function ListaVacia({ mensaje }: ListaVaciaProps) {
  return <p className="kit-vacia">{mensaje}</p>;
}

export interface AvisoProps {
  /** «error» se anuncia en el momento (role="alert"); «exito» e «info», cuando el lector termina (role="status"). */
  tipo: "error" | "exito" | "info";
  children: ReactNode;
}

export function Aviso({ tipo, children }: AvisoProps) {
  return (
    <div role={tipo === "error" ? "alert" : "status"} className={`kit-aviso kit-aviso-${tipo}`}>
      {children}
    </div>
  );
}

export interface EtiquetaEstadoProps {
  texto: string;
  tono?: "neutro" | "exito" | "error";
}

/** El estado de algo, como «Vencido» o «Devuelto». El texto lo dice todo: el color solo acompaña. */
export function EtiquetaEstado({ texto, tono = "neutro" }: EtiquetaEstadoProps) {
  return <span className={`kit-estado kit-estado-${tono}`}>{texto}</span>;
}

export interface DialogoConfirmacionProps {
  titulo: string;
  mensaje: ReactNode;
  textoConfirmar: string;
  textoCancelar?: string;
  abierto: boolean;
  alConfirmar: () => void;
  alCancelar: () => void;
}

/** Pide confirmación antes de una acción que no se deshace. Escape o «Cancelar» lo cierran sin hacer nada. */
export function DialogoConfirmacion({
  titulo,
  mensaje,
  textoConfirmar,
  textoCancelar = "Cancelar",
  abierto,
  alConfirmar,
  alCancelar,
}: DialogoConfirmacionProps) {
  return (
    <ModalOverlay
      className="kit-fondo-modal"
      isOpen={abierto}
      isDismissable
      onOpenChange={(si) => {
        if (!si) alCancelar();
      }}
    >
      <Modal>
        <Dialog role="alertdialog" className="kit-dialogo">
          <Heading slot="title">{titulo}</Heading>
          <div>{mensaje}</div>
          <div className="kit-dialogo-acciones">
            <Boton alPulsar={alCancelar}>{textoCancelar}</Boton>
            <Boton variante="peligro" alPulsar={alConfirmar}>
              {textoConfirmar}
            </Boton>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
