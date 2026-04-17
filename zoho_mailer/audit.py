import csv
import os

MASTER_FILE = 'contacts.csv'
STATE_FILES = ['Solar Gujarat.csv', 'Solar Maharashtra.csv']

def audit():
    if not os.path.exists(MASTER_FILE):
        print(f"Error: {MASTER_FILE} not found.")
        return

    # Load master emails
    master_emails = set()
    with open(MASTER_FILE, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            email = row.get('Email', '').strip().lower()
            if email:
                master_emails.add(email)
    
    print(f"Loaded {len(master_emails)} existing contacts from {MASTER_FILE}.\n")

    for file in STATE_FILES:
        if not os.path.exists(file):
            print(f"Skip: {file} not found.")
            continue
        
        new_contacts = []
        na_count = 0
        duplicate_count = 0
        
        with open(file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                email = row.get('Email', '').strip().lower()
                if not email or email == 'n/a':
                    na_count += 1
                    continue
                
                if email in master_emails:
                    duplicate_count += 1
                else:
                    new_contacts.append(email)
        
        total = len(new_contacts) + duplicate_count + na_count
        print(f"--- Audit: {file} ---")
        print(f"Total Rows: {total}")
        print(f"  - New Contacts found: {len(new_contacts)}")
        print(f"  - Already in master:  {duplicate_count}")
        print(f"  - Missing Email (N/A): {na_count}")
        print("")

if __name__ == "__main__":
    audit()
