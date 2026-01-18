# NetWatch Pro - User Manual

**Version:** 1.0.0
**Last Updated:** January 2025
**Product:** NetWatch Pro - Employee Monitoring Solution

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [Dashboard Overview](#3-dashboard-overview)
4. [Computer Management](#4-computer-management)
5. [Real-Time Monitoring](#5-real-time-monitoring)
6. [Screenshots & Recordings](#6-screenshots--recordings)
7. [Activity Tracking](#7-activity-tracking)
8. [Keylogger & Clipboard](#8-keylogger--clipboard)
9. [Remote Control](#9-remote-control)
10. [Policies & Blocking](#10-policies--blocking)
11. [Alerts & Notifications](#11-alerts--notifications)
12. [Reports & Analytics](#12-reports--analytics)
13. [User Management](#13-user-management)
14. [Settings & Configuration](#14-settings--configuration)
15. [Agent Installation](#15-agent-installation)
16. [Troubleshooting](#16-troubleshooting)
17. [FAQ](#17-faq)

---

## 1. Introduction

### What is NetWatch Pro?

NetWatch Pro is a comprehensive employee monitoring and remote management solution designed for organizations to:

- **Monitor employee productivity** - Track application usage, websites visited, and time spent on tasks
- **Capture visual evidence** - Automatic screenshots and screen recordings
- **Ensure security compliance** - Monitor sensitive data access and enforce policies
- **Remote management** - Control, lock, and manage computers remotely
- **Generate insights** - Detailed reports on productivity and usage patterns

### Key Features

| Feature | Description |
|---------|-------------|
| **Live Monitoring** | Real-time view of employee screens |
| **Screenshot Capture** | Automatic periodic screenshots |
| **Screen Recording** | Full video recording capability |
| **Activity Tracking** | Application and website usage logs |
| **Keystroke Logging** | Encrypted keystroke capture |
| **Clipboard Monitoring** | Track copy/paste activities |
| **Remote Desktop** | View and control computers remotely |
| **Remote Shell** | Command-line access to computers |
| **File Transfer** | Upload/download files remotely |
| **Website Blocking** | Block access to specified websites |
| **Application Blocking** | Prevent certain apps from running |
| **Instant Messaging** | Send messages to employee screens |
| **Productivity Reports** | Detailed analytics and reports |
| **Multi-tenant** | Isolated data per organization |

### User Roles

| Role | Capabilities |
|------|--------------|
| **Admin** | Full access - manage users, settings, all features |
| **Manager** | Monitor, control, manage policies (no user management) |
| **Viewer** | View-only access to dashboard and reports |

---

## 2. Getting Started

### First-Time Setup

When you access NetWatch Pro for the first time, you'll be guided through the setup wizard:

1. **Create Organization** - Enter your company name
2. **Create Admin Account** - Set up your administrator credentials
3. **Configure Settings** - Basic monitoring preferences

### Logging In

1. Navigate to your NetWatch Pro URL
2. Enter your email and password
3. If 2FA is enabled, enter the 6-digit code from your authenticator app
4. Click **Sign In**

### Dashboard First Look

After logging in, you'll see the main dashboard with:

- **Summary Cards** - Online computers, alerts, activity statistics
- **Activity Chart** - Productivity trends over time
- **Recent Activity** - Latest actions across your organization
- **Quick Actions** - Shortcuts to common tasks

---

## 3. Dashboard Overview

### Navigation Sidebar

The left sidebar provides access to all features:

```
├── Dashboard        - Overview and statistics
├── Computers        - Manage monitored computers
├── Monitoring       - Real-time screen viewing
├── Screenshots      - View captured screenshots
├── Recordings       - Screen recordings
├── Alerts           - Alerts and notifications
├── Policies         - Website/app blocking rules
├── Processes        - Running processes
├── Clipboard        - Clipboard history
├── Keylogger        - Keystroke logs
├── Firewall         - Network rules
├── Remote           - Remote desktop access
├── Control          - Remote terminal access
├── Messaging        - Send messages to computers
├── Reports          - Generate reports
│   ├── Productivity
│   ├── Applications
│   ├── Websites
│   └── System Info
└── Settings         - Configuration
    └── Users        - User management
```

### Header Bar

- **Search** - Quick search across computers and data
- **Notifications** - Real-time alert notifications
- **User Menu** - Profile, settings, logout

### Status Indicators

| Status | Icon | Description |
|--------|------|-------------|
| **Online** | 🟢 | Computer connected and active |
| **Offline** | 🔴 | Computer disconnected |
| **Idle** | 🟡 | Computer connected but no activity |
| **Locked** | 🔒 | Computer locked by admin |

---

## 4. Computer Management

### Viewing Computers

Navigate to **Computers** to see all monitored endpoints:

- **Grid View** - Visual cards with status
- **List View** - Detailed table format
- **Filter by Group** - Show specific departments
- **Filter by Status** - Online/Offline/All
- **Search** - Find by name or hostname

### Adding Computers

#### Method 1: Manual Entry
1. Click **Add Computer**
2. Select **Manual Entry** tab
3. Fill in details:
   - **Name** - Display name (e.g., "John's Workstation")
   - **Hostname** - Computer hostname
   - **IP Address** - Optional
   - **OS Type** - Windows/macOS/Linux
   - **Group** - Assign to department
4. Click **Add Computer**

#### Method 2: Network Discovery
1. Click **Add Computer**
2. Select **Network Discovery** tab
3. Click **Scan Network**
4. Review discovered devices
5. Click **Test Connection** on desired device
6. Click **Add** for connectable devices

### Computer Groups

Organize computers by department or function:

1. Go to **Computers** → **Groups**
2. Click **Add Group**
3. Enter name and select color
4. Assign computers to the group

### Computer Details

Click on any computer to view:

- **System Information** - OS, IP, MAC address
- **Resource Usage** - CPU, memory, disk
- **Activity Summary** - Recent applications and websites
- **Quick Actions** - Lock, message, remote control

---

## 5. Real-Time Monitoring

### Monitoring Grid

Navigate to **Monitoring** to see live thumbnails of all online computers:

- Thumbnails update every 5 seconds
- Click any thumbnail to expand
- Status badges show connection state

### Single Computer View

Click a computer to enter focused monitoring mode:

- **Live Screen** - Full-size real-time view
- **Activity Stats** - Current application, idle time
- **System Stats** - CPU, memory usage
- **Quick Actions** - Lock, message, screenshot

### Watch Mode

Enable Watch Mode for priority computers:

1. Click the **Eye** icon on a computer
2. Computer moves to priority section
3. Higher refresh rate and instant alerts

---

## 6. Screenshots & Recordings

### Viewing Screenshots

Navigate to **Screenshots**:

1. Select computer or view all
2. Filter by date range
3. Click thumbnail to enlarge
4. Use arrow keys to navigate

### Screenshot Settings

Configure automatic capture:

1. Go to **Settings**
2. Find **Screenshot Interval**
3. Set interval (e.g., 5 minutes)
4. Save changes

### Screen Recordings

Navigate to **Recordings**:

1. View recorded sessions
2. Filter by computer/date
3. Click to play in browser
4. Download for offline viewing

### Starting a Recording

1. Go to computer details or monitoring view
2. Click **Start Recording**
3. Recording continues until stopped
4. View in Recordings section

---

## 7. Activity Tracking

### Activity Logs

Navigate to **Dashboard** or **Computer Details** for activity:

- **Applications Used** - List with time spent
- **Window Titles** - Detailed activity context
- **Categories** - Productive, neutral, unproductive
- **Timeline** - Hour-by-hour breakdown

### Website Tracking

View websites visited:

1. Go to **Reports** → **Websites**
2. Select computer and date range
3. View:
   - Most visited sites
   - Time per site
   - Category breakdown
   - Blocked attempts

### Application Tracking

View application usage:

1. Go to **Reports** → **Applications**
2. Select computer and date range
3. View:
   - Top applications by time
   - Usage trends
   - Category distribution

### Productivity Categories

Activities are categorized as:

| Category | Examples | Color |
|----------|----------|-------|
| **Productive** | IDE, Office apps, Work tools | Green |
| **Neutral** | Browsers, File managers | Blue |
| **Unproductive** | Social media, Games | Red |

---

## 8. Keylogger & Clipboard

### Keystroke Logs

Navigate to **Keylogger**:

1. Select computer
2. Set date range
3. View logs grouped by application
4. Search for specific text
5. Export if needed

**Privacy Note:** Keystroke data is encrypted in storage and should be used responsibly and in compliance with local laws and company policies.

### Clipboard Monitoring

Navigate to **Clipboard**:

1. Select computer
2. View clipboard history
3. Types captured:
   - Text content
   - File paths
   - Image references
4. Filter by content type

---

## 9. Remote Control

### Remote Desktop (View Mode)

Watch an employee's screen in real-time:

1. Go to **Remote** or computer details
2. Click **View Screen**
3. Live feed appears
4. Close when done

### Remote Desktop (Control Mode)

Take control of a computer:

1. Go to **Remote**
2. Select computer
3. Click **Take Control**
4. Use your mouse and keyboard
5. The employee sees your actions
6. Click **End Session** when done

### Remote Terminal

Access command line:

1. Go to **Control**
2. Select computer
3. Terminal opens with shell access
4. Type commands as if local
5. Supports:
   - Windows: CMD, PowerShell
   - macOS/Linux: Bash, Zsh

### File Transfer

Upload or download files:

1. Go to computer details
2. Click **File Transfer**
3. Choose direction:
   - **Upload** - Send file to computer
   - **Download** - Retrieve file from computer
4. Select file and destination
5. Monitor progress

---

## 10. Policies & Blocking

### Website Blocking

Create rules to block websites:

1. Go to **Policies**
2. Click **Add Rule**
3. Configure:
   - **Type**: Website
   - **Pattern**: URL pattern (e.g., `*.facebook.com`)
   - **Action**: Block, Warn, or Log
   - **Groups**: Apply to specific groups or all
4. Save rule

**Pattern Examples:**
- `*.facebook.com` - Block all Facebook
- `youtube.com` - Block YouTube
- `*.gambling.com` - Block gambling sites

### Application Blocking

Block specific applications:

1. Go to **Policies**
2. Click **Add Rule**
3. Configure:
   - **Type**: Application
   - **Pattern**: App name (e.g., `Steam`)
   - **Action**: Block, Warn, or Log
4. Save rule

### Quick Rules

Enable preset blocking categories:

1. Go to **Policies**
2. Enable quick toggles:
   - **Social Media** - Facebook, Twitter, Instagram
   - **Gaming** - Steam, gaming sites
   - **Streaming** - Netflix, YouTube, Twitch
   - **Shopping** - Amazon, eBay

### Actions Explained

| Action | Behavior |
|--------|----------|
| **Block** | Prevents access, shows blocked message |
| **Warn** | Shows warning, allows continue |
| **Log** | Silently logs for reporting |

---

## 11. Alerts & Notifications

### Alert Types

| Alert Type | Trigger |
|------------|---------|
| **Policy Violation** | Blocked site/app accessed |
| **Idle** | No activity for configured time |
| **Offline** | Computer disconnected |
| **Suspicious** | Unusual activity detected |
| **Command Executed** | Remote action performed |

### Viewing Alerts

Navigate to **Alerts**:

1. View all alerts chronologically
2. Filter by type or computer
3. Mark as read
4. Click for details

### Alert Rules

Configure custom alert triggers:

1. Go to **Settings** → **Alert Rules**
2. Click **Add Rule**
3. Configure:
   - **Type** - What to monitor
   - **Condition** - When to alert
   - **Severity** - Low/Medium/High/Critical
   - **Actions** - Email, notification

### Email Notifications

Receive alerts via email:

1. Configure SMTP in settings
2. Create alert rule with email action
3. Add recipient email addresses

---

## 12. Reports & Analytics

### Productivity Report

Navigate to **Reports** → **Productivity**:

1. Select date range
2. Select computers/groups
3. View:
   - Productivity score
   - Time breakdown by category
   - Trends over time
   - Top activities

### Application Report

Navigate to **Reports** → **Applications**:

- Top applications by usage
- Time per application
- Category distribution
- User comparison

### Website Report

Navigate to **Reports** → **Websites**:

- Most visited websites
- Time per website
- Category breakdown
- Blocked attempts

### System Info Report

Navigate to **Reports** → **System Info**:

- Hardware specifications
- Software inventory
- Resource usage trends

### Exporting Reports

1. Generate desired report
2. Click **Export**
3. Choose format:
   - **PDF** - Formatted document
   - **CSV** - Spreadsheet data
   - **Excel** - Full workbook

### Scheduled Reports

Automate report delivery:

1. Go to **Settings** → **Scheduled Reports**
2. Click **Add Schedule**
3. Configure:
   - Report type
   - Frequency (daily/weekly/monthly)
   - Recipients
   - Format
4. Save schedule

---

## 13. User Management

### Viewing Users

Go to **Settings** → **Users**:

- List all organization users
- View roles and status
- Last login time

### Adding Users

1. Click **Add User**
2. Enter details:
   - Email address
   - Name
   - Role (Admin/Manager/Viewer)
3. User receives invitation email
4. They set their password

### Editing Users

1. Click user row
2. Edit name or role
3. Save changes

### Removing Users

1. Click user row
2. Click **Delete**
3. Confirm deletion

### Two-Factor Authentication

Enable 2FA for added security:

1. Go to **Settings** (user profile)
2. Click **Enable 2FA**
3. Scan QR code with authenticator app
4. Enter verification code
5. Save backup codes safely

---

## 14. Settings & Configuration

### General Settings

Navigate to **Settings**:

| Setting | Description |
|---------|-------------|
| **Screenshot Interval** | How often to capture (seconds) |
| **Idle Timeout** | Time before marking idle |
| **Data Retention** | Days to keep data |
| **Enable Recordings** | Toggle screen recording |
| **Notify Offline** | Alert when computer disconnects |

### Data Retention

Configure how long data is stored:

1. Go to **Settings**
2. Set retention periods:
   - Screenshots: 30 days
   - Recordings: 14 days
   - Activity logs: 90 days
   - Keylogs: 30 days
3. Old data is automatically deleted

### Email Configuration

For password reset and alert emails:

1. Go to **Settings**
2. Configure SMTP:
   - Host (e.g., smtp.gmail.com)
   - Port (e.g., 587)
   - Username
   - Password
   - From address

### Organization Settings

1. Organization name
2. Timezone
3. Date format preferences

---

## 15. Agent Installation

### System Requirements

| Platform | Minimum Requirements |
|----------|---------------------|
| **Windows** | Windows 10/11, 4GB RAM |
| **macOS** | macOS 10.15+, 4GB RAM |
| **Linux** | Ubuntu 20.04+, 4GB RAM |

### Installing on Windows

1. Download `NetWatch-Agent-x.x.x-win.exe`
2. Run as Administrator
3. Accept license agreement
4. Enter server URL when prompted
5. Set admin password (for uninstall protection)
6. Agent starts automatically

### Installing on macOS

1. Download `NetWatch-Agent-x.x.x-mac.dmg`
2. Open DMG file
3. Drag to Applications
4. Launch from Applications
5. Grant required permissions:
   - Screen Recording
   - Accessibility
   - Full Disk Access (optional)
6. Enter server URL
7. Agent runs in menu bar

### Installing on Linux

1. Download `NetWatch-Agent-x.x.x-linux.AppImage`
2. Make executable: `chmod +x NetWatch-Agent*.AppImage`
3. Run: `./NetWatch-Agent*.AppImage`
4. Enter server URL
5. Agent runs in system tray

### Agent Configuration

The agent can be pre-configured with a `config.json` file:

```json
{
  "serverUrl": "https://your-netwatch-server.com",
  "autoStart": true,
  "screenshotInterval": 5000,
  "activityLogInterval": 10000
}
```

Place this file:
- Windows: `%APPDATA%/NetWatch Agent/config.json`
- macOS: `~/Library/Application Support/NetWatch Agent/config.json`
- Linux: `~/.config/NetWatch Agent/config.json`

### Verifying Connection

After installation:

1. Look for tray icon (green = connected)
2. Check NetWatch dashboard for the computer
3. Status should show "Online"

---

## 16. Troubleshooting

### Agent Won't Connect

**Symptoms:** Agent shows "Disconnected" or "Connecting..."

**Solutions:**
1. Verify server URL is correct
2. Check internet connection
3. Ensure firewall allows outbound WebSocket (port 443)
4. Restart the agent
5. Check server status

### Screenshots Not Appearing

**Symptoms:** Computer online but no new screenshots

**Solutions:**
1. Verify screenshot interval in settings
2. Check agent has screen recording permission (macOS)
3. Restart agent
4. Check agent logs for errors

### Slow Real-Time Updates

**Symptoms:** Live monitoring has lag

**Solutions:**
1. Check network connection
2. Reduce video quality in settings
3. Close other bandwidth-heavy applications
4. Check server resources

### Agent Not Auto-Starting

**Symptoms:** Agent doesn't start on boot

**Solutions:**
1. Verify auto-start is enabled in agent settings
2. Check Windows Startup folder / macOS Login Items
3. Reinstall agent with auto-start enabled

### Cannot Remote Control

**Symptoms:** Remote desktop shows blank or doesn't respond

**Solutions:**
1. Ensure computer is online
2. Check agent has required permissions
3. Verify WebSocket connection is active
4. Try refreshing the page

### Email Notifications Not Working

**Symptoms:** No emails received for alerts

**Solutions:**
1. Verify SMTP settings
2. Check spam folder
3. Test with "Send Test Email" button
4. Verify recipient email addresses

---

## 17. FAQ

### General Questions

**Q: Is employee consent required?**
A: Yes, in most jurisdictions employees must be informed that monitoring is in place. Consult your legal team and comply with local regulations.

**Q: Can employees see they're being monitored?**
A: The agent icon appears in the system tray. It can be configured for visible or stealth mode depending on your policy.

**Q: How much storage does monitoring use?**
A: Approximately 50-100MB per computer per day, depending on screenshot frequency and recording usage.

**Q: Is the data encrypted?**
A: Yes, sensitive data (keystrokes, 2FA secrets) is encrypted with AES-256. All communication uses HTTPS/WSS.

### Technical Questions

**Q: What ports need to be open?**
A: Outbound HTTPS (443) for web dashboard and WebSocket connections.

**Q: Does it work through VPN?**
A: Yes, as long as the agent can reach the server URL.

**Q: Can I monitor multiple organizations?**
A: NetWatch Pro is multi-tenant. Each organization has completely isolated data.

**Q: What happens if the agent loses connection?**
A: Data is cached locally and synced when connection is restored.

### Privacy Questions

**Q: Who can access monitoring data?**
A: Only users within your organization with appropriate roles (Admin, Manager, Viewer).

**Q: How long is data retained?**
A: Configurable from 7 to 90 days. Adjust in Settings.

**Q: Can data be exported?**
A: Yes, reports can be exported as PDF, CSV, or Excel.

---

## Support

For technical support:

- **Documentation**: Check this manual and the Developer Guide
- **Email**: support@your-company.com
- **Website**: https://your-netwatch-site.com/help

---

## Legal Notice

NetWatch Pro is intended for legitimate employee monitoring within legal boundaries. Users are responsible for:

- Obtaining proper consent from employees
- Complying with local privacy laws (GDPR, CCPA, etc.)
- Using data responsibly and ethically
- Implementing appropriate data security measures

Always consult legal counsel before deploying monitoring software.

---

**Document Version History:**

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Jan 2025 | Initial release |

---

*NetWatch Pro - Employee Monitoring Solution*
*Copyright 2024-2025 Infinititech Partners. All rights reserved.*
