import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  INVITATION_HTML,
  INVITATION_SUBJECT,
  INVITATION_TEXT,
} from "../src/lib/email/invitation-template";

import { assertSeedAllowed, seedPassword } from "./seed-guard";
import { syncRoles } from "../src/lib/roles";

assertSeedAllowed("seed");
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database for Parliamentary Event Platform...");

  // 1. Organization
  const org = await prisma.organization.upsert({
    where: { slug: "parliament-gh" },
    update: {},
    create: {
      name: "Parliament of Ghana",
      slug: "parliament-gh",
      status: "active",
    },
  });

  // 2-3. Permissions and system roles (single source: src/lib/roles.ts)
  const roleIds = await syncRoles(prisma, org.id);

  // 4. Test Users (with hashed passwords)
  const passwordHash = await bcrypt.hash(seedPassword(), 10);

  const adminUser = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "admin@parliament.gh" } },
    update: { passwordHash },
    create: {
      organizationId: org.id,
      email: "admin@parliament.gh",
      fullName: "Kwame Boateng (Director of IT & Protocol)",
      passwordHash,
      status: "active",
    },
  });

  const protocolUser = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "protocol@parliament.gh" } },
    update: { passwordHash },
    create: {
      organizationId: org.id,
      email: "protocol@parliament.gh",
      fullName: "Akosua Mensah (Chief Protocol Officer)",
      passwordHash,
      status: "active",
    },
  });

  const approverUser = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "approver@parliament.gh" } },
    update: { passwordHash },
    create: {
      organizationId: org.id,
      email: "approver@parliament.gh",
      fullName: "Cyril Nsiah (Clerk to Parliament)",
      passwordHash,
      status: "active",
    },
  });

  const seatingUser = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "seating@parliament.gh" } },
    update: { passwordHash },
    create: {
      organizationId: org.id,
      email: "seating@parliament.gh",
      fullName: "Ebenezer Quaye (Marshal of Parliament)",
      passwordHash,
      status: "active",
    },
  });

  const usherUser = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "usher@parliament.gh" } },
    update: { passwordHash },
    create: {
      organizationId: org.id,
      email: "usher@parliament.gh",
      fullName: "Abena Serwaa (Senior Protocol Usher)",
      passwordHash,
      status: "active",
    },
  });

  // Assign user roles (idempotent)
  const assignments: [string, string][] = [
    [adminUser.id, "super_admin"],
    [protocolUser.id, "protocol_officer"],
    [approverUser.id, "campaign_approver"],
    [seatingUser.id, "seating_manager"],
    [usherUser.id, "usher"],
  ];
  for (const [userId, roleKey] of assignments) {
    const exists = await prisma.userRoleAssignment.findFirst({
      where: { userId, roleId: roleIds[roleKey], eventId: null, revokedAt: null },
    });
    if (!exists) await prisma.userRoleAssignment.create({ data: { userId, roleId: roleIds[roleKey] } });
  }

  // 5. Initial Event: 2026 Festival of Nine Lessons and Carols
  const event = await prisma.event.upsert({
    where: { organizationId_eventCode: { organizationId: org.id, eventCode: "CAROLS-2026" } },
    update: {},
    create: {
      organizationId: org.id,
      eventCode: "CAROLS-2026",
      name: "2026 Festival of Nine Lessons and Carols",
      description: "Annual Parliamentary Festival of Nine Lessons and Carols celebrating state leadership, clergy, diplomatic corps, and civil society.",
      status: "active",
      venueName: "Forecourt of Parliament of Ghana",
      venueAddress: "Parliament House, Osu, Accra, Ghana",
      timezone: "Africa/Accra",
      startsAt: new Date("2026-12-18T16:00:00Z"),
      endsAt: new Date("2026-12-18T20:30:00Z"),
      rsvpDeadline: new Date("2026-12-10T18:00:00Z"),
      brandConfig: JSON.stringify({
        primaryColor: "#102343",
        accentColor: "#C6A65B",
        backgroundColor: "#F7F5F0",
        institutionTitle: "PARLIAMENT OF GHANA",
        crestUrl: "/images/parliament-crest.svg",
      }),
      createdBy: adminUser.id,
      activatedAt: new Date(),
    },
  });

  // Grant event access
  for (const u of [adminUser, protocolUser, approverUser, seatingUser, usherUser]) {
    await prisma.eventUserAccess.upsert({
      where: { eventId_userId: { eventId: event.id, userId: u.id } },
      update: {},
      create: { eventId: event.id, userId: u.id, grantedBy: adminUser.id },
    });
  }

  // 6. Protocol Categories (Section 5.5 of PRD)
  const categoriesData = [
    {
      categoryKey: "parliamentary_leadership",
      name: "Parliamentary Leadership, MPs & Parliamentary Service Leadership",
      rankOrder: 1,
      colourHex: "#102343", // Blue
      description: "Rt. Hon. Speaker, Leadership of Parliament, Honorable Members of Parliament, Clerk to Parliament, and Directors.",
    },
    {
      categoryKey: "diplomatic_corps",
      name: "Diplomatic Corps & Designated State Dignitaries",
      rankOrder: 2,
      colourHex: "#C6A65B", // Gold
      description: "Ambassadors, High Commissioners, Heads of Diplomatic Missions, and Special Envoys.",
    },
    {
      categoryKey: "public_security_judiciary",
      name: "Public & State Institutions, Security Services & Judicial Service",
      rankOrder: 3,
      colourHex: "#18794E", // Green
      description: "Chief Justice, Supreme Court Justices, Service Chiefs, Heads of State Agencies and Commissions.",
    },
    {
      categoryKey: "clergy_religious",
      name: "Clergy, Churches & Religious Bodies",
      rankOrder: 4,
      colourHex: "#6B21A8", // Purple
      description: "Eminent Archbishops, Presiding Bishops, General Superintendents, and National Chief Imam representatives.",
    },
    {
      categoryKey: "csos_private_sector",
      name: "Civil Society Organisations, Private Sector & Other Distinguished Guests",
      rankOrder: 5,
      colourHex: "#EA580C", // Orange
      description: "Executive Directors of Think Tanks, Business Council Executives, Traditional Leaders, and Media Executives.",
    },
  ];

  const categories: Record<string, any> = {};
  for (const cat of categoriesData) {
    const c = await prisma.protocolCategory.upsert({
      where: { eventId_categoryKey: { eventId: event.id, categoryKey: cat.categoryKey } },
      update: cat,
      create: { ...cat, eventId: event.id },
    });
    categories[cat.categoryKey] = c;
  }

  // 7. Institutions
  const institutionsData = [
    { name: "Parliament of Ghana", institutionType: "Legislature", officialDomain: "parliament.gh" },
    { name: "British High Commission, Accra", institutionType: "Diplomatic Mission", officialDomain: "fcdo.gov.uk" },
    { name: "Embassy of the United States, Accra", institutionType: "Diplomatic Mission", officialDomain: "state.gov" },
    { name: "Judicial Service of Ghana", institutionType: "Judiciary", officialDomain: "judicial.gov.gh" },
    { name: "Ghana Armed Forces", institutionType: "Security Service", officialDomain: "gaf.mil.gh" },
    { name: "Christian Council of Ghana", institutionType: "Religious Body", officialDomain: "christiancouncilgh.org" },
    { name: "Center for Democratic Development (CDD-Ghana)", institutionType: "Civil Society", officialDomain: "cddgh.org" },
  ];

  const institutions: Record<string, any> = {};
  for (const inst of institutionsData) {
    const i = await prisma.institution.upsert({
      where: { organizationId_name: { organizationId: org.id, name: inst.name } },
      update: {},
      create: { ...inst, organizationId: org.id },
    });
    institutions[inst.name] = i;
  }

  // 8. People & Event Guests
  const guestsData = [
    {
      fullName: "Rt. Hon. Alban Sumana Kingsford Bagbin",
      title: "Rt. Hon.",
      designation: "Speaker of Parliament",
      institutionName: "Parliament of Ghana",
      categoryKey: "parliamentary_leadership",
      email: "speaker@parliament.gh",
      companionAllowance: 2,
    },
    {
      fullName: "Hon. Alexander Kwamina Afenyo-Markin",
      title: "Hon.",
      designation: "Majority Leader",
      institutionName: "Parliament of Ghana",
      categoryKey: "parliamentary_leadership",
      email: "afenyo.markin@parliament.gh",
      companionAllowance: 1,
    },
    {
      fullName: "Hon. Dr. Cassiel Ato Baah Forson",
      title: "Hon. Dr.",
      designation: "Minority Leader",
      institutionName: "Parliament of Ghana",
      categoryKey: "parliamentary_leadership",
      email: "ato.forson@parliament.gh",
      companionAllowance: 1,
    },
    {
      fullName: "H.E. Harriet Thompson",
      title: "H.E.",
      designation: "British High Commissioner to Ghana",
      institutionName: "British High Commission, Accra",
      categoryKey: "diplomatic_corps",
      email: "harriet.thompson@fcdo.gov.uk",
      companionAllowance: 1,
    },
    {
      fullName: "H.E. Virginia E. Palmer",
      title: "H.E.",
      designation: "Ambassador of the United States of America",
      institutionName: "Embassy of the United States, Accra",
      categoryKey: "diplomatic_corps",
      email: "palmerve@state.gov",
      companionAllowance: 1,
    },
    {
      fullName: "Her Ladyship Justice Gertrude Araba Esaaba Sackey Torkornoo",
      title: "Her Ladyship",
      designation: "Chief Justice of Ghana",
      institutionName: "Judicial Service of Ghana",
      categoryKey: "public_security_judiciary",
      email: "chiefjustice@judicial.gov.gh",
      companionAllowance: 1,
    },
    {
      fullName: "Lt. Gen. Thomas Oppong-Peprah",
      title: "Lt. Gen.",
      designation: "Chief of Defence Staff",
      institutionName: "Ghana Armed Forces",
      categoryKey: "public_security_judiciary",
      email: "cds@gaf.mil.gh",
      companionAllowance: 1,
    },
    {
      fullName: "Most Rev. Dr. Paul Kwabena Boafo",
      title: "Most Rev. Dr.",
      designation: "Presiding Bishop, The Methodist Church Ghana",
      institutionName: "Christian Council of Ghana",
      categoryKey: "clergy_religious",
      email: "bishop.boafo@methodistchurchgh.org",
      companionAllowance: 1,
    },
    {
      fullName: "Prof. Henry Kwasi Prempeh",
      title: "Prof.",
      designation: "Executive Director",
      institutionName: "Center for Democratic Development (CDD-Ghana)",
      categoryKey: "csos_private_sector",
      email: "h.prempeh@cddgh.org",
      companionAllowance: 1,
    },
  ];

  const createdEventGuests = [];
  for (const g of guestsData) {
    const inst = institutions[g.institutionName];
    const person = await prisma.person.create({
      data: {
        organizationId: org.id,
        institutionId: inst ? inst.id : null,
        title: g.title,
        fullName: g.fullName,
        designation: g.designation,
        email: g.email,
      },
    });

    const category = categories[g.categoryKey];
    const eventGuest = await prisma.eventGuest.create({
      data: {
        eventId: event.id,
        personId: person.id,
        institutionId: inst ? inst.id : null,
        protocolCategoryId: category ? category.id : null,
        guestReference: `GH-GST-${Math.floor(1000 + Math.random() * 9000)}`,
        companionAllowance: g.companionAllowance,
        guestStatus: "active",
      },
      include: { person: true, protocolCategory: true, institution: true },
    });
    createdEventGuests.push(eventGuest);
  }

  // 9. Seating Plan & Sections
  const seatingPlan = await prisma.seatingPlan.create({
    data: {
      eventId: event.id,
      versionNumber: 1,
      name: "Forecourt Seating Master Plan v1.0",
      status: "proposed",
      createdBy: seatingUser.id,
    },
  });

  const sectionsConfig = [
    { sectionCode: "SEC-A-BLUE", name: "Section A (Parliamentary Leadership)", categoryKey: "parliamentary_leadership", capacity: 30, colourHex: "#102343", sectionType: "vip" },
    { sectionCode: "SEC-B-GOLD", name: "Section B (Diplomatic Corps)", categoryKey: "diplomatic_corps", capacity: 40, colourHex: "#C6A65B", sectionType: "vip" },
    { sectionCode: "SEC-C-GREEN", name: "Section C (State & Security Leadership)", categoryKey: "public_security_judiciary", capacity: 50, colourHex: "#18794E", sectionType: "general" },
    { sectionCode: "SEC-D-PURPLE", name: "Section D (Eminent Clergy & Churches)", categoryKey: "clergy_religious", capacity: 50, colourHex: "#6B21A8", sectionType: "general" },
    { sectionCode: "SEC-E-ORANGE", name: "Section E (Civil Society & Invited Guests)", categoryKey: "csos_private_sector", capacity: 80, colourHex: "#EA580C", sectionType: "general" },
  ];

  for (let idx = 0; idx < sectionsConfig.length; idx++) {
    const s = sectionsConfig[idx];
    const cat = categories[s.categoryKey];
    const section = await prisma.seatingSection.create({
      data: {
        seatingPlanId: seatingPlan.id,
        sectionCode: s.sectionCode,
        name: s.name,
        protocolCategoryId: cat ? cat.id : null,
        capacity: s.capacity,
        displayOrder: idx + 1,
        colourHex: s.colourHex,
        sectionType: s.sectionType,
      },
    });

    // Create 10 numbered seats per section for visual demonstration
    for (let seatNum = 1; seatNum <= 10; seatNum++) {
      await prisma.seat.create({
        data: {
          sectionId: section.id,
          seatCode: `${s.sectionCode}-R1-S${seatNum}`,
          rowLabel: "Row 1",
          seatNumber: seatNum,
          seatStatus: "available",
        },
      });
    }
  }

  // 10. Invitation Template & Version
  const template = await prisma.invitationTemplate.create({
    data: {
      eventId: event.id,
      name: "Official State Invitation (2026 Nine Lessons & Carols)",
      channel: "email",
      status: "active",
      createdBy: adminUser.id,
    },
  });

  const templateVersion = await prisma.invitationTemplateVersion.create({
    data: {
      templateId: template.id,
      versionNumber: 1,
      subjectTemplate: INVITATION_SUBJECT,
      htmlContent: INVITATION_HTML,
      textContent: INVITATION_TEXT,
      status: "approved",
      createdBy: adminUser.id,
      approvedBy: approverUser.id,
      approvedAt: new Date(),
    },
  });

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

