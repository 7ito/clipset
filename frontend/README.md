# Clipset Frontend

Frontend application for Clipset - a private video sharing platform.

## Tech Stack

- **Framework**: React 19
- **Build Tool**: Vite
- **Language**: TypeScript
- **Routing**: TanStack Router
- **State Management**: TanStack Query (React Query)
- **Styling**: TailwindCSS 4
- **UI Components**: shadcn-ui
- **HTTP Client**: Axios

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

3. **Build for production**:
   ```bash
   npm run build
   ```

The development server will start at `http://localhost:5173`.

## Features Implemented

### Authentication
- ✅ Login page with form validation
- ✅ Registration with invitation tokens
- ✅ JWT token management
- ✅ Protected routes
- ✅ Auto-redirect on authentication
- ✅ Logout functionality

### User Interface
- ✅ Dark mode toggle with persistence
- ✅ Responsive navigation bar
- ✅ Toast notifications
- ✅ Loading states
- ✅ Error handling

### Admin Panel
- ✅ Admin-only routes with auto-redirect
- ✅ Sidebar navigation
- ✅ Invitation management
  - Create invitations
  - View invitation list
  - Copy invitation links
  - Revoke invitations
- ✅ Category management
  - List categories with video counts
  - Create new categories
  - Edit category names
  - Delete categories with confirmation
  - Real-time updates

### User Pages
- ✅ Dashboard (placeholder)
- ✅ Profile page (placeholder)

## Project Structure

```
frontend/
├── src/
│   ├── api/              # API client functions
│   │   ├── auth.ts
│   │   ├── invitations.ts
│   │   ├── users.ts
│   │   └── categories.ts
│   ├── components/       # Reusable components
│   │   ├── ui/          # shadcn-ui components
│   │   ├── layout/      # Layout components
│   │   ├── common/      # Common components
│   │   ├── invitations/ # Invitation components
│   │   └── categories/  # Category components (future)
│   ├── contexts/        # React contexts
│   │   ├── auth-context.tsx
│   │   └── theme-context.tsx
│   ├── hooks/           # Custom hooks
│   │   └── useAuth.ts
│   ├── lib/             # Utilities
│   │   ├── api-client.ts
│   │   ├── auth.ts
│   │   ├── toast.ts
│   │   └── validations/
│   ├── routes/          # Route components
│   │   ├── _auth/       # Protected routes
│   │   ├── login.tsx
│   │   └── register.$token.tsx
│   ├── types/           # TypeScript types
│   │   ├── api.ts
│   │   ├── auth.ts
│   │   ├── user.ts
│   │   ├── invitation.ts
│   │   └── category.ts
│   └── App.tsx
```

## Environment Variables

Create a `.env` file (optional):

```env
VITE_API_BASE_URL=http://localhost:8000
```

Default: `http://localhost:8000`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Routing

This project uses file-based routing with TanStack Router:

- `/` - Redirects to dashboard (protected)
- `/login` - Login page
- `/register/:token` - Registration page with invitation token
- `/dashboard` - User dashboard (protected)
- `/profile` - User profile (protected)
- `/admin` - Admin panel (admin only)
  - `/admin/invitations` - Invitation management
  - `/admin/categories` - Category management

## Authentication Flow

1. User visits protected route
2. If no token, redirect to `/login`
3. User logs in, receives JWT token
4. Token stored in localStorage
5. Token added to all API requests via axios interceptor
6. On 401 response, token cleared and redirect to login

## API Integration

All API calls use the centralized `apiClient` from `lib/api-client.ts`:

```typescript
// Example API call
import { apiClient } from "@/lib/api-client"

export async function getCategories() {
  const response = await apiClient.get("/api/categories/")
  return response.data
}
```

Features:
- Automatic JWT token injection
- Global error handling
- 401 auto-redirect to login
- TypeScript type safety

## State Management

Uses TanStack Query (React Query) for server state:

```typescript
// Example query
const { data, isLoading, error } = useQuery({
  queryKey: ["categories"],
  queryFn: getCategories,
})

// Example mutation
const mutation = useMutation({
  mutationFn: createCategory,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["categories"] })
  },
})
```

Benefits:
- Automatic caching
- Background refetching
- Optimistic updates
- Loading and error states

## Styling

Uses TailwindCSS 4 with custom configuration:

- **Theme**: Light and dark mode support
- **Colors**: Custom color palette
- **Components**: shadcn-ui components
- **Responsive**: Mobile-first approach

## Development Tips

1. **Hot Module Replacement**: Changes auto-reload in browser
2. **TypeScript**: Enable strict mode in `tsconfig.json`
3. **Route Generation**: Run `npm run dev` to auto-generate route tree
4. **Component Library**: Use shadcn-ui CLI to add new components:
   ```bash
   npx shadcn-ui@latest add button
   ```

## Testing

*End-to-end testing implemented with Playwright for critical flows.*

Tested features:
- ✅ Login/logout flow
- ✅ Admin invitation management
- ✅ Category CRUD operations

## Next Features

- [ ] Video upload interface
- [ ] Video list and playback
- [ ] User profile with videos
- [ ] Admin dashboard with stats
- [ ] System configuration UI
