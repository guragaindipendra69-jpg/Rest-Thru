'use server';

import { getSession } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

// Support ticketing, shared by the superadmin inbox and the owner's own thread.
//
// Every export of a "use server" module is a public POST endpoint, and this
// module had almost no authorization: `getSupportTickets` returned every
// ticket on the platform to any signed-in user (a waiter included),
// `updateTicketStatus` let anyone set any ticket to any string,
// `getTicketReplies` read any thread by id, and `addTicketReply` posted into
// one. A ticket body is whatever a restaurant chose to tell support, so the
// read side is a cross-tenant disclosure and the write side lets one outlet
// answer another outlet's support thread while wearing the platform's badge.
//
// Two guards below. `requireAdmin` follows the private-copy pattern the other
// admin modules use (admin.ts, admin-menu.ts, admin-owners.ts). `authorizeTicket`
// is the per-thread check: platform admins reach every ticket, a tenant reaches
// only tickets filed by their own restaurant.

/** Platform admins only. Reaches across tenants, so it carries no restaurantId. */
async function requireAdmin() {
  const session = await getSession();
  if (!session || (session.role !== 'ADMIN' && session.role !== 'SUPER_ADMIN')) {
    return null;
  }
  return session;
}

const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

// The stored reply role is OWNER or SUPERADMIN (see TicketReply.role in the
// schema). This used to read `session.role === 'SUPERADMIN'`, and SUPERADMIN is
// not a session role -- the real values are ADMIN and SUPER_ADMIN -- so the test
// was always false: every support answer was written as role OWNER, rendered in
// TicketChat with a User icon labelled "You", and never moved the ticket to
// IN_PROGRESS. The restaurant saw the platform's reply as its own message.
type ReplyRole = 'OWNER' | 'SUPERADMIN';

/**
 * Resolve a ticket the caller is allowed to act on, or null.
 *
 * Returns the ticket's `restaurantId` so a caller does not need a second read,
 * plus the reply role to stamp on anything they post.
 */
async function authorizeTicket(
  ticketId: string
): Promise<{ ticketId: string; userId: string; role: ReplyRole } | null> {
  const session = await getSession();
  if (!session?.id) return null;
  if (!ticketId) return null;

  if (session.role === 'ADMIN' || session.role === 'SUPER_ADMIN') {
    const exists = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    return exists ? { ticketId, userId: session.id, role: 'SUPERADMIN' } : null;
  }

  // Tenant side: the restaurantId must come from the session and appear in the
  // where clause, never from the caller. A restaurant id is public (it is on
  // every table QR), so filtering on a supplied one authorizes nothing.
  if (!session.restaurantId) return null;
  const owned = await prisma.supportTicket.findFirst({
    where: { id: ticketId, restaurantId: session.restaurantId },
    select: { id: true },
  });
  return owned ? { ticketId, userId: session.id, role: 'OWNER' } : null;
}

/**
 * The superadmin support inbox: every ticket on the platform. Admin-only.
 *
 * The owner-facing equivalent is `getSupportTickets` in lib/actions/settings-pages.ts,
 * which scopes to the session's own restaurant. Do not merge the two.
 */
export async function getSupportTickets() {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized' };

  try {
    const tickets = await prisma.supportTicket.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        restaurant: { select: { name: true } },
        user: { select: { firstName: true, lastName: true, email: true } },
        _count: { select: { replies: true } },
      },
    });
    return { data: tickets };
  } catch (error) {
    console.error('Failed to fetch support tickets:', error);
    return { error: 'Failed to fetch tickets' };
  }
}

/** Move a ticket through its lifecycle. Admin-only; the status is allowlisted. */
export async function updateTicketStatus(ticketId: string, status: string) {
  const session = await requireAdmin();
  if (!session) return { error: 'Unauthorized' };

  // `status` is a bare String column with no enum behind it, so an unvalidated
  // write persists a value no view can filter on.
  const normalized = String(status || '').trim().toUpperCase();
  if (!TICKET_STATUSES.includes(normalized as (typeof TICKET_STATUSES)[number])) {
    return { error: `Invalid status. Expected one of: ${TICKET_STATUSES.join(', ')}` };
  }

  try {
    const result = await prisma.supportTicket.updateMany({
      where: { id: ticketId },
      data: { status: normalized },
    });
    if (result.count === 0) return { error: 'Ticket not found' };
    revalidatePath('/superadmin/support');
    return { success: true };
  } catch (error) {
    console.error('Failed to update ticket status:', error);
    return { error: 'Failed to update ticket' };
  }
}

/** Read one thread. Admins reach any ticket; a tenant only reaches its own. */
export async function getTicketReplies(ticketId: string) {
  const auth = await authorizeTicket(ticketId);
  if (!auth) return { error: 'Unauthorized' };

  try {
    const replies = await prisma.ticketReply.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
    });
    return { data: replies };
  } catch (error) {
    console.error('Failed to fetch replies:', error);
    return { error: 'Failed to fetch replies' };
  }
}

/**
 * Post into a thread. The reply role is derived from the verified session, not
 * from a caller-supplied value, so a tenant cannot post as the platform.
 */
export async function addTicketReply(ticketId: string, message: string, imageUrl?: string) {
  const auth = await authorizeTicket(ticketId);
  if (!auth) return { error: 'Unauthorized' };

  if (!message?.trim()) return { error: 'Message is required' };

  try {
    const reply = await prisma.ticketReply.create({
      data: {
        ticketId,
        userId: auth.userId,
        role: auth.role,
        message: message.trim(),
        imageUrl: imageUrl || null,
      },
    });

    // A platform answer picks the ticket up, but only out of OPEN -- a support
    // agent adding a note to a RESOLVED or CLOSED ticket should not silently
    // reopen it, which an unconditional write did.
    if (auth.role === 'SUPERADMIN') {
      await prisma.supportTicket.updateMany({
        where: { id: ticketId, status: 'OPEN' },
        data: { status: 'IN_PROGRESS' },
      });
    }

    revalidatePath('/superadmin/support');
    revalidatePath('/owner/settings');
    return { success: true, data: reply };
  } catch (error) {
    console.error('Failed to add reply:', error);
    return { error: 'Failed to send reply' };
  }
}
