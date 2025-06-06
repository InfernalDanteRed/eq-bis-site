import requests
import json
import os

URL = "https://eqdb.net/api/v1/items?id="
OUTPUT_FILE = "eq_items_fetched.txt"  # .jsonl = JSON lines format
ERROR_FILE = "eq_items_failed.txt"

def fetch_and_append_item(item_id, output_path, retry_count):
    if retry_count<3:
        try:
            response = requests.get(f"{URL}{item_id}")
            response.raise_for_status()
            item_data = response.json()

            if isinstance(item_data, list):
                items = item_data
            else:
                items = [item_data]
            if item_data == "{}":
                return

            with open(output_path, "a", encoding="utf-8") as f:
                for item in items:
                    f.write(json.dumps(item) + "\n")

            print(f"✅ Item {item_id} written to {output_path}")
        except requests.RequestException as e:
            print(f"❌ Failed to fetch item {item_id}: {e}")
            fetch_and_append_item(item_id, output_path, retry_count+1)
        except json.JSONDecodeError:
            print(f"❌ Invalid JSON from item {item_id}")
    else:
        with open(ERROR_FILE, "a", encoding="utf-8") as g:
            g.write(str(item_id) + ",")

# Example range — update this as needed
#for i in range(1001, 107000):
#    fetch_and_append_item(i, OUTPUT_FILE, 0)

#for i in range(1001001, 1010700):
#    fetch_and_append_item(i, OUTPUT_FILE, 0)

#for i in range(2001001, 2107000):
#    fetch_and_append_item(i, OUTPUT_FILE, 0)

#for item in [42480,61499,80615,90282,90283,90284,90285,90286,90287,90288,90289,90290,90291,99492,2002844,2021724,2040411,2059450,2059559,2059560,2076838,2095499]:
#    fetch_and_append_item(item, OUTPUT_FILE, 0)

for i in range(1010700, 1107000):
    fetch_and_append_item(i, OUTPUT_FILE, 0)