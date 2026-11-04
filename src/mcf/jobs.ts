import { z } from "zod";
import { htmlToText } from "./html.js";

// ---------------------------------------------------------------------------
// Lenient response schemas (the API is unofficial; every field is optional).
// ---------------------------------------------------------------------------

const str = z.string().nullish();
const num = z.number().nullish();

const salarySchema = z.looseObject({
  minimum: num,
  maximum: num,
  type: z.looseObject({ salaryType: str }).nullish(),
});

const companySchema = z.looseObject({ uen: str, name: str });

const addressSchema = z.looseObject({
  block: str,
  street: str,
  building: str,
  postalCode: str,
  isOverseas: z.boolean().nullish(),
  overseasCountry: str,
  foreignAddress1: str,
  foreignAddress2: str,
  districts: z.array(z.looseObject({ id: num, location: str })).nullish(),
});

const metadataSchema = z.looseObject({
  jobPostId: str,
  newPostingDate: str,
  originalPostingDate: str,
  createdAt: str,
  updatedAt: str,
  expiryDate: str,
  totalNumberJobApplication: num,
  totalNumberOfView: num,
  isHideSalary: z.boolean().nullish(),
  jobDetailsUrl: str,
});

const jobShape = {
  uuid: z.string(),
  title: str,
  status: z.looseObject({ jobStatus: str }).nullish(),
  salary: salarySchema.nullish(),
  postedCompany: companySchema.nullish(),
  hiringCompany: companySchema.nullish(),
  address: addressSchema.nullish(),
  employmentTypes: z.array(z.looseObject({ employmentType: str })).nullish(),
  positionLevels: z.array(z.looseObject({ position: str })).nullish(),
  categories: z.array(z.looseObject({ category: str })).nullish(),
  skills: z.array(z.looseObject({ skill: str, uuid: str })).nullish(),
  schemes: z.array(z.unknown()).nullish(),
  flexibleWorkArrangements: z.array(z.unknown()).nullish(),
  shiftPattern: z.unknown().optional(),
  metadata: metadataSchema.nullish(),
};

export const jobListItemSchema = z.looseObject(jobShape);

export const searchResponseSchema = z.looseObject({
  results: z.array(jobListItemSchema),
  total: z.number().nullish(),
});

export const jobDetailsSchema = z.looseObject({
  ...jobShape,
  description: str,
  minimumYearsExperience: num,
  numberOfVacancies: num,
  workingHours: str,
  otherRequirements: str,
});

export const skillSuggestionsSchema = z.looseObject({
  skills: z.array(z.looseObject({ skill: z.string(), uuid: z.string() })),
});

export const popularJobTitlesSchema = z.array(z.looseObject({ icmsJobTitle: z.string(), count: num }));
export const inDemandJobTitlesSchema = z.array(z.looseObject({ jobTitle: z.string(), count: num }));


export type JobListItem = z.output<typeof jobListItemSchema>;
export type JobDetails = z.output<typeof jobDetailsSchema>;

// ---------------------------------------------------------------------------
// Compact output shapes
// ---------------------------------------------------------------------------

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const salaryOutputSchema = z
  .object({ min: nullableNumber, max: nullableNumber, type: nullableString })
  .nullable();

const fullJobSummarySchema = z.object({
  uuid: z.string(),
  title: nullableString,
  company: nullableString,
  hiringCompany: nullableString,
  salary: salaryOutputSchema,
  isHideSalary: z.boolean().nullable(),
  employmentTypes: z.array(z.string()),
  positionLevels: z.array(z.string()),
  categories: z.array(z.string()),
  address: nullableString,
  district: nullableString,
  skills: z.array(z.string()),
  newPostingDate: nullableString,
  jobPostId: nullableString,
  jobDetailsUrl: nullableString,
  totalNumberJobApplication: nullableNumber,
});
type FullJobSummary = z.infer<typeof fullJobSummarySchema>;

/** List summary. address, skills and jobDetailsUrl are present only with detail "full". */
export const jobSummarySchema = fullJobSummarySchema
  .omit({ address: true, skills: true, jobDetailsUrl: true })
  .extend({
    address: nullableString.optional(),
    skills: z.array(z.string()).optional(),
    jobDetailsUrl: nullableString.optional(),
  });
export type JobSummary = z.infer<typeof jobSummarySchema>;
export type JobDetail = "compact" | "full";

function compact<T>(items: ReadonlyArray<T | null | undefined> | null | undefined): T[] {
  return (items ?? []).filter((item): item is T => item !== null && item !== undefined);
}

function toSalary(salary: JobListItem["salary"]): z.infer<typeof salaryOutputSchema> {
  if (!salary) return null;
  return {
    min: salary.minimum ?? null,
    max: salary.maximum ?? null,
    type: salary.type?.salaryType ?? null,
  };
}

function toAddress(address: JobListItem["address"]): { address: string | null; district: string | null } {
  if (!address) return { address: null, district: null };
  const district = address.districts?.[0]?.location ?? null;
  if (address.isOverseas) {
    const parts = compact([address.foreignAddress1, address.foreignAddress2, address.overseasCountry]);
    return { address: parts.join(", ") || null, district };
  }
  const line = compact([address.block, address.street].filter(Boolean)).join(" ");
  const parts = compact([line || null, address.building, address.postalCode ? `S${address.postalCode}` : null]);
  return { address: parts.join(", ") || null, district };
}

/** Best-effort label for loosely typed entries (schemes, flexible work arrangements). */
function labelOf(item: unknown): string | null {
  if (typeof item === "string") return item;
  if (typeof item === "object" && item !== null) {
    for (const key of ["scheme", "name", "schemeName", "flexibleWorkArrangement", "description", "label"]) {
      const value = (item as Record<string, unknown>)[key];
      if (typeof value === "string" && value !== "") return value;
      if (typeof value === "object" && value !== null) {
        const nested = labelOf(value);
        if (nested !== null) return nested;
      }
    }
    return JSON.stringify(item);
  }
  return item === null || item === undefined ? null : String(item);
}

export function labelsOf(items: ReadonlyArray<unknown> | null | undefined): string[] {
  return compact((items ?? []).map(labelOf));
}

/**
 * List summary. "compact" (default) omits address, skills and jobDetailsUrl;
 * "full" includes them. Ranking scores are always dropped.
 */
export function summarizeJob(job: JobListItem, detail: JobDetail = "compact"): JobSummary {
  const { address, skills, jobDetailsUrl, ...rest } = summarizeJobFull(job);
  return detail === "full" ? { ...rest, address, skills, jobDetailsUrl } : rest;
}

function summarizeJobFull(job: JobListItem): FullJobSummary {
  const { address, district } = toAddress(job.address);
  return {
    uuid: job.uuid,
    title: job.title ?? null,
    company: job.postedCompany?.name ?? null,
    hiringCompany: job.hiringCompany?.name ?? null,
    salary: toSalary(job.salary),
    isHideSalary: job.metadata?.isHideSalary ?? null,
    employmentTypes: compact(job.employmentTypes?.map((t) => t.employmentType)),
    positionLevels: compact(job.positionLevels?.map((p) => p.position)),
    categories: compact(job.categories?.map((c) => c.category)),
    address,
    district,
    skills: compact(job.skills?.map((s) => s.skill)),
    newPostingDate: job.metadata?.newPostingDate ?? null,
    jobPostId: job.metadata?.jobPostId ?? null,
    jobDetailsUrl: job.metadata?.jobDetailsUrl ?? null,
    totalNumberJobApplication: job.metadata?.totalNumberJobApplication ?? null,
  };
}

export const jobDetailsOutputSchema = z.object({
  uuid: z.string(),
  title: nullableString,
  company: nullableString,
  hiringCompany: nullableString,
  status: nullableString,
  description: nullableString,
  descriptionHtml: z.string().optional(),
  salary: salaryOutputSchema,
  isHideSalary: z.boolean().nullable(),
  minimumYearsExperience: nullableNumber,
  numberOfVacancies: nullableNumber,
  workingHours: nullableString,
  shiftPattern: nullableString,
  otherRequirements: nullableString,
  skills: z.array(z.string()),
  schemes: z.array(z.string()),
  flexibleWorkArrangements: z.array(z.string()),
  categories: z.array(z.string()),
  employmentTypes: z.array(z.string()),
  positionLevels: z.array(z.string()),
  address: nullableString,
  district: nullableString,
  jobPostId: nullableString,
  newPostingDate: nullableString,
  originalPostingDate: nullableString,
  expiryDate: nullableString,
  totalNumberOfView: nullableNumber,
  totalNumberJobApplication: nullableNumber,
  jobDetailsUrl: nullableString,
});
export type JobDetailsOutput = z.infer<typeof jobDetailsOutputSchema>;

export function summarizeJobDetails(job: JobDetails, includeRawHtml: boolean): JobDetailsOutput {
  const base = summarizeJobFull(job);
  const text = job.description ? htmlToText(job.description) : null;
  const shift = labelOf(job.shiftPattern);
  const output: JobDetailsOutput = {
    uuid: base.uuid,
    title: base.title,
    company: base.company,
    hiringCompany: base.hiringCompany,
    status: job.status?.jobStatus ?? null,
    description: text,
    salary: base.salary,
    isHideSalary: base.isHideSalary,
    minimumYearsExperience: job.minimumYearsExperience ?? null,
    numberOfVacancies: job.numberOfVacancies ?? null,
    workingHours: job.workingHours ?? null,
    shiftPattern: shift,
    otherRequirements: job.otherRequirements ?? null,
    skills: base.skills,
    schemes: labelsOf(job.schemes),
    flexibleWorkArrangements: labelsOf(job.flexibleWorkArrangements),
    categories: base.categories,
    employmentTypes: base.employmentTypes,
    positionLevels: base.positionLevels,
    address: base.address,
    district: base.district,
    jobPostId: base.jobPostId,
    newPostingDate: base.newPostingDate,
    originalPostingDate: job.metadata?.originalPostingDate ?? null,
    expiryDate: job.metadata?.expiryDate ?? null,
    totalNumberOfView: job.metadata?.totalNumberOfView ?? null,
    totalNumberJobApplication: base.totalNumberJobApplication,
    jobDetailsUrl: base.jobDetailsUrl,
  };
  if (includeRawHtml) output.descriptionHtml = job.description ?? "";
  return output;
}
