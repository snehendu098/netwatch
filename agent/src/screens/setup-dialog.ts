/**
 * HTML template for first-time setup dialog
 */
export function getSetupDialogHTML(): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          padding: 30px;
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          color: white;
          margin: 0;
          overflow-y: auto;
        }
        h2 { margin: 0 0 10px 0; font-size: 24px; }
        h3 { margin: 20px 0 10px 0; font-size: 16px; color: #e2e8f0; }
        p { color: #94a3b8; margin: 0 0 20px 0; }
        .form-group { margin-bottom: 16px; }
        label { display: block; margin-bottom: 8px; color: #e2e8f0; font-weight: 500; }
        input[type="url"], input[type="password"], input[type="time"] {
          width: 100%;
          padding: 12px;
          border: 1px solid #334155;
          border-radius: 8px;
          background: #1e293b;
          color: white;
          font-size: 14px;
          box-sizing: border-box;
        }
        input:focus { outline: none; border-color: #3b82f6; }
        input::placeholder { color: #64748b; }
        .hint { font-size: 12px; color: #64748b; margin-top: 6px; }
        .buttons { display: flex; gap: 12px; margin-top: 25px; }
        button {
          flex: 1;
          padding: 12px 20px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        }
        .primary { background: #3b82f6; color: white; }
        .primary:hover { background: #2563eb; }
        .secondary { background: #334155; color: white; }
        .secondary:hover { background: #475569; }
        .logo { text-align: center; margin-bottom: 15px; }
        .logo svg { width: 40px; height: 40px; }
        .error { color: #ef4444; font-size: 12px; margin-top: 6px; display: none; }

        /* Schedule styles */
        .schedule-section { margin-top: 20px; padding-top: 20px; border-top: 1px solid #334155; }
        .schedule-toggle { display: flex; align-items: center; gap: 12px; margin-bottom: 15px; }
        .toggle-switch {
          position: relative;
          width: 48px;
          height: 26px;
          background: #334155;
          border-radius: 13px;
          cursor: pointer;
          transition: background 0.3s;
        }
        .toggle-switch.active { background: #3b82f6; }
        .toggle-switch::after {
          content: '';
          position: absolute;
          width: 22px;
          height: 22px;
          background: white;
          border-radius: 50%;
          top: 2px;
          left: 2px;
          transition: left 0.3s;
        }
        .toggle-switch.active::after { left: 24px; }
        .toggle-label { font-size: 14px; color: #e2e8f0; }

        .schedule-options { display: none; }
        .schedule-options.visible { display: block; }

        .days-grid {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 15px;
        }
        .day-btn {
          padding: 8px 12px;
          border: 1px solid #334155;
          border-radius: 6px;
          background: #1e293b;
          color: #94a3b8;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }
        .day-btn.selected {
          background: #3b82f6;
          border-color: #3b82f6;
          color: white;
        }
        .day-btn:hover { border-color: #3b82f6; }

        .time-row {
          display: flex;
          gap: 15px;
          align-items: center;
        }
        .time-row .form-group { flex: 1; margin-bottom: 0; }
        .time-row input[type="time"] { padding: 10px; }

        .preset-btns {
          display: flex;
          gap: 8px;
          margin-bottom: 15px;
        }
        .preset-btn {
          padding: 6px 12px;
          border: 1px solid #334155;
          border-radius: 6px;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          font-size: 12px;
        }
        .preset-btn:hover { border-color: #3b82f6; color: #3b82f6; }
      </style>
    </head>
    <body>
      <div class="logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>
      </div>
      <h2>NetWatch Agent Setup</h2>
      <p>Configure the connection to your NetWatch server</p>

      <div class="form-group">
        <label for="serverUrl">Server URL</label>
        <input type="url" id="serverUrl" placeholder="https://your-netwatch-server.com" required>
        <div class="hint">Enter the URL of your NetWatch dashboard server</div>
        <div class="error" id="urlError">Please enter a valid URL</div>
      </div>

      <div class="form-group">
        <label for="adminPassword">Admin Password</label>
        <input type="password" id="adminPassword" placeholder="Enter a secure password">
        <div class="hint">This password is required to exit or reconfigure the agent</div>
      </div>

      <div class="schedule-section">
        <h3>Monitoring Schedule</h3>
        <div class="schedule-toggle">
          <div class="toggle-switch" id="scheduleToggle" onclick="toggleSchedule()"></div>
          <span class="toggle-label" id="scheduleLabel">Always Active (24/7)</span>
        </div>

        <div class="schedule-options" id="scheduleOptions">
          <div class="preset-btns">
            <button type="button" class="preset-btn" onclick="setPreset('weekdays')">Weekdays Only</button>
            <button type="button" class="preset-btn" onclick="setPreset('alldays')">All Days</button>
            <button type="button" class="preset-btn" onclick="setPreset('business')">Business Hours</button>
          </div>

          <label>Active Days</label>
          <div class="days-grid">
            <button type="button" class="day-btn" data-day="0">Sun</button>
            <button type="button" class="day-btn selected" data-day="1">Mon</button>
            <button type="button" class="day-btn selected" data-day="2">Tue</button>
            <button type="button" class="day-btn selected" data-day="3">Wed</button>
            <button type="button" class="day-btn selected" data-day="4">Thu</button>
            <button type="button" class="day-btn selected" data-day="5">Fri</button>
            <button type="button" class="day-btn" data-day="6">Sat</button>
          </div>

          <div class="time-row">
            <div class="form-group">
              <label for="startTime">Start Time</label>
              <input type="time" id="startTime" value="09:00">
            </div>
            <div class="form-group">
              <label for="endTime">End Time</label>
              <input type="time" id="endTime" value="18:00">
            </div>
          </div>
          <div class="hint">Monitoring will only be active during these hours on selected days</div>
        </div>
      </div>

      <div class="buttons">
        <button class="secondary" onclick="cancel()">Cancel</button>
        <button class="primary" onclick="save()">Save & Connect</button>
      </div>

      <script>
        const { ipcRenderer } = require('electron');

        let scheduleEnabled = false;
        let selectedDays = [1, 2, 3, 4, 5]; // Mon-Fri default

        document.getElementById('serverUrl').focus();

        // Day button click handlers
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

        function setPreset(preset) {
          const dayBtns = document.querySelectorAll('.day-btn');
          dayBtns.forEach(btn => btn.classList.remove('selected'));

          if (preset === 'weekdays') {
            selectedDays = [1, 2, 3, 4, 5];
            document.getElementById('startTime').value = '09:00';
            document.getElementById('endTime').value = '18:00';
          } else if (preset === 'alldays') {
            selectedDays = [0, 1, 2, 3, 4, 5, 6];
            document.getElementById('startTime').value = '00:00';
            document.getElementById('endTime').value = '23:59';
          } else if (preset === 'business') {
            selectedDays = [1, 2, 3, 4, 5];
            document.getElementById('startTime').value = '08:00';
            document.getElementById('endTime').value = '17:00';
          }

          selectedDays.forEach(day => {
            document.querySelector('.day-btn[data-day="' + day + '"]').classList.add('selected');
          });
        }

        function isValidUrl(string) {
          try {
            const url = new URL(string);
            return url.protocol === 'http:' || url.protocol === 'https:';
          } catch (_) {
            return false;
          }
        }

        function save() {
          const serverUrl = document.getElementById('serverUrl').value.trim();
          const adminPassword = document.getElementById('adminPassword').value;

          if (!isValidUrl(serverUrl)) {
            document.getElementById('urlError').style.display = 'block';
            return;
          }
          document.getElementById('urlError').style.display = 'none';

          const schedule = {
            enabled: scheduleEnabled,
            days: selectedDays,
            startTime: document.getElementById('startTime').value,
            endTime: document.getElementById('endTime').value
          };

          ipcRenderer.send('setup-complete', { serverUrl, adminPassword, schedule });
        }

        function cancel() {
          ipcRenderer.send('setup-cancelled');
        }

        document.getElementById('serverUrl').addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            document.getElementById('adminPassword').focus();
          }
        });

        document.getElementById('adminPassword').addEventListener('keypress', (e) => {
          if (e.key === 'Enter') save();
        });
      </script>
    </body>
    </html>
  `;
}
