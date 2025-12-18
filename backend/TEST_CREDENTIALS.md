# Test Credentials

## Admin User
Created automatically on app startup.

- **Username**: admin
- **Email**: admin@clipset.local  
- **Password**: admin123
- **Role**: Admin
- **Quota**: N/A (admins have unlimited quota)

## Test Users
Created by running `python -m app.seed`.

### Alice (0% Quota)
- **Username**: alice
- **Email**: alice@example.com
- **Password**: password123
- **Role**: User
- **Weekly Quota Used**: 0 GB / 4 GB (0%)
- **Use Case**: Testing fresh uploads, full quota available

### Bob (50% Quota)
- **Username**: bob
- **Email**: bob@example.com
- **Password**: password123
- **Role**: User
- **Weekly Quota Used**: 2 GB / 4 GB (50%)
- **Use Case**: Testing partial quota, can still upload

### Charlie (100% Quota)
- **Username**: charlie
- **Email**: charlie@example.com
- **Password**: password123
- **Role**: User
- **Weekly Quota Used**: 4 GB / 4 GB (100%)
- **Use Case**: Testing quota enforcement, uploads should be blocked

## Login Testing

```bash
# Test login via API (requires backend running)
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "password123"}'
```

## Resetting Test Data

To reset the database and recreate test users:

```bash
cd backend
python -m app.seed
```

To add test users without clearing existing data:

```bash
python -m app.seed --no-reset
```

## Notes

- All test user passwords are intentionally simple for development purposes
- **Never use these credentials in production**
- Quota resets every Sunday at midnight UTC (configurable)
- Admin user has no quota restrictions
