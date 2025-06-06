import json
from pathlib import Path
import argparse
from collections import defaultdict

# CONFIG
CHUNK_SIZE = 800

# ARGUMENTS
parser = argparse.ArgumentParser()
parser.add_argument(
    "--input", default="gear_data_full_temp.js", help="Input gear JSON file"
)
parser.add_argument(
    "--output", default="../../public/gear_chunks", help="Output directory"
)
parser.add_argument(
    "--version", default="v1", help="Data version (used in filenames)"
)
args = parser.parse_args()

version = args.version
output_dir = Path(args.output) / version
output_dir.mkdir(parents=True, exist_ok=True)

chunk_counter = 0

# Load full gear list
with open(args.input, "r", encoding="utf-8") as f:
    items = json.load(f)

# Sort items by slot type
slot_groups = defaultdict(list)
slot_counter = set()

for item in items:
    slots = item.get("SlotType")
    if slots == "Aug":
        slot_groups[slots].append(item)
    else:
        for slot in slots:
            slot_groups[slot].append(item)
            slot_counter.add(slot)

# For stats/indexing
global_index = []

def prefix_of(item):
    # 3-letter lowercase prefix of the ItemName (or "zzz" if missing)
    return (item.get("ItemName") or "zzz").lower()[:3]

# For each slot group, sort and chunk—avoiding splitting on the same prefix
for slot, group in slot_groups.items():
    # Sort lexicographically by lowercase ItemName
    group.sort(key=lambda x: prefix_of(x))

    i = 0
    n = len(group)
    while i < n:
        # Tentative end of this chunk:
        end_idx = min(i + CHUNK_SIZE - 1, n - 1)

        # If we’re not at the very last item, and the next item has the same prefix,
        # slide end_idx forward until the prefix changes (to avoid splitting).
        while (
            end_idx < n - 1
            and prefix_of(group[end_idx]) == prefix_of(group[end_idx + 1])
        ):
            end_idx += 1

        # Now [i … end_idx] is one chunk
        chunk = group[i : end_idx + 1]

        start_prefix = prefix_of(chunk[0])
        end_prefix = prefix_of(chunk[-1])

        filename = f"{version}_chunk_{slot.lower()}_{start_prefix}_{end_prefix}_{chunk_counter}.json"
        filepath = output_dir / filename

        # Save this chunk
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(chunk, f)

        # Increment chunk_counter after using it for this file’s index
        global_index.append({filename: chunk_counter})
        chunk_counter += 1

        # Move i to the next item after this chunk
        i = end_idx + 1

# Save slot-based index
with open(output_dir / "index.json", "w", encoding="utf-8") as f:
    json.dump(global_index, f, indent=2)

# Output slot summary
print(f"✅ Chunked by slot: {len(slot_counter)} slots found")
for slot in sorted(slot_counter):
    print(f"  • {slot} → {len(slot_groups[slot])} items")
print(f"📁 Output written to: {output_dir}")
print(f"Number of chunks written: {chunk_counter}")