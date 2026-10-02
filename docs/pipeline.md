# Pipeline y mantenimiento

## Eventos y permisos

| Evento                         | CI                | GHCR                        | Laptop                                   |
| ------------------------------ | ----------------- | --------------------------- | ---------------------------------------- |
| Pull request a main            | Sí, runner GitHub | No                          | No                                       |
| Push a main                    | Sí                | Sí, si pasa todos los gates | Reconciliación desde controlador privado |
| Tag vX.Y.Z                     | Sí                | Sí, si pertenece a main     | No despliegue automático por tag         |
| Ejecución manual de CI en main | Sí                | Sí                          | Sí tras éxito                            |
| Controlador privado con SHA    | No reconstruye    | Reutiliza imagen firmada    | Sí, permite rollback                     |

El permiso global de CI es `contents: read`. Solo `publish` dispone de `packages: write`, `id-token: write` y `attestations: write`. El controlador privado tiene permisos de lectura; consulta metadatos públicos de CI y verifica attestations. Se utiliza el `GITHUB_TOKEN` temporal de cada job; no hay PAT guardado en el repositorio.

Todas las acciones externas se fijan por SHA completo. Dependabot revisa npm, Docker y Actions semanalmente. Los workflows no usan `pull_request_target` ni construyen o ejecutan código de forks con permisos de publicación. La política del repositorio exige aprobación para workflows de todos los contribuidores externos.

## Gates y artefactos

Calidad: formato, lint, TypeScript estricto, 14 pruebas de dominio/HTTP, cobertura, auditoría npm y actionlint. Además se prueban cinco escenarios del script de despliegue con Docker y HTTP simulados: éxito, rollback, primer despliegue fallido, descarga fallida y rechazo de referencias no confiables.

Contenedor: readiness, operación de negocio, usuario no root, configuración read-only/cap-drop y SIGTERM con código de salida cero. Grype bloquea severidad alta y crítica, incluyendo hallazgos sin arreglo disponible. Los fallos del scanner tampoco se silencian.

Se conservan cobertura durante 14 días, informes y SBOM durante 30 días, imagen exportada durante 2 días y manifiesto de despliegue durante 90 días. Los paquetes publicados permanecen en GHCR hasta que el propietario los elimine. Las attestations de procedencia y SBOM se publican en GitHub y en el registro.

## Cambios y versiones

Trabaja en ramas cortas y abre un pull request. `main` exige los estados `quality` y `container`, impide force push y borrado y exige resolver conversaciones. El propietario administrador conserva la posibilidad de hacer mantenimiento; las protecciones no equivalen a una revisión independiente de sus propios cambios.

Para una versión, crea un tag `vX.Y.Z` sobre un commit de main y súbelo. El pipeline publica también esa etiqueta. El despliegue sigue usando el digest registrado, por lo que no cambia cuando se mueve o se vuelve a publicar una etiqueta.

Cuando una actualización de base tenga vulnerabilidades altas o críticas, actualiza el digest mediante Dependabot y vuelve a correr CI. No desactives el gate para obtener un build verde; evalúa y documenta una excepción concreta antes de cambiar la política.

## Referencias

- [Publicación de paquetes desde GitHub Actions](https://docs.github.com/en/packages/managing-github-packages-using-github-actions-workflows/publishing-and-installing-a-package-with-github-actions).
- [Artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations) y [acción oficial attest](https://github.com/actions/attest).
- [Grype scan-action](https://github.com/anchore/scan-action) y [Syft SBOM](https://github.com/anchore/sbom-action).
- [Caché de builds con GitHub Actions](https://docs.docker.com/build/ci/github-actions/cache/).
