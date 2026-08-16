import prisma from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

// Activity-log writer. A plain module, NOT "use server", for the same reason
// lib/auth-tenant.ts and lib/plan-guard.ts are plain modules: it carries no
// authorization of its own and is only ever called by an action that has
// already established who the caller is.
//
// It used to be an export of lib/actions/logs.ts, which is a "use server"
// module, and it takes the *session* as its first argument. Every "use server"
// export is a public POST endpoint, so that combination let an anonymous caller
// post a forged audit-log entry attributed to any user id, restaurant id,
// action type and description they liked -- against the one table whose whole
// job is to be trustworthy after the fact. Nothing about the call sites needed
// it to be an endpoint: all nineteen are server modules importing it directly.
//
// Keep this file free of "use server". If a client ever needs to record
// something, give it a narrow action that derives the session server-side
// rather than accepting one.

export type LogActivityData = {
  restaurantId?: string;
  actionType: string;
  entityType: string;
  entityId: string;
  description: string;
  changesBefore?: Record<string, unknown>;
  changesAfter?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export async function logActivity(session: SessionUser, data: LogActivityData) {
  await prisma.activityLog.create({
    data: {
      restaurantId: session.restaurantId || data.restaurantId || "",
      userId: session.id,
      actionType: data.actionType,
      entityType: data.entityType,
      entityId: data.entityId,
      description: data.description,
      changesBefore: data.changesBefore as any,
      changesAfter: data.changesAfter as any,
      ipAddress: data.ipAddress ?? undefined,
      userAgent: data.userAgent ?? undefined,
    },
  });
}
