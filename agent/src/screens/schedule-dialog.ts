import { ScheduleConfig } from '../utils/schedule';

/**
 * HTML template for schedule configuration dialog
 */
export function getScheduleDialogHTML(currentSchedule: ScheduleConfig): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 25px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: white; margin: 0; }
        h3 { margin: 0 0 20px 0; font-size: 18px; }
        label { display: block; margin-bottom: 8px; color: #e2e8f0; font-weight: 500; font-size: 14px; }
        .hint { font-size: 12px; color: #64748b; margin-top: 8px; }
        .buttons { display: flex; gap: 12px; margin-top: 25px; }
        button { flex: 1; padding: 12px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; }
        .primary { background: #3b82f6; color: white; }
        .primary:hover { background: #2563eb; }
        .secondary { background: #334155; color: white; }
        .secondary:hover { background: #475569; }
        .schedule-toggle { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .toggle-switch { position: relative; width: 48px; height: 26px; background: #334155; border-radius: 13px; cursor: pointer; transition: background 0.3s; }
        .toggle-switch.active { background: #3b82f6; }
        .toggle-switch::after { content: ''; position: absolute; width: 22px; height: 22px; background: white; border-radius: 50%; top: 2px; left: 2px; transition: left 0.3s; }
        .toggle-switch.active::after { left: 24px; }
        .toggle-label { font-size: 14px; color: #e2e8f0; }
        .schedule-options { display: none; }
        .schedule-options.visible { display: block; }
        .days-grid { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 15px; }
        .day-btn { padding: 8px 12px; border: 1px solid #334155; border-radius: 6px; background: #1e293b; color: #94a3b8; cursor: pointer; font-size: 13px; transition: all 0.2s; }
        .day-btn.selected { background: #3b82f6; border-color: #3b82f6; color: white; }
        .day-btn:hover { border-color: #3b82f6; }
        .time-row { display: flex; gap: 15px; align-items: center; }
        .time-row .form-group { flex: 1; margin-bottom: 0; }
        input[type="time"] { width: 100%; padding: 10px; border: 1px solid #334155; border-radius: 8px; background: #1e293b; color: white; font-size: 14px; box-sizing: border-box; }
        input[type="time"]:focus { outline: none; border-color: #3b82f6; }
        .form-group { margin-bottom: 15px; }
      </style>
    </head>
    <body>
      <h3>Configure Monitoring Schedule</h3>

      <div class="schedule-toggle">
        <div class="toggle-switch ${currentSchedule.enabled ? 'active' : ''}" id="scheduleToggle" onclick="toggleSchedule()"></div>
        <span class="toggle-label" id="scheduleLabel">${currentSchedule.enabled ? 'Custom Schedule' : 'Always Active (24/7)'}</span>
      </div>

      <div class="schedule-options ${currentSchedule.enabled ? 'visible' : ''}" id="scheduleOptions">
        <label>Active Days</label>
        <div class="days-grid">
          <button type="button" class="day-btn ${currentSchedule.days.includes(0) ? 'selected' : ''}" data-day="0">Sun</button>
          <button type="button" class="day-btn ${currentSchedule.days.includes(1) ? 'selected' : ''}" data-day="1">Mon</button>
          <button type="button" class="day-btn ${currentSchedule.days.includes(2) ? 'selected' : ''}" data-day="2">Tue</button>
          <button type="button" class="day-btn ${currentSchedule.days.includes(3) ? 'selected' : ''}" data-day="3">Wed</button>
          <button type="button" class="day-btn ${currentSchedule.days.includes(4) ? 'selected' : ''}" data-day="4">Thu</button>
          <button type="button" class="day-btn ${currentSchedule.days.includes(5) ? 'selected' : ''}" data-day="5">Fri</button>
          <button type="button" class="day-btn ${currentSchedule.days.includes(6) ? 'selected' : ''}" data-day="6">Sat</button>
        </div>

        <div class="time-row">
          <div class="form-group">
            <label for="startTime">Start Time</label>
            <input type="time" id="startTime" value="${currentSchedule.startTime}">
          </div>
          <div class="form-group">
            <label for="endTime">End Time</label>
            <input type="time" id="endTime" value="${currentSchedule.endTime}">
          </div>
        </div>
        <div class="hint">Monitoring will only be active during these hours on selected days</div>
      </div>

      <div class="buttons">
        <button class="secondary" onclick="cancel()">Cancel</button>
        <button class="primary" onclick="save()">Save Schedule</button>
      </div>

      <script>
        const { ipcRenderer } = require('electron');
        let scheduleEnabled = ${currentSchedule.enabled};
        let selectedDays = ${JSON.stringify(currentSchedule.days)};

        document.querySelectorAll('.day-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const day = parseInt(btn.dataset.day);
            btn.classList.toggle('selected');
            if (btn.classList.contains('selected')) {
              if (!selectedDays.includes(day)) selectedDays.push(day);
            } else {
              selectedDays = selectedDays.filter(d => d !== day);
            }
            selectedDays.sort((a, b) => a - b);
          });
        });

        function toggleSchedule() {
          scheduleEnabled = !scheduleEnabled;
          const toggle = document.getElementById('scheduleToggle');
          const label = document.getElementById('scheduleLabel');
          const options = document.getElementById('scheduleOptions');
          if (scheduleEnabled) {
            toggle.classList.add('active');
            label.textContent = 'Custom Schedule';
            options.classList.add('visible');
          } else {
            toggle.classList.remove('active');
            label.textContent = 'Always Active (24/7)';
            options.classList.remove('visible');
          }
        }

        function save() {
          const schedule = {
            enabled: scheduleEnabled,
            days: selectedDays,
            startTime: document.getElementById('startTime').value,
            endTime: document.getElementById('endTime').value
          };
          ipcRenderer.send('save-schedule-config', schedule);
        }

        function cancel() {
          ipcRenderer.send('cancel-schedule-config');
        }
      </script>
    </body>
    </html>
  `;
}
