import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { groupDaysByWeek } from '../utils/date-utils.js';
import { MONTH_NAMES, DAY_NAMES } from '../utils/constants.js';

export function exportToExcel(year, month, schedules, employees, holidays, patternConfig) {
  // Create a new workbook
  const wb = XLSX.utils.book_new();
  
  const scheduleMap = {};
  schedules.forEach(s => {
    scheduleMap[`${s.employee_id}-${s.date}`] = s;
  });

  const holidayMap = {};
  holidays.forEach(h => {
    holidayMap[h.date] = h;
  });

  const weeks = groupDaysByWeek(year, month);
  const weekLabels = ['I', 'II', 'III', 'IV', 'V', 'VI'];

  const wsData = [];

  // Title
  wsData.push([`Jadwal Travel Management ${MONTH_NAMES[month-1]} ${year}`]);
  wsData.push([]); // Empty row

  // Pattern Legend (Top Right logic simulated by putting it before table)
  wsData.push(['POLA JADWAL']);
  if (patternConfig) {
    patternConfig.scheduleTypes.forEach(t => {
      wsData.push([`${t.code} = ${t.hours !== '-' ? t.hours : t.label}`]);
    });
  }
  wsData.push([]);

  // Loop through weeks
  weeks.forEach((week, wIdx) => {
    // Header for week
    const header1 = ['Hari'];
    const header2 = ['Tanggal'];
    
    week.forEach(day => {
      header1.push(DAY_NAMES[day.dayOfWeek]);
      header2.push(day.day);
    });

    wsData.push([`MINGGU ${weekLabels[wIdx]}`]);
    wsData.push(header1);
    wsData.push(header2);

    // Rows for employees
    employees.forEach(emp => {
      const row = [emp.name];
      week.forEach(day => {
        const sched = scheduleMap[`${emp.id}-${day.date}`];
        row.push(sched ? sched.schedule_type : '');
      });
      wsData.push(row);
    });

    wsData.push([]); // Empty row between weeks
  });

  // Notes
  wsData.push(['Note:']);
  if (patternConfig) {
    patternConfig.scheduleTypes.forEach(t => {
      if (t.hours !== '-') wsData.push([`- Untuk Jadwal ${t.code}, ${t.hours}`]);
    });
  }
  
  // Sort holidays
  const sortedHolidays = [...holidays].sort((a,b) => new Date(a.date) - new Date(b.date));
  sortedHolidays.forEach(h => {
    const d = new Date(h.date).getDate();
    wsData.push([`- Tgl ${d} ${h.name}`]);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto-size columns slightly
  const wscols = [{wch: 25}]; // First col wider
  for(let i=0; i<7; i++) wscols.push({wch: 10});
  ws['!cols'] = wscols;

  XLSX.utils.book_append_sheet(wb, ws, "Roster");

  // Save file
  XLSX.writeFile(wb, `Roster_Travel_${MONTH_NAMES[month-1]}_${year}.xlsx`);
  
  window.showToast('File Excel berhasil diunduh');
}

export async function exportToPDF(year, month) {
  const element = document.getElementById('dashboard-content');
  if (!element) return;

  try {
    window.showToast('Menyiapkan file PDF...', 'info');
    
    // Create canvas from the dashboard DOM
    const canvas = await html2canvas(element, {
      scale: 2, // Higher resolution
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/png');
    
    // Use A4 Landscape
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    
    // Calculate aspect ratio to fit width
    const imgWidth = pdfWidth - 20; // 10mm padding on each side
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 10; // Top padding

    // Add first page
    pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
    heightLeft -= (pdfHeight - 20);

    // Add subsequent pages if content overflows (rare for landscape roster but possible)
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight + 10;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= (pdfHeight - 20);
    }

    pdf.save(`Roster_Travel_${MONTH_NAMES[month-1]}_${year}.pdf`);
    window.showToast('File PDF berhasil diunduh');
  } catch (err) {
    console.error('PDF Export Error:', err);
    window.showToast('Gagal mengekspor PDF', 'error');
  }
}
