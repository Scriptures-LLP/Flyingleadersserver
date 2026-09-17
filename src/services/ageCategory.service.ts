import { Setting } from "../models/Setting.js";

export type TravellerType = "adult" | "child" | "infant";

const DEFAULT_INFANT_MAX_AGE = 2;
const DEFAULT_CHILD_MAX_AGE = 11;

// Configurable via admin Settings (keys below) instead of hard-coded, so the
// business can change where "child" ends and "adult" begins without a code
// change — this is the single source of truth every layer (admin, app,
// pricing, invoice) must agree on, so age-vs-type can never mismatch.
export async function getAgeCategoryConfig(): Promise<{ infantMaxAge: number; childMaxAge: number }> {
  const [infantSetting, childSetting] = await Promise.all([
    Setting.findOne({ key: "age_category_infant_max_age" }),
    Setting.findOne({ key: "age_category_child_max_age" }),
  ]);

  const infantMaxAge = Number(infantSetting?.value);
  const childMaxAge = Number(childSetting?.value);

  return {
    infantMaxAge: Number.isFinite(infantMaxAge) && infantMaxAge >= 0 ? infantMaxAge : DEFAULT_INFANT_MAX_AGE,
    childMaxAge: Number.isFinite(childMaxAge) && childMaxAge >= 0 ? childMaxAge : DEFAULT_CHILD_MAX_AGE,
  };
}

export function categorizeAge(age: number, config: { infantMaxAge: number; childMaxAge: number }): TravellerType {
  if (age <= config.infantMaxAge) return "infant";
  if (age <= config.childMaxAge) return "child";
  return "adult";
}
