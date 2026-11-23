// The search specification shared by the planner, the Studio API and every runner.
// It is the same shape search.mjs reads from a job file.
import { z } from 'zod';

export const AGENTS = ['catalyst', 'ace', 'prowess', 'capitaline'];

const code = (re) => z.array(z.string().regex(re)).max(20).default([]);
export const SearchSpec = z.object({
  job: z.string().regex(/^[a-z0-9-]{1,60}$/),
  brief: z.string().max(500).default(''),
  closingDate: z.string().regex(/^\d{2}\/\d{2}$/).default('31/12'),
  regions: z.array(z.string().min(2).max(60)).min(1).max(30),
  accountType: z.enum(['U1', 'U2', 'C1', 'C2']).default('U1'),
  status: z.array(z.enum(['Active', 'Inactive', 'Unknown'])).min(1).default(['Active']),
  independence: z.array(z.enum(['A', 'B', 'C', 'D', 'U'])).min(1).default(['A', 'B', 'U']),
  companiesWith: z.array(z.enum(['website', 'overview', 'tradeDescription'])).default(['website', 'overview', 'tradeDescription']),
  years: z.array(z.number().int().min(2017).max(2026)).min(1).max(5),
  yearRule: z.enum(['all', 'atLeastOne']).default('all'),
  financials: z.array(z.object({
    item: z.string().min(2).max(80),
    min: z.number().nullish(),
    max: z.number().nullish(),
    unit: z.enum(['thousand', 'million', 'billion']).default('million'),
    currency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  }).refine((f) => f.min != null || f.max != null, 'needs a minimum or a maximum')
    .refine((f) => f.min == null || f.max == null || f.max >= f.min, 'maximum is below the minimum')).max(6),
  nace: code(/^\d{2,4}$/),
  usSic: code(/^\d{2,4}$/),
  naics: code(/^\d{3,6}$/),
  text: z.array(z.string().min(2).max(200)).max(4).default([]),
  maxCompanies: z.number().int().min(1).max(10000).default(2000), // the runner narrows the search until it is within this
}).passthrough().refine((s) => s.nace.length + s.usSic.length + s.naics.length + s.text.length > 0, 'needs at least one industry code or keyword search');

// Prowess (CMIE): the industry is a set of CMIE product/service group names, ticked exactly as written. Years are
// March year-ends (2024 = FY 2023-24). Identity and financial columns are fixed in prowess.mjs; filtering happens
// afterwards in TAIGA, so there are no thresholds here.
const marchYear = z.number().int().min(2010).max(2030);
export const ProwessSpec = z.object({
  job: z.string().regex(/^[a-z0-9-]{1,60}$/),
  brief: z.string().max(500).default(''),
  groups: z.array(z.string().min(2).max(160)).min(1).max(20),
  fromYear: marchYear,
  toYear: marchYear,
  rptYear: marchYear, // related-party data is pulled for one year per run
}).refine((s) => s.toYear >= s.fromYear && s.toYear - s.fromYear <= 4, 'years must run from the first to the last, five at most')
  .refine((s) => s.rptYear >= s.fromYear && s.rptYear <= s.toYear, 'the related-party year must be one of the years');
export const specFor = (agent) => (agent === 'prowess' ? ProwessSpec : SearchSpec);
