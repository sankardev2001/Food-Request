import type { AuthTokenPayload } from './authSecurity';
import {
  normalizeBeneficiaryRole,
  normalizeFoodRequestDoc,
  normalizeMealType,
  type FoodRequestShape,
} from './foodRequestNormalize';

export type { FoodRequestShape };
export { normalizeBeneficiaryRole, normalizeFoodRequestDoc, normalizeMealType };

export type EmployerMandatoryField = 'name' | 'aadharNumber';

export type ContractorMandatoryField = 'teamName' | 'foodCount';

export type EmployerFieldErrors = Partial<Record<EmployerMandatoryField, boolean>>;

export type ContractorFieldErrors = Partial<Record<ContractorMandatoryField, boolean>>;

/** Employers may edit their own requests only within this window after creation. Records are never auto-deleted — they remain in MongoDB / admin Excel. */
export const FOOD_REQUEST_EDIT_WINDOW_MS = 30 * 60 * 1000;

export function isFoodRequestEditable(createdAt: string, now = Date.now()): boolean {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t <= FOOD_REQUEST_EDIT_WINDOW_MS;
}

export function getFoodRequestEditRemainingMs(createdAt: string, now = Date.now()): number {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, FOOD_REQUEST_EDIT_WINDOW_MS - (now - t));
}

export function assertEmployerCanEditRequest(
  auth: AuthTokenPayload,
  req: { createdAt: string; requesterMobile: string }
): string | null {
  if (auth.role === 'admin') return null;
  if (!canManageRequest(auth, req)) {
    return 'You can only edit your own requests.';
  }
  if (!isFoodRequestEditable(req.createdAt)) {
    return 'Edit window expired (30 minutes after submit). This request can no longer be changed.';
  }
  return null;
}

export function isAadharFirst4(value: string): boolean {
  return /^\d{4}$/.test(String(value).trim());
}

export function getEmployerFieldErrors(row: {
  name: string;
  aadharNumber: string;
  remarks: string;
}): EmployerFieldErrors {
  return {
    name: !row.name.trim(),
    aadharNumber: !isAadharFirst4(row.aadharNumber),
  };
}

export function employerRowHasInput(row: {
  name: string;
  aadharNumber: string;
  remarks: string;
}): boolean {
  return Boolean(row.name.trim() || row.aadharNumber.trim() || row.remarks.trim());
}

export function isEmployerRowComplete(row: {
  name: string;
  aadharNumber: string;
  remarks: string;
}): boolean {
  const err = getEmployerFieldErrors(row);
  return !err.name && !err.aadharNumber;
}

export type EmployerFoodValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

export function isContractorFoodCount(value: string | number | undefined): boolean {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) && n >= 1 && n <= 9999;
}

export function getContractorFieldErrors(row: {
  teamName: string;
  foodCount: string;
  remarks: string;
}): ContractorFieldErrors {
  return {
    teamName: !row.teamName.trim(),
    foodCount: !isContractorFoodCount(row.foodCount),
  };
}

export function contractorRowHasInput(row: {
  teamName: string;
  foodCount: string;
  remarks: string;
}): boolean {
  return Boolean(row.teamName.trim() || row.foodCount.trim() || row.remarks.trim());
}

export function isContractorRowComplete(row: {
  teamName: string;
  foodCount: string;
  remarks: string;
}): boolean {
  const err = getContractorFieldErrors(row);
  return !err.teamName && !err.foodCount;
}

export function validateFoodRequestItem(
  beneficiaryRole: 'CPS' | 'Contractor',
  body: {
    name?: string;
    aadharNumber?: string;
    foodCount?: number | string;
    vegNonVeg?: string;
    type?: string;
    remarks?: string;
  }
): EmployerFoodValidation {
  if (!body.vegNonVeg || !['Veg', 'Non-Veg'].includes(body.vegNonVeg)) {
    return { ok: false, error: 'Food type (Veg/Non-Veg) is required.' } as const;
  }
  if (!body.type?.trim()) {
    return { ok: false, error: 'Meal type is required.' } as const;
  }
  if (beneficiaryRole === 'Contractor') {
    if (!body.name?.trim()) {
      return { ok: false, error: 'Team name is required.' } as const;
    }
    if (!isContractorFoodCount(body.foodCount)) {
      return { ok: false, error: 'No of Food must be a number from 1 to 9999.' } as const;
    }
    return { ok: true } as const;
  }
  return validateEmployerFoodBody({
    name: body.name,
    aadharNumber: body.aadharNumber,
    vegNonVeg: body.vegNonVeg,
    type: body.type,
    remarks: body.remarks,
  });
}

export function validateEmployerFoodBody(body: {
  name?: string;
  aadharNumber?: string;
  vegNonVeg?: string;
  type?: string;
  remarks?: string;
  beneficiaryRole?: string;
}): EmployerFoodValidation {
  if (!body.name?.trim()) {
    return { ok: false, error: 'Beneficiary name is required.' } as const;
  }
  if (!isAadharFirst4(body.aadharNumber ?? '')) {
    return { ok: false, error: 'Aadhar first 4 digits must be exactly 4 numbers.' } as const;
  }
  if (!body.vegNonVeg || !['Veg', 'Non-Veg'].includes(body.vegNonVeg)) {
    return { ok: false, error: 'Food type (Veg/Non-Veg) is required.' } as const;
  }
  if (!body.type?.trim()) {
    return { ok: false, error: 'Meal type is required.' } as const;
  }
  return { ok: true } as const;
}

export function buildFoodRequest(
  auth: AuthTokenPayload,
  fields: {
    name: string;
    vegNonVeg: string;
    type: string;
    date?: string;
    remarks?: string;
    aadharNumber?: string;
    beneficiaryRole?: string;
    foodCount?: number;
    createdByRole?: string;
    id?: string;
    createdAt?: string;
  }
): FoodRequestShape {
  const role = normalizeBeneficiaryRole(fields.beneficiaryRole);
  const foodCount =
    role === 'Contractor' && fields.foodCount != null
      ? Math.max(1, parseInt(String(fields.foodCount), 10) || 1)
      : undefined;
  return normalizeFoodRequestDoc({
    id: fields.id || `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    date: fields.date || new Date().toISOString().slice(0, 10),
    requesterName: auth.name,
    requesterCps: auth.mobileNo,
    requesterMobile: auth.mobileNo,
    name: fields.name.trim(),
    aadharNumber: role === 'CPS' ? fields.aadharNumber?.trim() || '' : '',
    beneficiaryRole: role,
    foodCount,
    vegNonVeg: fields.vegNonVeg === 'Non-Veg' ? 'Non-Veg' : 'Veg',
    type: normalizeMealType(fields.type),
    remarks: fields.remarks?.trim() || '',
    createdAt: fields.createdAt || new Date().toISOString(),
    createdByRole: fields.createdByRole || auth.role,
  });
}

export function canManageRequest(auth: AuthTokenPayload, req: { requesterMobile: string }): boolean {
  if (auth.role === 'admin') return true;
  return req.requesterMobile.trim() === auth.mobileNo.trim();
}
