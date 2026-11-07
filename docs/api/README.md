# API

Interactive OpenAPI docs: `GET /api/docs` (Swagger) and `/api/redoc`; raw schema at `/api/openapi.json`.

All routes are under `/api/v1`. Auth uses HttpOnly cookies set by `/auth/verify-otp`; non-browser clients may send `Authorization: Bearer <access_token>` (returned in the verify response). Errors are `{"detail": "..."}` (422 validation errors return FastAPI's list form). Lists return `{items, page, has_more}` with `page` & `limit` (max 50).

| Area | Endpoints |
| --- | --- |
| Health | `GET /health` |
| Auth | `POST /auth/request-otp`, `POST /auth/verify-otp`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all` |
| Users | `GET/PATCH /users/me`, `GET /users/me/listings`, `GET /users/me/blocks`, `GET /users/{id}`, `POST/DELETE /users/{id}/block`, `GET /users/{id}/is-blocked` |
| Files | `POST /files` (multipart `file`, `purpose`), `GET /files/{id}` |
| Listings | `GET /listings/meta`, `GET /listings?q&category&mode&lat&lng&radius_km&sort&page`, `POST /listings`, `GET/PATCH/DELETE /listings/{id}`, `POST /listings/{id}/close|reopen|complete`, `POST/DELETE /listings/{id}/save` |
| Reservations | `POST /reservations`, `GET /reservations?role=requester|owner&status`, `GET /reservations/{id}`, `POST /reservations/{id}/actions` `{action: accept|decline|cancel|confirm|no_show|dispute, note}` |
| Wanted requests | `GET /requests`, `GET /requests/mine`, `POST /requests`, `GET/PATCH /requests/{id}`, `POST /requests/{id}/close|cancel`, `POST /requests/{id}/offers`, `POST /requests/{id}/offers/{offerId}/accept|decline` |
| Organizations | `POST /organizations`, `GET/PATCH /organizations/mine`, `GET /organizations/mine/dashboard`, `GET /organizations/{id}` |
| Messages | `GET /messages/conversations`, `GET /messages/unread-count`, `GET/POST /messages/conversations/{id}` |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all` |
| Reports | `POST /reports` |
| Admin (role=admin) | `GET /admin/overview`, `GET /admin/reports`, `POST /admin/reports/{id}/resolve`, `GET /admin/organizations`, `POST /admin/organizations/{id}/review`, `GET /admin/listings`, `POST /admin/listings/{id}/remove`, `GET /admin/users`, `POST /admin/users/{id}/suspend|unsuspend`, `GET /admin/disputes`, `POST /admin/reservations/{id}/resolve`, `GET /admin/moderation-actions` |
| Impact | `GET /impact` |
