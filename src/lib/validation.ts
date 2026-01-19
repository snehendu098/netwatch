import { z } from "zod";

// Common validation patterns
const emailSchema = z.string().email("Invalid email address");
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const idSchema = z.string().min(1, "ID is required").max(100);
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// User schemas
export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1, "Name is required").max(100),
  role: z.enum(["ADMIN", "MANAGER", "VIEWER"]).default("VIEWER"),
});

export const updateUserSchema = z.object({
  id: idSchema,
  email: emailSchema.optional(),
  name: z.string().min(1).max(100).optional(),
  role: z.enum(["ADMIN", "MANAGER", "VIEWER"]).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
  twoFactorToken: z.string().length(6).optional(),
});

// Computer schemas
export const createComputerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  hostname: z.string().min(1, "Hostname is required").max(255),
  ipAddress: z
    .string()
    .regex(/^(\d{1,3}\.){3}\d{1,3}$/, "Invalid IP address")
    .optional()
    .nullable(),
  macAddress: z
    .string()
    .regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, "Invalid MAC address")
    .optional()
    .nullable(),
  osType: z.enum(["windows", "macos", "linux"]).default("windows"),
  osVersion: z.string().max(100).optional().nullable(),
  groupId: idSchema.optional().nullable(),
});

export const updateComputerSchema = createComputerSchema.partial().extend({
  id: idSchema,
});

// Group schemas
export const createGroupSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format")
    .default("#3B82F6"),
});

export const updateGroupSchema = createGroupSchema.partial().extend({
  id: idSchema,
});

// Policy/Block Rule schemas
export const createPolicySchema = z.object({
  type: z.enum(["WEBSITE", "APP"]),
  pattern: z
    .string()
    .min(1, "Pattern is required")
    .max(500)
    .refine(
      (val) => {
        // Basic validation for URL patterns
        if (val.includes("*") || val.includes(".")) return true;
        return false;
      },
      { message: "Invalid pattern format" }
    ),
  action: z.enum(["BLOCK", "WARN", "LOG"]).default("BLOCK"),
  groupIds: z.array(idSchema).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updatePolicySchema = createPolicySchema.partial().extend({
  id: idSchema,
});

// Alert schemas
export const createAlertSchema = z.object({
  type: z.enum(["POLICY_VIOLATION", "IDLE", "OFFLINE", "SUSPICIOUS"]),
  message: z.string().min(1, "Message is required").max(1000),
  computerId: idSchema.optional().nullable(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
});

export const updateAlertSchema = z.object({
  id: idSchema,
  isRead: z.boolean().optional(),
});

export const bulkUpdateAlertsSchema = z.object({
  ids: z.array(idSchema).min(1, "At least one ID is required"),
  isRead: z.boolean(),
});

// Firewall Rule schemas
export const createFirewallRuleSchema = z.object({
  computerId: idSchema,
  name: z.string().min(1, "Name is required").max(100),
  direction: z.enum(["INBOUND", "OUTBOUND", "BOTH"]),
  action: z.enum(["ALLOW", "BLOCK"]),
  protocol: z.enum(["TCP", "UDP", "ICMP", "ANY"]),
  port: z
    .string()
    .regex(/^(\d+(-\d+)?|\*)$/, "Invalid port format")
    .optional()
    .nullable(),
  remoteIp: z
    .string()
    .regex(
      /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?|\*)$/,
      "Invalid IP/CIDR format"
    )
    .optional()
    .nullable(),
  application: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(1).max(1000).default(100),
});

export const updateFirewallRuleSchema = createFirewallRuleSchema.partial().extend({
  id: idSchema,
});

// Device Command schemas
export const createCommandSchema = z.object({
  computerId: idSchema,
  command: z.enum([
    "LOCK",
    "UNLOCK",
    "SHUTDOWN",
    "RESTART",
    "LOGOFF",
    "SLEEP",
    "MESSAGE",
    "EXECUTE",
  ]),
  payload: z
    .object({
      message: z.string().max(1000).optional(),
      title: z.string().max(200).optional(),
      command: z.string().max(2000).optional(),
      timeout: z.number().int().positive().max(3600).optional(),
    })
    .optional()
    .nullable(),
});

// File Transfer schemas
export const createFileTransferSchema = z.object({
  computerId: idSchema,
  direction: z.enum(["UPLOAD", "DOWNLOAD"]),
  localPath: z.string().min(1, "Local path is required").max(1000),
  remotePath: z.string().min(1, "Remote path is required").max(1000),
  fileName: z.string().min(1, "File name is required").max(255),
});

// Remote Session schemas
export const createRemoteSessionSchema = z.object({
  computerId: idSchema,
  sessionType: z.enum(["VIEW", "CONTROL", "SHELL"]),
});

// Report schemas
export const exportReportSchema = z.object({
  type: z.enum(["activity", "productivity", "screenshots", "websites", "applications"]),
  format: z.enum(["pdf", "csv", "xlsx"]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  computerIds: z.array(idSchema).optional(),
  groupIds: z.array(idSchema).optional(),
});

// Query parameter schemas
export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const computersQuerySchema = paginationSchema.extend({
  status: z.enum(["ONLINE", "OFFLINE", "IDLE"]).optional(),
  groupId: idSchema.optional(),
  search: z.string().max(100).optional(),
});

export const activityQuerySchema = paginationSchema.merge(dateRangeSchema).extend({
  computerId: idSchema.optional(),
  type: z.enum(["APP", "WEBSITE", "IDLE"]).optional(),
  category: z
    .enum([
      "DEVELOPMENT",
      "PRODUCTIVITY",
      "COMMUNICATION",
      "ENTERTAINMENT",
      "SOCIAL",
      "OTHER",
    ])
    .optional(),
});

export const screenshotsQuerySchema = paginationSchema.merge(dateRangeSchema).extend({
  computerId: idSchema.optional(),
});

export const alertsQuerySchema = paginationSchema.extend({
  type: z.enum(["POLICY_VIOLATION", "IDLE", "OFFLINE", "SUSPICIOUS"]).optional(),
  isRead: z.coerce.boolean().optional(),
  computerId: idSchema.optional(),
});

// Settings schemas
export const updateSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().max(10000),
});

// Invitation schemas
export const createInvitationSchema = z.object({
  email: emailSchema,
  role: z.enum(["ADMIN", "MANAGER", "VIEWER"]).default("VIEWER"),
});

export const acceptInvitationSchema = z.object({
  token: z.string().length(64),
  password: passwordSchema,
  name: z.string().min(1, "Name is required").max(100),
});

export const settingsSchema = z.record(z.string(), z.string());

// Validation helper
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodIssue[] } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues };
}

// Sanitization helpers
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/^\.+/, "_")
    .substring(0, 255);
}

// Type exports
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateComputerInput = z.infer<typeof createComputerSchema>;
export type UpdateComputerInput = z.infer<typeof updateComputerSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type CreatePolicyInput = z.infer<typeof createPolicySchema>;
export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>;
export type CreateAlertInput = z.infer<typeof createAlertSchema>;
export type CreateFirewallRuleInput = z.infer<typeof createFirewallRuleSchema>;
export type UpdateFirewallRuleInput = z.infer<typeof updateFirewallRuleSchema>;
export type CreateCommandInput = z.infer<typeof createCommandSchema>;
export type CreateFileTransferInput = z.infer<typeof createFileTransferSchema>;
export type CreateRemoteSessionInput = z.infer<typeof createRemoteSessionSchema>;
export type ExportReportInput = z.infer<typeof exportReportSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
