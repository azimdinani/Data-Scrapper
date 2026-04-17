# Python Email Automator (Git-Safe Edition)

A professional Python-based mailer for automating personalized outreach to clients via any SMTP provider (Zoho, Gmail, Outlook, etc.). 

## 🛡️ Git Safety
This folder is configured with a `.gitignore` that prevents your private data (`.csv`), secrets (`.env`), and business assets (`.pdf`, `.png`) from being uploaded to Git. 

## 🚀 Getting Started

1.  **Configure Environment**:
    - Rename `.env.example` to `.env`.
    - Fill in `SMTP_SERVER`, `SMTP_PORT`, `SMTP_EMAIL`, `SMTP_PASSWORD`.
    - Fill in your signature details (Name, LinkedIn, Company, WhatsApp).

2.  **Add Assets (Local Only)**:
    - To send attachments and inline images, manually place these files in this folder:
        - `Hydrocell 1601SLR.pdf` (Product Brief)
        - `Mockup.png` (Inline product image)
        - `Org Logo Transp.png` (Company logo)
    - *Note: If these files are missing, the script skips them gracefully.*

3.  **Set Up Email Open Tracker** (optional but recommended):
    - Open `tracker.gs` and follow the setup instructions at the top (3 mins).
    - Paste the Web App URL into your `.env` as `TRACKER_URL`.
    - Set a unique `CAMPAIGN_ID` so you can track multiple campaigns separately.

4.  **Sync Data**:
    - Place your BNI Scraper exports (or any CSV) in this folder.
    - Run `python merge.py` to append new unique contacts into `contacts.csv`.

5.  **Send Test Emails First**:
    - Add your personal/test emails to `test_contacts.csv`.
    - Run: `python send_emails.py --mode test`
    - Check your inbox — verify layout, images, links, and tracking pixel.

6.  **Launch Full Campaign** (only after test passes):
    - Run: `python send_emails.py --mode campaign`
    - You'll see a summary and must type **SEND** to confirm before anything sends.
    - Progress is saved after every email, so it's safe to stop and resume anytime.

---

## 📂 File Explanation

*   `send_emails.py`: The main automation script. Run with `--mode test` or `--mode campaign`.
*   `merge.py`: Sync/import new leads into your contact database.
*   `tracker.gs`: Google Apps Script for email open tracking. Follow the setup steps inside the file.
*   `contacts.csv`: Your central database (automatically ignored by Git).
*   `test_contacts.csv`: Your test recipients list (ignored by Git).
*   `.env`: Your private configuration (automatically ignored by Git).
*   `contacts_template.csv`: An example file showing the required CSV headers.

---

## 🛠️ Customization
*   **Template**: Edit the `BODY_TEMPLATE` inside `send_emails.py` to change the email wording.
*   **SMTP Provider**: You can use any provider by changing `SMTP_SERVER` and `SMTP_PORT` in your `.env`.
    - **Gmail**: `smtp.gmail.com` (Port 465) - *Requires App Password*
    - **Outlook**: `smtp-mail.outlook.com` (Port 587 - *may require TLS code changes*)
    - **Zoho**: `smtp.zoho.in` or `smtp.zoho.com` (Port 465)
*   **Delays**: The script includes randomized delays (mimics human behavior) to protect your account from spam filters. You can adjust this in the `time.sleep()` section.

> [!WARNING]
> Always run a test on yourself first before starting a large campaign!
