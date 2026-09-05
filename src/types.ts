export type UserRole = 'employer' | 'admin';

export interface UserProfile {
  id?: string;
  name: string;
  cpsNo: string;
  mobileNo: string;
  role: UserRole;
  aadharNumber?: string;
  isSuperAdmin?: boolean;
  token?: string;
  loggedInAt?: string;
}

// Stored in the 'users' table
export interface AppUser {
  id: string;
  name: string;
  cpsNo: string;
  mobileNo: string;
  userType: UserRole;
  aadharNumber: string;
  isSuperAdmin?: boolean;
  createdAt: string;
}

export type FoodType = 'Veg' | 'Non-Veg';
// Meal type replacing detaction/non-detaction
export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';

// Stored in the 'food_requests' table
export interface FoodRequest {
  id: string;
  date: string;              // YYYY-MM-DD
  requesterName: string;     // Name of requester (logged in employer or admin)
  requesterCps: string;      // CPS No of requester
  requesterMobile: string;   // Mobile No of requester
  name: string;              // Beneficiary name
  aadharNumber: string;      // First 4 digits or full Aadhar
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
