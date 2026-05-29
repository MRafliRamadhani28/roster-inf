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

export async function exportToPDF(year, month, schedules, employees, holidays, patternConfig) {
  try {
    window.showToast('Menyiapkan file PDF...', 'info');

    // Build data maps
    const scheduleMap = {};
    schedules.forEach(s => {
      scheduleMap[`${s.employee_id}-${s.date}`] = s;
    });

    const holidayMap = {};
    holidays.forEach(h => {
      holidayMap[h.date] = h;
    });

    const daysInMonth = new Date(year, month, 0).getDate();
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month - 1, d);
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        day: d,
        date: dateStr,
        dayOfWeek: dateObj.getDay(),
        isWeekend: dateObj.getDay() === 0 || dateObj.getDay() === 6,
      });
    }

    // Build off-screen container
    const wrapper = document.createElement('div');
    wrapper.id = 'pdf-render-target';
    wrapper.style.cssText = `
      position: fixed; top: -99999px; left: -99999px;
      width: 1400px;
      background: #ffffff;
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      padding: 20px 24px;
      box-sizing: border-box;
      color: #1e293b;
    `;

    // --- Title ---
    const title = document.createElement('div');
    title.style.cssText = 'text-align: center; margin-bottom: 10px;';
    title.innerHTML = `
      <div style="font-size: 18px; font-weight: 700; color: #1e40af;">
        JADWAL TRAVEL MANAGEMENT
      </div>
      <div style="font-size: 14px; font-weight: 600; color: #475569; margin-top: 2px;">
        ${MONTH_NAMES[month - 1]} ${year}
      </div>
    `;
    wrapper.appendChild(title);

    // --- Legend (inline, compact) ---
    if (patternConfig && patternConfig.scheduleTypes) {
      const legend = document.createElement('div');
      legend.style.cssText = 'display: flex; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; justify-content: center;';
      patternConfig.scheduleTypes.forEach(type => {
        const item = document.createElement('span');
        item.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 600;';
        item.innerHTML = `
          <span style="display:inline-block; width:12px; height:12px; border-radius:3px; background-color:${type.color};"></span>
          ${type.code} = ${type.hours !== '-' ? type.hours : type.label}
        `;
        legend.appendChild(item);
      });
      wrapper.appendChild(legend);
    }

    // --- Main Table ---
    const table = document.createElement('table');
    table.style.cssText = `
      width: 100%;
      border-collapse: collapse;
      font-size: 8px;
      table-layout: fixed;
    `;

    // Header Row 1: Day names
    let headerRow1 = '<tr>';
    headerRow1 += `<th style="background:#1e40af; color:white; padding:4px 2px; border:1px solid #cbd5e1; text-align:left; font-size:9px; font-weight:700; width:120px; min-width:120px;">Nama</th>`;
    days.forEach(day => {
      let bgColor = '#f1f5f9';
      let textColor = '#334155';
      if (holidayMap[day.date]) {
        bgColor = holidayMap[day.date].is_national_holiday ? '#ef4444' : '#f87171';
        textColor = '#ffffff';
      } else if (day.isWeekend) {
        bgColor = '#22c55e';
        textColor = '#ffffff';
      }
      headerRow1 += `<th style="background:${bgColor}; color:${textColor}; padding:3px 1px; border:1px solid #cbd5e1; text-align:center; font-size:8px; font-weight:600;">${DAY_NAMES[day.dayOfWeek]}</th>`;
    });
    headerRow1 += '</tr>';

    // Header Row 2: Day numbers
    let headerRow2 = '<tr>';
    headerRow2 += `<th style="background:#1e40af; color:white; padding:4px 2px; border:1px solid #cbd5e1; text-align:left; font-size:9px; font-weight:700;">Tanggal</th>`;
    days.forEach(day => {
      let bgColor = '#f8fafc';
      let textColor = '#334155';
      if (holidayMap[day.date]) {
        bgColor = holidayMap[day.date].is_national_holiday ? '#fecaca' : '#fde8e8';
        textColor = '#991b1b';
      } else if (day.isWeekend) {
        bgColor = '#dcfce7';
        textColor = '#166534';
      }
      headerRow2 += `<th style="background:${bgColor}; color:${textColor}; padding:3px 1px; border:1px solid #cbd5e1; text-align:center; font-size:9px; font-weight:700;">${day.day}</th>`;
    });
    headerRow2 += '</tr>';

    // Employee Rows
    let bodyRows = '';
    employees.forEach((emp, idx) => {
      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      let row = `<tr>`;
      row += `<td style="background:${rowBg}; padding:3px 4px; border:1px solid #cbd5e1; text-align:left; font-size:8px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${emp.name}</td>`;
      days.forEach(day => {
        const schedule = scheduleMap[`${emp.id}-${day.date}`];
        const type = schedule ? schedule.schedule_type : '';
        let cellBg = rowBg;
        let cellColor = '#1e293b';

        if (type && patternConfig) {
          const typeInfo = patternConfig.scheduleTypes.find(t => t.code === type);
          if (typeInfo) {
            cellBg = typeInfo.color;
            cellColor = '#ffffff';
          }
        } else if (!type) {
          if (holidayMap[day.date]) {
            cellBg = holidayMap[day.date].is_national_holiday ? 'rgba(239,68,68,0.1)' : 'rgba(252,165,165,0.15)';
          } else if (day.isWeekend) {
            cellBg = 'rgba(34,197,94,0.1)';
          }
        }

        row += `<td style="background:${cellBg}; color:${cellColor}; padding:3px 1px; border:1px solid #cbd5e1; text-align:center; font-size:8px; font-weight:600;">${type}</td>`;
      });
      row += '</tr>';
      bodyRows += row;
    });

    table.innerHTML = `
      <thead>${headerRow1}${headerRow2}</thead>
      <tbody>${bodyRows}</tbody>
    `;
    wrapper.appendChild(table);

    // --- Notes Section ---
    const notesSection = document.createElement('div');
    notesSection.style.cssText = 'margin-top: 10px; display: flex; gap: 20px; flex-wrap: wrap; font-size: 8px;';

    // Schedule notes
    if (patternConfig && patternConfig.scheduleTypes) {
      const schedNotes = patternConfig.scheduleTypes.filter(t => t.hours !== '-');
      if (schedNotes.length > 0) {
        const noteDiv = document.createElement('div');
        noteDiv.style.cssText = 'flex: 1; min-width: 200px;';
        noteDiv.innerHTML = `
          <div style="font-weight:700; margin-bottom:4px; font-size:9px;">📝 Note Jadwal:</div>
          ${schedNotes.map(t => `<div style="margin-left:8px;">- Untuk Jadwal ${t.code}, ${t.hours}</div>`).join('')}
        `;
        notesSection.appendChild(noteDiv);
      }
    }

    // Holiday notes
    if (holidays && holidays.length > 0) {
      const holDiv = document.createElement('div');
      holDiv.style.cssText = 'flex: 1; min-width: 200px; background:#fef2f2; border:1px solid #f87171; border-radius:6px; padding:6px 8px; color:#991b1b;';
      const sortedHolidays = [...holidays].sort((a, b) => new Date(a.date) - new Date(b.date));
      holDiv.innerHTML = `
        <div style="font-weight:700; margin-bottom:4px; font-size:9px;">⚠️ INFO LIBUR:</div>
        ${sortedHolidays.map(h => `<div style="margin-left:8px;">- Tgl ${new Date(h.date).getDate()} ${h.name}</div>`).join('')}
      `;
      notesSection.appendChild(holDiv);
    }

    wrapper.appendChild(notesSection);

    // Append to body for rendering
    document.body.appendChild(wrapper);

    // Capture with html2canvas
    const canvas = await html2canvas(wrapper, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: wrapper.scrollWidth,
      height: wrapper.scrollHeight,
    });

    // Remove the off-screen element
    document.body.removeChild(wrapper);

    const imgData = canvas.toDataURL('image/png');

    // Create PDF - single page, fit everything
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 8; // mm

    const availableWidth = pdfWidth - (margin * 2);
    const availableHeight = pdfHeight - (margin * 2);

    // Scale to fit within single page
    const imgAspect = canvas.width / canvas.height;
    const pageAspect = availableWidth / availableHeight;

    let finalWidth, finalHeight;
    if (imgAspect > pageAspect) {
      // Wider than page → fit by width
      finalWidth = availableWidth;
      finalHeight = availableWidth / imgAspect;
    } else {
      // Taller than page → fit by height
      finalHeight = availableHeight;
      finalWidth = availableHeight * imgAspect;
    }

    // Center on page
    const x = margin + (availableWidth - finalWidth) / 2;
    const y = margin + (availableHeight - finalHeight) / 2;

    pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);

    pdf.save(`Roster_Travel_${MONTH_NAMES[month-1]}_${year}.pdf`);
    window.showToast('File PDF berhasil diunduh');
  } catch (err) {
    console.error('PDF Export Error:', err);
    window.showToast('Gagal mengekspor PDF', 'error');
  }
}

