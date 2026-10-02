# Verificación

Comprobaciones locales ejecutadas en Windows, Node.js 22.14.0 y Docker Desktop con contenedores Linux:

- 14 pruebas de dominio y HTTP aprobadas.
- Cobertura de dominio/HTTP: 100% de líneas y funciones, 95,34% de ramas. `main.ts` se excluye de esa medición; el cierre de proceso se prueba ejecutando el contenedor.
- Cinco escenarios del despliegue y rollback aprobados con Docker y HTTP simulados.
- Docker build multietapa completado; smoke funcional del contenedor aprobado.
- Contenedor ejecutado con UID/GID no privilegiados `65532:65532`, con root filesystem de solo lectura, capacidades eliminadas y SIGTERM con salida cero.
- Workflows validados con actionlint; las ejecuciones reales de GitHub se pueden consultar mediante los badges del README.

El scanner compara contra una base de vulnerabilidades actualizada en cada ejecución. Su resultado vigente está en el artefacto `security-reports`; no se interpreta un build anterior como garantía permanente.

El despliegue local requiere laptop encendida, Docker Desktop y runner activos. El servicio se entrega a `127.0.0.1:8088`; no se expone a Internet ni implementa disponibilidad continua durante el reemplazo del contenedor.
