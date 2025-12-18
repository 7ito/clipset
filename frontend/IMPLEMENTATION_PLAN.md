# Frontend Implementation Plan

## Technology Stack
- React 18+ with TypeScript
- Vite (build tool)
- React Router v6 (routing)
- TanStack Query (React Query) for API state management
- Axios (HTTP client)
- Tailwind CSS (styling)
- Video.js (video player)
- React Dropzone (file upload)

---

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── Layout.tsx
│   │   ├── video/
│   │   │   ├── VideoCard.tsx
│   │   │   ├── VideoGrid.tsx
│   │   │   ├── VideoPlayer.tsx
│   │   │   ├── VideoProcessingStatus.tsx
│   │   │   └── VideoMetadataForm.tsx
│   │   ├── upload/
│   │   │   ├── UploadDropzone.tsx
│   │   │   ├── UploadProgress.tsx
│   │   │   └── QuotaDisplay.tsx
│   │   ├── admin/
│   │   │   ├── StatsCards.tsx
│   │   │   ├── UserTable.tsx
│   │   │   ├── InvitationTable.tsx
│   │   │   ├── CategoryTable.tsx
│   │   │   └── ConfigForm.tsx
│   │   └── common/
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Modal.tsx
│   │       ├── Spinner.tsx
│   │       └── Pagination.tsx
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── VideoDetail.tsx
│   │   ├── UserProfile.tsx
│   │   ├── Upload.tsx
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   └── admin/
│   │       ├── Dashboard.tsx
│   │       ├── Users.tsx
│   │       ├── Invitations.tsx
│   │       ├── Categories.tsx
│   │       └── Settings.tsx
│   ├── api/
│   │   ├── client.ts              # Axios instance
│   │   ├── auth.ts                # Auth API calls
│   │   ├── users.ts               # User API calls
│   │   ├── videos.ts              # Video API calls
│   │   ├── categories.ts          # Category API calls
│   │   ├── invitations.ts         # Invitation API calls
│   │   └── admin.ts               # Admin API calls
│   ├── hooks/
│   │   ├── useAuth.ts             # Auth context hook
│   │   ├── useVideos.ts           # Video queries
│   │   ├── useUpload.ts           # Upload mutation
│   │   ├── useUsers.ts            # User queries
│   │   ├── useCategories.ts       # Category queries
│   │   └── useAdmin.ts            # Admin queries
│   ├── contexts/
│   │   └── AuthContext.tsx        # Auth state
│   ├── types/
│   │   └── index.ts               # TypeScript interfaces
│   ├── utils/
│   │   ├── formatBytes.ts         # Byte formatting
│   │   ├── formatDuration.ts      # Duration formatting
│   │   └── formatDate.ts          # Date formatting
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── public/
│   └── favicon.ico
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── Dockerfile
└── .dockerignore
```

---

## Phase 1: Project Setup

### 1.1 Initialize Vite Project
```bash
npm create vite@latest . -- --template react-ts
```

### 1.2 Install Dependencies
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.0",
    "@tanstack/react-query": "^5.17.0",
    "axios": "^1.6.5",
    "video.js": "^8.9.0",
    "react-dropzone": "^14.2.3"
  },
  "devDependencies": {
    "@types/react": "^18.2.48",
    "@types/react-dom": "^18.2.18",
    "@types/video.js": "^7.3.55",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.11",
    "tailwindcss": "^3.4.1",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.33"
  }
}
```

### 1.3 Configure Tailwind CSS
```bash
npx tailwindcss init -p
```

Configure `tailwind.config.js`:
```js
content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}']
```

### 1.4 Environment Variables
Create `.env`:
```
VITE_API_URL=http://localhost:8000
```

---

## Phase 2: Type Definitions

Create `src/types/index.ts`:

### 2.1 Core Types
```typescript
export interface User {
  id: string;
  email: string;
  username: string;
  role: 'user' | 'admin';
  created_at: string;
  is_active: boolean;
  weekly_upload_bytes: number;
  last_upload_reset: string;
}

export interface Video {
  id: string;
  title: string;
  description: string | null;
  filename: string;
  thumbnail_filename: string;
  original_filename: string;
  file_size_bytes: number;
  duration_seconds: number | null;
  uploaded_by: string;
  category_id: string | null;
  view_count: number;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  uploader?: User;
  category?: Category;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  created_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  token: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  used: boolean;
  used_at: string | null;
}

export interface Config {
  id: number;
  max_file_size_bytes: number;
  weekly_upload_limit_bytes: number;
  video_storage_path: string;
  updated_at: string;
  updated_by: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
```

---

## Phase 3: API Client

### 3.1 Axios Instance (`src/api/client.ts`)
- Base URL from env
- Request interceptor: Add JWT token to Authorization header
- Response interceptor: Handle 401 (redirect to login), other errors
- Token stored in localStorage

### 3.2 API Modules
Create typed API functions in `src/api/`:

**auth.ts**:
- `login(username, password)`
- `register(email, username, password, invitationToken)`
- `getCurrentUser()`
- `logout()`

**videos.ts**:
- `getVideos(filters)`
- `getVideo(id)`
- `uploadVideo(formData, onProgress)`
- `updateVideo(id, data)`
- `deleteVideo(id)`
- `incrementViewCount(id)`
- `getVideoStreamUrl(id)`
- `getThumbnailUrl(id)`

**users.ts**:
- `getUsers(page, pageSize)`
- `getUser(id)`
- `getUserVideos(id, page, pageSize)`
- `updateUserRole(id, role)`
- `toggleUserActive(id)`
- `deleteUser(id)`

**categories.ts**:
- `getCategories()`
- `createCategory(name)`
- `updateCategory(id, name)`
- `deleteCategory(id)`

**invitations.ts**:
- `getInvitations()`
- `createInvitation(email)`
- `validateInvitation(token)`
- `revokeInvitation(id)`

**admin.ts**:
- `getStats()`
- `getConfig()`
- `updateConfig(data)`

---

## Phase 4: Authentication

### 4.1 Auth Context (`src/contexts/AuthContext.tsx`)
- State: `user`, `token`, `isAuthenticated`, `isLoading`
- Actions: `login()`, `logout()`, `register()`
- Load user on mount if token exists
- Provide context to app

### 4.2 Auth Hook (`src/hooks/useAuth.ts`)
- Consume AuthContext
- Return auth state and methods

### 4.3 Protected Routes
- `ProtectedRoute` component: Check auth, redirect to login
- `AdminRoute` component: Check admin role, redirect if not admin

---

## Phase 5: Routing

### 5.1 Router Setup (`src/App.tsx`)
```tsx
<Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/register/:token" element={<Register />} />
  
  <Route element={<ProtectedRoute />}>
    <Route path="/" element={<Home />} />
    <Route path="/videos/:id" element={<VideoDetail />} />
    <Route path="/users/:id" element={<UserProfile />} />
    <Route path="/upload" element={<Upload />} />
    
    <Route element={<AdminRoute />}>
      <Route path="/admin" element={<Dashboard />} />
      <Route path="/admin/users" element={<Users />} />
      <Route path="/admin/invitations" element={<Invitations />} />
      <Route path="/admin/categories" element={<Categories />} />
      <Route path="/admin/settings" element={<Settings />} />
    </Route>
  </Route>
</Routes>
```

---

## Phase 6: Core Pages

### 6.1 Login Page (`src/pages/Login.tsx`)
- Form: username, password
- Call `login()` from auth context
- Redirect to home on success
- Show error messages

### 6.2 Register Page (`src/pages/Register.tsx`)
- Extract token from URL params
- Validate token on mount
- Form: email (pre-filled), username, password, confirm password
- Call `register()`
- Redirect to login on success

### 6.3 Home Page (`src/pages/Home.tsx`)
- Video grid with thumbnails
- Filters: category dropdown, sort by (newest/most viewed)
- Pagination controls
- Each card shows: thumbnail, title, uploader username, view count, upload date
- Click card → navigate to video detail

### 6.4 Video Detail Page (`src/pages/VideoDetail.tsx`)
- Video player (Video.js)
- Poll for processing status if not completed
- Title, description, category badge
- Uploader info with link to profile
- View count
- Edit/Delete buttons (if owner or admin)
- Increment view count on first play

### 6.5 User Profile Page (`src/pages/UserProfile.tsx`)
- Username, email (if viewing own profile), join date
- Weekly quota display (if own profile)
- Grid of user's uploaded videos
- Pagination

### 6.6 Upload Page (`src/pages/Upload.tsx`)
- Dropzone for file selection
- File format validation (MP4, MOV, AVI, MKV, WEBM)
- File size validation against config
- Quota display and validation
- Form: title, description, category
- Upload progress bar
- Success message with link to video (processing status)

---

## Phase 7: Admin Pages

### 7.1 Admin Dashboard (`src/pages/admin/Dashboard.tsx`)
- Stats cards: total users, total videos, storage used, processing queue
- Recent videos table
- Quick actions: create invitation, create category

### 7.2 Users Management (`src/pages/admin/Users.tsx`)
- Table: username, email, role, videos count, join date, active status
- Actions: change role, toggle active, delete
- Pagination

### 7.3 Invitations Management (`src/pages/admin/Invitations.tsx`)
- Create invitation form (email input)
- Table: email, token, status (pending/used/expired), created by, created date
- Copy invitation link button
- Revoke button

### 7.4 Categories Management (`src/pages/admin/Categories.tsx`)
- Create category form (name input)
- List of categories with edit/delete actions
- Show video count per category

### 7.5 Settings (`src/pages/admin/Settings.tsx`)
- Config form:
  - Max file size (with GB converter)
  - Weekly upload limit (with GB converter)
  - Video storage path
- Save button
- Show last updated info

---

## Phase 8: React Query Hooks

### 8.1 Video Hooks (`src/hooks/useVideos.ts`)
- `useVideos(filters)`: Query for video list with pagination
- `useVideo(id)`: Query for single video with polling if processing
- `useUploadVideo()`: Mutation for upload with progress
- `useUpdateVideo()`: Mutation for update
- `useDeleteVideo()`: Mutation for delete
- `useIncrementViewCount()`: Mutation for view increment

### 8.2 User Hooks (`src/hooks/useUsers.ts`)
- `useUsers(page, pageSize)`: Query for user list
- `useUser(id)`: Query for user profile
- `useUserVideos(id, page)`: Query for user's videos
- `useUpdateUserRole()`: Mutation
- `useToggleUserActive()`: Mutation
- `useDeleteUser()`: Mutation

### 8.3 Category Hooks (`src/hooks/useCategories.ts`)
- `useCategories()`: Query for all categories
- `useCreateCategory()`: Mutation
- `useUpdateCategory()`: Mutation
- `useDeleteCategory()`: Mutation

### 8.4 Invitation Hooks (`src/hooks/useInvitations.ts`)
- `useInvitations()`: Query for invitations
- `useCreateInvitation()`: Mutation
- `useValidateInvitation(token)`: Query
- `useRevokeInvitation()`: Mutation

### 8.5 Admin Hooks (`src/hooks/useAdmin.ts`)
- `useAdminStats()`: Query for dashboard stats
- `useConfig()`: Query for config
- `useUpdateConfig()`: Mutation

---

## Phase 9: Key Components

### 9.1 Video Components

**VideoCard.tsx**:
- Thumbnail image with fallback
- Title, uploader username
- View count, upload date
- Processing status badge if not completed
- Click handler to navigate to detail

**VideoGrid.tsx**:
- Responsive grid layout (3-4 columns)
- Empty state if no videos
- Loading skeleton

**VideoPlayer.tsx**:
- Video.js integration
- Byte-range streaming support
- Controls, quality settings
- Error handling
- Auto-play on ready

**VideoProcessingStatus.tsx**:
- Processing indicator (spinner)
- Status message
- Polling mechanism
- Error display if failed

### 9.2 Upload Components

**UploadDropzone.tsx**:
- Drag-and-drop area
- File type validation
- File size validation
- Preview selected file

**UploadProgress.tsx**:
- Progress bar
- Percentage display
- Cancel button
- Upload speed estimate

**QuotaDisplay.tsx**:
- Visual progress bar of weekly quota
- Used / Total display
- Resets on Sunday message

### 9.3 Admin Components

**StatsCards.tsx**:
- 4 cards in grid
- Icon, title, value
- Optional subtitle

**UserTable.tsx**:
- Sortable columns
- Role badge
- Active status indicator
- Action dropdown menu

**InvitationTable.tsx**:
- Status badge (pending/used/expired)
- Copy link button with toast
- Expiry date display

**CategoryTable.tsx**:
- Inline edit for name
- Delete confirmation modal
- Video count display

**ConfigForm.tsx**:
- Number inputs with GB/MB converters
- Path input with validation
- Save button with loading state

### 9.4 Common Components

**Button.tsx**: Variants (primary, secondary, danger), loading state, sizes
**Input.tsx**: Text, number, password types with validation
**Modal.tsx**: Reusable modal with header, body, footer
**Spinner.tsx**: Loading spinner
**Pagination.tsx**: Page controls with page numbers

---

## Phase 10: Utilities

### 10.1 Formatters (`src/utils/`)
- `formatBytes(bytes)`: Convert bytes to KB/MB/GB
- `formatDuration(seconds)`: Convert to MM:SS or HH:MM:SS
- `formatDate(dateString)`: Relative time (e.g., "2 hours ago") or formatted date

---

## Phase 11: Styling

### 11.1 Tailwind Configuration
- Custom colors for brand
- Custom spacing/sizing if needed
- Dark mode support (optional for v2)

### 11.2 Layout
- Responsive navbar with mobile menu
- Fixed navbar, content area, optional footer
- Consistent padding/margins
- Grid layouts for video cards

### 11.3 Video.js Styling
- Custom controls skin
- Responsive player
- Thumbnail preview on hover (optional)

---

## Phase 12: Error Handling & UX

### 12.1 Error Boundaries
- Catch React errors
- Display fallback UI
- Log errors

### 12.2 Loading States
- Skeleton loaders for content
- Spinners for actions
- Disabled states during mutations

### 12.3 Toast Notifications
- Success messages (upload complete, saved)
- Error messages (upload failed, quota exceeded)
- Info messages (processing started)

### 12.4 Form Validation
- Client-side validation before submit
- Display validation errors
- Required field indicators

---

## Phase 13: Optimization

### 13.1 Code Splitting
- Lazy load admin routes
- Lazy load video player component

### 13.2 Image Optimization
- Lazy load thumbnails
- Use responsive images

### 13.3 Query Caching
- Configure React Query cache times
- Prefetch on hover (optional)

---

## Phase 14: Accessibility

- Semantic HTML
- ARIA labels for icons/buttons
- Keyboard navigation
- Focus management in modals
- Alt text for images

---

## Implementation Order

1. Phase 1-2: Project setup + type definitions
2. Phase 3-4: API client + authentication
3. Phase 5: Routing structure
4. Phase 6.1-6.3: Login, register, home page (video grid)
5. Phase 6.4: Video detail page + player
6. Phase 6.6: Upload page (core feature)
7. Phase 6.5: User profile page
8. Phase 7: Admin pages
9. Phase 8-9: React Query hooks + remaining components
10. Phase 10-14: Utilities, styling, error handling, optimization

---

## Testing Checklist

- [ ] Login/logout flow
- [ ] Registration with invitation
- [ ] Video upload with progress
- [ ] Video playback
- [ ] Processing status polling
- [ ] Filtering and pagination
- [ ] Admin CRUD operations
- [ ] Quota validation
- [ ] Responsive design (mobile/tablet/desktop)
- [ ] Error handling (network errors, 401, 404, etc.)
