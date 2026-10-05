import * as XLSX from 'xlsx';
import { FoodRequest } from '../types';

function isContractorRequest(req: FoodRequest): boolean {
  return req.beneficiaryRole === 'Contractor';
}

export function buildCpsExportRows(requests: FoodRequest[]) {
  return requests
    .filter((r) => !isContractorRequest(r))
    .map((req) => ({
      DATE: req.date,
      'REQUESTER NAME': req.requesterName,
      'NAME (BENEFICIARY)': req.name,
      'AADHAR FIRST 4': req.aadharNumber || '',
      'VEG/NON-VEG': req.vegNonVeg,
      'MEAL TIME': req.type,
      REMARK: req.remarks || '',
      'MOBILE NO': req.requesterMobile || '-',
    }));
}

export function buildContractorExportRows(requests: FoodRequest[]) {
  return requests
    .filter((r) => isContractorRequest(r))
    .map((req) => ({
      DATE: req.date,
      'REQUESTER NAME': req.requesterName,
      'TEAM NAME': req.name,
      'NO OF FOOD': req.foodCount ?? '',
      'VEG/NON-VEG': req.vegNonVeg,
      'MEAL TIME': req.type,
      REMARK: req.remarks || '',
      'MOBILE NO': req.requesterMobile || '-',
    }));
}

export function writeFoodRequestsWorkbook(requests: FoodRequest[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const cpsSheet = XLSX.utils.json_to_sheet(buildCpsExportRows(requests));
  const contractorSheet = XLSX.utils.json_to_sheet(buildContractorExportRows(requests));
  XLSX.utils.book_append_sheet(workbook, cpsSheet, 'CPS Requests');
  XLSX.utils.book_append_sheet(workbook, contractorSheet, 'Contractor Requests');
  return workbook;
}

export function exportFoodRequestsToExcel(requests: FoodRequest[], fileName = 'Food_Requests_Data_Collect.xlsx') {
  const workbook = writeFoodRequestsWorkbook(requests);
  XLSX.writeFile(workbook, fileName);
}

export function exportFoodRequestsToCSV(requests: FoodRequest[], fileName = 'Food_Requests_Data_Collect.csv') {
  const cps = buildCpsExportRows(requests);
  const contractor = buildContractorExportRows(requests);
  const sections: string[] = [];
  if (cps.length) {
    sections.push('CPS REQUESTS');
    sections.push(Object.keys(cps[0]).join(','));
    sections.push(...cps.map((row) => Object.values(row).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')));
  }
  if (contractor.length) {
    if (sections.length) sections.push('');
    sections.push('CONTRACTOR REQUESTS');
    sections.push(Object.keys(contractor[0]).join(','));
    sections.push(
      ...contractor.map((row) => Object.values(row).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    );
  }
  const blob = new Blob([sections.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
