variable "proyecto" {
  description = "Proyecto de GCP donde vive la aplicación."
  type        = string
}

variable "region" {
  description = "Región de Cloud Run, Firestore y Artifact Registry."
  type        = string
  default     = "europe-west1"
}

variable "aplicacion" {
  description = "Nombre de la aplicación: da nombre al servicio de Cloud Run, a la base de Firestore y al repositorio de Artifact Registry."
  type        = string

  # Lo más restrictivo de los tres: la base de Firestore pide de 4 a 63 caracteres, empezar por
  # letra y acabar en letra o número; Cloud Run, como mucho 49.
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,47}[a-z0-9]$", var.aplicacion))
    error_message = "El nombre de la aplicación lleva de 4 a 49 caracteres: minúsculas, números y guiones, empieza por letra y no acaba en guion."
  }
}

variable "cuenta_ejecucion" {
  description = "Cuenta de servicio con la que se ejecuta el servicio de Cloud Run (diverger-run en el proyecto del harness)."
  type        = string

  validation {
    condition     = endswith(var.cuenta_ejecucion, ".iam.gserviceaccount.com")
    error_message = "La cuenta de ejecución tiene que ser una cuenta de servicio (...@<proyecto>.iam.gserviceaccount.com)."
  }
}

variable "imagen_inicial" {
  description = "Imagen con la que se crea el servicio la primera vez. Después la cambia el despliegue continuo y la infraestructura no la toca."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "google_client_id" {
  description = "ID del cliente OAuth de Google para el inicio de sesión. No es un secreto: el servidor se lo da al navegador."
  type        = string
  default     = ""
}

variable "instancias_maximas" {
  description = "Instancias máximas de Cloud Run: limita el gasto."
  type        = number
  default     = 2

  validation {
    condition     = var.instancias_maximas >= 1 && var.instancias_maximas <= 10
    error_message = "Las instancias máximas van de 1 a 10."
  }
}

variable "acceso_publico" {
  description = "Si el servicio se puede llamar sin identidad de Google Cloud. La aplicación pide su propio inicio de sesión con Google en /api."
  type        = bool
  default     = true
}

variable "proteccion_borrado" {
  description = "Impide borrar el servicio y la base de datos con tofu destroy. En staging de pruebas se apaga para poder tirar la aplicación."
  type        = bool
  default     = true
}

variable "fichero_indices" {
  description = "Fichero con los índices compuestos de Firestore, en el formato de firestore.indexes.json, relativo a infra/."
  type        = string
  default     = "firestore.indexes.json"
}
