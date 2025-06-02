import requests
import json
import os

URL = "https://eqdb.net/api/v1/items?id="
OUTPUT_FILE = "eq_items_fetched.txt"  # .jsonl = JSON lines format

def fetch_and_append_item(item_id, output_path):
    try:
        response = requests.get(f"{URL}{item_id}")
        response.raise_for_status()
        item_data = response.json()

        if isinstance(item_data, list):
            items = item_data
        else:
            items = [item_data]

        with open(output_path, "a", encoding="utf-8") as f:
            for item in items:
                f.write(json.dumps(item) + "\n")

        print(f"✅ Item {item_id} written to {output_path}")
    except requests.RequestException as e:
        print(f"❌ Failed to fetch item {item_id}: {e}")
    except json.JSONDecodeError:
        print(f"❌ Invalid JSON from item {item_id}")

# Example range — update this as needed
for i in range(2004407, 2004420):
    fetch_and_append_item(i, OUTPUT_FILE)

for i in range(2020898, 2020920):
    fetch_and_append_item(i, OUTPUT_FILE)

for i in range(2004407, 2004410):
    fetch_and_append_item(i, OUTPUT_FILE)