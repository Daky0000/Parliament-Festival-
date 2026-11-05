// Builds previews of the invitation email (src/lib/email/invitation-template.ts):
// one per protocol rank plus one for a guest with no rank, so the header colours
// can be checked without sending email.
// Run: npx tsx docs/email/build-previews.ts   -> docs/email/previews/*.html
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInvitationVars, fillTemplate } from "../../src/lib/email/render-invitation";
import { INVITATION_HTML } from "../../src/lib/email/invitation-template";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Rank names and colours as seeded in prisma/seed.ts; the last one has no rank
const samples = [
  { file: "rank-1", order: 1, name: "Parliamentary Leadership, MPs & Parliamentary Service Leadership", colour: "#102343", guest: ["Hon.", "Kofi Asare", "Member of Parliament", "Parliament of Ghana"] },
  { file: "rank-2", order: 2, name: "Diplomatic Corps & Designated State Dignitaries", colour: "#C6A65B", guest: ["H.E.", "Ama Serwaa Mensah", "Ambassador", "Embassy of the Republic of Example"] },
  { file: "rank-3", order: 3, name: "Public & State Institutions, Security Services & Judicial Service", colour: "#18794E", guest: ["Justice", "Yaw Boateng", "Justice of the Supreme Court", "Judicial Service of Ghana"] },
  { file: "rank-4", order: 4, name: "Clergy, Churches & Religious Bodies", colour: "#6B21A8", guest: ["Most Rev.", "Peter Owusu", "Archbishop", "Example Archdiocese"] },
  { file: "rank-5", order: 5, name: "Civil Society Organisations, Private Sector & Other Distinguished Guests", colour: "#EA580C", guest: ["Dr.", "Efua Addo", "Executive Director", "Example Foundation"] },
  { file: "no-rank", order: null, name: null, colour: null, guest: ["Mr.", "Kwesi Appiah", "", "Example Company Ltd"] },
];

const out = path.join(dir, "previews");
fs.mkdirSync(out, { recursive: true });

for (const s of samples) {
  const [title, name, designation, institution] = s.guest;
  let html = fillTemplate(
    INVITATION_HTML,
    buildInvitationVars(
      { title, fullName: name, designation, institution, rankColourHex: s.colour, rankName: s.name, rankOrder: s.order },
      {
        eventName: "2026 Festival of Nine Lessons and Carols",
        rsvpUrl: "http://localhost:3000/",
        reference: `GH-GST-PREVIEW-${s.order ?? 0}`,
      }
    ),
    { html: true }
  );
  // Local copies of the hosted images and font so previews work offline
  html = html.replace(/http:\/\/localhost:3000\/assets\//g, "../../../public/assets/");
  fs.writeFileSync(path.join(out, `${s.file}.html`), html);
  console.log("wrote", `previews/${s.file}.html`);
}
