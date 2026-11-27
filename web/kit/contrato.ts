// El contrato del kit (ADR 0058 del harness): los componentes que exporta web/kit/index.ts y las propiedades que tiene
// cada uno. Las pantallas y la skill implement cuentan con ellos. Un kit que los sustituya puede añadir componentes y
// propiedades, pero no quitar ninguno de estos: contrato.test.tsx falla nombrando el componente y la propiedad.
export const CONTRATO: Record<string, readonly string[]> = {
  Pagina: ["titulo", "menu", "children"],
  Menu: ["etiqueta", "opciones", "actual", "alElegir"],
  Boton: ["children", "variante", "enviar", "desactivado", "alPulsar"],
  Campo: ["etiqueta", "valor", "alCambiar", "tipo", "error", "descripcion", "obligatorio", "nombre"],
  Selector: ["etiqueta", "opciones", "valor", "alCambiar", "error", "obligatorio", "textoVacio"],
  Formulario: ["alEnviar", "etiqueta", "children"],
  Tabla: ["etiqueta", "columnas", "filas", "vacia"],
  ListaVacia: ["mensaje"],
  Aviso: ["tipo", "children"],
  EtiquetaEstado: ["texto", "tono"],
  DialogoConfirmacion: ["titulo", "mensaje", "textoConfirmar", "textoCancelar", "abierto", "alConfirmar", "alCancelar"],
};
