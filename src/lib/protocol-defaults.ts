// The five protocol categories every new event starts with (PRD §5.5).
// Admins can rename or deactivate them on the Protocol page afterwards.
export const DEFAULT_PROTOCOL_CATEGORIES = [
  {
    categoryKey: "parliamentary_leadership",
    name: "Parliamentary Leadership, MPs & Parliamentary Service Leadership",
    rankOrder: 1,
    colourHex: "#102343",
    description: "Rt. Hon. Speaker, Leadership of Parliament, Honorable Members of Parliament, Clerk to Parliament, and Directors.",
  },
  {
    categoryKey: "diplomatic_corps",
    name: "Diplomatic Corps & Designated State Dignitaries",
    rankOrder: 2,
    colourHex: "#C6A65B",
    description: "Ambassadors, High Commissioners, Heads of Diplomatic Missions, and Special Envoys.",
  },
  {
    categoryKey: "public_security_judiciary",
    name: "Public & State Institutions, Security Services & Judicial Service",
    rankOrder: 3,
    colourHex: "#18794E",
    description: "Chief Justice, Supreme Court Justices, Service Chiefs, Heads of State Agencies and Commissions.",
  },
  {
    categoryKey: "clergy_religious",
    name: "Clergy, Churches & Religious Bodies",
    rankOrder: 4,
    colourHex: "#6B21A8",
    description: "Eminent Archbishops, Presiding Bishops, General Superintendents, and National Chief Imam representatives.",
  },
  {
    categoryKey: "csos_private_sector",
    name: "Civil Society Organisations, Private Sector & Other Distinguished Guests",
    rankOrder: 5,
    colourHex: "#EA580C",
    description: "Executive Directors of Think Tanks, Business Council Executives, Traditional Leaders, and Media Executives.",
  },
] as const;
