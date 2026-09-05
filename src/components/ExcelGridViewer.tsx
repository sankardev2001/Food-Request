import React, { useState } from 'react';
import { FoodRequest } from '../types';
import { exportFoodRequestsToExcel, exportFoodRequestsToCSV } from '../utils/excelExport';
import { Download, FileSpreadsheet, Search, Filter, Trash2, Calendar, FileText, Check } from 'lucide-react';

interface ExcelGridViewerProps {
  requests: FoodRequest[];
  onDeleteRequest: (id: string) => void;
  onRefresh: () => void;
  isAdmin: boolean;
}

export const ExcelGridViewer: React.FC<ExcelGridViewerProps> = ({
  requests,
  onDeleteRequest,
  onRefresh,
  isAdmin,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [filterVeg, setFilterVeg] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>({ row: 0, col: 0 });
  const [exporting, setExporting] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Filtering
  const filteredRequests = requests.filter((req) => {
    const matchesSearch =
      !searchQuery ||
      req.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.requesterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.aadharNumber.includes(searchQuery) ||
      (req.requesterCps && req.requesterCps.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesDate = !selectedDate || req.date === selectedDate;
    const matchesVeg = filterVeg === 'all' || req.vegNonVeg === filterVeg;
    const matchesType = filterType === 'all' || req.type === filterType;

    return matchesSearch && matchesDate && matchesVeg && matchesType;
  });

  const handleDownloadExcel = async () => {
    setExporting(true);
    setDownloadSuccess(false);
    try {
      // First try server export endpoint
      const response = await fetch(`/api/requests/export.xlsx?role=admin`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Food_Requests_Admin_Data_Collect_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        // Fallback to client-side XLSX generation
        exportFoodRequestsToExcel(filteredRequests);
      }
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (e) {
      console.warn('Server export failed, executing client-side XLSX generation:', e);
      exportFoodRequestsToExcel(filteredRequests);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadCSV = () => {
    exportFoodRequestsToCSV(filteredRequests);
  };

  // Generate blank placeholder rows for authentic Excel look (at least 15 rows visible)
  const minRows = 15;
  const blankRowsCount = Math.max(0, minRows - filteredRequests.length);

  return (
    <div className="space-y-4">
      {/* Control Bar: Filters & Action buttons */}
      <div className="bg-white/50 backdrop-blur-2xl p-5 rounded-[2rem] border border-white/60 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="admin-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search requester, beneficiary, aadhar..."
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-white/70 bg-white/70 backdrop-blur-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs transition-all"
            />
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="date"
              id="admin-date-filter"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 text-xs border border-white/70 rounded-xl bg-white/70 backdrop-blur-sm text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs"
            />
            {selectedDate && (
              <button
                type="button"
                onClick={() => setSelectedDate('')}
                className="text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Veg / Non-Veg filter */}
          <select
            id="admin-filter-veg"
            value={filterVeg}
            onChange={(e) => setFilterVeg(e.target.value)}
            className="px-3 py-2 text-xs border border-white/70 rounded-xl bg-white/70 backdrop-blur-sm text-slate-800 font-medium focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs cursor-pointer"
          >
            <option value="all">All Food Types</option>
            <option value="Veg">Veg Only</option>
            <option value="Non-Veg">Non-Veg Only</option>
          </select>

          {/* Type filter */}
          <select
            id="admin-filter-type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 text-xs border border-white/70 rounded-xl bg-white/70 backdrop-blur-sm text-slate-800 font-medium focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-xs cursor-pointer"
          >
            <option value="all">All Meal Types</option>
            <option value="Breakfast">Breakfast</option>
            <option value="Lunch">Lunch</option>
            <option value="Dinner">Dinner</option>
            <option value="Snacks">Snacks</option>
          </select>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            id="btn-download-csv"
            onClick={handleDownloadCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white/60 hover:bg-white/90 border border-white/70 rounded-xl transition-all shadow-xs cursor-pointer backdrop-blur-md"
            title="Download CSV spreadsheet"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            id="btn-download-excel"
            onClick={handleDownloadExcel}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl border border-emerald-400/40 transition-all shadow-lg shadow-emerald-500/25 cursor-pointer disabled:opacity-60"
            title="Download full formatted Excel .xlsx file"
          >
            {downloadSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-200" />
                <span>Downloaded .xlsx</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4 text-white" />
                <span>{exporting ? 'Generating...' : 'Download Excel (.xlsx)'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Excel Sheet UI matching Screenshot 1 */}
      <div className="bg-white/60 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl border border-white/60 overflow-hidden">
        {/* Top Excel Ribbon Bar */}
        <div className="bg-white/40 backdrop-blur-xl border-b border-white/40 px-5 py-3 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Workbook: Food_Requests_Master.xlsx
            </span>
            <span className="text-slate-400">|</span>
            <span className="font-mono text-[11px] text-slate-500">
              Active Sheet: [data collect - admin site] ({filteredRequests.length} rows)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-emerald-800 bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-0.5 rounded-full font-bold">
              Excel Grid Mode
            </span>
          </div>
        </div>

        {/* Formula / Cell Bar */}
        <div className="bg-white/30 backdrop-blur-md border-b border-white/30 px-4 py-2 flex items-center gap-2.5 text-xs font-mono">
          <div className="bg-white/70 px-2.5 py-0.5 rounded-lg border border-white/80 text-slate-800 font-bold min-w-[40px] text-center shadow-xs">
            {activeCell ? `${String.fromCharCode(65 + activeCell.col)}${activeCell.row + 2}` : 'A1'}
          </div>
          <span className="text-slate-400 font-sans italic">fx</span>
          <div className="text-slate-700 truncate flex-1 font-sans text-xs">
            {activeCell && filteredRequests[activeCell.row]
              ? Object.values(filteredRequests[activeCell.row])[activeCell.col] || ''
              : 'Select any cell in the table to inspect'}
          </div>
        </div>

        {/* The Spreadsheet Grid Table */}
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full border-collapse text-left text-xs font-sans">
            {/* Column Letters (A, B, C, D, E, F...) */}
            <thead>
              <tr className="bg-white/30 text-slate-500 font-mono text-[11px] border-b border-white/50 select-none backdrop-blur-sm">
                <th className="w-10 px-2 py-1 text-center bg-white/40 border-r border-white/50 font-semibold">
                  #
                </th>
                <th className="px-3 py-1.5 font-semibold text-center border-r border-white/50">A</th>
                <th className="px-3 py-1.5 font-semibold text-center border-r border-white/50">B</th>
                <th className="px-3 py-1.5 font-semibold text-center border-r border-white/50">C</th>
                <th className="px-3 py-1.5 font-semibold text-center border-r border-white/50">D</th>
                <th className="px-3 py-1.5 font-semibold text-center border-r border-white/50">E</th>
                <th className="px-3 py-1.5 font-semibold text-center border-r border-white/50">F</th>
                {isAdmin && <th className="px-3 py-1.5 font-semibold text-center">Action</th>}
              </tr>

              {/* Exact Column Names matching Screenshot 1 */}
              {/* DATE | REQUESTER NAME | NAME | AADHAR NUMBER | VEG/NON-VEG | TYPE */}
              <tr className="bg-white/70 text-slate-800 font-black border-y border-white/60 tracking-wider select-none backdrop-blur-md">
                <th className="w-10 px-2 py-2 text-center bg-white/50 border-r border-white/50 font-mono text-slate-600">
                  1
                </th>
                <th className="px-4 py-2.5 border-r border-white/50 whitespace-nowrap">DATE</th>
                <th className="px-4 py-2.5 border-r border-white/50 whitespace-nowrap">REQUESTER NAME</th>
                <th className="px-4 py-2.5 border-r border-white/50 whitespace-nowrap">NAME</th>
                <th className="px-4 py-2.5 border-r border-white/50 whitespace-nowrap">AADHAR NUMBER</th>
                <th className="px-4 py-2.5 border-r border-white/50 whitespace-nowrap">VEG/NON-VEG</th>
                <th className="px-4 py-2.5 border-r border-white/50 whitespace-nowrap">TYPE</th>
                {isAdmin && <th className="px-3 py-2.5 text-center text-slate-600 font-semibold">Manage</th>}
              </tr>
            </thead>

            <tbody className="divide-y divide-white/40 bg-white/40">
              {filteredRequests.map((req, rIdx) => (
                <tr
                  key={req.id}
                  className="hover:bg-white/80 transition-colors group cursor-pointer"
                  onClick={() => setActiveCell({ row: rIdx, col: 0 })}
                >
                  {/* Row Number */}
                  <td className="w-10 px-2 py-2 text-center bg-white/30 border-r border-white/50 font-mono text-[11px] text-slate-500 select-none">
                    {rIdx + 2}
                  </td>

                  {/* DATE */}
                  <td
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveCell({ row: rIdx, col: 0 });
                    }}
                    className={`px-4 py-2 font-mono border-r border-white/50 whitespace-nowrap text-slate-800 ${
                      activeCell?.row === rIdx && activeCell?.col === 0
                        ? 'outline-2 outline-emerald-600 -outline-offset-1 bg-emerald-500/15 font-semibold'
                        : ''
                    }`}
                  >
                    {req.date}
                  </td>

                  {/* REQUESTER NAME */}
                  <td
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveCell({ row: rIdx, col: 1 });
                    }}
                    className={`px-4 py-2 font-medium border-r border-white/50 whitespace-nowrap text-slate-900 ${
                      activeCell?.row === rIdx && activeCell?.col === 1
                        ? 'outline-2 outline-emerald-600 -outline-offset-1 bg-emerald-500/15 font-semibold'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{req.requesterName}</span>
                      {req.requesterCps && (
                        <span className="text-[10px] text-slate-500 font-mono">({req.requesterCps})</span>
                      )}
                    </div>
                  </td>

                  {/* NAME */}
                  <td
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveCell({ row: rIdx, col: 2 });
                    }}
                    className={`px-4 py-2 font-semibold border-r border-white/50 whitespace-nowrap text-slate-900 ${
                      activeCell?.row === rIdx && activeCell?.col === 2
                        ? 'outline-2 outline-emerald-600 -outline-offset-1 bg-emerald-500/15 font-semibold'
                        : ''
                    }`}
                  >
                    {req.name}
                  </td>

                  {/* AADHAR NUMBER */}
                  <td
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveCell({ row: rIdx, col: 3 });
                    }}
                    className={`px-4 py-2 font-mono border-r border-white/50 whitespace-nowrap text-slate-800 ${
                      activeCell?.row === rIdx && activeCell?.col === 3
                        ? 'outline-2 outline-emerald-600 -outline-offset-1 bg-emerald-500/15 font-semibold'
                        : ''
                    }`}
                  >
                    {req.aadharNumber}
                  </td>

                  {/* VEG/NON-VEG */}
                  <td
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveCell({ row: rIdx, col: 4 });
                    }}
                    className={`px-4 py-2 border-r border-white/50 whitespace-nowrap ${
                      activeCell?.row === rIdx && activeCell?.col === 4
                        ? 'outline-2 outline-emerald-600 -outline-offset-1 bg-emerald-500/15 font-semibold'
                        : ''
                    }`}
                  >
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        req.vegNonVeg === 'Veg'
                          ? 'bg-emerald-500/15 text-emerald-800 border border-emerald-500/25'
                          : 'bg-rose-500/15 text-rose-800 border border-rose-500/25'
                      }`}
                    >
                      {req.vegNonVeg}
                    </span>
                  </td>

                  {/* TYPE */}
                  <td
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveCell({ row: rIdx, col: 5 });
                    }}
                    className={`px-4 py-2 border-r border-white/50 whitespace-nowrap font-medium text-slate-800 ${
                      activeCell?.row === rIdx && activeCell?.col === 5
                        ? 'outline-2 outline-emerald-600 -outline-offset-1 bg-emerald-500/15 font-semibold'
                        : ''
                    }`}
                  >
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        req.type === 'Breakfast'
                          ? 'bg-amber-500/15 text-amber-900 border border-amber-500/25'
                          : req.type === 'Lunch'
                          ? 'bg-emerald-500/15 text-emerald-900 border border-emerald-500/25'
                          : req.type === 'Dinner'
                          ? 'bg-indigo-500/15 text-indigo-900 border border-indigo-500/25'
                          : 'bg-purple-500/15 text-purple-900 border border-purple-500/25'
                      }`}
                    >
                      {req.type}
                    </span>
                  </td>

                  {/* Action */}
                  {isAdmin && (
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete food request for ${req.name}?`)) {
                            onDeleteRequest(req.id);
                          }
                        }}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-500/15 transition-colors cursor-pointer"
                        title="Delete record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {/* Blank placeholder rows for Excel look */}
              {Array.from({ length: blankRowsCount }).map((_, bIdx) => {
                const rowNum = filteredRequests.length + bIdx + 2;
                return (
                  <tr key={`blank-${bIdx}`} className="h-8 select-none">
                    <td className="w-10 px-2 py-1.5 text-center bg-white/30 border-r border-white/50 font-mono text-[11px] text-slate-400">
                      {rowNum}
                    </td>
                    <td className="px-4 py-1.5 border-r border-white/40"></td>
                    <td className="px-4 py-1.5 border-r border-white/40"></td>
                    <td className="px-4 py-1.5 border-r border-white/40"></td>
                    <td className="px-4 py-1.5 border-r border-white/40"></td>
                    <td className="px-4 py-1.5 border-r border-white/40"></td>
                    <td className="px-4 py-1.5 border-r border-white/40"></td>
                    {isAdmin && <td className="px-3 py-1.5"></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom Excel Sheet Tabs matching Screenshot 1 */}
        <div className="bg-white/40 backdrop-blur-xl border-t border-white/40 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="px-3 py-1 text-xs text-slate-600 hover:text-slate-900 rounded-xl hover:bg-white/50 font-medium cursor-pointer transition-colors">
              Log in
            </div>
            <div className="px-3 py-1 text-xs text-slate-600 hover:text-slate-900 rounded-xl hover:bg-white/50 font-medium cursor-pointer transition-colors">
              data in - User site
            </div>
            {/* Active Sheet Tab matching Screenshot 1 */}
            <div className="px-4 py-1 text-xs font-bold text-emerald-800 bg-white/80 border border-white/80 rounded-xl shadow-xs cursor-pointer flex items-center gap-2 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>data collect - admin site</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-600 font-medium">
            Total records: <span className="font-bold text-slate-800">{filteredRequests.length}</span> / {requests.length}
          </div>
        </div>
      </div>
    </div>
  );
};
