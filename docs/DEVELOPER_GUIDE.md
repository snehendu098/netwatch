# NetWatch Developer Guide

**Version:** 1.0.0
**Last Updated:** December 2024
**Author:** Infinititech Partners

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Database Schema](#5-database-schema)
6. [API Reference](#6-api-reference)
7. [Socket.IO Real-time Communication](#7-socketio-real-time-communication)
8. [Desktop Agent Architecture](#8-desktop-agent-architecture)
9. [Authentication System](#9-authentication-system)
10. [Frontend Components](#10-frontend-components)
11. [Data Flow Diagrams](#11-data-flow-diagrams)
12. [Development Setup](#12-development-setup)
13. [Deployment Guide](#13-deployment-guide)
14. [Testing](#14-testing)
15. [Security Considerations](#15-security-considerations)

---

## 1. Project Overview

NetWatch is a comprehensive employee monitoring solution that enables organizations to:

- **Real-time Screen Monitoring** - Live view of employee screens
- **Screenshot Capture** - Periodic automatic screenshots with storage
- **Screen Recording** - Full video recording of screen activity
- **Activity Tracking** - Applications used, window titles, time spent
- **Website Monitoring** - Track visited URLs with categorization
- **Process Monitoring** - Running processes with CPU/memory usage
- **Keylogging** - Keystroke capture (encrypted storage)
- **Clipboard Monitoring** - Track copied content
- **Remote Desktop Control** - Mouse/keyboard control
- **Terminal Access** - Remote CMD/PowerShell/Bash access
- **File Transfer** - Upload/download files to/from computers
- **System Restrictions** - Block USB, printers, applications
- **Website/App Blocking** - Policy-based blocking
- **Messaging** - Send messages with screen lock capability
- **Alerts & Reporting** - Automated alerts and productivity reports

### Key Concepts

- **Organization** - Multi-tenant structure; each company has isolated data
- **Computer** - A monitored endpoint running the NetWatch Agent
- **Computer Group** - Logical grouping for policies and reporting
- **Agent** - Electron desktop application installed on monitored computers
- **Console** - Web dashboard for administrators

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NETWATCH ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │  Desktop Agent  │     │  Desktop Agent  │     │  Desktop Agent  │       │
│  │  (Electron)     │     │  (Electron)     │     │  (Electron)     │       │
│  │  Windows/Mac/   │     │  Windows/Mac/   │     │  Windows/Mac/   │       │
│  │  Linux          │     │  Linux          │     │  Linux          │       │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘       │
│           │                       │                       │                 │
│           │     Socket.IO (WebSocket) - /agent namespace  │                 │
│           └───────────────────────┼───────────────────────┘                 │
│                                   ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         NETWATCH SERVER                                │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │                    Custom HTTP Server (server.ts)                │  │ │
│  │  │  - Next.js App Router Handler                                   │  │ │
│  │  │  - Socket.IO Server (socket-server.ts)                          │  │ │
│  │  │    ├─ /agent namespace (for desktop agents)                     │  │ │
│  │  │    └─ /console namespace (for admin dashboard)                  │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                   │                                    │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │                      Next.js 15 App Router                       │  │ │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │  │ │
│  │  │  │  API Routes │  │   Pages     │  │   Lib (Utilities)       │  │  │ │
│  │  │  │  /api/*     │  │  /dashboard │  │  - auth.ts              │  │  │ │
│  │  │  │             │  │  /login     │  │  - prisma.ts            │  │  │ │
│  │  │  │             │  │  /setup     │  │  - socket-server.ts     │  │  │ │
│  │  │  │             │  │             │  │  - email.ts             │  │  │ │
│  │  │  │             │  │             │  │  - encryption.ts        │  │  │ │
│  │  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  │                                   │                                    │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │                         Prisma ORM                               │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                   │                                         │
│                                   ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                      PostgreSQL Database (Neon)                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │  Admin Dashboard│◄──── Socket.IO (/console) ────┐                       │
│  │  (Web Browser)  │                                │                       │
│  └─────────────────┘                                │                       │
│           ▲                                         │                       │
│           │ HTTP/REST API                           │                       │
│           └─────────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack

### Web Dashboard (Main Application)

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Next.js | 16.1.1 |
| React | React | 19.2.3 |
| Language | TypeScript | 5.x |
| Database | PostgreSQL (Neon) | - |
| ORM | Prisma | 5.22.0 |
| Authentication | NextAuth.js (v5 beta) | 5.0.0-beta.30 |
| Real-time | Socket.IO | 4.8.2 |
| UI Components | Radix UI + shadcn/ui | Various |
| Styling | Tailwind CSS | 4.x |
| Charts | Recharts | 3.6.0 |
| State Management | Zustand | 5.0.9 |
| Form Handling | React Hook Form + Zod | 7.69.0 / 4.2.1 |
| Error Tracking | Sentry | 10.32.1 |
| Email | Nodemailer | 7.0.7 |
| PDF Generation | PDFKit | 0.17.2 |
| Excel Export | XLSX | 0.18.5 |

### Desktop Agent

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Electron | 28.1.0 |
| Language | TypeScript | 5.3.3 |
| Socket Client | Socket.IO Client | 4.8.2 |
| System Info | systeminformation | 5.23.5 |
| Screen Capture | screenshot-desktop | 1.15.0 |
| Remote Control | robotjs | 0.6.0 |
| Terminal | node-pty | 1.0.0 |
| Keylogger | node-global-key-listener | 0.3.0 |
| Active Window | active-win | 8.1.1 |
| Clipboard | clipboardy | 4.0.0 |
| Auto-start | auto-launch | 5.0.6 |
| Persistence | electron-store | 8.1.0 |
| Machine ID | node-machine-id | 1.1.12 |
| Video Recording | fluent-ffmpeg | 2.1.3 |

---

## 4. Project Structure

```
netwatch/
├── agent/                          # Electron Desktop Agent
│   ├── src/
│   │   ├── main.ts                 # Main Electron entry point
│   │   ├── services/
│   │   │   ├── agent-service.ts    # Socket.IO connection & communication
│   │   │   ├── screen-capture.ts   # Screenshot capture
│   │   │   ├── screen-recorder.ts  # Video recording
│   │   │   ├── activity-tracker.ts # App/window tracking
│   │   │   ├── process-monitor.ts  # Running processes
│   │   │   ├── clipboard-monitor.ts# Clipboard capture
│   │   │   ├── keylogger-service.ts# Keystroke logging
│   │   │   ├── command-executor.ts # Remote command execution
│   │   │   ├── remote-control.ts   # Mouse/keyboard control
│   │   │   ├── terminal-service.ts # Remote shell access
│   │   │   ├── file-transfer.ts    # File upload/download
│   │   │   ├── blocking-service.ts # Website/app blocking
│   │   │   └── system-restrictions.ts # USB, printer control
│   │   └── utils/
│   │       └── password.ts         # Password hashing
│   ├── assets/                     # Icons, HTML templates
│   ├── dist/                       # Compiled JavaScript
│   ├── release/                    # Built installers
│   ├── package.json
│   └── tsconfig.json
│
├── src/                            # Next.js Web Application
│   ├── app/
│   │   ├── api/                    # API Routes
│   │   │   ├── auth/
│   │   │   │   ├── [...nextauth]/route.ts  # NextAuth handler
│   │   │   │   ├── two-factor/route.ts     # 2FA setup/verify
│   │   │   │   └── password-reset/route.ts # Password reset
│   │   │   ├── computers/
│   │   │   │   ├── route.ts        # GET all, POST create
│   │   │   │   └── [id]/route.ts   # GET, PUT, DELETE single
│   │   │   ├── groups/route.ts     # Computer groups
│   │   │   ├── users/route.ts      # User management
│   │   │   ├── screenshots/route.ts# Screenshot management
│   │   │   ├── recordings/route.ts # Recording management
│   │   │   ├── activity/route.ts   # Activity logs
│   │   │   ├── processes/route.ts  # Process logs
│   │   │   ├── clipboard/route.ts  # Clipboard logs
│   │   │   ├── keylogs/route.ts    # Keystroke logs
│   │   │   ├── commands/route.ts   # Device commands
│   │   │   ├── alerts/route.ts     # Alerts
│   │   │   ├── alert-rules/route.ts# Alert rules config
│   │   │   ├── policies/route.ts   # Block rules
│   │   │   ├── firewall/route.ts   # Firewall rules
│   │   │   ├── messages/route.ts   # Messaging
│   │   │   ├── remote-sessions/route.ts # Remote sessions
│   │   │   ├── file-transfers/route.ts  # File transfers
│   │   │   ├── reports/
│   │   │   │   ├── productivity/route.ts
│   │   │   │   └── export/route.ts
│   │   │   ├── scheduled-reports/route.ts
│   │   │   ├── settings/route.ts   # Org settings
│   │   │   ├── audit-logs/route.ts # Audit logs
│   │   │   ├── retention/route.ts  # Data retention
│   │   │   ├── dashboard/stats/route.ts
│   │   │   ├── network/
│   │   │   │   ├── discover/route.ts # Network scanning
│   │   │   │   └── test/route.ts   # Connectivity test
│   │   │   ├── setup/route.ts      # First-time setup
│   │   │   ├── health/route.ts     # Health check
│   │   │   └── cron/               # Scheduled jobs
│   │   │       ├── cleanup/route.ts
│   │   │       └── scheduled-reports/route.ts
│   │   │
│   │   ├── dashboard/              # Dashboard Pages
│   │   │   ├── page.tsx            # Main dashboard
│   │   │   ├── layout.tsx          # Dashboard layout
│   │   │   ├── computers/
│   │   │   │   ├── page.tsx        # Computers list
│   │   │   │   └── [id]/page.tsx   # Computer detail
│   │   │   ├── monitoring/
│   │   │   │   ├── page.tsx        # Live monitoring grid
│   │   │   │   └── [computerId]/page.tsx # Single computer view
│   │   │   ├── screenshots/page.tsx
│   │   │   ├── recordings/page.tsx
│   │   │   ├── alerts/page.tsx
│   │   │   ├── policies/page.tsx
│   │   │   ├── processes/page.tsx
│   │   │   ├── clipboard/page.tsx
│   │   │   ├── keylogger/page.tsx
│   │   │   ├── firewall/page.tsx
│   │   │   ├── remote/page.tsx     # Remote desktop
│   │   │   ├── control/page.tsx    # Terminal access
│   │   │   ├── messaging/page.tsx
│   │   │   ├── reports/
│   │   │   │   ├── page.tsx        # Reports overview
│   │   │   │   ├── productivity/page.tsx
│   │   │   │   ├── applications/page.tsx
│   │   │   │   ├── websites/page.tsx
│   │   │   │   └── system-info/page.tsx
│   │   │   └── settings/
│   │   │       ├── page.tsx        # General settings
│   │   │       └── users/page.tsx  # User management
│   │   │
│   │   ├── login/page.tsx          # Login page
│   │   ├── setup/page.tsx          # First-time setup wizard
│   │   ├── layout.tsx              # Root layout
│   │   └── globals.css             # Global styles
│   │
│   ├── components/
│   │   ├── ui/                     # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── form.tsx
│   │   │   ├── table.tsx
│   │   │   └── ... (20+ components)
│   │   ├── dashboard/
│   │   │   ├── header.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── charts.tsx
│   │   │   └── activity-feed.tsx
│   │   ├── monitoring/
│   │   │   ├── monitoring-grid.tsx
│   │   │   └── single-computer-view.tsx
│   │   ├── remote/
│   │   │   └── LiveRemoteDesktop.tsx
│   │   ├── computers/
│   │   │   └── add-computer-dialog.tsx
│   │   ├── modals/
│   │   │   ├── add-computer-dialog.tsx
│   │   │   ├── add-group-dialog.tsx
│   │   │   └── add-policy-dialog.tsx
│   │   ├── providers.tsx           # React providers
│   │   └── command-palette.tsx
│   │
│   ├── lib/
│   │   ├── auth.ts                 # NextAuth configuration
│   │   ├── prisma.ts               # Prisma client singleton
│   │   ├── socket-server.ts        # Socket.IO server
│   │   ├── socket-client.ts        # Socket.IO client hook
│   │   ├── email.ts                # Email sending
│   │   ├── encryption.ts           # AES encryption
│   │   ├── two-factor.ts           # 2FA (speakeasy)
│   │   ├── validation.ts           # Zod schemas
│   │   ├── rate-limit.ts           # Rate limiting
│   │   ├── redis.ts                # Redis client
│   │   ├── audit.ts                # Audit logging
│   │   ├── retention.ts            # Data retention
│   │   ├── report-generator.ts     # PDF/Excel reports
│   │   ├── error-tracking.ts       # Error handling
│   │   ├── sentry.ts               # Sentry integration
│   │   └── utils.ts                # Utility functions
│   │
│   └── types/
│       └── next-auth.d.ts          # NextAuth type extensions
│
├── prisma/
│   ├── schema.prisma               # Database schema
│   ├── seed.ts                     # Development seed data
│   └── seed-production.ts          # Production initial data
│
├── server.ts                       # Custom HTTP server entry
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── .env                            # Environment variables
```

---

## 5. Database Schema

### Entity Relationship Diagram

```
┌──────────────────┐       ┌──────────────────┐
│   Organization   │       │      User        │
├──────────────────┤       ├──────────────────┤
│ id (PK)          │───┐   │ id (PK)          │
│ name             │   │   │ email            │
│ slug             │   │   │ password         │
│ plan             │   └──►│ organizationId(FK)│
│ createdAt        │       │ role             │
│ updatedAt        │       │ twoFactorEnabled │
└──────────────────┘       │ twoFactorSecret  │
         │                 └──────────────────┘
         │
         ▼
┌──────────────────┐       ┌──────────────────┐
│ ComputerGroup    │       │    Computer      │
├──────────────────┤       ├──────────────────┤
│ id (PK)          │       │ id (PK)          │
│ name             │◄──────│ groupId (FK)     │
│ color            │       │ organizationId(FK)│
│ organizationId(FK)│      │ name, hostname   │
└──────────────────┘       │ ipAddress, mac   │
                           │ osType, osVersion│
                           │ status           │
                           │ cpuUsage, mem... │
                           │ lastSeen         │
                           └──────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  ActivityLog     │    │   Screenshot     │    │   Recording      │
├──────────────────┤    ├──────────────────┤    ├──────────────────┤
│ id, computerId   │    │ id, computerId   │    │ id, computerId   │
│ applicationName  │    │ imageUrl/filePath│    │ videoUrl/filePath│
│ windowTitle      │    │ fileSize         │    │ fileSize         │
│ duration         │    │ activeWindow     │    │ duration         │
│ startTime        │    │ capturedAt       │    │ status           │
│ category         │    └──────────────────┘    │ startedAt        │
└──────────────────┘                            └──────────────────┘

┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│     Keylog       │    │  ClipboardLog    │    │   ProcessLog     │
├──────────────────┤    ├──────────────────┤    ├──────────────────┤
│ id, computerId   │    │ id, computerId   │    │ id, computerId   │
│ keystrokes       │    │ content          │    │ processName      │
│ application      │    │ contentType      │    │ processId        │
│ windowTitle      │    │ application      │    │ path             │
│ capturedAt       │    │ capturedAt       │    │ cpuUsage, mem    │
└──────────────────┘    └──────────────────┘    └──────────────────┘

┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  DeviceCommand   │    │  FirewallRule    │    │  RemoteSession   │
├──────────────────┤    ├──────────────────┤    ├──────────────────┤
│ id, computerId   │    │ id, computerId   │    │ id, computerId   │
│ command          │    │ name, direction  │    │ userId           │
│ payload (JSON)   │    │ action, protocol │    │ sessionType      │
│ status           │    │ port, remoteIp   │    │ status           │
│ sentAt           │    │ application      │    │ startedAt        │
│ executedAt       │    │ isActive         │    │ endedAt          │
│ response         │    └──────────────────┘    └──────────────────┘
└──────────────────┘

┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   FileTransfer   │    │      Alert       │    │   BlockRule      │
├──────────────────┤    ├──────────────────┤    ├──────────────────┤
│ id, computerId   │    │ id               │    │ id               │
│ direction        │    │ type, message    │    │ type (WEB/APP)   │
│ localPath        │    │ computerId       │    │ pattern          │
│ remotePath       │    │ organizationId   │    │ action           │
│ status, progress │    │ isRead           │    │ organizationId   │
│ startedAt        │    │ createdAt        │    │ groupIds         │
└──────────────────┘    └──────────────────┘    └──────────────────┘

┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│    AlertRule     │    │ ScheduledReport  │    │    AuditLog      │
├──────────────────┤    ├──────────────────┤    ├──────────────────┤
│ id               │    │ id               │    │ id               │
│ name, type       │    │ name, reportType │    │ organizationId   │
│ condition (JSON) │    │ format, schedule │    │ userId, action   │
│ severity         │    │ recipients       │    │ resource         │
│ actions (JSON)   │    │ filters          │    │ resourceId       │
│ organizationId   │    │ organizationId   │    │ details (JSON)   │
│ groupIds         │    │ lastRunAt        │    │ ipAddress        │
│ isActive         │    │ nextRunAt        │    │ status           │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

### Key Models Explained

#### Organization
- Multi-tenant root entity
- All data is scoped by `organizationId`
- Plans: `free`, `pro`, `enterprise`

#### User
- Belongs to one organization
- Roles: `ADMIN`, `MANAGER`, `VIEWER`
- Supports 2FA with backup codes
- OAuth support (Google, GitHub)

#### Computer
- Represents a monitored endpoint
- Status: `ONLINE`, `OFFLINE`, `LOCKED`
- Automatically registered when agent connects
- Linked to optional ComputerGroup

#### ActivityLog
- Tracks application usage
- Categories: `DEVELOPMENT`, `PRODUCTIVITY`, `COMMUNICATION`, `ENTERTAINMENT`, `SOCIAL`, `OTHER`
- Duration in milliseconds

#### DeviceCommand
- Remote commands sent to agents
- Commands: `LOCK`, `UNLOCK`, `SHUTDOWN`, `RESTART`, `MESSAGE`, `LOGOFF`, `SLEEP`, `EXECUTE`
- Status workflow: `PENDING` → `SENT` → `EXECUTED`/`FAILED`

---

## 6. API Reference

### Authentication

All API routes (except `/api/auth/*` and `/api/setup`) require authentication via NextAuth session.

```typescript
// Example: Checking authentication in API route
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ... rest of handler
}
```

### API Endpoints

#### Computers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/computers` | List all computers in organization |
| POST | `/api/computers` | Add new computer manually |
| GET | `/api/computers/[id]` | Get computer details |
| PUT | `/api/computers/[id]` | Update computer |
| DELETE | `/api/computers/[id]` | Delete computer |

**POST /api/computers Request Body:**
```json
{
  "name": "John's Workstation",
  "hostname": "DESKTOP-ABC123",
  "ipAddress": "192.168.1.100",
  "osType": "windows",
  "groupId": "clp123abc..."
}
```

#### Screenshots

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/screenshots` | List screenshots (with filters) |
| GET | `/api/screenshots/[id]` | Get screenshot details |
| DELETE | `/api/screenshots/[id]` | Delete screenshot |

**Query Parameters:**
- `computerId` - Filter by computer
- `startDate` / `endDate` - Date range
- `page` / `limit` - Pagination

#### Activity Logs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/activity` | Get activity logs |

**Query Parameters:**
- `computerId` - Filter by computer
- `category` - Filter by category
- `startDate` / `endDate` - Date range

#### Commands

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/commands` | List commands |
| POST | `/api/commands` | Send command to computer |
| GET | `/api/commands/[id]` | Get command status |

**POST /api/commands Request Body:**
```json
{
  "computerId": "clp123abc...",
  "command": "LOCK",
  "payload": {
    "message": "Your computer has been locked"
  }
}
```

**Available Commands:**
| Command | Payload | Description |
|---------|---------|-------------|
| `LOCK` | `{ message?: string }` | Lock the computer |
| `UNLOCK` | - | Unlock the computer |
| `SHUTDOWN` | `{ delay?: number }` | Shutdown with optional delay |
| `RESTART` | `{ delay?: number }` | Restart with optional delay |
| `LOGOFF` | - | Log off current user |
| `SLEEP` | - | Put computer to sleep |
| `MESSAGE` | `{ title, message, type }` | Show message popup |
| `EXECUTE` | `{ command: string }` | Execute shell command |

#### Network Discovery

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/network/discover` | Get local network info |
| POST | `/api/network/discover` | Scan network for devices |
| POST | `/api/network/test` | Test connectivity to IP |

**POST /api/network/discover Request:**
```json
{
  "subnet": "192.168.1",  // Optional, auto-detected if omitted
  "startIp": 1,
  "endIp": 254
}
```

**POST /api/network/test Request:**
```json
{
  "ip": "192.168.1.100",
  "osType": "windows"
}
```

#### Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/productivity` | Get productivity metrics |
| POST | `/api/reports/export` | Export report as PDF/CSV/Excel |

---

## 7. Socket.IO Real-time Communication

### Server Configuration

**File:** `src/lib/socket-server.ts`

The Socket.IO server uses two namespaces:

1. **`/agent`** - For desktop agent connections
2. **`/console`** - For admin dashboard connections

### Agent Namespace Events

#### Agent → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `auth` | `{ machineId, hostname, osType, osVersion, macAddress, ipAddress, agentVersion }` | Authentication |
| `heartbeat` | `{ cpuUsage, memoryUsage, diskUsage, activeWindow, isIdle, idleTime }` | Status update (every 10s) |
| `screen_frame` | `{ frame, timestamp, monitorIndex }` | Live screen frame (Base64 JPEG) |
| `screenshot` | `{ image, timestamp, activeWindow }` | Screenshot for storage |
| `activity_log` | `{ logs: Array<{ applicationName, windowTitle, startTime, endTime, duration, category }> }` | Activity batch |
| `keystrokes` | `{ strokes: Array<{ keys, applicationName, windowTitle, timestamp }> }` | Keystroke batch |
| `clipboard` | `{ content, contentType, timestamp }` | Clipboard capture |
| `process_list` | `{ processes: Array<{ processName, processId, path, cpuUsage, memoryUsage, username }> }` | Process snapshot |
| `website_visit` | `{ url, title, browser, duration, timestamp }` | Website visit |
| `command_response` | `{ commandId, success, response, error }` | Command result |
| `terminal_output` | `{ sessionId, output }` | Terminal output |
| `file_transfer_progress` | `{ transferId, progress, bytesTransferred }` | Transfer progress |

#### Server → Agent

| Event | Payload | Description |
|-------|---------|-------------|
| `auth_success` | `{ computerId, config }` | Authentication success |
| `auth_error` | `{ message }` | Authentication failure |
| `command` | `{ id, command, payload }` | Execute command |
| `start_screen_stream` | `{ quality, fps }` | Start screen streaming |
| `stop_screen_stream` | - | Stop screen streaming |
| `capture_screenshot` | - | Capture single screenshot |
| `remote_input` | `{ type, event }` | Mouse/keyboard input |
| `start_remote_control` | `{ sessionId, mode, quality, fps }` | Start remote control |
| `start_terminal` | `{ sessionId, shell }` | Start terminal session |
| `terminal_input` | `{ sessionId, input }` | Terminal input |
| `file_transfer` | `{ transferId, direction, remotePath, fileData }` | File transfer request |

### Console Namespace Events

#### Console → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `auth` | `{ userId }` | Authentication |
| `watch_computer` | `{ computerId }` | Start watching computer |
| `unwatch_computer` | `{ computerId }` | Stop watching computer |
| `send_command` | `{ computerId, command, payload }` | Send command to agent |
| `remote_input` | `{ computerId, type, event }` | Send mouse/keyboard |
| `start_terminal` | `{ computerId, shell }` | Start terminal |
| `terminal_input` | `{ computerId, sessionId, input }` | Terminal input |
| `file_transfer` | `{ computerId, direction, remotePath, fileData }` | File transfer |
| `request_screenshot` | `{ computerId }` | Request screenshot |
| `start_remote_control` | `{ computerId, mode }` | Start remote control |

#### Server → Console

| Event | Payload | Description |
|-------|---------|-------------|
| `auth_success` | `{ onlineAgents }` | Auth success with online agents |
| `agent_online` | `{ computerId, hostname }` | Agent connected |
| `agent_offline` | `{ computerId }` | Agent disconnected |
| `heartbeat` | `{ computerId, cpuUsage, memoryUsage, ... }` | Agent heartbeat |
| `screen_frame` | `{ computerId, frame, timestamp }` | Live screen frame |
| `keystrokes` | `{ computerId, strokes }` | Real-time keystrokes |
| `clipboard` | `{ computerId, content, contentType }` | Clipboard change |
| `process_list` | `{ computerId, processes }` | Process update |
| `command_response` | `{ commandId, success, response }` | Command result |
| `terminal_output` | `{ sessionId, output }` | Terminal output |
| `file_transfer_progress` | `{ transferId, progress }` | Transfer progress |

### Data Flow Example: Live Monitoring

```
┌──────────┐                    ┌──────────┐                    ┌──────────┐
│  Agent   │                    │  Server  │                    │ Console  │
└────┬─────┘                    └────┬─────┘                    └────┬─────┘
     │                               │                               │
     │ connect /agent                │                               │
     │──────────────────────────────►│                               │
     │                               │                               │
     │ emit: auth                    │                               │
     │──────────────────────────────►│                               │
     │                               │ Create/Update Computer        │
     │                               │ in Database                   │
     │◄──────────────────────────────│                               │
     │ emit: auth_success            │                               │
     │                               │                               │
     │                               │           connect /console    │
     │                               │◄──────────────────────────────│
     │                               │                               │
     │                               │              emit: auth       │
     │                               │◄──────────────────────────────│
     │                               │                               │
     │                               │──────────────────────────────►│
     │                               │         emit: auth_success    │
     │                               │         (with onlineAgents)   │
     │                               │                               │
     │                               │       emit: watch_computer    │
     │                               │◄──────────────────────────────│
     │                               │                               │
     │        emit: start_screen_stream                              │
     │◄──────────────────────────────│                               │
     │                               │                               │
     │ emit: screen_frame (loop)     │                               │
     │──────────────────────────────►│                               │
     │                               │──────────────────────────────►│
     │                               │         emit: screen_frame    │
     │                               │                               │
     │ emit: heartbeat (10s)         │                               │
     │──────────────────────────────►│                               │
     │                               │ Update Computer status        │
     │                               │──────────────────────────────►│
     │                               │           emit: heartbeat     │
```

---

## 8. Desktop Agent Architecture

### Entry Point

**File:** `agent/src/main.ts`

The agent is an Electron application that:
1. Shows a setup wizard on first run (server URL + admin password)
2. Runs in the system tray
3. Connects to the server via Socket.IO
4. Starts monitoring services
5. Requires admin password to exit

### Services

#### AgentService (`agent-service.ts`)
- Core Socket.IO client
- Handles authentication, heartbeat, reconnection
- Event emitter for inter-service communication
- Methods: `sendScreenshot()`, `sendActivityLogs()`, `sendKeystrokes()`, etc.

#### ScreenCapture (`screen-capture.ts`)
- Captures screenshots using `screenshot-desktop`
- Configurable interval (default: 5 seconds)
- Compresses to JPEG before sending
- Supports multiple monitors

#### ProcessMonitor (`process-monitor.ts`)
- Uses `systeminformation` for process list
- Monitors every 10 seconds
- Tracks CPU/memory per process

#### ActivityTracker (`activity-tracker.ts`)
- Uses `active-win` to detect focused window
- Tracks application name, window title
- Calculates duration per application
- Categorizes activities

#### ClipboardMonitor (`clipboard-monitor.ts`)
- Uses `clipboardy` to read clipboard
- Detects changes and sends to server
- Handles text and file paths

#### KeyloggerService (`keylogger-service.ts`)
- Uses `node-global-key-listener`
- Buffers keystrokes before sending
- Records application context

#### CommandExecutor (`command-executor.ts`)
- Handles remote commands
- Executes lock, shutdown, restart, etc.
- Uses native OS commands

#### RemoteControl (`remote-control.ts`)
- Uses `robotjs` for mouse/keyboard
- Receives input events from server
- Simulates user input

#### TerminalService (`terminal-service.ts`)
- Uses `node-pty` for pseudo-terminal
- Supports CMD, PowerShell, Bash
- Multiple concurrent sessions

#### FileTransfer (`file-transfer.ts`)
- Handles file upload/download
- Chunks large files
- Progress reporting

#### BlockingService (`blocking-service.ts`)
- Monitors active applications/websites
- Matches against block rules
- Can terminate or show warning

#### SystemRestrictions (`system-restrictions.ts`)
- Controls USB, printers, etc.
- OS-specific implementations

### Agent Configuration

**Config sources (in priority order):**
1. `config.json` in app directory
2. Environment variables (`NETWATCH_SERVER_URL`)
3. `electron-store` persistent storage

**Stored settings:**
```typescript
{
  serverUrl: string,
  autoStart: boolean,
  screenshotInterval: number,
  activityLogInterval: number,
  adminPasswordHash: string  // PBKDF2 hashed
}
```

### Building the Agent

```bash
cd agent

# Install dependencies
npm install

# Build TypeScript
npm run build

# Package for all platforms
npm run package

# Or specific platform
npm run package:win   # Windows (NSIS + MSI)
npm run package:mac   # macOS (DMG)
npm run package:linux # Linux (AppImage)
```

Output: `agent/release/`

---

## 9. Authentication System

### NextAuth.js Configuration

**File:** `src/lib/auth.ts`

#### Providers

1. **Credentials** - Email/password with optional 2FA
2. **Google OAuth** - Google sign-in
3. **GitHub OAuth** - GitHub sign-in

#### Session Strategy

JWT-based sessions with custom claims:
```typescript
{
  id: string,           // User ID
  email: string,
  name: string,
  role: string,         // ADMIN, MANAGER, VIEWER
  organizationId: string,
  organizationName: string,
  image?: string
}
```

#### Two-Factor Authentication

**File:** `src/lib/two-factor.ts`

- Uses `speakeasy` for TOTP
- Secrets encrypted with AES-256
- Backup codes generated on setup

```typescript
// Setup 2FA
POST /api/auth/two-factor
{ "action": "setup" }
// Returns: { secret, qrCodeUrl, backupCodes }

// Verify and enable 2FA
POST /api/auth/two-factor
{ "action": "verify", "token": "123456" }

// Disable 2FA
POST /api/auth/two-factor
{ "action": "disable", "password": "..." }
```

#### Password Reset

**File:** `src/lib/email.ts`

```typescript
POST /api/auth/password-reset
{ "email": "user@example.com" }
// Sends email with reset link

POST /api/auth/password-reset
{ "token": "...", "password": "newpassword" }
// Resets password
```

### Role-Based Access Control

| Feature | ADMIN | MANAGER | VIEWER |
|---------|-------|---------|--------|
| View Dashboard | ✓ | ✓ | ✓ |
| View Computers | ✓ | ✓ | ✓ |
| Add/Edit Computers | ✓ | ✓ | ✗ |
| Delete Computers | ✓ | ✗ | ✗ |
| View Screenshots | ✓ | ✓ | ✓ |
| View Keylogs | ✓ | ✓ | ✗ |
| Send Commands | ✓ | ✓ | ✗ |
| Remote Control | ✓ | ✓ | ✗ |
| Manage Policies | ✓ | ✓ | ✗ |
| Manage Users | ✓ | ✗ | ✗ |
| Manage Settings | ✓ | ✗ | ✗ |

---

## 10. Frontend Components

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│                        Header                                │
│  [Logo]  [Search]                    [Notifications] [User] │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                   │
│ Sidebar  │                  Main Content                     │
│          │                                                   │
│ Dashboard│                  (Page Content)                   │
│ Computers│                                                   │
│ Monitor  │                                                   │
│ Screen-  │                                                   │
│ shots    │                                                   │
│ ...      │                                                   │
│          │                                                   │
│ Settings │                                                   │
│          │                                                   │
└──────────┴──────────────────────────────────────────────────┘
```

### Key Components

#### Dashboard Layout (`src/app/dashboard/layout.tsx`)
- Wraps all dashboard pages
- Includes Header and Sidebar
- Authentication check

#### Monitoring Grid (`src/components/monitoring/monitoring-grid.tsx`)
- Displays live thumbnails of all computers
- Socket.IO connection for real-time updates
- Click to expand to single view

#### Single Computer View (`src/components/monitoring/single-computer-view.tsx`)
- Full-screen live view
- Activity stats
- Quick action buttons

#### Add Computer Dialog (`src/components/computers/add-computer-dialog.tsx`)
- Tabs: Manual Entry / Network Discovery
- Network scanning
- Connectivity testing

### UI Component Library

Using shadcn/ui with Radix primitives:

| Component | File |
|-----------|------|
| Button | `ui/button.tsx` |
| Card | `ui/card.tsx` |
| Dialog | `ui/dialog.tsx` |
| DropdownMenu | `ui/dropdown-menu.tsx` |
| Form | `ui/form.tsx` |
| Input | `ui/input.tsx` |
| Select | `ui/select.tsx` |
| Table | `ui/table.tsx` |
| Tabs | `ui/tabs.tsx` |
| Toast (Sonner) | `ui/sonner.tsx` |

### State Management

**Zustand Store:** `src/lib/socket-client.ts`

```typescript
interface SocketState {
  isConnected: boolean;
  onlineAgents: Map<string, AgentInfo>;
  screenFrames: Map<string, string>;
  // ... actions
}

const useSocket = create<SocketState>((set) => ({
  // ... state and actions
}));
```

---

## 11. Data Flow Diagrams

### Screenshot Capture Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SCREENSHOT CAPTURE FLOW                          │
└─────────────────────────────────────────────────────────────────────────┘

  Agent                        Server                        Database
    │                            │                               │
    │ 1. Timer triggers          │                               │
    │    (every 5s)              │                               │
    │                            │                               │
    │ 2. screenshot-desktop      │                               │
    │    captures screen         │                               │
    │                            │                               │
    │ 3. Convert to Base64 JPEG  │                               │
    │                            │                               │
    │ 4. emit('screenshot')      │                               │
    │ ─────────────────────────► │                               │
    │                            │ 5. Create Screenshot record   │
    │                            │ ─────────────────────────────►│
    │                            │                               │
    │                            │ 6. If console watching:       │
    │                            │    emit('screen_frame')       │
    │                            │                               │
```

### Command Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        COMMAND EXECUTION FLOW                           │
└─────────────────────────────────────────────────────────────────────────┘

  Dashboard        Socket Server          Agent              Database
      │                  │                   │                    │
      │ 1. POST          │                   │                    │
      │ /api/commands    │                   │                    │
      │ ─────────────────────────────────────────────────────────►│
      │                  │                   │ 2. Create command │
      │                  │                   │    (PENDING)      │
      │◄─────────────────────────────────────────────────────────│
      │                  │                   │                    │
      │ 3. emit          │                   │                    │
      │ ('send_command') │                   │                    │
      │ ────────────────►│                   │                    │
      │                  │ 4. Update status  │                    │
      │                  │    (SENT)         │                    │
      │                  │ ─────────────────────────────────────►│
      │                  │                   │                    │
      │                  │ 5. emit('command')│                    │
      │                  │ ─────────────────►│                    │
      │                  │                   │ 6. Execute         │
      │                  │                   │    (LOCK/SHUTDOWN) │
      │                  │                   │                    │
      │                  │ 7. emit           │                    │
      │                  │ ('command_response')                   │
      │                  │ ◄─────────────────│                    │
      │                  │                   │                    │
      │                  │ 8. Update status  │                    │
      │                  │    (EXECUTED)     │                    │
      │                  │ ─────────────────────────────────────►│
      │                  │                   │                    │
      │ 9. emit          │                   │                    │
      │ ('command_response')                 │                    │
      │ ◄────────────────│                   │                    │
```

---

## 12. Development Setup

### Prerequisites

- Node.js 18+
- PostgreSQL (or Neon account)
- Git

### Environment Variables

Create `.env` file:

```env
# Database
DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=require"

# NextAuth
AUTH_SECRET="your-secret-key-min-32-chars"
AUTH_URL="http://localhost:4000"
NEXTAUTH_URL="http://localhost:4000"

# OAuth (optional)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

# Email (optional)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
EMAIL_FROM="noreply@yourapp.com"

# Redis (optional, for rate limiting)
REDIS_URL="redis://localhost:6379"

# Sentry (optional)
SENTRY_DSN=""

# Encryption
ENCRYPTION_KEY="32-character-key-for-aes-256!!!"
```

### Installation

```bash
# Clone repository
git clone https://github.com/yourorg/netwatch.git
cd netwatch

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Seed database (development)
npm run db:seed

# Start development server
npm run dev
```

### Agent Development

```bash
cd agent

# Install dependencies
npm install

# Start in development mode
npm run dev

# Or build and run
npm run start
```

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## 13. Deployment Guide

### Web Dashboard (Vercel)

1. Push to GitHub
2. Import in Vercel
3. Set environment variables in Vercel dashboard:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `AUTH_URL` (your production URL)
   - `NEXTAUTH_URL` (your production URL)

### Database (Neon)

1. Create Neon project
2. Copy connection string to `DATABASE_URL`
3. Run `npx prisma db push`

### Agent Distribution

1. Build installers: `npm run package`
2. Distribute:
   - Windows: `NetWatch-Agent-x.x.x-win-x64.exe`
   - macOS: `NetWatch-Agent-x.x.x-mac-x64.dmg`
   - Linux: `NetWatch-Agent-x.x.x-linux-x64.AppImage`

### Configuration for Agents

Agents need the server URL. Options:
1. Pre-configure `config.json` before packaging
2. User enters during first-run setup
3. Environment variable `NETWATCH_SERVER_URL`

---

## 14. Testing

### Test Structure

```
src/__tests__/
├── api/
│   ├── computers.test.ts
│   └── ...
├── components/
│   └── ...
└── lib/
    └── ...
```

### Running Tests

```bash
# All tests
npm test

# Specific file
npm test -- src/__tests__/api/computers.test.ts

# Watch mode
npm run test:watch
```

### Test Configuration

**File:** `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

---

## 15. Security Considerations

### Data Protection

1. **Encryption at Rest**
   - 2FA secrets encrypted with AES-256
   - Keystroke data encrypted before storage

2. **Encryption in Transit**
   - HTTPS for all API calls
   - WSS for Socket.IO in production

3. **Password Security**
   - bcrypt for user passwords
   - PBKDF2 for agent admin passwords

### Access Control

1. **Role-based permissions** (ADMIN, MANAGER, VIEWER)
2. **Organization isolation** (multi-tenant)
3. **Session-based authentication** (JWT)
4. **2FA support**

### Rate Limiting

```typescript
// API rate limiting
const rateLimitConfig = {
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 100,     // per window
};
```

### Audit Logging

All sensitive actions are logged:
- User login/logout
- Computer add/delete
- Command execution
- Data export
- Settings changes

### Input Validation

Using Zod schemas for all API inputs:

```typescript
const computerSchema = z.object({
  name: z.string().min(1).max(100),
  hostname: z.string().min(1).max(255),
  ipAddress: z.string().ip().optional(),
  osType: z.enum(["windows", "macos", "linux"]),
});
```

---

## Appendix A: Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | NextAuth secret (32+ chars) |
| `AUTH_URL` | Yes | Application URL |
| `NEXTAUTH_URL` | Yes | Same as AUTH_URL |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth secret |
| `GITHUB_CLIENT_ID` | No | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | No | GitHub OAuth secret |
| `SMTP_HOST` | No | SMTP server host |
| `SMTP_PORT` | No | SMTP server port |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `EMAIL_FROM` | No | From email address |
| `REDIS_URL` | No | Redis connection string |
| `SENTRY_DSN` | No | Sentry DSN for error tracking |
| `ENCRYPTION_KEY` | No | 32-char AES key |

---

## Appendix B: Troubleshooting

### Agent won't connect

1. Check server URL in agent config
2. Verify server is running
3. Check firewall allows WebSocket connections
4. Check server logs for auth errors

### Screenshots not appearing

1. Verify agent is connected (check dashboard)
2. Check agent logs for capture errors
3. Verify storage permissions

### Real-time updates not working

1. Check WebSocket connection in browser DevTools
2. Verify Socket.IO server is running
3. Check CORS configuration

### Database connection issues

1. Verify `DATABASE_URL` format
2. Check SSL mode (`?sslmode=require` for Neon)
3. Run `npx prisma db push` to sync schema

---

## Appendix C: Contributing

### Code Style

- TypeScript strict mode
- ESLint configuration
- Prettier for formatting

### Pull Request Process

1. Create feature branch
2. Make changes
3. Run tests
4. Submit PR with description

### Commit Message Format

```
type(scope): description

- type: feat, fix, docs, style, refactor, test, chore
- scope: api, agent, dashboard, etc.
```

---

---

## Appendix D: Production Deployment Checklist

### Environment Variables for Vercel Production

```env
# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"

# Authentication (GENERATE NEW FOR PRODUCTION)
AUTH_SECRET="<generate with: openssl rand -base64 32>"
AUTH_URL="https://your-domain.com"
NEXTAUTH_URL="https://your-domain.com"

# Encryption Key (EXACTLY 32 characters)
ENCRYPTION_KEY="<generate with: openssl rand -base64 24 | cut -c1-32>"

# SMTP Configuration (for password reset emails)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"  # Use Gmail App Password, not regular password
SMTP_FROM="NetWatch Pro <noreply@your-domain.com>"

# Socket.IO URL (same as your production URL)
NEXT_PUBLIC_SOCKET_URL="https://your-domain.com"

# Error Tracking (Sentry)
SENTRY_DSN="https://xxx@xxx.ingest.sentry.io/xxx"
NEXT_PUBLIC_SENTRY_DSN="https://xxx@xxx.ingest.sentry.io/xxx"

# Cron Jobs (for scheduled tasks)
CRON_SECRET="<generate with: openssl rand -base64 32>"
```

### Vercel Configuration

1. **Framework Preset**: Next.js
2. **Build Command**: `prisma generate && next build`
3. **Output Directory**: `.next`
4. **Install Command**: `npm install`

### Production Database Setup

```bash
# After setting DATABASE_URL in Vercel:
# 1. Push schema to production database
npx prisma db push

# 2. (Optional) Run production seed for initial admin
npx prisma db seed -- --environment production
```

### SMTP Setup for Gmail

1. Enable 2-Step Verification on Gmail
2. Generate App Password: Google Account → Security → App Passwords
3. Use the 16-character App Password as `SMTP_PASS`

### Cross-Platform Agent Builds (CI/CD)

Due to native dependencies (robotjs, node-pty), agents must be built on their target platform:

**GitHub Actions Example (`.github/workflows/agent-build.yml`):**

```yaml
name: Build Agent

on:
  push:
    tags:
      - 'v*'

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd agent && npm ci
      - run: cd agent && npm run package:win
      - uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: agent/release/*.exe

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd agent && npm ci
      - run: cd agent && npm run package:linux
      - uses: actions/upload-artifact@v4
        with:
          name: linux-installer
          path: agent/release/*.AppImage

  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd agent && npm ci
      - run: cd agent && npm run package:mac
      - uses: actions/upload-artifact@v4
        with:
          name: macos-installer
          path: agent/release/*.dmg
```

### Pre-Launch Checklist

- [ ] Remove demo credentials from login page
- [ ] Generate fresh AUTH_SECRET (production)
- [ ] Generate fresh ENCRYPTION_KEY (production)
- [ ] Configure SMTP for email notifications
- [ ] Set up Sentry for error tracking
- [ ] Test first-time setup flow
- [ ] Build agents for all target platforms
- [ ] Test agent connectivity to production server
- [ ] Configure data retention policies
- [ ] Review and test all monitoring features
- [ ] Set up scheduled reports cron job
- [ ] Configure backup strategy for database

---

**Document Version History:**

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Dec 2024 | Initial release |
| 1.1.0 | Jan 2025 | Added production deployment guide, CI/CD for agents |

---

*This document is maintained by the NetWatch development team. For questions or updates, please contact the development team or submit an issue on GitHub.*
