/**
 * HTML template for the admin password dialog
 */
export function getPasswordDialogHTML(): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          padding: 20px;
          background: #f5f5f5;
        }
        h3 { margin: 0 0 15px 0; color: #333; }
        input {
          width: 100%;
          padding: 10px;
          margin: 10px 0;
          border: 1px solid #ccc;
          border-radius: 4px;
          box-sizing: border-box;
        }
        .buttons { display: flex; gap: 10px; margin-top: 15px; }
        button {
          flex: 1;
          padding: 10px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .primary { background: #007bff; color: white; }
        .secondary { background: #6c757d; color: white; }
        .error { color: red; font-size: 12px; display: none; }
      </style>
    </head>
    <body>
      <h3>Admin Password Required</h3>
      <input type="password" id="password" placeholder="Enter admin password" autofocus>
      <div class="error" id="error">Incorrect password</div>
      <div class="buttons">
        <button class="secondary" onclick="cancel()">Cancel</button>
        <button class="primary" onclick="verify()">Verify</button>
      </div>
      <script>
        const { ipcRenderer } = require('electron');
        document.getElementById('password').addEventListener('keypress', (e) => {
          if (e.key === 'Enter') verify();
        });
        function verify() {
          const password = document.getElementById('password').value;
          ipcRenderer.send('verify-admin-password', password);
        }
        function cancel() {
          ipcRenderer.send('cancel-password-dialog');
        }
        ipcRenderer.on('password-invalid', () => {
          document.getElementById('error').style.display = 'block';
          document.getElementById('password').value = '';
          document.getElementById('password').focus();
        });
      </script>
    </body>
    </html>
  `;
}

/**
 * HTML template for schedule password verification
 */
export function getSchedulePasswordDialogHTML(): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; background: #f5f5f5; }
        h3 { margin: 0 0 15px 0; color: #333; }
        input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
        .buttons { display: flex; gap: 10px; margin-top: 15px; }
        button { flex: 1; padding: 10px; border: none; border-radius: 4px; cursor: pointer; }
        .primary { background: #007bff; color: white; }
        .secondary { background: #6c757d; color: white; }
        .error { color: red; font-size: 12px; display: none; }
      </style>
    </head>
    <body>
      <h3>Admin Password Required</h3>
      <input type="password" id="password" placeholder="Enter admin password" autofocus>
      <div class="error" id="error">Incorrect password</div>
      <div class="buttons">
        <button class="secondary" onclick="cancel()">Cancel</button>
        <button class="primary" onclick="verify()">Verify</button>
      </div>
      <script>
        const { ipcRenderer } = require('electron');
        document.getElementById('password').addEventListener('keypress', (e) => { if (e.key === 'Enter') verify(); });
        function verify() { ipcRenderer.send('verify-schedule-password', document.getElementById('password').value); }
        function cancel() { ipcRenderer.send('cancel-schedule-password'); }
        ipcRenderer.on('password-invalid-schedule', () => {
          document.getElementById('error').style.display = 'block';
          document.getElementById('password').value = '';
        });
      </script>
    </body>
    </html>
  `;
}
