/** Food request persistence shape (no auth imports — safe for mongoHelpers). */

export interface FoodRequestShape {
  id: string;
  date: string;
  requesterName: string;
  requesterCps: string;
  requesterMobile: string;
  name: string;
  aadharNumber?: string;
  beneficiaryRole?: 'CPS' | 'Contractor';
  foodCount?: number;
  vegNonVeg: 'Veg' | 'Non-Veg';
  type: string;
  remarks?: string;
  createdAt: string;
  createdByRole?: string;
}

const MEAL_TYPE_VALUES = ['Breakfast', 'Lunch', 'Dinner'] as const;

export function normalizeMealType(type: string): string {
  const t = String(type).trim();
  if (t === 'Snacks') return 'Lunch';
  return (MEAL_TYPE_VALUES as readonly string[]).includes(t) ? t : 'Lunch';
}

export function normalizeBeneficiaryRole(role: string | undefined): 'CPS' | 'Contractor' {
  return role === 'Contractor' ? 'Contractor' : 'CPS';
}

export function normalizeFoodRequestDoc(
  raw: Record<string, unknown> | FoodRequestShape
): FoodRequestShape {
  const mobile = String(raw.requesterMobile ?? raw.requesterCps ?? '').trim();
  return {
    id: String(raw.id ?? `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`),
    date: String(raw.date ?? new Date().toISOString().slice(0, 10)),
    requesterName: String(raw.requesterName ?? '').trim(),
    requesterCps: String(raw.requesterCps ?? mobile).trim(),
    requesterMobile: mobile,
    name: String(raw.name ?? '').trim(),
    aadharNumber: raw.aadharNumber != null ? String(raw.aadharNumber).trim() : '',
    beneficiaryRole: normalizeBeneficiaryRole(
      raw.beneficiaryRole != null ? String(raw.beneficiaryRole) : undefined
    ),
    vegNonVeg: raw.vegNonVeg === 'Non-Veg' ? 'Non-Veg' : 'Veg',
    type: normalizeMealType(String(raw.type ?? 'Lunch')),
    remarks: raw.remarks != null ? String(raw.remarks).trim() : '',
    foodCount:
      raw.foodCount != null && raw.foodCount !== ''
        ? Math.max(0, parseInt(String(raw.foodCount), 10) || 0)
        : undefined,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    createdByRole:
      raw.createdByRole != null && raw.createdByRole !== ''
        ? String(raw.createdByRole)
        : undefined,
  };
}
