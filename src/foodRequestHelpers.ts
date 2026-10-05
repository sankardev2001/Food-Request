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

export type EmployerFieldErrors = Partial<Record<EmployerMandatoryField, boolean>>;

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
  if (
    body.beneficiaryRole != null &&
    body.beneficiaryRole !== '' &&
    body.beneficiaryRole !== 'CPS' &&
    body.beneficiaryRole !== 'Contractor'
  ) {
    return { ok: false, error: 'Role must be CPS or Contractor.' } as const;
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
    createdByRole?: string;
    id?: string;
    createdAt?: string;
  }
): FoodRequestShape {
  return normalizeFoodRequestDoc({
    id: fields.id || `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    date: fields.date || new Date().toISOString().slice(0, 10),
    requesterName: auth.name,
    requesterCps: auth.mobileNo,
    requesterMobile: auth.mobileNo,
    name: fields.name.trim(),
    aadharNumber: fields.aadharNumber?.trim() || '',
    beneficiaryRole: normalizeBeneficiaryRole(fields.beneficiaryRole),
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
