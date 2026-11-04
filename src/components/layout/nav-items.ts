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
  type LucideIcon,
} from "lucide-react";

export type NavItem = { name: string; href: string; icon: LucideIcon; badge?: string };

export const navigationItems: NavItem[] = [
  { name: "Executive Overview", href: "/", icon: LayoutDashboard },
  { name: "Guest Directory", href: "/guests", icon: Users },
  { name: "Import Wizard", href: "/guests/import", icon: FileSpreadsheet },
  { name: "Protocol Precedence", href: "/protocol", icon: Award },
  { name: "Invitation Campaigns", href: "/invitations/campaigns", icon: Mail },
  { name: "RSVP Dashboard", href: "/rsvps", icon: CheckCircle2 },
  { name: "Seating Planner", href: "/seating", icon: Armchair },
  { name: "Arrival & Attendance", href: "/attendance", icon: CalendarDays },
  { name: "AI Command Centre", href: "/ai-centre", icon: Sparkles, badge: "AI" },
];
