import { getActor } from "@/lib/authz";
import { getHiddenNavHrefs } from "@/lib/viewer";
import { navigationItems } from "@/components/layout/nav-items";
import { NavigationClientView } from "./NavigationClientView";

export const dynamic = "force-dynamic";

export default async function NavigationVisibilityPage() {
  // The layout already requires platform.manage.
  const actor = (await getActor())!;
  const hiddenHrefs = await getHiddenNavHrefs(actor.organizationId);
  const items = navigationItems.map((i) => ({ name: i.name, href: i.href }));
  return <NavigationClientView items={items} initialHidden={hiddenHrefs} />;
}
