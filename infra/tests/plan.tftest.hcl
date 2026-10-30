# Pruebas de la infraestructura sin tocar GCP (TA-079): tofu test con el proveedor simulado
# comprueba el plan, es decir, qué crearía la infraestructura y con qué valores. Que de verdad se
# cree y que la deriva se revierta se prueba aplicando en el proyecto de pruebas (README).
mock_provider "google" {}

variables {
  proyecto         = "proyecto-de-prueba"
  aplicacion       = "prestamos"
  cuenta_ejecucion = "diverger-run@proyecto-de-prueba.iam.gserviceaccount.com"
}

run "crea_cloud_run_firestore_y_artifact_registry_en_la_region" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.aplicacion.name == "prestamos" && google_cloud_run_v2_service.aplicacion.location == "europe-west1"
    error_message = "El servicio de Cloud Run se llama como la aplicación y está en europe-west1."
  }

  assert {
    condition     = google_firestore_database.datos.name == "prestamos" && google_firestore_database.datos.location_id == "europe-west1" && google_firestore_database.datos.type == "FIRESTORE_NATIVE"
    error_message = "La base de Firestore es propia de la aplicación, nativa y en europe-west1."
  }

  assert {
    condition     = google_artifact_registry_repository.imagenes.repository_id == "prestamos" && google_artifact_registry_repository.imagenes.location == "europe-west1" && google_artifact_registry_repository.imagenes.format == "DOCKER"
    error_message = "El repositorio de Artifact Registry es de Docker, propio de la aplicación y en europe-west1."
  }

  assert {
    condition     = output.repositorio_imagenes == "europe-west1-docker.pkg.dev/proyecto-de-prueba/prestamos"
    error_message = "La ruta del repositorio de imágenes no es la esperada."
  }
}

run "el_servicio_se_ejecuta_con_su_cuenta_y_conoce_su_base" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.aplicacion.template[0].service_account == "diverger-run@proyecto-de-prueba.iam.gserviceaccount.com"
    error_message = "El servicio se ejecuta con la cuenta de ejecución, no con la cuenta por defecto de Compute Engine."
  }

  assert {
    condition     = contains([for e in google_cloud_run_v2_service.aplicacion.template[0].containers[0].env : "${e.name}=${e.value}"], "FIRESTORE_DATABASE=prestamos")
    error_message = "El servicio recibe en FIRESTORE_DATABASE el nombre de su base."
  }

  assert {
    condition     = google_cloud_run_v2_service.aplicacion.template[0].scaling[0].min_instance_count == 0 && google_cloud_run_v2_service.aplicacion.template[0].scaling[0].max_instance_count == 2
    error_message = "El servicio escala a cero y tiene un máximo de instancias para limitar el gasto."
  }

  assert {
    condition     = google_cloud_run_v2_service.aplicacion.template[0].containers[0].startup_probe[0].http_get[0].path == "/api/salud"
    error_message = "La sonda de arranque usa /api/salud, la ruta pública de la plantilla."
  }

  assert {
    condition     = google_cloud_run_v2_service.aplicacion.invoker_iam_disabled == true
    error_message = "Por defecto el servicio se puede llamar sin identidad de Google Cloud; la aplicación pide su inicio de sesión."
  }
}

run "la_cuenta_solo_entra_en_su_base_de_firestore" {
  command = plan

  assert {
    condition     = google_project_iam_member.datos.role == "roles/datastore.user" && google_project_iam_member.datos.member == "serviceAccount:diverger-run@proyecto-de-prueba.iam.gserviceaccount.com"
    error_message = "La cuenta de ejecución tiene datastore.user."
  }

  assert {
    condition     = google_project_iam_member.datos.condition[0].expression == "resource.name == \"projects/proyecto-de-prueba/databases/prestamos\""
    error_message = "El permiso sobre Firestore se limita a la base de la aplicación."
  }
}

run "protege_el_borrado_salvo_que_se_apague" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.aplicacion.deletion_protection == true && google_firestore_database.datos.delete_protection_state == "DELETE_PROTECTION_ENABLED"
    error_message = "Por defecto ni el servicio ni la base se pueden borrar con tofu destroy."
  }
}

run "sin_proteccion_de_borrado_en_staging_de_pruebas" {
  command = plan

  variables {
    proteccion_borrado = false
  }

  assert {
    condition     = google_cloud_run_v2_service.aplicacion.deletion_protection == false && google_firestore_database.datos.delete_protection_state == "DELETE_PROTECTION_DISABLED" && google_firestore_database.datos.deletion_policy == "DELETE"
    error_message = "Sin protección, tofu destroy borra el servicio y la base."
  }
}

run "sin_indices_compuestos_en_la_plantilla" {
  command = plan

  assert {
    condition     = length(google_firestore_index.indices) == 0
    error_message = "La plantilla no trae índices compuestos: los añade el arquitecto."
  }
}

run "crea_un_indice_por_cada_entrada_de_firestore_indexes_json" {
  command = plan

  variables {
    fichero_indices = "tests/indices-de-prueba.json"
  }

  assert {
    condition     = length(google_firestore_index.indices) == 2
    error_message = "Hay un índice por cada entrada del fichero."
  }

  assert {
    condition     = google_firestore_index.indices["prestamos:equipo:ASCENDING,inicio:DESCENDING"].database == "prestamos" && google_firestore_index.indices["prestamos:equipo:ASCENDING,inicio:DESCENDING"].collection == "prestamos"
    error_message = "El índice va en la base de la aplicación y en su colección."
  }

  assert {
    condition     = google_firestore_index.indices["equipos:etiquetas:CONTAINS,nombre:ASCENDING"].fields[0].array_config == "CONTAINS" && google_firestore_index.indices["equipos:etiquetas:CONTAINS,nombre:ASCENDING"].query_scope == "COLLECTION"
    error_message = "Los campos de tipo lista usan arrayConfig y el ámbito por defecto es COLLECTION."
  }
}

run "rechaza_un_nombre_de_aplicacion_no_valido" {
  command = plan

  variables {
    aplicacion = "Mi_Aplicacion"
  }

  expect_failures = [var.aplicacion]
}

run "rechaza_una_cuenta_que_no_es_de_servicio" {
  command = plan

  variables {
    cuenta_ejecucion = "persona@diverger.ai"
  }

  expect_failures = [var.cuenta_ejecucion]
}
