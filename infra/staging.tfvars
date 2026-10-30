# Entorno de staging en el proyecto de pruebas del harness. Nada de esto es secreto.
# Una aplicación creada desde la plantilla cambia «aplicacion» por su nombre (y el prefijo de
# staging.gcs.tfbackend, para que su estado no pise el de otra).
proyecto         = "diverger-exp-harness"
region           = "europe-west1"
aplicacion       = "golden-path"
cuenta_ejecucion = "diverger-run@diverger-exp-harness.iam.gserviceaccount.com"

# Las aplicaciones de prueba se crean y se tiran en cada ejecución del nivel 0 y del nivel 1.
proteccion_borrado = false
