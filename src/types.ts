export type UserRole = 'employer' | 'admin';

export interface UserProfile {
  id?: string;
  name: string;
  team?: string;
  mobileNo: string;
  role: UserRole;
  isSuperAdmin?: boolean;
  token?: string;
  loggedInAt?: string;
}

// Stored in the 'users' table
export interface AppUser {
  id: string;
  name: string;
  team?: string;
  mobileNo: string;
  password?: string;
  userType: UserRole;
  isSuperAdmin?: boolean;
  createdAt: string;
}

export type FoodType = 'Veg' | 'Non-Veg';
/** Beneficiary role on a food request (not the logged-in user role). */
export type BeneficiaryRole = 'CPS' | 'Contractor';
// Meal type replacing detaction/non-detaction
export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';

// Stored in the 'food_requests' table
export interface FoodRequest {
  id: string;
  date: string;              // YYYY-MM-DD
  requesterName: string;     // Name of requester (logged in employer or admin)
  requesterCps: string;      // Legacy field; new requests use requesterMobile for ownership
  requesterMobile: string;   // Mobile No of requester
  name: string;              // Beneficiary name
  aadharNumber?: string;     // First 4 digits of Aadhar (employer submissions)
  beneficiaryRole?: BeneficiaryRole; // CPS | Contractor
  vegNonVeg: FoodType;       // 'Veg' | 'Non-Veg'
  type: MealType;            // 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks'
  remarks?: string;
  createdAt: string;
  createdByRole?: string;
}

export interface FoodStats {
  total: number;
  vegCount: number;
  nonVegCount: number;
  breakfastCount: number;
  lunchCount: number;
  dinnerCount: number;
  snacksCount: number;
  todayCount: number;
}
