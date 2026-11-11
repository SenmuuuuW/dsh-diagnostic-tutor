# API Contracts (v1.0)

All routes are under `/diagnostic-tutor/api`, loopback same-origin, and read
local state. There is no approval route for generated scenes.

## Read

- `GET /overview?sessionId=`
- `GET /node?id=`
- `GET /lesson?nodeId=`
- `GET /diagnostics`
- `GET /export`
- `GET /sources`, `GET /assets`, `GET /assets/export`
- `GET /review`, `GET /insights`, `GET /plan/ics`
- `GET /scene-config` (read-only approved scenes; no approval mutation)
- `udt_material_visual` tool returns a local image path; no HTTP image-analysis route

## Write

- `POST /reset` (destructive, explicit UI)
- `POST /import` (full export document; validated/replaced atomically with rollback)
- `POST /focus`, lesson/path/course-run tools via agent tools
- `POST /review/grade`, `/review/undo`
- `POST /asset`, `/asset/delete`, `/assets/import`
- `POST /preferences/language`

No endpoint grants mastery, advances a course, or approves a scene.
