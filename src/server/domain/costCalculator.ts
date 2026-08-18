import type { MonthlyCost, PrototypeSubsidy } from "../../shared/types";

export const PROTOTYPE_SUBSIDY_RATE = 0.2;

export function calculatePrototypeSubsidy(
  annualIncome: number,
): PrototypeSubsidy {
  if (!Number.isFinite(annualIncome) || annualIncome < 0) {
    throw new Error("annualIncome must be a non-negative number");
  }

  const annualSubsidy = Math.floor(annualIncome * PROTOTYPE_SUBSIDY_RATE);

  return {
    annual_subsidy: annualSubsidy,
    monthly_subsidy: Math.floor(annualSubsidy / 12),
    formula_version: "prototype-v1",
    prototype_only: true,
  };
}

export function calculateMonthlyCost(
  monthlyFee: number,
  annualIncome: number,
): MonthlyCost {
  if (!Number.isFinite(monthlyFee) || monthlyFee < 0) {
    throw new Error("monthlyFee must be a non-negative number");
  }

  const subsidy = calculatePrototypeSubsidy(annualIncome);

  return {
    ...subsidy,
    monthly_fee: monthlyFee,
    estimated_self_pay: Math.max(0, monthlyFee - subsidy.monthly_subsidy),
  };
}
