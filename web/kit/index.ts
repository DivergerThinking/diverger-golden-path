// El sistema de diseño de la aplicación (ADR 0058 del harness). Las pantallas solo importan de aquí. Lo que exporta este
// fichero, con sus propiedades, es el contrato del kit (contrato.ts): un cliente puede sustituir el kit entero si lo
// mantiene, o solo tokens.css para poner su marca. La guía, con un ejemplo de cada componente, está en LEEME.md.
import "./tokens.css";
import "./kit.css";

export {
  Aviso,
  Boton,
  Campo,
  DialogoConfirmacion,
  EtiquetaEstado,
  Formulario,
  ListaVacia,
  Menu,
  Pagina,
  Selector,
  Tabla,
} from "./componentes.js";
export type {
  AvisoProps,
  BotonProps,
  CampoProps,
  Columna,
  DialogoConfirmacionProps,
  EtiquetaEstadoProps,
  Fila,
  FormularioProps,
  ListaVaciaProps,
  MenuProps,
  Opcion,
  PaginaProps,
  SelectorProps,
  TablaProps,
} from "./componentes.js";
