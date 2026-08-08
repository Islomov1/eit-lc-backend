require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { google } = require('googleapis');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'Leads';

// Locally: reads service-account.json from disk (gitignored, never committed).
// On a host like Render: paste the full JSON as one line into the
// GOOGLE_SERVICE_ACCOUNT_JSON environment variable instead — there's no
// file upload there, so this is how the secret gets in.
const authOptions = { scopes: ['https://www.googleapis.com/auth/spreadsheets'] };
if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  authOptions.credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
} else {
  authOptions.keyFile = 'service-account.json';
}
const auth = new google.auth.GoogleAuth(authOptions);

const HEADER_ROW = ['Timestamp', 'Name', 'Phone', 'Course', 'Comment', 'Language', 'Source'];

async function ensureHeaderRow(sheets) {
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:G1`,
  });

  const hasHeader = existing.data.values && existing.data.values.length > 0;
  if (!hasHeader) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:G1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] }
    });
  }
}

app.post('/api/leads', async (req, res) => {
  try {
    const { name, phone, course, comment, lang, source } = req.body;

    if (!name || !phone || !course) {
      return res.status(400).json({ status: 'error', message: 'Missing required fields' });
    }

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    await ensureHeaderRow(sheets);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:G`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          new Date().toISOString(),
          name,
          `'${phone}`,
          course,
          comment || '',
          lang || '',
          source || ''
        ]]
      }
    });

    res.json({ status: 'success' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Failed to save lead' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));