# NetWatch Pro API Documentation

## Overview

NetWatch Pro provides a comprehensive REST API for managing employee monitoring, computer management, and administrative functions. All API endpoints require authentication unless otherwise specified.

## Base URL

- Development: `http://localhost:3000/api`
- Production: `https://your-domain.com/api`

## Authentication

All API requests require a valid session. Authentication is handled via NextAuth.js with session cookies.

### Headers

```
Cookie: next-auth.session-token=<your-session-token>
```

## Rate Limiting

API requests are rate-limited to prevent abuse:

- **Login endpoints**: 5 requests per minute
- **General API**: 100 requests per minute
- **Agent endpoints**: 500 requests per minute

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in window
- `X-RateLimit-Reset`: Unix timestamp when limit resets
- `Retry-After`: Seconds until rate limit resets (when limited)

---

## Endpoints

### Computers

#### List Computers
```http
GET /api/computers
```

Query Parameters:
- `status` (string): Filter by status (`ONLINE`, `OFFLINE`, `IDLE`)
- `groupId` (string): Filter by computer group

Response:
```json
[
  {
    "id": "string",
    "name": "string",
    "hostname": "string",
    "ipAddress": "string",
    "status": "ONLINE" | "OFFLINE" | "IDLE",
    "os": "string",
    "lastSeen": "ISO8601 timestamp",
    "group": { "id": "string", "name": "string" }
  }
]
```

#### Get Computer
```http
GET /api/computers/:id
```

#### Update Computer
```http
PATCH /api/computers/:id
```

Body:
```json
{
  "name": "string",
  "groupId": "string"
}
```

#### Delete Computer
```http
DELETE /api/computers/:id
```

---

### Screenshots

#### List Screenshots
```http
GET /api/screenshots
```

Query Parameters:
- `computerId` (string): Filter by computer
- `from` (ISO8601): Start date
- `to` (ISO8601): End date

#### Get Screenshot
```http
GET /api/screenshots/:id
```

Returns the screenshot image data.

---

### Recordings

#### List Recordings
```http
GET /api/recordings
```

Query Parameters:
- `computerId` (string): Filter by computer
- `from` (ISO8601): Start date
- `to` (ISO8601): End date

#### Get Recording
```http
GET /api/recordings/:id
```

---

### Keylogs

#### List Keylogs
```http
GET /api/keylogs
```

Query Parameters:
- `computerId` (string): Filter by computer
- `from` (ISO8601): Start date
- `to` (ISO8601): End date
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 50)

**Note**: Keylog data is encrypted at rest.

---

### Activity Logs

#### List Activity
```http
GET /api/activity
```

Query Parameters:
- `computerId` (string): Filter by computer
- `from` (ISO8601): Start date
- `to` (ISO8601): End date

Response includes:
- Application usage
- Window focus tracking
- Idle time detection

---

### Clipboard Logs

#### List Clipboard History
```http
GET /api/clipboard
```

Query Parameters:
- `computerId` (string): Filter by computer
- `from` (ISO8601): Start date
- `to` (ISO8601): End date

---

### Process Logs

#### List Processes
```http
GET /api/processes
```

Query Parameters:
- `computerId` (string): Filter by computer

Returns the most recent process snapshot for each computer.

---

### Alerts

#### List Alerts
```http
GET /api/alerts
```

Query Parameters:
- `type` (string): Filter by alert type
- `isRead` (boolean): Filter by read status
- `computerId` (string): Filter by computer

#### Create Alert
```http
POST /api/alerts
```

Body:
```json
{
  "type": "SECURITY" | "POLICY" | "SYSTEM" | "ACTIVITY",
  "message": "string",
  "computerId": "string",
  "severity": "LOW" | "MEDIUM" | "HIGH"
}
```

**Note**: High severity and security alerts trigger email notifications to admins.

#### Mark Alerts as Read
```http
PATCH /api/alerts
```

Body:
```json
{
  "alertIds": ["string"],
  "isRead": true
}
```

#### Delete Alert
```http
DELETE /api/alerts/:id
```

---

### Commands

#### List Commands
```http
GET /api/commands
```

Query Parameters:
- `computerId` (string): Filter by computer
- `status` (string): Filter by status

#### Send Command
```http
POST /api/commands
```

Body:
```json
{
  "computerId": "string",
  "type": "LOCK" | "SHUTDOWN" | "RESTART" | "MESSAGE" | "EXECUTE" | "SCREENSHOT",
  "payload": {}
}
```

Command types:
- `LOCK`: Lock the computer screen
- `SHUTDOWN`: Shutdown the computer
- `RESTART`: Restart the computer
- `MESSAGE`: Display a message to the user
- `EXECUTE`: Execute a command/script
- `SCREENSHOT`: Request immediate screenshot

---

### Remote Sessions

#### List Sessions
```http
GET /api/remote-sessions
```

#### Create Session
```http
POST /api/remote-sessions
```

Body:
```json
{
  "computerId": "string",
  "type": "DESKTOP" | "TERMINAL"
}
```

#### End Session
```http
PATCH /api/remote-sessions/:id
```

Body:
```json
{
  "status": "ENDED"
}
```

---

### File Transfers

#### List Transfers
```http
GET /api/file-transfers
```

#### Initiate Transfer
```http
POST /api/file-transfers
```

Body:
```json
{
  "computerId": "string",
  "direction": "UPLOAD" | "DOWNLOAD",
  "filePath": "string",
  "fileName": "string"
}
```

---

### Firewall Rules

#### List Rules
```http
GET /api/firewall
```

#### Create Rule
```http
POST /api/firewall
```

Body:
```json
{
  "name": "string",
  "type": "WEBSITE" | "APPLICATION",
  "target": "string",
  "action": "BLOCK" | "ALLOW",
  "computers": ["computerId"] | null
}
```

#### Update Rule
```http
PATCH /api/firewall/:id
```

#### Delete Rule
```http
DELETE /api/firewall/:id
```

---

### Policies

#### List Policies
```http
GET /api/policies
```

#### Create Policy
```http
POST /api/policies
```

Body:
```json
{
  "name": "string",
  "description": "string",
  "rules": {},
  "computers": ["computerId"] | null
}
```

---

### Groups

#### List Groups
```http
GET /api/groups
```

#### Create Group
```http
POST /api/groups
```

Body:
```json
{
  "name": "string",
  "description": "string"
}
```

---

### Users

#### List Users
```http
GET /api/users
```

**Requires**: ADMIN role

#### Create User
```http
POST /api/users
```

Body:
```json
{
  "email": "string",
  "name": "string",
  "password": "string",
  "role": "VIEWER" | "MANAGER" | "ADMIN"
}
```

#### Update User
```http
PATCH /api/users/:id
```

#### Delete User
```http
DELETE /api/users/:id
```

---

### Reports

#### Export Report
```http
POST /api/reports/export
```

Body:
```json
{
  "type": "ACTIVITY" | "PRODUCTIVITY" | "WEBSITE" | "APPLICATION" | "KEYSTROKE",
  "format": "PDF" | "CSV" | "XLSX",
  "from": "ISO8601",
  "to": "ISO8601",
  "computerIds": ["string"]
}
```

#### Get Productivity Report
```http
GET /api/reports/productivity
```

Query Parameters:
- `from` (ISO8601): Start date
- `to` (ISO8601): End date
- `computerId` (string): Optional computer filter

---

### Settings

#### Get Settings
```http
GET /api/settings
```

#### Update Settings
```http
PUT /api/settings
```

Body:
```json
{
  "key": "string",
  "value": "any"
}
```

---

### Data Retention

#### Get Retention Settings
```http
GET /api/retention
```

**Requires**: ADMIN role

Response:
```json
{
  "settings": {
    "activityLogs": 90,
    "screenshots": 30,
    "recordings": 14,
    "keylogs": 30,
    "clipboardLogs": 14,
    "processLogs": 7,
    "websiteLogs": 60,
    "auditLogs": 365,
    "alerts": 90
  },
  "stats": {
    "counts": {...},
    "sizes": {...},
    "totalRecords": 1000
  }
}
```

#### Update Retention Settings
```http
PUT /api/retention
```

Body:
```json
{
  "settings": {
    "screenshots": 60,
    "recordings": 30
  }
}
```

#### Run Manual Cleanup
```http
POST /api/retention
```

---

### Cron Jobs

#### Data Cleanup (Automated)
```http
POST /api/cron/cleanup
```

Headers:
```
x-cron-secret: <CRON_SECRET>
```

This endpoint should be called by an external cron service to run data retention cleanup automatically.

---

### Dashboard

#### Get Dashboard Stats
```http
GET /api/dashboard/stats
```

Response:
```json
{
  "computers": {
    "total": 10,
    "online": 8,
    "offline": 2
  },
  "alerts": {
    "unread": 5,
    "total": 50
  },
  "activity": {
    "todayHours": 64.5,
    "productivityScore": 78
  }
}
```

---

### Audit Logs

#### List Audit Logs
```http
GET /api/audit-logs
```

**Requires**: ADMIN role

Query Parameters:
- `action` (string): Filter by action type
- `userId` (string): Filter by user
- `from` (ISO8601): Start date
- `to` (ISO8601): End date

---

### Health Check

#### Check Health
```http
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "ISO8601",
  "database": "connected",
  "version": "1.0.0"
}
```

---

## Error Responses

All errors follow a consistent format:

```json
{
  "error": "Error message",
  "details": "Optional detailed information"
}
```

Common HTTP Status Codes:
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (not authenticated)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

---

## WebSocket Events

Real-time updates are delivered via Socket.io. Connect to the socket server specified in `NEXT_PUBLIC_SOCKET_URL`.

### Events

- `computer:status` - Computer online/offline status changes
- `screenshot:new` - New screenshot captured
- `alert:new` - New alert created
- `command:response` - Command execution response
- `activity:update` - Real-time activity updates
- `remote:stream` - Remote desktop stream frames

---

## Agent API

The desktop agent communicates with the server via Socket.io for real-time features and REST API for data submission.

### Agent Authentication

Agents authenticate using their unique machine ID and registration key.

### Agent Events

- `agent:register` - Register agent with server
- `agent:heartbeat` - Periodic health check
- `agent:screenshot` - Upload screenshot
- `agent:activity` - Submit activity log
- `agent:keylog` - Submit keystroke log
- `agent:process` - Submit process list
