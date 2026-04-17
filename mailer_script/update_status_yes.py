import csv
import os

MASTER_FILE = 'contacts.csv'

# Emails provided by the user to be marked as "Yes"
EMAILS_TO_MARK_YES = [
    "Ceyonesolar@gmail.com", "Info@meerasunenergies.com", "Karanshah212@gmail.com", 
    "Merup13334@gmail.com", "Powertronics1990@gmail.com", "Sunshineengineeringsolutions@gmail.com", 
    "adityasolarkop@gmail.com", "adityavniteee@gmail.com", "akash@isunsolar.in", 
    "akshayurja88@gmail.com", "alteamarenewable@gmail.com", "amit.sharma@madhavtechnologies.com", 
    "amol@smartsun-solar.com", "atulchimle.bni@gmail.com", "bhumeshpatel@gmail.com", 
    "brightnestenergy@gmail.com", "chirag.happysolar@gmail.com", "connect@powertechsolar.in", 
    "connectus@solarjunction.in", "cyardi@nrgtechnologists.com", "deepsolartech@gmail.com", 
    "dipen.patel@gbreenergy.com", "energymixindia@gmail.com", "energypowersyst@gmail.com", 
    "ewcsolarpvtltd@gmail.com", "fourcellenergy@gmail.com", "gauravvijaywani@gmail.com", 
    "golden.electricals@rediffmail.com", "gosolar@upvoltage.co.in", "gunvant529@gmail.com", 
    "harin@krishjay.com", "harsh@citizensolar.com", "hello.viaelectric@gmail.com", 
    "himaxsolar@gmail.com", "hussain@sunrisegrp.in", "info.bkipl@gmail.com", 
    "info.rgpowersolutions@gmail.com", "info.tspsolution@gmail.com", "info@anshsolar.com", 
    "info@kapsol.co.in", "info@nysapower.com", "info@sindhurajsolar.com", 
    "info@solarmegapower.com", "info@superwatt.in", "janatarajaenterprises@gmail.com", 
    "jpshukla69@gmail.com", "kash.dalal@techsolar.org", "kumar.pawar@rei-infra.com", 
    "kushalthacker98@gmail.com", "laukikmsanghavi@gmail.com", "magwinsolarpower@gmail.com", 
    "mahesh@dabun.in", "malhar.jani1988@gmail.com", "md@bsolar.in", "meet@tvaritenergy.in", 
    "mkt@atarurenew.com", "nidhi@urjal.in", "nikhiltarle17@gmail.com", "nikmehta1994@gmail.com", 
    "nitin@futurista.co.in", "northgreencontact@gmail.com", "pateldarshit274@gmail.com", 
    "powershineenergy1993@gmail.com", "prabhatmohite@yahoo.com", "praful@arhamrenewtech.com", 
    "prakash@suryatechsolarsystems.com", "priyanka@visolindia.com", "rajul@dimansolar.com", 
    "ramahajani8@gmail.com", "ravi@amplesolar.in", "ruturajkatole@gmail.com", 
    "saifyraja@gmail.com", "sales2.renew@gmail.com", "sales@gogreenventures.in", 
    "sanchaysolar@gmail.com", "satishantenaproducts@gmail.com", "savajsunny3333@gmail.com", 
    "saysolar.sales@gmail.com", "shantiniketan@hotmail.com", "shreyansthanks@gmail.com", 
    "shrikanti@sunergize.co.in", "solarsolution.as@gmail.com", "soryouthenergy@gmail.com", 
    "sthenicenergy@gmail.com", "subhash@golesgreenenergy.com", "sudarshansolarhouse@gmail.com", 
    "suntechsolutions14@gmail.com", "team@ashone.in", "varun@solarhitechsolutions.in", 
    "vasudhacleantech@gmail.com", "veershukla008@gmail.com", "vishal@dimansolar.com", 
    "visionentap@gmail.com"
]
EMAILS_SET = {e.lower().strip() for e in EMAILS_TO_MARK_YES}

def update_status():
    if not os.path.exists(MASTER_FILE):
        print(f"Error: {MASTER_FILE} not found.")
        return

    rows = []
    updated_count = 0
    with open(MASTER_FILE, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            email = row.get('Email', '').strip().lower()
            if email in EMAILS_SET:
                row['Sent Status'] = 'Yes'
                updated_count += 1
            rows.append(row)
    
    with open(MASTER_FILE, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    
    print(f"Successfully marked {updated_count} contacts as 'Yes' in {MASTER_FILE}.")

if __name__ == "__main__":
    update_status()
