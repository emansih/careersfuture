/**
 * Allowed search filter values, live-tested and recorded in docs/mycareersfuture-api.md
 * ("Search filters"). employmentTypes, categories and positionLevels are validated upstream
 * against an enum: one unknown value fails the whole request with HTTP 400.
 */

export const EMPLOYMENT_TYPES = [
  "Permanent",
  "Full Time",
  "Contract",
  "Part Time",
  "Temporary",
  "Freelance",
  "Internship/Attachment",
  "Flexi-work",
] as const;

/** Employment types with the ids and names used by the GraphQL lookup (which search rejects for two of them). */
export const EMPLOYMENT_TYPE_TABLE = [
  { id: "02", searchName: "Temporary", graphqlName: "Temporary" },
  { id: "03", searchName: "Contract", graphqlName: "Contract" },
  { id: "05", searchName: "Part Time", graphqlName: "Part Time" },
  { id: "06", searchName: "Freelance", graphqlName: "Freelance" },
  { id: "07", searchName: "Permanent", graphqlName: "Permanent" },
  { id: "08", searchName: "Full Time", graphqlName: "Full Time" },
  { id: "09", searchName: "Flexi-work", graphqlName: "Flexi Time" },
  { id: "10", searchName: "Internship/Attachment", graphqlName: "Internship" },
] as const;

export const CATEGORIES = [
  "Accounting / Auditing / Taxation",
  "Admin / Secretarial",
  "Advertising / Media",
  "Architecture / Interior Design",
  "Banking and Finance",
  "Building and Construction",
  "Consulting",
  "Customer Service",
  "Design",
  "Education and Training",
  "Engineering",
  "Entertainment",
  "Environment / Health",
  "Events / Promotions",
  "F&B",
  "General Management",
  "General Work",
  "Healthcare / Pharmaceutical",
  "Hospitality",
  "Human Resources",
  "Information Technology",
  "Insurance",
  "Legal",
  "Logistics / Supply Chain",
  "Manufacturing",
  "Marketing / Public Relations",
  "Medical / Therapy Services",
  "Personal Care / Beauty",
  "Precision Engineering",
  "Professional Services",
  "Public / Civil Service",
  "Purchasing / Merchandising",
  "Real Estate / Property Management",
  "Repair and Maintenance",
  "Risk Management",
  "Sales / Retail",
  "Sciences / Laboratory / R&D",
  "Security and Investigation",
  "Social Services",
  "Telecommunications",
  "Travel / Tourism",
  "Wholesale Trade",
  "Others",
] as const;

export const POSITION_LEVELS = [
  "Senior Management",
  "Middle Management",
  "Manager",
  "Professional",
  "Senior Executive",
  "Executive",
  "Junior Executive",
  "Non-executive",
  "Fresh/entry level",
] as const;

export const FLEXIBLE_WORK_ARRANGEMENTS = [
  { id: 1, label: "Flexi-Hours" },
  { id: 2, label: "Telecommuting" },
  { id: 3, label: "Employees Choice of Days Off" },
  { id: 4, label: "Staggered Time" },
  { id: 5, label: "Compressed Work Schedule" },
  { id: 6, label: "Creative Scheduling" },
] as const;

export const SCHEMES = [
  { id: 1, name: "P-Max", note: "no jobs seen" },
  { id: 2, name: "Career Conversion Programme (CCP)", note: "UI: For mid-career switchers" },
  { id: 3, name: "Career Trial", note: "no jobs seen" },
  { id: 4, name: "Career Support", note: "no jobs seen" },
  { id: 5, name: "SGUnited Traineeships", note: "no jobs seen" },
  { id: 6, name: "SGUnited Mid-Career Pathways", note: "no jobs seen" },
  { id: 7, name: "Mid-Career Pathways Programme", note: "UI: For mid-career attachments" },
  { id: 8, name: "GRaduate Industry Traineeships (GRIT)", note: "UI: For fresh graduates" },
] as const;

export const REGIONS = {
  Central: [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20],
  East: [16, 17, 18],
  North: [25, 26, 27],
  "North-East": [19, 28],
  West: [5, 21, 22, 23, 24],
  Islandwide: [998],
} as const;

export type Region = keyof typeof REGIONS;
export const REGION_NAMES = Object.keys(REGIONS) as [Region, ...Region[]];

export const POSTING_COMPANIES = ["Direct", "Third Party"] as const;

export const SORT_VALUES = ["relevancy", "new_posting_date", "min_monthly_salary", "normalised_job_title"] as const;

export const LANGUAGES = ["english", "zh-Hans", "ms", "ta"] as const;
