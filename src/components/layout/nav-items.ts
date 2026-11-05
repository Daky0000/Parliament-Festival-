import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  Award,
  Mail,
  CheckCircle2,
  Armchair,
  CalendarDays,
  Sparkles,
  QrCode,
  FileBarChart,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { name: string; href: string; icon: LucideIcon; badge?: string; permission: string };

/** What the signed-in viewer may see; computed on the server in the dashboard layout. */
export type Viewer = {
  fullName: string;
  roleLabel: string;
  allowedHrefs: string[];
  canUsher: boolean;
  canSuperAdmin: boolean;
  event: { id: string; name: string; eventCode: string; startsAt: string | null; venueName: string | null } | null;
  events: { id: string; name: string }[];
};

export const navigationItems: NavItem[] = [
  { name: "Executive Overview", href: "/", icon: LayoutDashboard, permission: "events.read" },
  { name: "Guest Directory", href: "/guests", icon: Users, permission: "guests.read" },
  { name: "Import Wizard", href: "/guests/import", icon: FileSpreadsheet, permission: "guests.import" },
  { name: "Protocol Precedence", href: "/protocol", icon: Award, permission: "protocol.read" },
  { name: "Invitation Templates", href: "/invitations/templates", icon: QrCode, permission: "campaigns.read" },
  { name: "Invitation Campaigns", href: "/invitations/campaigns", icon: Mail, permission: "campaigns.read" },
  { name: "RSVP Dashboard", href: "/rsvps", icon: CheckCircle2, permission: "rsvps.read" },
  { name: "Seating Planner", href: "/seating", icon: Armchair, permission: "seating.read" },
  { name: "Arrival & Attendance", href: "/attendance", icon: CalendarDays, permission: "reports.read" },
  { name: "Reports & Readiness", href: "/reports", icon: FileBarChart, permission: "reports.read" },
  { name: "AI Command Centre", href: "/ai-centre", icon: Sparkles, badge: "AI", permission: "ai.use" },
];
