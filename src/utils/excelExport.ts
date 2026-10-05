import * as XLSX from 'xlsx';
import { FoodRequest } from '../types';

export function exportFoodRequestsToExcel(requests: FoodRequest[], fileName = 'Food_Requests_Data_Collect.xlsx') {
  const rows = requests.map((req) => ({
    DATE: req.date,
    'REQUESTER NAME': req.requesterName,
    NAME: req.name,
    'AADHAR FIRST 4': req.aadharNumber || '',
    ROLES: req.beneficiaryRole || 'CPS',
    'VEG/NON-VEG': req.vegNonVeg,
    TYPE: req.type,
    REMARK: req.remarks || '',
    'MOBILE NO': req.requesterMobile || '-',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 22 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'data collect - admin site');

  XLSX.writeFile(workbook, fileName);
}

export function exportFoodRequestsToCSV(requests: FoodRequest[], fileName = 'Food_Requests_Data_Collect.csv') {
  const headers = [
    'DATE',
    'REQUESTER NAME',
    'NAME',
    'AADHAR FIRST 4',
    'ROLES',
    'VEG/NON-VEG',
    'TYPE',
    'REMARK',
    'MOBILE NO',
  ];
  const csvRows = [
    headers.join(','),
    ...requests.map((r) =>
      [
        `"${r.date}"`,
        `"${r.requesterName.replace(/"/g, '""')}"`,
        `"${r.name.replace(/"/g, '""')}"`,
        `"${(r.aadharNumber || '').replace(/"/g, '""')}"`,
        `"${r.beneficiaryRole || 'CPS'}"`,
        `"${r.vegNonVeg}"`,
        `"${r.type}"`,
        `"${(r.remarks || '').replace(/"/g, '""')}"`,
        `"${r.requesterMobile || ''}"`,
      ].join(',')
    ),
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
