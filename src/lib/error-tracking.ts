/**
 * Error Tracking Utility with Sentry Integration
 *
 * This module provides error tracking that integrates with Sentry when configured,
 * with graceful fallback to console logging when Sentry is not available.
 */

import { captureError, captureMessage, setUserContext, clearUserContext, addBreadcrumb, Sentry } from "./sentry";

interface ErrorContext {
  userId?: string;
  organizationId?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

class ErrorTracker {
  private isProduction = process.env.NODE_ENV === "production";
  private hasSentry = !!process.env.SENTRY_DSN || !!process.env.NEXT_PUBLIC_SENTRY_DSN;

  /**
   * Capture and log an error
   */
  captureError(error: Error, context?: ErrorContext): void {
    const errorData = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      ...context,
    };

    // Always log to console in development
    if (!this.isProduction) {
      console.error("[Error Tracked]", errorData);
    }

    // Send to Sentry
    captureError(error, context as Record<string, unknown>);
  }

  /**
   * Capture a message/warning
   */
  captureMessage(
    message: string,
    level: "info" | "warning" | "error" = "info",
    context?: ErrorContext
  ): void {
    const data = {
      message,
      level,
      timestamp: new Date().toISOString(),
      ...context,
    };

    if (!this.isProduction) {
      console.log(`[${level.toUpperCase()}]`, data);
    }

    const sentryLevel = level === "warning" ? "warning" : level === "error" ? "error" : "info";
    captureMessage(message, sentryLevel, context as Record<string, unknown>);
  }

  /**
   * Set user context for error tracking
   */
  setUser(user: { id: string; email?: string; organizationId?: string }): void {
    setUserContext(user);

    if (!this.isProduction) {
      console.log("[ErrorTracker] User context set:", user.id);
    }
  }

  /**
   * Clear user context (on logout)
   */
  clearUser(): void {
    clearUserContext();

    if (!this.isProduction) {
      console.log("[ErrorTracker] User context cleared");
    }
  }

  /**
   * Add a breadcrumb for debugging
   */
  addBreadcrumb(category: string, message: string, data?: Record<string, unknown>): void {
    addBreadcrumb(category, message, data);
  }

  /**
   * Start a performance transaction
   */
  startTransaction(name: string, op: string) {
    if (this.hasSentry) {
      return Sentry.startSpan({ name, op }, () => {});
    }
    return null;
  }
}

// Export singleton instance
export const errorTracker = new ErrorTracker();

// Helper function for API routes
export function withErrorTracking<T>(
  handler: () => Promise<T>,
  context?: ErrorContext
): Promise<T> {
  return handler().catch((error) => {
    errorTracker.captureError(error as Error, context);
    throw error;
  });
}

// Express/API middleware for error tracking
export function errorTrackingMiddleware(
  error: Error,
  context?: ErrorContext
): void {
  errorTracker.captureError(error, context);
}

// React Error Boundary helper
export function captureReactError(error: Error, errorInfo: { componentStack: string }): void {
  errorTracker.captureError(error, {
    metadata: {
      componentStack: errorInfo.componentStack,
    },
  });
}
