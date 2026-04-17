import csv
import os
import glob

# Central contact sheet
MASTER_FILE = 'contacts.csv'
REQUIRED_HEADERS = ['First Name', 'Last Name', 'Email', 'Company', 'City', 'Sent Status']

def clean_professional(text):
    """Clean text for professional look: remove commas, title case, handle N/A."""
    if not text or str(text).lower() in ('n/a', 'nan', ''):
        return 'N/A'
    # Remove trailing/leading commas and whitespace
    cleaned = str(text).strip(' \t\n\r",')
    # Split by comma if it's a list (like "Surat, Gujarat") and take the first part
    if ',' in cleaned:
        cleaned = cleaned.split(',')[0].strip()
    return cleaned.title()

def sync_contacts():
    print("Starting Contact Sync...")
    
    # 1. Load existing contacts to prevent duplicates and preserve status
    master_contacts = {} # email -> row
    if os.path.exists(MASTER_FILE):
        with open(MASTER_FILE, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                email = row.get('Email', '').strip().lower()
                if email:
                    master_contacts[email] = row
        print(f"Loaded {len(master_contacts)} existing contacts from {MASTER_FILE}")
    else:
        print(f"Creating new master file: {MASTER_FILE}")

    # 2. Find all other CSV files to import
    # This includes BNI exports or any other lead lists
    csv_files = glob.glob("*.csv")
    # Exclude master, template, hvac and audit files
    csv_files = [
        f for f in csv_files 
        if f.lower() != MASTER_FILE.lower() 
        and 'template' not in f.lower()
        and 'hvac' not in f.lower()
        and 'audit' not in f.lower()
        and 'test_contacts' not in f.lower()
    ]
    
    if not csv_files:
        print("No new CSV files found to import. Place your BNI exports in this folder.")
        return

    new_count = 0
    updated_count = 0

    for file in csv_files:
        print(f"Processing {file}...")
        try:
            with open(file, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Map possible source headers to our master headers
                    email = (row.get('Email') or row.get('Email Address') or '').strip().lower()
                    if not email or "@" not in email:
                        continue
                    
                    first_name = clean_professional(row.get('First Name') or row.get('Name', '').split(' ')[0])
                    last_name = clean_professional(row.get('Last Name') or (row.get('Name', '').split(' ')[1] if ' ' in row.get('Name', '') else ''))
                    company = (row.get('Company Name') or row.get('Company') or 'N/A').strip()
                    city = clean_professional(row.get('City'))
                    
                    if email not in master_contacts:
                        # New contact found
                        master_contacts[email] = {
                            'First Name': first_name,
                            'Last Name': last_name,
                            'Email': email,
                            'Company': company,
                            'City': city,
                            'Sent Status': 'No'
                        }
                        new_count += 1
                    else:
                        # Existing contact - Update info AND reset status to "No" for this campaign
                        ent = master_contacts[email]
                        if ent['City'] == 'N/A' and city != 'N/A':
                            ent['City'] = city
                            updated_count += 1
                        
                        # Fix status to "No" to ensure they are picked up in the next send
                        if ent.get('Sent Status') != 'No':
                            ent['Sent Status'] = 'No'
                            updated_count += 1
                        
                        # Apply professional cleaning
                        ent['First Name'] = clean_professional(ent['First Name'])
                        ent['Last Name'] = clean_professional(ent['Last Name'])
                        ent['City'] = clean_professional(ent['City'])
        except Exception as e:
            print(f"Error reading {file}: {e}")

    # 3. Write back to master file
    with open(MASTER_FILE, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=REQUIRED_HEADERS)
        writer.writeheader()
        # Sort by status and then email to keep it tidy
        sorted_rows = sorted(master_contacts.values(), key=lambda x: (x['Sent Status'], x['Email']))
        writer.writerows(sorted_rows)

    print("\nSync Complete!")
    print(f" - {new_count} new contacts added.")
    print(f" - {updated_count} existing contacts updated with info.")
    print(f" - Total database size: {len(master_contacts)} contacts.")
    print(f"\nNext: Run 'python send_emails.py' to start the campaign.")

if __name__ == "__main__":
    sync_contacts()
