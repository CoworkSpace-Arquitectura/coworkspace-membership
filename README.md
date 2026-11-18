# CoworkSpace · Membership Service

![CI-CD](https://github.com/CoworkSpace-Arquitectura/coworkspace-membership/actions/workflows/deploy.yml/badge.svg)

Microservicio de miembros, planes y suscripciones. Publica los eventos `membership.activated` y `membership.expired` en Redis.

- **Endpoints:** `/members`, `/plans`, `/subscriptions`
- **Puerto local:** 3002

## Documentación de la API

- Swagger UI desplegado: https://coworkspace-membership.onrender.com/docs
- En local: http://localhost:<PUERTO>/docs (el JSON OpenAPI está en `/docs-json`).
