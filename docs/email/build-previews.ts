// Builds one preview of invitation-template.html per protocol rank, with sample
// guests, so the rank-coloured header can be checked without sending email.
// Run: npx tsx docs/email/build-previews.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rankTheme } from "../../src/lib/email/rank-theme";
import { interpolateInvitationTemplate } from "../../src/lib/email/provider";

const dir = path.dirname(fileURLToPath(import.meta.url));
const template = fs.readFileSync(path.join(dir, "invitation-template.html"), "utf8");

// Rank names and colours as seeded in prisma/seed.ts
const ranks = [
  { order: 1, name: "Parliamentary Leadership, MPs & Parliamentary Service Leadership", colour: "#102343", guest: ["Hon.", "Kofi Asare", "Member of Parliament", "Parliament of Ghana"] },
  { order: 2, name: "Diplomatic Corps & Designated State Dignitaries", colour: "#C6A65B", guest: ["H.E.", "Ama Serwaa Mensah", "Ambassador", "Embassy of the Republic of Example"] },
  { order: 3, name: "Public & State Institutions, Security Services & Judicial Service", colour: "#18794E", guest: ["Justice", "Yaw Boateng", "Justice of the Supreme Court", "Judicial Service of Ghana"] },
  { order: 4, name: "Clergy, Churches & Religious Bodies", colour: "#6B21A8", guest: ["Most Rev.", "Peter Owusu", "Archbishop", "Example Archdiocese"] },
  { order: 5, name: "Civil Society Organisations, Private Sector & Other Distinguished Guests", colour: "#EA580C", guest: ["Dr.", "Efua Addo", "Executive Director", "Example Foundation"] },
];

const out = path.join(dir, "previews");
fs.mkdirSync(out, { recursive: true });

for (const r of ranks) {
  const [title, name, designation, institution] = r.guest;
  let html = interpolateInvitationTemplate(template, {
    "guest.title": title,
    "guest.full_name": name,
    "guest.designation": designation,
    "guest.institution_name": institution,
    "event.name": "2026 Festival of Nine Lessons and Carols",
    "event.venue_name": "Forecourt of Parliament House",
    "invitation.reference": `GH-GST-PREVIEW-${r.order}`,
    "invitation.rsvp_url": "https://parliament-protocol-platform.pages.dev/",
    ...rankTheme(r.colour, r.name, r.order),
  });
  // Use local copies of the hosted images and font so previews work offline
  html = html
    .replace(/https:\/\/parliament-protocol-platform\.pages\.dev\/assets\//g, "../../../cloudflare-pages-portal/assets/");
  fs.writeFileSync(path.join(out, `rank-${r.order}.html`), html);
  console.log("wrote", `previews/rank-${r.order}.html`);
}
