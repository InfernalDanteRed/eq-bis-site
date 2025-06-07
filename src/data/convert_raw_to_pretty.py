import json

def get_stat(item, key):
    return item.get(key) if item.get(key) != 0 else None

# Hypothetical slot bit-to-name mapping (just a placeholder — you can adjust these)
SLOT_BITMASK = {
    0: "Charm", # 1
    1: "",  # 2
    2: "Head", # 4
    3: "Face", # 8
    4: "Ear", # 16
    5: "Neck", # 32
    6: "Shoulders", # 64
    7: "Arms", # 128
    8: "Back", # 256
    9: "", # 512
    10: "Wrist", # 1024
    11: "Range", # 2048
    12: "Hands", # 4096
    13: "Primary", # 8192
    14: "Secondary", # 16384
    15: "", # 32768
    16: "Fingers", # 65536
    17: "Chest", # 131072
    18: "Legs", # 262144
    19: "Feet",  # 524288
    20: "Waist", # 1048576
    21: "MISC", # 2097152
    22: "MISC", # 4194304
    23: "MISC" # 8388608
}

# Hypothetical slot bit-to-name mapping (just a placeholder — you can adjust these)
SLOT_CLASSES = {
    0: "WAR", # 1
    1: "CLR",  # 2
    2: "PAL", # 4
    3: "RNG", # 8
    4: "SHD", # 16
    5: "DRU", # 32
    6: "MNK", # 64
    7: "BRD", # 128
    8: "ROG", # 256
    9: "SHM", # 512
    10: "NEC", # 1024
    11: "WIZ", # 2048
    12: "MAG", # 4096
    13: "ENC", # 8192
    14: "BST", # 16384
    15: "BER", # 32768
}

itemtypes = set()

def parse_slot_types(slot_mask):
    slots = []
    for i in range(24):
        if slot_mask & (1 << i):
            label = SLOT_BITMASK.get(i, f"UnknownSlot{i}")
            if label != "":
                slots.append(label)
    return slots if slots else ["UNKNOWN"]

def parse_class_types(class_mask):
    slots = ""
    for i in range(24):
        if class_mask & (1 << i):
            label = SLOT_CLASSES.get(i, f"UnknownSlot{i}")
            if label != "":
                slots += label + ","
    return slots[0:-1] if slots else ["UNKNOWN"]

with open("eq_items_fetched.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

items = []
for line in lines:
    try:
        #print(line)
        raw = json.loads(line)
        if raw.get("itemtype") not in itemtypes:
            print(raw.get("Name"))
        itemtypes.add(raw.get("itemtype"))
        slot_mask = raw.get("slots", 0)
        if slot_mask != 0:
            # TODO: get is Aug seperate from slot type!
            if raw.get("augtype") == 0:
                slot_mask = raw.get("slots", 0)
                slot_names = parse_slot_types(slot_mask)
                class_mask = raw.get("classes", 0)
                class_names = parse_class_types(class_mask)

            else:
                slot_names = "Aug"

            transformed = {
                "ItemName": raw.get("Name", "MISSING"),
                "SlotType": slot_names,
                #"Link": None,
                #"WeaponDamage": get_stat(raw, "damage"),
                #"WeaponDelay": get_stat(raw, "delay"),
                #"WeaponType": None,
                "AC": get_stat(raw, "ac"),
                "HP": get_stat(raw, "hp"),
                "Mana": get_stat(raw, "mana"),
                "Haste": get_stat(raw, "haste"),
                "HStr": get_stat(raw, "heroic_str"),
                "HSta": get_stat(raw, "heroic_sta"),
                "HInt": get_stat(raw, "heroic_int"),
                "HWis": get_stat(raw, "heroic_wis"),
                "HAgi": get_stat(raw, "heroic_agi"),
                "HDex": get_stat(raw, "heroic_dex"),
                "HCha": get_stat(raw, "heroic_cha"),
                "Str": get_stat(raw, "astr"),
                "Sta": get_stat(raw, "asta"),
                "Int": get_stat(raw, "aint"),
                "Wis": get_stat(raw, "awis"),
                "Agi": get_stat(raw, "aagi"),
                "Dex": get_stat(raw, "adex"),
                "Cha": get_stat(raw, "acha"),
                "MagicResist": get_stat(raw, "mr"),
                "HMagic": get_stat(raw, "heroic_mr"),
                "FireResist": get_stat(raw, "fr"),
                "HFire": get_stat(raw, "heroic_fr"),
                "ColdResist": get_stat(raw, "cr"),
                "HCold": get_stat(raw, "heroic_cr"),
                "DiseaseResist": get_stat(raw, "dr"),
                "HDisease": get_stat(raw, "heroic_dr"),
                "PoisonResist": get_stat(raw, "pr"),
                "HPoison": get_stat(raw, "heroic_pr"),
                "CombatEffects": get_stat(raw, "combateffects"),
                "HPRegen": get_stat(raw, "regen"),
                "ManaRegen": get_stat(raw, "manaregen"),
                "SpellShield": get_stat(raw, "spellshield"),
                "Shielding": get_stat(raw, "shielding"),
                "DmgShield": get_stat(raw, "damageshield"),
                "DoTShield": get_stat(raw, "dotshielding"),
                "DmgShieldMit": get_stat(raw, "dsmitigation"),
                "Avoidance": get_stat(raw, "avoidance"),
                "Attack": get_stat(raw, "attack"),
                "Accuracy": get_stat(raw, "accuracy"),
                "Strikethrough": get_stat(raw, "strikethrough"),
                "StunResist": get_stat(raw, "stunresist"),
                "HealAmount": get_stat(raw, "healamt"),
                "SpellDamage": get_stat(raw, "spelldmg"),
                #"Clairvoyance": get_stat(raw, "clairvoyance"),
                "BashMod": None,
                "BackstabMod": get_stat(raw, "backstabdmg"),
                "FrenzyMod": None,
                "FocusEffectOrSkillMod": raw.get("focusname") or None,
                "FocusEffectId": raw.get("focuseffect") or None,
                "ClickyEffect": raw.get("clickname") or None,
                "WeaponProc": raw.get("procname") or None,
                "ProcMod": None,
                "CLASSES": class_names,
                "AugSlot": None,
                "AugWeaponProc": None,
                "AugWeaponDmg": None,
                "AugBaneDmg": None,
                "itemId": raw.get("id", 0),
                "iconId": raw.get("icon"),
            }
            items.append(transformed)
    except json.JSONDecodeError as e:
        print(f"Skipping malformed line: {e}")
print(itemtypes)
with open("gear_data_full_temp.js", "w", encoding="utf-8") as out_file:
    out_file.write("export default ")
    json.dump(items, out_file, indent=2)
    out_file.write(";")
    print("total items: {}".format(len(items)))