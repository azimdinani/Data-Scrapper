import csv
import smtplib
import argparse
import urllib.parse
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from email.mime.application import MIMEApplication
import time
import random
import os

# Ultra-simple fallback to parse .env locally without needing 'pip install python-dotenv'
def load_env():
    if os.path.exists('.env'):
        with open('.env', 'r') as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key, val = line.strip().split('=', 1)
                    os.environ[key.strip()] = val.strip()

load_env()

# Setup variables
SMTP_SERVER = os.environ.get("SMTP_SERVER", "smtp.zoho.in")
SMTP_PORT   = int(os.environ.get("SMTP_PORT", 465))
SENDER_EMAIL    = os.environ.get("SMTP_EMAIL", os.environ.get("ZOHO_EMAIL"))
SENDER_PASSWORD = os.environ.get("SMTP_PASSWORD", os.environ.get("ZOHO_APP_PASSWORD"))

# Sender Configuration for Template (Defaults provided)
S_NAME     = os.environ.get("SENDER_NAME",     "Azim Dinani")
S_COMPANY  = os.environ.get("SENDER_COMPANY",  "Hydrocell")
S_LINKEDIN = os.environ.get("SENDER_LINKEDIN", "https://www.linkedin.com/in/azimdinani")
S_WHATSAPP = os.environ.get("SENDER_WHATSAPP", "+919377024559")
S_WEBSITE  = os.environ.get("SENDER_WEBSITE",  "www.hydrocell.in")
S_PHONE    = os.environ.get("SENDER_PHONE",    "+91 93770 24559")

# Open Tracker
TRACKER_URL = os.environ.get("TRACKER_URL", "")
CAMPAIGN_ID = os.environ.get("CAMPAIGN_ID", f"campaign_{time.strftime('%Y%m%d')}")

if not SENDER_EMAIL or not SENDER_PASSWORD:
    print("Error: Missing SMTP_EMAIL or SMTP_PASSWORD in .env file.")
    print("Make sure you copied .env.example to .env and filled it out!")
    exit(1)

# ==========================================
# CUSTOM EMAIL TEMPLATE
# ==========================================
SUBJECT_TEMPLATE = "BNI Connect: something for your solar clients, {First Name}"
BODY_TEMPLATE = """
<html>
<body style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #333333; line-height: 1.6;">
    <p>Hi {First Name},</p>
    <p>Found your profile on BNI Connect and noticed you're <i>active in the solar sector</i>.</p>
    <p>I'm {S_NAME} from <b>BNI Chapter Grandeur, Vapi (Gujarat)</b>, an alum of NIT Trichy, and I lead business at <b>{S_COMPANY}</b>. Over the past 6 months, we've been developing a <u>specialized solar panel cleaning chemical</u>, and recently finalized a formulation:</p>

    <ul>
        <li><strong>Biodegradable:</strong> environmentally safe, no harsh chemicals</li>
        <li><strong>Residue-free:</strong> leaves panels spotless without any film or buildup</li>
        <li><strong>Low foaming:</strong> easy rinse, saves water during cleaning</li>
        <li><strong>High dilution ratio:</strong> 1:10 dilution, very cost-effective</li>
        <li><strong>Safe on coatings:</strong> won't damage anti-reflective or protective panel surfaces</li>
    </ul>

    {IMAGE_PLACEHOLDER}

    <p>Given the dust conditions in {City}, dirty panels are a real efficiency problem &mdash; and most people are still using generic cleaners not optimized for PV surfaces.</p>

    <p>I'd love to send you a <b>sample</b> or a quick <b>product brief</b> if it could be relevant for your work or your clients.</p>

    <p>Would that work for you?</p>

    <br>
    <table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #333333; line-height: 1.6;">
        <tr>
            <td style="padding-right: 15px; border-right: 2px solid #0066cc;">
                {LOGO_PLACEHOLDER}
            </td>
            <td style="padding-left: 15px;">
                <p style="margin: 0; color: #666666;">Warm regards,</p>
                <p style="margin: 0; font-size: 16px;"><strong><a href="{S_LINKEDIN}" style="color: #333333; text-decoration: none;">{S_NAME}</a></strong></p>
                <p style="margin: 0; color: #666666;">Business Growth</p>
                <p style="margin: 0;">{S_PHONE} | <a href="mailto:{S_EMAIL}" style="color: #0066cc; text-decoration: none;">{S_EMAIL}</a> | <a href="https://{S_WEBSITE}" style="color: #0066cc; text-decoration: none; font-weight: bold;">{S_WEBSITE}</a></p>
                <p style="margin: 0; margin-top: 4px;"><a href="https://wa.me/{S_WHATSAPP_CLEAN}?text=Hi%20{S_NAME},%20I%20would%20like%20to%20know%20more%20about%20the%20solar%20panel%20cleaning%20chemical." style="color: #25D366; text-decoration: none; font-weight: bold;">Message me on WhatsApp</a></p>
            </td>
        </tr>
    </table>

    {TRACKER_PIXEL}
</body>
</html>
"""

# Load assets into memory if they exist
def load_asset(path):
    if os.path.exists(path):
        with open(path, 'rb') as f:
            return f.read()
    return None

def image_subtype(filename):
    """Get image MIME subtype from filename (replaces removed imghdr module)."""
    ext = os.path.splitext(filename)[1].lower()
    return {'.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg',
            '.gif': 'gif', '.webp': 'webp', '.bmp': 'bmp'}.get(ext, 'png')

LOGO_FILE   = "Org Logo Transp.png"
MOCKUP_FILE = "Mockup.png"
PDF_FILE    = "Hydrocell 1601SLR.pdf"

logo_data   = load_asset(LOGO_FILE)
mockup_data = load_asset(MOCKUP_FILE)
pdf_data    = load_asset(PDF_FILE)

print(f"  Assets: Logo={'✓' if logo_data else '✗'}  Mockup={'✓' if mockup_data else '✗'}  PDF={'✓' if pdf_data else '✗'}")


def build_tracker_pixel(email):
    """Generate an invisible 1x1 tracking pixel img tag."""
    if not TRACKER_URL:
        return ""
    params    = urllib.parse.urlencode({"email": email, "cid": CAMPAIGN_ID})
    pixel_url = f"{TRACKER_URL}?{params}"
    return f'<img src="{pixel_url}" width="1" height="1" style="display:none;border:0;" alt="">'


def smtp_connect():
    """Create a fresh SMTP connection and return the server object."""
    server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT)
    server.login(SENDER_EMAIL, SENDER_PASSWORD)
    return server


def send_emails(contact_file, is_test=False, limit=None):
    mode_label = "TEST" if is_test else "CAMPAIGN"
    sent_count = 0
    server = None

    try:
        print(f"Connecting to SMTP Server ({SMTP_SERVER})...")
        server = smtp_connect()
        print("Successfully connected and logged in!\n")
    except Exception as e:
        print(f"Failed to connect or login:\n{e}")
        return

    if not os.path.exists(contact_file):
        print(f"Error: Could not find '{contact_file}'.")
        return

    contacts = []
    with open(contact_file, mode='r', encoding='utf-8-sig') as file:
        reader    = csv.DictReader(file)
        fieldnames = list(reader.fieldnames)
        for row in reader:
            contacts.append(row)

    if 'Sent Status' not in fieldnames:
        fieldnames.append('Sent Status')

    to_send = [c for c in contacts if c.get("Sent Status", "No").lower() not in ("yes",)]
    print(f"Total contacts: {len(contacts)} | Pending: {len(to_send)}")

    if not to_send:
        print("Nothing to send — all contacts already marked as sent!")
        server.quit()
        return

    for row in to_send:
        first_name = row.get("First Name", "There")
        company    = row.get("Company", "your company")

        city_raw = row.get("City", "").strip(' \t\n\r",')
        if not city_raw or city_raw.upper() == 'N/A' or city_raw.lower() == 'nan':
            city = "your area"
        else:
            city = city_raw.split(',')[0].strip().title()

        recipient_email = row.get("Email")
        if not recipient_email or "@" not in recipient_email:
            print(f"Skipping {first_name}: Invalid email '{recipient_email}'")
            continue

        whatsapp_clean = "".join(filter(str.isdigit, S_WHATSAPP))

        img_placeholder = ""
        if mockup_data:
            img_placeholder = '<div style="margin: 20px 0;"><img src="cid:mockup_img" alt="Product Mockup" style="max-width: 100%; height: auto; border-radius: 8px;"></div>'

        logo_placeholder = f"<b>{S_COMPANY}</b>"
        if logo_data:
            logo_placeholder = '<img src="cid:logo_img" alt="Logo" width="90" style="display: block;">'

        tracker_pixel = build_tracker_pixel(recipient_email)

        subject = SUBJECT_TEMPLATE.format(**{"First Name": first_name})
        body = BODY_TEMPLATE.format(**{
            "First Name":       first_name,
            "City":             city,
            "S_NAME":           S_NAME,
            "S_COMPANY":        S_COMPANY,
            "S_LINKEDIN":       S_LINKEDIN,
            "S_PHONE":          S_PHONE,
            "S_EMAIL":          SENDER_EMAIL,
            "S_WEBSITE":        S_WEBSITE,
            "S_WHATSAPP_CLEAN": whatsapp_clean,
            "IMAGE_PLACEHOLDER":img_placeholder,
            "LOGO_PLACEHOLDER": logo_placeholder,
            "TRACKER_PIXEL":    tracker_pixel,
        })

        msg = MIMEMultipart('mixed')
        msg['From']    = f"{S_NAME} <{SENDER_EMAIL}>"
        msg['To']      = recipient_email
        msg['Subject'] = subject

        msg_related = MIMEMultipart('related')
        msg.attach(msg_related)
        msg_related.attach(MIMEText(body, 'html'))

        if logo_data:
            from email.mime.base import MIMEBase
            from email import encoders
            part = MIMEBase('image', image_subtype(LOGO_FILE))
            part.set_payload(logo_data)
            encoders.encode_base64(part)
            part.add_header('Content-ID', '<logo_img>')
            part.add_header('Content-Disposition', 'inline', filename="logo.png")
            msg_related.attach(part)

        if mockup_data:
            from email.mime.base import MIMEBase
            from email import encoders
            part = MIMEBase('image', image_subtype(MOCKUP_FILE))
            part.set_payload(mockup_data)
            encoders.encode_base64(part)
            part.add_header('Content-ID', '<mockup_img>')
            part.add_header('Content-Disposition', 'inline', filename="mockup.png")
            msg_related.attach(part)

        if pdf_data:
            pdf_part = MIMEApplication(pdf_data, Name="Product_Brief.pdf")
            pdf_part.add_header('Content-Disposition', 'attachment', filename="Product_Brief.pdf")
            msg.attach(pdf_part)

        print(f"  Sending to {recipient_email} ({first_name})...", end="", flush=True)
        try:
            server.send_message(msg)
            print(" Done")
            row["Sent Status"] = "Yes"
        except Exception as e:
            # Connection likely dropped — reconnect and retry once
            print(f" Connection lost, reconnecting...", end="", flush=True)
            try:
                server = smtp_connect()
                server.send_message(msg)
                print(" Done (reconnected)")
                row["Sent Status"] = "Yes"
            except Exception as retry_e:
                print(f" Error: {retry_e}")
                row["Sent Status"] = "Failed"

        # Only write progress back during campaign (preserve test CSV as-is)
        if not is_test:
            with open(contact_file, mode='w', newline='', encoding='utf-8-sig') as outfile:
                writer = csv.DictWriter(outfile, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(contacts)

        sent_count += 1
        if limit and sent_count >= limit:
            print(f"\nLimit of {limit} reached. Stopping batch.")
            break

        delay = random.randint(10, 30) if is_test else random.randint(60, 180)
        print(f"  Waiting {delay}s before next...\n")
        time.sleep(delay)

    try:
        server.quit()
    except Exception:
        pass
    print(f"\n--- {mode_label} COMPLETE ---")
    if is_test:
        print("Check your inbox and verify everything looks correct.")
        print("When ready, run:  python send_emails.py --mode campaign")


# ==========================================
# ENTRY POINT
# ==========================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BNI Email Automator")
    parser.add_argument(
        "--mode",
        choices=["test", "campaign"],
        required=True,
        help="'test' sends to test_contacts.csv | 'campaign' sends to contacts.csv"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max number of emails to send in this run (e.g. 100)"
    )
    args = parser.parse_args()

    if args.mode == "test":
        print("\n==============================")
        print("       TEST MODE")
        print("==============================")
        print(f"Sending to: test_contacts.csv")
        print(f"Tracker   : {'Active (' + CAMPAIGN_ID + ')' if TRACKER_URL else 'Not configured'}")
        print("==============================\n")
        send_emails("test_contacts.csv", is_test=True)

    elif args.mode == "campaign":
        # Count pending
        try:
            with open("contacts.csv", 'r', encoding='utf-8-sig') as f:
                all_rows = list(csv.DictReader(f))
            pending = [r for r in all_rows if r.get("Sent Status", "No").lower() not in ("yes",)]
            pending_count = len(pending)
            total_count   = len(all_rows)
        except Exception:
            pending_count = "?"
            total_count   = "?"

        print("\n========================================")
        print("       CAMPAIGN MODE — FULL SEND")
        print("========================================")
        print(f"  SMTP Server  : {SMTP_SERVER}")
        print(f"  Sender Email : {SENDER_EMAIL}")
        print(f"  Campaign ID  : {CAMPAIGN_ID}")
        print(f"  Tracker      : {'Active' if TRACKER_URL else 'NOT configured (add TRACKER_URL to .env)'}")
        print(f"  Pending      : {pending_count} / {total_count} contacts")
        print("========================================")
        confirm = input("\nType  SEND  to begin (anything else cancels): ").strip()
        if confirm == "SEND":
            send_emails("contacts.csv", is_test=False, limit=args.limit)
        else:
            print("Cancelled. No emails were sent.")
