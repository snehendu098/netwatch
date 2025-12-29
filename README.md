# NetWatch Pro

A comprehensive employee monitoring solution with real-time screen monitoring, activity tracking, and remote management capabilities.

## Features

### Dashboard
- **Real-time Monitoring** - Live view of all connected computers with screen thumbnails
- **Screenshots** - Automatic and on-demand screenshot capture with full-screen viewer
- **Screen Recording** - Record screen activity with playback support
- **Activity Tracking** - Track application usage, websites visited, and idle time
- **Keylogger** - Encrypted keystroke logging with search and export
- **Clipboard Monitoring** - Track clipboard content changes
- **Process Monitoring** - View running processes on remote computers

### Remote Management
- **Remote Desktop** - View and control remote computers in real-time
- **Terminal Access** - SSH-like terminal access to remote machines
- **File Transfer** - Upload and download files to/from remote computers
- **Commands** - Send commands (lock, shutdown, restart, message)
- **Firewall Management** - Configure firewall rules per computer

### Policies & Blocking
- **Website Blocking** - Block access to websites by URL patterns
- **Application Blocking** - Prevent specific applications from running
- **Quick Rules** - One-click blocking for social media, gaming, streaming sites

### Reporting & Alerts
- **Activity Reports** - Generate detailed activity reports (PDF, CSV, XLSX)
- **Productivity Analytics** - Track productive vs unproductive time
- **Real-time Alerts** - Get notified of policy violations and suspicious activity
- **Audit Logging** - Complete audit trail for compliance

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL (production), SQLite (development)
- **Real-time**: Socket.io
- **Agent**: Electron 28 (Windows, macOS, Linux)
- **Authentication**: NextAuth.js v5

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (or use SQLite for development)
- npm or yarn

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/your-org/netwatch.git
cd netwatch
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env` and configure:
- `DATABASE_URL` - Your PostgreSQL connection string
- `AUTH_SECRET` - Generate with `openssl rand -base64 32`
- `NEXT_PUBLIC_SOCKET_URL` - URL of your Socket.io server
- `ENCRYPTION_KEY` - 32-character key for data encryption

4. **Initialize the database**
```bash
npx prisma db push
npx prisma db seed
```

5. **Start the development server**
```bash
npm run dev
```

6. **Access the dashboard**
Open [http://localhost:3000](http://localhost:3000)

### Default Credentials
- Email: `admin@example.com`
- Password: `admin123`

(Change these immediately in production!)

## Agent Installation

### Building the Agent

```bash
cd agent
npm install
npm run build
```

### Packaging for Distribution

```bash
# Windows
npm run package:win

# macOS
npm run package:mac

# Linux
npm run package:linux
```

### Agent Configuration

On first run, the agent will prompt for:
1. **Server URL** - The URL of your NetWatch dashboard
2. **Admin Password** - Password required to exit or reconfigure the agent

Alternatively, create a `config.json`:
```json
{
  "serverUrl": "https://your-netwatch-server.com",
  "autoStart": true,
  "screenshotInterval": 5000,
  "activityLogInterval": 10000
}
```

## Deployment

### Using Docker

```bash
docker build -t netwatch .
docker run -p 3000:3000 --env-file .env netwatch
```

### Using Railway/Render/Vercel

1. Connect your repository
2. Set environment variables
3. Deploy

### Socket.io Server

For production, deploy the Socket.io server separately:

```bash
cd socket-server
npm install
npm start
```

Set `NEXT_PUBLIC_SOCKET_URL` to your Socket.io server URL.

## API Documentation

See [docs/API.md](docs/API.md) for complete API documentation.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `AUTH_SECRET` | NextAuth secret key | Yes |
| `AUTH_URL` | Application URL | Yes |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.io server URL | Yes |
| `ENCRYPTION_KEY` | 32-char encryption key | Yes |
| `SMTP_HOST` | SMTP server host | No |
| `SMTP_PORT` | SMTP server port | No |
| `SMTP_USER` | SMTP username | No |
| `SMTP_PASS` | SMTP password | No |
| `SENTRY_DSN` | Sentry error tracking DSN | No |
| `CRON_SECRET` | Secret for cron job auth | No |

## Data Retention

Data is automatically cleaned up based on configurable retention periods:

| Data Type | Default Retention |
|-----------|------------------|
| Activity Logs | 90 days |
| Screenshots | 30 days |
| Recordings | 14 days |
| Keylogs | 30 days |
| Clipboard Logs | 14 days |
| Process Logs | 7 days |

Configure via Settings > Data Retention or trigger manually via API.

## Security Considerations

- All keylog data is encrypted at rest using AES-256-GCM
- Passwords are hashed using PBKDF2 with random salts
- API routes are rate-limited to prevent abuse
- Session-based authentication with secure cookies
- Role-based access control (Admin, Manager, Viewer)

## Scripts

```bash
# Development
npm run dev          # Start development server

# Production
npm run build        # Build for production
npm start            # Start production server

# Database
npm run db:seed      # Seed database with sample data
npm run db:reset     # Reset and reseed database

# Agent
cd agent && npm run build    # Build agent
cd agent && npm run package  # Package for distribution
```

## Project Structure

```
netwatch/
├── src/
│   ├── app/              # Next.js pages and API routes
│   ├── components/       # React components
│   ├── lib/              # Utility functions and configs
│   └── hooks/            # Custom React hooks
├── agent/
│   └── src/
│       ├── main.ts       # Electron main process
│       └── services/     # Agent monitoring services
├── socket-server/        # Standalone Socket.io server
├── prisma/
│   └── schema.prisma     # Database schema
└── docs/                 # Documentation
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary software. All rights reserved.

## Support

For support, please open an issue on GitHub or contact support@netwatch.io
