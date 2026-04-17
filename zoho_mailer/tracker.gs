/**
 * BNI Mailer — Email Open Tracker (Google Apps Script)
 * ─────────────────────────────────────────────────────
 *
 * SETUP (one-time, ~3 minutes):
 *
 *  1. Go to https://sheets.google.com and create a NEW blank spreadsheet.
 *     Name it anything (e.g., "Email Tracker Dashboard").
 *
 *  2. In the top menu, click:  Extensions > Apps Script
 *
 *  3. Delete all existing code in the editor.
 *     Paste the entire contents of this file, then Save (Ctrl+S).
 *
 *  4. Click:  Deploy > New Deployment
 *     - Type              → Web App
 *     - Description       → "Email Pixel Tracker v1"
 *     - Execute as        → Me
 *     - Who has access    → Anyone
 *     → Click "Deploy" and authorize when Google prompts you.
 *
 *  5. Copy the Web App URL that appears after deployment.
 *     It looks like:
 *     https://script.google.com/macros/s/AKfycbXXXXXXXXXXXXXXXXXXXXX/exec
 *
 *  6. Open your local .env file and add:
 *     TRACKER_URL=https://script.google.com/macros/s/XXXXXX/exec
 *
 *  7. Optionally set a Campaign ID in .env:
 *     CAMPAIGN_ID=bni_solar_apr_2026
 *
 * That's it! Sends will now log opens live in the "Email Opens" tab of your sheet.
 */

const SHEET_NAME = "Email Opens";

function doGet(e) {
  try {
    const email = (e.parameter.email || "unknown").toLowerCase().trim();
    const cid   = (e.parameter.cid   || "default").trim();
    const ts    = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short"
    });

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName(SHEET_NAME);

    // Create the sheet with headers if it doesn't exist yet
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      const headers = [["First Opened (IST)", "Last Opened (IST)", "Email", "Campaign", "Open Count"]];
      sheet.getRange("A1:E1").setValues(headers)
           .setFontWeight("bold")
           .setBackground("#4f46e5")
           .setFontColor("#ffffff");
      sheet.setFrozenRows(1);
      sheet.setColumnWidths(1, 5, 180);
    }

    const data = sheet.getDataRange().getValues();
    let found  = false;

    for (let i = 1; i < data.length; i++) {
      if (data[i][2] === email && data[i][3] === cid) {
        const newCount = (Number(data[i][4]) || 0) + 1;
        sheet.getRange(i + 1, 2).setValue(ts);       // Update "Last Opened"
        sheet.getRange(i + 1, 5).setValue(newCount); // Increment open count
        found = true;
        break;
      }
    }

    // New entry
    if (!found) {
      sheet.appendRow([ts, ts, email, cid, 1]);
    }

  } catch (_) {
    // Always silently fail — never break the email rendering
  }

  // Return empty text response. The 1x1 pixel in the email will silently fail to
  // load as an image, but the tracking GET request has already been logged above.
  return ContentService
    .createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}
