# Agent Guidelines for Clipset

## Project Structure
- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS 4 (in `frontend/`)
- **Backend**: FastAPI + SQLAlchemy + SQLite (in `backend/`)

## Build/Test Commands
**Frontend** (from `frontend/`): `npm run dev` (dev), `npm run build` (build), `npm run lint` (lint)
**Backend** (from `backend/`): `uvicorn app.main:app --reload` (dev), no tests configured yet

## Code Style

### Frontend (TypeScript/React)
- **Imports**: Use `@/*` path aliases for src imports (e.g., `import { cn } from "@/lib/utils"`)
- **Types**: Strict TypeScript enabled; use explicit types for props, avoid `any`
- **Components**: Use function declarations (e.g., `export function Button() {}`), not arrow functions for exports
- **Naming**: PascalCase for components/types, camelCase for variables/functions
- **Formatting**: No semicolons (per tsconfig), double quotes for strings, 2-space indent
- **UI**: Use shadcn-style components from `@/components/ui/*` with `class-variance-authority` for variants

### Backend (Python/FastAPI)
- **Imports**: Group stdlib, third-party, local imports; use `from app.*` for internal modules
- **Types**: Use Pydantic models for schemas, SQLAlchemy models for DB, type hints everywhere
- **Naming**: snake_case for functions/variables, PascalCase for classes
- **Validation**: Use Pydantic validators (e.g., `@field_validator`), convert emails/usernames to lowercase
- **Error Handling**: Raise HTTPException with appropriate status codes and detail messages
- **Async**: All DB operations use async/await with AsyncSession
- **Models**: SQLAlchemy models in `app/models/`, Pydantic schemas in `app/schemas/`

## Key Conventions
- Store usernames and emails in lowercase for case-insensitive uniqueness
- Use dependency injection (`Depends()`) for DB sessions and auth
- API routes: `/api/{resource}` pattern with proper HTTP methods
- Authentication: JWT tokens via `create_access_token()`, requires bearer token
