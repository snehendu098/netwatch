import nodemailer from "nodemailer";

// Email configuration
const emailConfig = {
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
};

// Create transporter
const transporter = nodemailer.createTransport(emailConfig);

// Email templates
const templates = {
  alert: (data: {
    alertType: string;
    computerName: string;
    message: string;
    severity: string;
    timestamp: string;
  }) => ({
    subject: `[NetWatch Alert] ${data.severity.toUpperCase()}: ${data.alertType} - ${data.computerName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1e293b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
          .alert-box { background: white; border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 4px solid ${
            data.severity === "HIGH" ? "#ef4444" : data.severity === "MEDIUM" ? "#f59e0b" : "#3b82f6"
          }; }
          .footer { background: #1e293b; color: #94a3b8; padding: 16px; border-radius: 0 0 8px 8px; font-size: 12px; }
          .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 16px; }
          .severity { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; color: white; background: ${
            data.severity === "HIGH" ? "#ef4444" : data.severity === "MEDIUM" ? "#f59e0b" : "#3b82f6"
          }; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>NetWatch Alert</h1>
          </div>
          <div class="content">
            <p>A new alert has been triggered in your NetWatch monitoring system:</p>
            <div class="alert-box">
              <p><strong>Type:</strong> ${data.alertType}</p>
              <p><strong>Computer:</strong> ${data.computerName}</p>
              <p><strong>Severity:</strong> <span class="severity">${data.severity}</span></p>
              <p><strong>Message:</strong> ${data.message}</p>
              <p><strong>Time:</strong> ${data.timestamp}</p>
            </div>
            <a href="${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard/alerts" class="btn">View in Dashboard</a>
          </div>
          <div class="footer">
            <p>This is an automated message from NetWatch Pro.</p>
            <p>To manage your notification preferences, visit your settings page.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
NetWatch Alert

Type: ${data.alertType}
Computer: ${data.computerName}
Severity: ${data.severity}
Message: ${data.message}
Time: ${data.timestamp}

View in Dashboard: ${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard/alerts
    `,
  }),

  dailyReport: (data: {
    organizationName: string;
    date: string;
    stats: {
      totalComputers: number;
      onlineComputers: number;
      totalAlerts: number;
      productivityScore: number;
      topApps: Array<{ name: string; hours: number }>;
    };
  }) => ({
    subject: `[NetWatch] Daily Report - ${data.date}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1e293b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
          .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
          .stat-box { background: white; padding: 16px; border-radius: 8px; text-align: center; }
          .stat-value { font-size: 32px; font-weight: bold; color: #1e293b; }
          .stat-label { font-size: 12px; color: #64748b; }
          .footer { background: #1e293b; color: #94a3b8; padding: 16px; border-radius: 0 0 8px 8px; font-size: 12px; }
          .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; }
          table { width: 100%; border-collapse: collapse; margin: 16px 0; }
          th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e2e8f0; }
          th { background: #f1f5f9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Daily Report - ${data.organizationName}</h1>
            <p style="margin: 0; opacity: 0.8;">${data.date}</p>
          </div>
          <div class="content">
            <div class="stat-grid">
              <div class="stat-box">
                <div class="stat-value">${data.stats.onlineComputers}/${data.stats.totalComputers}</div>
                <div class="stat-label">Computers Online</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${data.stats.productivityScore}%</div>
                <div class="stat-label">Productivity Score</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${data.stats.totalAlerts}</div>
                <div class="stat-label">Alerts Today</div>
              </div>
            </div>

            <h3>Top Applications</h3>
            <table>
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                ${data.stats.topApps
                  .map(
                    (app) => `
                  <tr>
                    <td>${app.name}</td>
                    <td>${app.hours.toFixed(1)}h</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>

            <p style="text-align: center;">
              <a href="${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard" class="btn">View Full Report</a>
            </p>
          </div>
          <div class="footer">
            <p>This is an automated daily report from NetWatch Pro.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Daily Report - ${data.organizationName}
${data.date}

Computers Online: ${data.stats.onlineComputers}/${data.stats.totalComputers}
Productivity Score: ${data.stats.productivityScore}%
Alerts Today: ${data.stats.totalAlerts}

Top Applications:
${data.stats.topApps.map((app) => `- ${app.name}: ${app.hours.toFixed(1)}h`).join("\n")}

View Full Report: ${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard
    `,
  }),

  weeklyDigest: (data: {
    organizationName: string;
    weekRange: string;
    summary: {
      avgProductivity: number;
      productivityChange: number;
      totalActiveHours: number;
      alertsCount: number;
      topProductiveComputers: Array<{ name: string; score: number }>;
    };
  }) => ({
    subject: `[NetWatch] Weekly Digest - ${data.weekRange}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1e293b 0%, #3b82f6 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
          .highlight { background: white; padding: 20px; border-radius: 8px; margin: 16px 0; text-align: center; }
          .big-number { font-size: 48px; font-weight: bold; color: #3b82f6; }
          .change { font-size: 14px; padding: 4px 8px; border-radius: 4px; }
          .change.positive { background: #dcfce7; color: #16a34a; }
          .change.negative { background: #fee2e2; color: #dc2626; }
          .footer { background: #1e293b; color: #94a3b8; padding: 16px; border-radius: 0 0 8px 8px; font-size: 12px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Weekly Digest</h1>
            <p>${data.organizationName} • ${data.weekRange}</p>
          </div>
          <div class="content">
            <div class="highlight">
              <div class="big-number">${data.summary.avgProductivity}%</div>
              <p>Average Productivity Score</p>
              <span class="change ${data.summary.productivityChange >= 0 ? "positive" : "negative"}">
                ${data.summary.productivityChange >= 0 ? "+" : ""}${data.summary.productivityChange}% from last week
              </span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div class="highlight">
                <div style="font-size: 28px; font-weight: bold;">${data.summary.totalActiveHours}h</div>
                <p style="margin: 0; color: #64748b;">Total Active Hours</p>
              </div>
              <div class="highlight">
                <div style="font-size: 28px; font-weight: bold;">${data.summary.alertsCount}</div>
                <p style="margin: 0; color: #64748b;">Alerts This Week</p>
              </div>
            </div>

            <h3>Top Performing Computers</h3>
            ${data.summary.topProductiveComputers
              .map(
                (c, i) => `
              <div style="background: white; padding: 12px; margin: 8px 0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                <span><strong>#${i + 1}</strong> ${c.name}</span>
                <span style="font-weight: bold; color: #3b82f6;">${c.score}%</span>
              </div>
            `
              )
              .join("")}
          </div>
          <div class="footer">
            <p>NetWatch Pro Weekly Digest</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Weekly Digest - ${data.organizationName}
${data.weekRange}

Average Productivity Score: ${data.summary.avgProductivity}%
Change from last week: ${data.summary.productivityChange >= 0 ? "+" : ""}${data.summary.productivityChange}%
Total Active Hours: ${data.summary.totalActiveHours}h
Alerts This Week: ${data.summary.alertsCount}

Top Performing Computers:
${data.summary.topProductiveComputers.map((c, i) => `${i + 1}. ${c.name}: ${c.score}%`).join("\n")}
    `,
  }),
};

// Email service class
export class EmailService {
  private static instance: EmailService;

  private constructor() {}

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  async sendEmail(to: string | string[], subject: string, html: string, text?: string): Promise<boolean> {
    // Check if email is configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn("Email not configured. Skipping email send.");
      return false;
    }

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || `"NetWatch Pro" <${process.env.SMTP_USER}>`,
        to: Array.isArray(to) ? to.join(", ") : to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ""),
      });

      console.log(`Email sent to ${to}: ${subject}`);
      return true;
    } catch (error) {
      console.error("Failed to send email:", error);
      return false;
    }
  }

  async sendAlertNotification(
    to: string | string[],
    data: {
      alertType: string;
      computerName: string;
      message: string;
      severity: string;
      timestamp: string;
    }
  ): Promise<boolean> {
    const template = templates.alert(data);
    return this.sendEmail(to, template.subject, template.html, template.text);
  }

  async sendDailyReport(
    to: string | string[],
    data: {
      organizationName: string;
      date: string;
      stats: {
        totalComputers: number;
        onlineComputers: number;
        totalAlerts: number;
        productivityScore: number;
        topApps: Array<{ name: string; hours: number }>;
      };
    }
  ): Promise<boolean> {
    const template = templates.dailyReport(data);
    return this.sendEmail(to, template.subject, template.html, template.text);
  }

  async sendWeeklyDigest(
    to: string | string[],
    data: {
      organizationName: string;
      weekRange: string;
      summary: {
        avgProductivity: number;
        productivityChange: number;
        totalActiveHours: number;
        alertsCount: number;
        topProductiveComputers: Array<{ name: string; score: number }>;
      };
    }
  ): Promise<boolean> {
    const template = templates.weeklyDigest(data);
    return this.sendEmail(to, template.subject, template.html, template.text);
  }

  async verifyConnection(): Promise<boolean> {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return false;
    }

    try {
      await transporter.verify();
      return true;
    } catch (error) {
      console.error("Email connection verification failed:", error);
      return false;
    }
  }
}

// Export singleton instance
export const emailService = EmailService.getInstance();
