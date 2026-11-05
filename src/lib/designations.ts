// Official posts offered when registering a dignitary. "Others" lets the
// admin type a post that is not on the list.
export const OTHER_DESIGNATION = "__other__";

export const DESIGNATION_GROUPS: { label: string; options: string[] }[] = [
  {
    label: "Parliament",
    options: [
      "Speaker of Parliament",
      "First Deputy Speaker",
      "Second Deputy Speaker",
      "Majority Leader",
      "Minority Leader",
      "Majority Chief Whip",
      "Minority Chief Whip",
      "Member of Parliament",
      "Clerk to Parliament",
      "Deputy Clerk to Parliament",
    ],
  },
  {
    label: "Executive",
    options: [
      "President of the Republic",
      "Vice President of the Republic",
      "Chief of Staff",
      "Minister of State",
      "Deputy Minister",
      "Regional Minister",
      "Metropolitan / Municipal / District Chief Executive",
    ],
  },
  {
    label: "Judiciary",
    options: ["Chief Justice", "Justice of the Supreme Court", "Justice of the Court of Appeal", "Justice of the High Court"],
  },
  {
    label: "Diplomatic corps",
    options: ["Ambassador", "High Commissioner", "Chargé d'Affaires", "Head of International Organisation"],
  },
  {
    label: "Security services",
    options: ["Chief of Defence Staff", "Inspector-General of Police", "Service Commander", "Director-General"],
  },
  {
    label: "Traditional & religious",
    options: ["Paramount Chief", "Queen Mother", "Archbishop", "Bishop", "Chief Imam", "Clergy"],
  },
  {
    label: "Institutions & others",
    options: ["Chairperson", "Chief Executive Officer", "Managing Director", "Director", "Commissioner", "Head of Institution", "Special Guest"],
  },
];

export const ALL_DESIGNATIONS = DESIGNATION_GROUPS.flatMap((g) => g.options);
