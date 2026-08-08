"use client";

import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * Grouped settings navigation shared by the owner and reception portals.
 *
 * The route list is declared once here so a new settings page only has to be
 * added in one place; the portal prefix is resolved from the current path so
 * the same component works under /owner and /reception.
 */
const NAV_GROUPS: Array<{ heading: string; items: Array<{ slug: string; label: string }> }> = [
  {
    heading: "General Setting",
    items: [
      { slug: "", label: "Restaurant Details" },
      { slug: "notifications", label: "Notifications" },
      { slug: "activity-log", label: "Activity Log" },
      { slug: "billing", label: "Billing & Subscription" },
      { slug: "users-role", label: "Users Role" },
      { slug: "trash", label: "Trash" },
      { slug: "integrations", label: "Integrations" },
    ],
  },
  {
    heading: "Order Setting",
    items: [
      { slug: "tax", label: "Tax & VAT" },
      { slug: "invoice", label: "Invoice Setting" },
      { slug: "kot", label: "KOT Setting" },
      { slug: "printer", label: "Printer" },
    ],
  },
  {
    heading: "Resthru",
    items: [
      { slug: "support", label: "Support & Feedback" },
      { slug: "release-notes", label: "Release Notes" },
    ],
  },
];

export default function SettingsShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const portal = pathname.startsWith("/owner") ? "/owner" : "/reception";
  const base = `${portal}/settings`;

  // "" is the index page, so it must match exactly or it would light up on
  // every child route.
  const isActive = (slug: string) =>
    slug === "" ? pathname === base || pathname === `${base}/` : pathname.startsWith(`${base}/${slug}`);

  return (
    // Side nav from `md` up, not `lg`. Below the breakpoint the nav stacks
    // full-width above the content, so on a tablet -- the reception counter's
    // device -- you had to scroll past all twelve settings links to reach the
    // form you came for. The portal shell already supplies the page gutter, so
    // this only adds the gap between nav and content.
    <div className="flex flex-col md:flex-row gap-6 items-start">
      <aside className="w-full md:w-[240px] md:flex-shrink-0">
        <button
          onClick={() => router.push(portal)}
          className="w-full flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 font-medium mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Settings
        </button>

        <nav className="space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="text-xs font-medium text-muted-foreground mb-2 px-1">
                {group.heading}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.slug);
                  return (
                    <li key={item.slug || "index"}>
                      <button
                        onClick={() => router.push(item.slug ? `${base}/${item.slug}` : base)}
                        className={`w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-left transition-colors ${
                          active
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-foreground hover:bg-muted"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                            active ? "bg-primary" : "bg-muted-foreground/40"
                          }`}
                        />
                        {item.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 w-full">{children}</div>
    </div>
  );
}
