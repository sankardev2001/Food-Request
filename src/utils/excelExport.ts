import * as XLSX from 'xlsx';
import { FoodRequest } from '../types';

export function exportFoodRequestsToExcel(requests: FoodRequest[], fileName = 'Food_Requests_Data_Collect.xlsx') {
  // Format data exactly matching the user's Excel column headers
  const rows = requests.map((req) => ({
    'DATE': req.date,
    'REQUESTER NAME': req.requesterName,
    'NAME': req.name,
    'AADHAR NUMBER': req.aadharNumber,
    'VEG/NON-VEG': req.vegNonVeg,
    'TYPE': req.type,
    'CPS NO': req.requesterCps || '-',
    'MOBILE NO': req.requesterMobile || '-',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths for polished Excel appearance
  worksheet['!cols'] = [
    { wch: 14 }, // DATE
    { wch: 22 }, // REQUESTER NAME
    { wch: 22 }, // NAME
    { wch: 18 }, // AADHAR NUMBER
    { wch: 16 }, // VEG/NON-VEG
    { wch: 18 }, // TYPE
    { wch: 15 }, // CPS NO
    { wch: 16 }, // MOBILE NO
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'data collect - admin site');

  XLSX.writeFile(workbook, fileName);
}

export function exportFoodRequestsToCSV(requests: FoodRequest[], fileName = 'Food_Requests_Data_Collect.csv') {
  const headers = ['DATE', 'REQUESTER NAME', 'NAME', 'AADHAR NUMBER', 'VEG/NON-VEG', 'TYPE', 'CPS NO', 'MOBILE NO'];
  const csvRows = [
    headers.join(','),
    ...requests.map((r) => [
      `"${r.date}"`,
      `"${r.requesterName.replace(/"/g, '""')}"`,
      `"${r.name.replace(/"/g, '""')}"`,
      `"${r.aadharNumber}"`,
      `"${r.vegNonVeg}"`,
      `"${r.type}"`,
      `"${r.requesterCps || ''}"`,
      `"${r.requesterMobile || ''}"`,
    ].join(',')),
  ];

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
