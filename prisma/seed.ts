import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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

  // 2. Permissions
  const permissionKeys = [
    "platform.manage", "users.read", "users.create", "users.update", "users.suspend",
    "events.create", "events.read", "events.update", "events.archive",
    "guests.read", "guests.create", "guests.update", "guests.archive", "guests.import", "guests.export",
    "protocol.read", "protocol.configure", "protocol.override",
    "campaigns.read", "campaigns.create", "campaigns.update", "campaigns.approve", "campaigns.dispatch", "campaigns.cancel",
    "invitations.read_activity", "rsvps.read", "rsvps.override",
    "seating.read", "seating.configure", "seating.assign", "seating.approve",
    "checkin.scan", "checkin.manual_override",
    "reports.read", "reports.export", "documents.read", "documents.upload",
    "ai.use", "ai.execute_read_tools", "ai.execute_write_tools",
    "audit.read", "integrations.manage"
  ];

  for (const key of permissionKeys) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: `Permission to ${key}` },
    });
  }

  // 3. Roles
  const adminRole = await prisma.role.upsert({
    where: { organizationId_key: { organizationId: org.id, key: "admin" } },
    update: {},
    create: {
      organizationId: org.id,
      key: "admin",
      name: "System Administrator",
      description: "Full access to platform configuration, users, events, and security.",
      isSystemRole: true,
    },
  });

  const protocolOfficerRole = await prisma.role.upsert({
    where: { organizationId_key: { organizationId: org.id, key: "protocol_officer" } },
    update: {},
    create: {
      organizationId: org.id,
      key: "protocol_officer",
      name: "Protocol Officer",
      description: "Manages guests, protocol rankings, and event participation.",
      isSystemRole: true,
    },
  });

  const campaignApproverRole = await prisma.role.upsert({
    where: { organizationId_key: { organizationId: org.id, key: "campaign_approver" } },
    update: {},
    create: {
      organizationId: org.id,
      key: "campaign_approver",
      name: "Campaign Approver",
      description: "Reviews and approves bulk invitations before dispatch.",
      isSystemRole: true,
    },
  });

  const seatingManagerRole = await prisma.role.upsert({
    where: { organizationId_key: { organizationId: org.id, key: "seating_manager" } },
    update: {},
    create: {
      organizationId: org.id,
      key: "seating_manager",
      name: "Seating Manager",
      description: "Allocates seats and reviews seating conflicts.",
      isSystemRole: true,
    },
  });

  const usherRole = await prisma.role.upsert({
    where: { organizationId_key: { organizationId: org.id, key: "usher" } },
    update: {},
    create: {
      organizationId: org.id,
      key: "usher",
      name: "Event Usher",
      description: "Scans QR credentials, validates attendees, and provides seating directions.",
      isSystemRole: true,
    },
  });

  // Assign permissions to Admin
  const allPermissions = await prisma.permission.findMany();
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: perm.id },
    });
  }

  // 4. Test Users (with hashed passwords)
  const passwordHash = await bcrypt.hash("Parliament2026!", 10);

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

  // Assign user roles
  await prisma.userRoleAssignment.createMany({
    data: [
      { userId: adminUser.id, roleId: adminRole.id },
      { userId: protocolUser.id, roleId: protocolOfficerRole.id },
      { userId: approverUser.id, roleId: campaignApproverRole.id },
      { userId: seatingUser.id, roleId: seatingManagerRole.id },
      { userId: usherUser.id, roleId: usherRole.id },
    ],
  });

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
      subjectTemplate: "Invitation to the 2026 Festival of Nine Lessons and Carols - Parliament of Ghana",
      htmlContent: `<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #0A1830; color: #F7F5F0; padding: 40px; border: 2px solid #C6A65B;">
        <div style="text-align: center; border-bottom: 1px solid #C6A65B; padding-bottom: 20px;">
          <h2 style="color: #C6A65B; margin: 0; letter-spacing: 2px;">PARLIAMENT OF GHANA</h2>
          <p style="font-size: 13px; color: #DFCA95; text-transform: uppercase;">Office of the Rt. Hon. Speaker</p>
        </div>
        <div style="padding: 30px 0; text-align: center;">
          <p style="font-style: italic; color: #DFCA95;">The Rt. Hon. Speaker and Leadership of Parliament request the honour of the presence of</p>
          <h3 style="font-size: 22px; color: #FFFFFF; margin: 15px 0;">{{guest.title}} {{guest.full_name}}</h3>
          <p style="font-size: 14px; color: #C6A65B; margin-bottom: 25px;">{{guest.designation}} - {{guest.institution_name}}</p>
          <p>at the</p>
          <h2 style="color: #C6A65B; font-size: 24px; margin: 10px 0;">2026 FESTIVAL OF NINE LESSONS AND CAROLS</h2>
          <p style="font-size: 15px; margin: 20px 0;"><strong>Date:</strong> Friday, 18th December 2026 &bull; <strong>Time:</strong> 4:00 PM GMT<br><strong>Venue:</strong> Forecourt of Parliament House, Accra</p>
          <div style="margin: 35px 0;">
            <a href="{{invitation.rsvp_url}}" style="background: #C6A65B; color: #0A1830; padding: 14px 32px; font-weight: bold; text-decoration: none; border-radius: 4px; display: inline-block;">CONFIRM ATTENDANCE / RSVP</a>
          </div>
          <p style="font-size: 12px; color: #DFCA95;">Please respond on or before 10th December 2026. Ref: {{invitation.reference}}</p>
        </div>
      </div>`,
      textContent: "The Rt. Hon. Speaker and Leadership of Parliament invite {{guest.full_name}} to the 2026 Festival of Nine Lessons and Carols on 18th December 2026 at the Forecourt of Parliament. RSVP: {{invitation.rsvp_url}}",
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
