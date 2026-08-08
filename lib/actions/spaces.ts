"use server";

import prisma from "@/lib/prisma";
import { requireTenant } from "@/lib/auth-tenant";
import { logActivity } from "./logs";

// Spaces are per-restaurant, fully custom (add/rename/delete) — see the Space
// model in prisma/schema.prisma. RestaurantTable.space is a free-text column,
// not a foreign key, so renaming a space bulk-updates every table's `space`
// string in the same transaction as the Space row rename.

export async function getSpaces() {
  const auth = await requireTenant();
  if (!auth.ok) return { error: auth.error };
  const { restaurantId } = auth.session;

  try {
    const spaces = await prisma.space.findMany({
      where: { restaurantId },
      orderBy: { displayOrder: "asc" },
    });

    // Table counts per space, so the UI can warn before a delete that would
    // orphan tables and can render "(N tables)" next to each space.
    const counts = await prisma.restaurantTable.groupBy({
      by: ["space"],
      where: { restaurantId },
      _count: true,
    });
    const countByName = new Map(counts.map((c) => [c.space, c._count]));

    return {
      data: spaces.map((f) => ({
        id: f.id,
        name: f.name,
        displayOrder: f.displayOrder,
        tableCount: countByName.get(f.name) ?? 0,
      })),
    };
  } catch (err: any) {
    return { error: err?.message || "Failed to load spaces" };
  }
}

export async function addSpace(name: string) {
  const auth = await requireTenant();
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  const { restaurantId } = session;

  const trimmed = name.trim();
  if (!trimmed) return { error: "Space name is required" };
  if (trimmed.length > 40) return { error: "Space name must be 40 characters or fewer" };

  try {
    const last = await prisma.space.findFirst({
      where: { restaurantId },
      orderBy: { displayOrder: "desc" },
      select: { displayOrder: true },
    });

    const space = await prisma.space.create({
      data: {
        restaurantId,
        name: trimmed,
        displayOrder: (last?.displayOrder ?? -1) + 1,
      },
    });

    await logActivity(session, {
      actionType: "SPACE_ADD",
      entityType: "Space",
      entityId: space.id,
      description: `Space "${name}" added`,
    });

    return { data: { id: space.id, name: space.name, displayOrder: space.displayOrder, tableCount: 0 } };
  } catch (err: any) {
    if (err?.code === "P2002") {
      return { error: `A space named "${trimmed}" already exists` };
    }
    return { error: err?.message || "Failed to add space" };
  }
}

export async function renameSpace(spaceId: string, newName: string) {
  const auth = await requireTenant();
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  const { restaurantId } = session;

  const trimmed = newName.trim();
  if (!trimmed) return { error: "Space name is required" };
  if (trimmed.length > 40) return { error: "Space name must be 40 characters or fewer" };

  try {
    const space = await prisma.space.findFirst({ where: { id: spaceId, restaurantId } });
    if (!space) return { error: "Space not found" };
    if (space.name === trimmed) return { data: { id: space.id, name: space.name } };

    // Rename the Space row and repoint every table on it in one transaction —
    // otherwise a crash mid-way would leave tables pointing at a name no
    // Space row has, silently hiding them from the tab list.
    const [updatedSpace] = await prisma.$transaction([
      prisma.space.update({ where: { id: spaceId }, data: { name: trimmed } }),
      prisma.restaurantTable.updateMany({
        where: { restaurantId, space: space.name },
        data: { space: trimmed },
      }),
    ]);

    await logActivity(session, {
      actionType: "SPACE_RENAME",
      entityType: "Space",
      entityId: spaceId,
      description: `Space renamed to "${newName}"`,
    });

    return { data: { id: updatedSpace.id, name: updatedSpace.name } };
  } catch (err: any) {
    if (err?.code === "P2002") {
      return { error: `A space named "${trimmed}" already exists` };
    }
    return { error: err?.message || "Failed to rename space" };
  }
}

/**
 * Persist a new left-to-right order for the space pills. Takes the full ordered
 * list of ids so one drag writes one consistent sequence instead of a stream of
 * swap operations that can interleave badly under a slow connection.
 */
export async function reorderSpaces(orderedIds: string[]) {
  const auth = await requireTenant();
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  const { restaurantId } = session;

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { error: "Nothing to reorder" };
  }

  try {
    // Scope to this tenant first, so an id from another restaurant is dropped
    // rather than silently renumbered.
    const owned = await prisma.space.findMany({
      where: { restaurantId, id: { in: orderedIds } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((s) => s.id));
    const ids = orderedIds.filter((id) => ownedIds.has(id));
    if (ids.length === 0) return { error: "No matching spaces" };

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.space.update({ where: { id }, data: { displayOrder: index } })
      )
    );

    return { data: { ids } };
  } catch (err: any) {
    return { error: err?.message || "Failed to reorder spaces" };
  }
}

/**
 * Move every table on one space across to another. Without this, deleting a
 * space that still holds tables was a dead end: the delete refused, and the
 * only way out was editing each table one at a time.
 *
 * An empty `toSpaceId` unassigns them instead. That is the only way out for a
 * restaurant down to its last space: there is no other space to move to, and
 * tables no longer need one.
 */
export async function moveTablesToSpace(fromSpaceId: string, toSpaceId: string) {
  const auth = await requireTenant();
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  const { restaurantId } = session;

  if (fromSpaceId === toSpaceId) return { error: "Pick a different space" };

  try {
    const from = await prisma.space.findFirst({
      where: { id: fromSpaceId, restaurantId },
    });
    if (!from) return { error: "Source space not found" };

    let toName = "";
    if (toSpaceId) {
      const to = await prisma.space.findFirst({
        where: { id: toSpaceId, restaurantId },
      });
      if (!to) return { error: "Destination space not found" };
      toName = to.name;
    }

    const moved = await prisma.restaurantTable.updateMany({
      where: { restaurantId, space: from.name },
      data: { space: toName },
    });

    await logActivity(session, {
      actionType: "SPACE_MOVE_TABLES",
      entityType: "Space",
      entityId: fromSpaceId,
      description: toName
        ? `${moved.count} table${moved.count === 1 ? "" : "s"} moved from "${from.name}" to "${toName}"`
        : `${moved.count} table${moved.count === 1 ? "" : "s"} unassigned from "${from.name}"`,
    });

    return { data: { moved: moved.count, to: toName } };
  } catch (err: any) {
    return { error: err?.message || "Failed to move tables" };
  }
}

export async function deleteSpace(spaceId: string) {
  const auth = await requireTenant();
  if (!auth.ok) return { error: auth.error };
  const { session } = auth;
  const { restaurantId } = session;

  try {
    const space = await prisma.space.findFirst({ where: { id: spaceId, restaurantId } });
    if (!space) return { error: "Space not found" };

    // Deliberately no "keep at least one space" rule: a single-room cafe should
    // be able to clear the list out entirely, since tables do not need a space.
    // Tables still have to be moved or unassigned first so none are orphaned.
    const tableCount = await prisma.restaurantTable.count({ where: { restaurantId, space: space.name } });
    if (tableCount > 0) {
      return { error: `Move or delete the ${tableCount} table${tableCount === 1 ? "" : "s"} on "${space.name}" before deleting it` };
    }

    await prisma.space.delete({ where: { id: spaceId } });

    await logActivity(session, {
      actionType: "SPACE_DELETE",
      entityType: "Space",
      entityId: spaceId,
      description: `Space deleted`,
    });

    return { data: { id: spaceId } };
  } catch (err: any) {
    return { error: err?.message || "Failed to delete space" };
  }
}
