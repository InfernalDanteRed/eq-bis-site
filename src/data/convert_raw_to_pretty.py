import json

def get_stat(item, key):
    return item.get(key) if item.get(key) != 0 else None

# Hypothetical slot bit-to-name mapping (just a placeholder — you can adjust these)
SLOT_BITMASK = {
    0: "Head",
    1: "Chest",
    2: "Arms",
    3: "Primary",
    4: "Hands",
    5: "Legs",
    6: "Misc",
    7: "Wrist",
    8: "Secondary",
    9: "Range",
    10: "Back",
    11: "Shoulders",
    12: "Neck",
    13: "Face",
    14: "Ear",
    15: "Finger",
    16: "Power Source",
    17: "Charm",
    18: "Ammo",
    19: "Feet",  # <-- your custom note
    20: "Waist",
    21: "Belt",
    22: "Hands2",
    23: "Aug"
}

def parse_slot_types(slot_mask):
    slots = []
    for i in range(24):
        if slot_mask & (1 << i):
            label = SLOT_BITMASK.get(i, f"UnknownSlot{i}")
            slots.append(label)
    return slots if slots else ["UNKNOWN"]

with open("eq_items_fetched.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

items = []
for line in lines:
    try:
        raw = json.loads(line)
        # TODO: get is Aug seperate from slot type!
        if raw.get("augtype") == 0:
            slot_mask = raw.get("slots", 0)
            slot_names = parse_slot_types(slot_mask)
        else:
            slot_names = "Aug"

        transformed = {
            "ItemName": raw.get("Name", "MISSING"),
            "SlotType": slot_names,
            "Link": None,
            "WeaponDamage": get_stat(raw, "damage"),
            "WeaponDelay": get_stat(raw, "delay"),
            "WeaponType": None,
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
            "Clairvoyance": get_stat(raw, "clairvoyance"),
            "BashMod": None,
            "BackstabMod": get_stat(raw, "backstabdmg"),
            "FrenzyMod": None,
            "FocusEffectOrSkillMod": raw.get("focusname") or None,
            "FocusEffectId": raw.get("focuseffect") or None,
            "ClickyEffect": raw.get("clickname") or None,
            "WeaponProc": raw.get("procname") or None,
            "ProcMod": None,
            "CLASSES": "BST",
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

with open("gear_data_full_temp.js", "w", encoding="utf-8") as out_file:
    out_file.write("export default ")
    json.dump(items, out_file, indent=2)
    out_file.write(";")