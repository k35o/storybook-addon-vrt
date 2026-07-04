export type {
  ResolvedVrtConfig,
  VrtFailOn,
  VrtOptions,
  VrtReport,
  VrtReportItem,
  VrtReportSummary,
  VrtRunMode,
  VrtStabilityOptions,
  VrtStatus,
  VrtStatusReason,
  VrtStoryParameters,
  VrtUncapturedReason,
} from './types';

/** Identity helper that gives editor completion to `vrt.config.json`-shaped objects. */
export function defineVrtConfig<const T extends import('./types').VrtOptions>(options: T): T {
  return options;
}
