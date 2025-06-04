import React, { useState, useEffect, useRef } from "react";
import gearData from "./data/gear_data_full_temp";

const slotLayout = [
  ["Ear", "Head", "Face", "Ear"],
  ["Chest", null, null, "Neck"],
  ["Arms", null, null, "Back"],
  ["Waist", null, null, "Shoulders"],
  ["Wrist", null, null, "Wrist"],
  ["Legs", "Hands", "Charm", "Feet"],
  [null, "Finger", "Finger", null],
  ["Primary", "Secondary", "Range", "Ammo"],
];

const allSlots = slotLayout
  .flatMap((row, rowIndex) =>
    row
      .map((slot, colIndex) =>
        slot ? { id: `${slot}-${rowIndex}-${colIndex}`, label: slot } : null
      )
      .filter(Boolean)
  );

const classOptions = [
  "",
  "BER",
  "BRD",
  "BST",
  "CLR",
  "DRU",
  "ENC",
  "MAG",
  "MNK",
  "NEC",
  "PAL",
  "RNG",
  "ROG",
  "SHD",
  "SHM",
  "WAR",
  "WIZ",
];

const statList = [
  { label: "Shielding", base: "Shielding" },
  { label: "SpellShield", base: "SpellShield"},
  { label: "DoTShield", base: "DoTShield"},
  { label: "DmgShieldMit", base: "DmgShieldMit"},
  { label: "Avoidance", base: "Avoidance" },
  { label: "Attack", base: "Attack"},
  { label: "Accuracy", base: "Accuracy"},
  { label: "Strikethrough", base: "Strikethrough"},
  { label: "StunResist", base: "StunResist"},
  { label: "Spell Damage", base: "SpellDamage" },
  { label: "Heal Amount", base: "HealAmount" },
  { label: "Haste", base: "Haste" },
  { label: "HP", base: "HP" },
  { label: "MP", base: "Mana" },
  { label: "AC", base: "AC" },
  { label: "STR", heroic: "HStr", base: "Str"},
  { label: "STA", heroic: "HSta", base: "Sta" },
  { label: "AGI", heroic: "HAgi", base: "Agi" },
  { label: "DEX", heroic: "HDex", base: "Dex" },
  { label: "WIS", heroic: "HWis", base: "Wis" },
  { label: "INT", heroic: "HInt", base: "Int" },
  { label: "CHA", heroic: "HCha", base: "Cha" },
  { label: "MAGIC", base: "MagicResist", heroic: "HMagic" },
  { label: "FIRE", base: "FireResist", heroic: "HFire" },
  { label: "COLD", base: "ColdResist", heroic: "HCold" },
  { label: "DISEASE", base: "DiseaseResist", heroic: "HDisease" },
  { label: "POISON", base: "PoisonResist", heroic: "HPoison" },

];

const defaultGear = Object.fromEntries(
  allSlots.map(({ id }) => [id, null])
);

function decodeBase64urlMask(maskStr) {
  const base64 = maskStr.replace(/-/g, '+').replace(/_/g, '/').padEnd(4, '=');
  const binary = atob(base64);
  return (binary.charCodeAt(0) << 16) | (binary.charCodeAt(1) << 8) | binary.charCodeAt(2);
}

const BASE64URL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const encode18BitId = (id) => {
  const c1 = (id >> 12) & 0b111111; // first 6 bits
  const c2 = (id >> 6) & 0b111111;  // next 6 bits
  const c3 = id & 0b111111;         // last 6 bits

  return BASE64URL_CHARS[c1] + BASE64URL_CHARS[c2] + BASE64URL_CHARS[c3];
};

const decode18BitId = (chunk) => {
  const i1 = BASE64URL_CHARS.indexOf(chunk[0]);
  const i2 = BASE64URL_CHARS.indexOf(chunk[1]);
  const i3 = BASE64URL_CHARS.indexOf(chunk[2]);
  return (i1 << 12) | (i2 << 6) | i3;
};

const encodeMaskToBase64url = (mask) => {
  const bytes = [
    (mask >> 16) & 0xff,
    (mask >> 8) & 0xff,
    mask & 0xff,
  ];
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

function getItemIconPath(item) {
  return `/item_icons/item_${item.iconId}.png`; 
}

export default function EQBisPlanner() {
  const wrapperRef = useRef(null);
  const pickerRef = useRef(null);
  const [gear, setGear] = useState(defaultGear);
  const [selectedClasses, setSelectedClasses] = useState(["", "", ""]);
  const [activeSlot, setActiveSlot] = useState(null);
  const [filter, setFilter] = useState("");
  const [currentHash, setCurrentHash] = useState(window.location.hash);
  const skipNextHashLoad = useRef(false);
  const lastParsedHash = useRef(""); // tracks what we’ve already parsed
  const hashWriteTimer = useRef(null);



  const loadFromHash = () => {
    const rawHash = window.location.hash.slice(1);
    // If user used ?build=…&classes=…, we can read from params:
    const params = new URLSearchParams(rawHash);
    const encoded =
      params.get("build") || rawHash.split("&")[0] || "";
    const classString = params.get("classes") || "";
    if (classString) {
      setSelectedClasses(classString.split("-"));
    }

    if (encoded.length >= 4) {
      // First 6 hex chars = 24‐bit presence mask
      const [maskEncoded, idHexes] = encoded.split(":");
      if (!maskEncoded || !idHexes) return;      
      const mask = decodeBase64urlMask(maskEncoded);
      // Build a lookup from itemId → gearData object
      // TODO: Make this not load everything from memory
      const gearByItemId = {};
      gearData.forEach((item) => {
        gearByItemId[item.itemId] = item;
      });

      const newGear = {};
      let hexIndex = 0;
      allSlots.forEach((slotObj, sIndex) => {
        // If that bit is set, read 6 hex digits: [itemId][aug0Id][aug1Id]
        if (mask & (1 << sIndex)) {
          const idChunk = idHexes.slice(hexIndex, hexIndex + 9);
          const itemId = decode18BitId(idChunk.slice(0, 3));
          const aug0Id = decode18BitId(idChunk.slice(3, 6));
          const aug1Id = decode18BitId(idChunk.slice(6, 9));

          if (itemId && gearByItemId[itemId]) newGear[slotObj.id] = gearByItemId[itemId];
          if (aug0Id && gearByItemId[aug0Id]) newGear[`${slotObj.id}-aug0`] = gearByItemId[aug0Id];
          if (aug1Id && gearByItemId[aug1Id]) newGear[`${slotObj.id}-aug1`] = gearByItemId[aug1Id];

          hexIndex += 9;
                  }
        });
      setGear(newGear);
    }
  };
  // --------------------------------------------
  // 1) On mount (or on hash change), decode URL hash
  // --------------------------------------------
  useEffect(() => {
    loadFromHash();
    window.addEventListener("hashchange", loadFromHash);
    return () => window.removeEventListener("hashchange", loadFromHash);
  }, []);

  // --------------------------------------------
  // 2) Whenever `gear` or `selectedClasses` changes, rebuild URL hash
  // --------------------------------------------
  useEffect(() => {
    if (hashWriteTimer.current) {
      clearTimeout(hashWriteTimer.current);
    }
    hashWriteTimer.current = window.setTimeout(() => {
      skipNextHashLoad.current = true;

    // (a) Build a 24‐bit presence mask
    let mask = 0;
    allSlots.forEach((slotObj, sIndex) => {
      if (gear[slotObj.id]) {
        mask |= 1 << sIndex;
      }
    });
    
    const maskBase64 = encodeMaskToBase64url(mask); // 4-character base64url
    // (b) For each set bit, append 3 two‐digit hex values: [itemId][aug0Id][aug1Id]
    let encodedIds = "";

    allSlots.forEach((slotObj, sIndex) => {
      if (mask & (1 << sIndex)) {
        const itemId = gear[slotObj.id]?.itemId || 0;
        const aug0Id = gear[`${slotObj.id}-aug0`]?.itemId || 0;
        const aug1Id = gear[`${slotObj.id}-aug1`]?.itemId || 0;

        encodedIds +=
          encode18BitId(itemId) +
          encode18BitId(aug0Id) +
          encode18BitId(aug1Id);
      }
    });

    // (c) Class combo code: just join with “‐”, or “00” if blank
    const classCode = selectedClasses
      .map((cls) => (cls ? cls : "00"))
      .join("-");

    const encoded = maskBase64 + ":" + encodedIds;
    const newHash = classCode
      ? `#build=${encoded}&classes=${classCode}`
      : `#build=${encoded}`;
      const currentHash = window.location.hash;
      if (
        currentHash !== newHash &&
        lastParsedHash.current !== newHash
      ) {
        window.history.replaceState(null, "", newHash);
      }
      hashWriteTimer.current = null;
    }, 300);
    return () => {
      if (hashWriteTimer.current) {
        clearTimeout(hashWriteTimer.current);
        hashWriteTimer.current = null;
      }
    };
    }, [gear, selectedClasses]);

  // --------------------------------------------
  // 3) Click‐outside logic to close any open “picker” dropdown
  // --------------------------------------------
  useEffect(() => {
    const handleClickOutside = (evt) => {
      const dropdowns = document.querySelectorAll(".z-50");
      const clickedInsideAny = Array.from(dropdowns).some((dropdown) => dropdown.contains(evt.target));
      if (!clickedInsideAny) {
        setActiveSlot(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentHashRef = useRef(window.location.hash);

  // --------------------------------------------
  // 5) Handlers for slot ↔ picker logic
  // --------------------------------------------
  const handleSlotClick = (slot) => {
    setTimeout(() => {
      setActiveSlot(slot);
      setFilter("");
    }, 0);
  };
  const handleItemSelect = (slot, item) => {
    setGear((prev) => ({ ...prev, [slot]: item }));
    setActiveSlot(null);
    setFilter("");
  };



  // Change one of the three class dropdowns
  const handleClassChange = (idx, val) => {
    const dup = [...selectedClasses];
    dup[idx] = val;
    setSelectedClasses(dup);
  };
  const availableOptions = (currentIdx) =>
    classOptions.filter(
      (opt) =>
        opt === "" ||
        !selectedClasses.includes(opt) ||
        selectedClasses[currentIdx] === opt
    );

  // Filtered list of items (for whichever slot is active)
  const filteredGearData = gearData.filter((item) => {
    if (!activeSlot) return false;
    const slotType = activeSlot.split("-")[0];
    const nameMatch = item.ItemName.toLowerCase().includes(filter.toLowerCase());
    const slotMatch = Array.isArray(item.SlotType)
    ? item.SlotType.includes(slotType)
    : item.SlotType === slotType;;
    // Also filter by selectedClasses: if none chosen, allow all
    const allowedClasses =
  typeof item.CLASSES === "string"
    ? item.CLASSES.split(",").map((c) => c.trim())
    : [];
    const anyClassSelected = selectedClasses.filter(Boolean);
    const classOK =
      anyClassSelected.length === 0 ||
      anyClassSelected.some((c) => allowedClasses.includes(c));
    return slotMatch && nameMatch && classOK;
  });

  return (
    <div className="w-full bg-gray-900">

    <div
      ref={wrapperRef}
      className="min-h-screen w-full flex flex-col items-center justify-start bg-gray-900 text-white p-4 space-y-6"
    >
      <h1 className="text-3xl font-extrabold">THJ Thats My Gear Planner</h1>

      <button
        onClick={() => navigator.clipboard.writeText(window.location.href)}
        className="px-4 py-2 bg-yellow-300 hover:bg-yellow-400 text-black font-semibold rounded"
      >
        Copy Build Link
      </button>
      <button
        onClick={() => setGear(defaultGear)}
        className="px-4 py-2 bg-red-400 hover:bg-red-500 text-white font-semibold rounded"
      >
        Reset Build
      </button>

      {/* Class selectors */}
      <div className="flex flex-wrap gap-2 justify-center w-full max-w-md">
        {selectedClasses.map((cls, idx) => (
          <select
            key={idx}
            value={cls}
            onChange={(e) => handleClassChange(idx, e.target.value)}
            className="px-4 py-2 bg-gray-800 border border-yellow-300 rounded text-white"
          >
            {availableOptions(idx).map((opt) => (
              <option key={opt} value={opt}>
                {opt || "Select Class"}
              </option>
            ))}
          </select>
        ))}
      </div>

      <div className="flex space-x-8 overflow-x-auto max-w-full px-2">
        {/* Effects Panel */}
        <div className="bg-gray-800 p-4 rounded-lg shadow-xl w-[20rem] space-y-2">
          <h2 className="text-lg font-bold mb-2 text-center">Effects</h2>
          {["ClickyEffect", "FocusEffectOrSkillMod", "WeaponProc"].map((eKey) => {
            const effects = Object.values(gear)
              .filter((it) => it && it[eKey])
              .map((it) => it[eKey]);
            return (
              <div key={eKey} className="border-b border-gray-600 py-1">
                <div className="text-sm font-semibold text-yellow-300">
                  {eKey}
                </div>
                {effects.length > 0 ? (
                  <ul className="list-disc list-inside text-sm text-gray-300">
                    {effects.map((eff, i) => (
                      <li key={i}>{eff}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-gray-500 italic">None</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Equipped Items List */}
        <div className="bg-gray-800 p-4 rounded-lg shadow-xl w-[36rem] space-y-2">
          <h2 className="text-lg font-bold mb-2 text-center">Equipped Items</h2>
          {allSlots.map(({ id, label }) => (
            <div
              key={id}
              className="flex justify-between text-sm border-b border-gray-600 py-1 relative"
            >
              <span>{label}</span>
              <span className="text-gray-300 italic">
                {gear[id]?.ItemName || "Not Equipped"}
              </span>
              <div className="flex flex-col ml-2 space-y-1">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="flex items-center space-x-2 relative"
                  >
                    <div
                      className="w-3 h-3 bg-yellow-300 rounded-sm cursor-pointer hover:bg-yellow-500"
                      onClick={() => handleSlotClick(`${id}-aug${i}`)}
                    />
                    <span className="text-xs text-gray-300">
                      {gear[`${id}-aug${i}`]?.ItemName || ""}
                    </span>
                    {gear[`${id}-aug${i}`] && (
                      <button
                        className="ml-1 text-red-400 text-xs hover:text-red-600"
                        onClick={() =>
                          handleItemSelect(`${id}-aug${i}`, null)
                        }
                      >
                        ✖
                      </button>
                    )}
                    {activeSlot === `${id}-aug${i}` && (
                      <div className="absolute z-50 top-full left-0 mt-1 w-48 bg-gray-800 border border-yellow-300 rounded shadow-lg">
                        <input
                          type="text"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                          placeholder="Search augs..."
                          className="w-full p-1 text-sm bg-gray-700 text-white border-b border-yellow-300"
                        />
                        <div className="max-h-48 overflow-y-auto">
                          {gearData
                            .filter(
                              (item) =>
                                item.SlotType === "Aug" &&
                                item.ItemName.toLowerCase().includes(
                                  filter.toLowerCase()
                                )
                            )
                            .slice(0, 8)
                            .map((item, idx) => (
                              <div
                                key={idx}
                                className="px-2 py-1 hover:bg-yellow-600 cursor-pointer"
                                onClick={() =>
                                  handleItemSelect(`${id}-aug${i}`, item)
                                }
                              >
                                {item.ItemName}
                              </div>
                            ))}
                          {gearData.filter(
                            (item) =>
                              item.SlotType === "Aug" &&
                              item.ItemName.toLowerCase().includes(
                                filter.toLowerCase()
                              )
                          ).length === 0 && (
                            <div className="px-2 py-1 text-gray-400 text-sm">
                              No matches
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Gear Grid */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-xl space-y-4">
          {slotLayout.map((row, rowIndex) => (
            <div key={rowIndex} className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {row.map((slot, colIndex) =>
                slot ? (
                  <div
                    key={`${slot}-${rowIndex}-${colIndex}`}
                    className="relative"
                  >
                    <div
                      className={`relative w-20 h-20 sm:w-24 sm:h-24 border border-yellow-300 rounded-lg cursor-pointer hover:bg-yellow-500 flex items-center justify-center text-white text-xs font-bold text-center ${
                        gear[`${slot}-${rowIndex}-${colIndex}`]
                          ? "bg-black"
                          : "bg-gray-600"
                      }`}
                      onClick={() =>
                        handleSlotClick(`${slot}-${rowIndex}-${colIndex}`)
                      }
                    >
                      {gear[`${slot}-${rowIndex}-${colIndex}`] ? (
                          <img
                            src={getItemIconPath(gear[`${slot}-${rowIndex}-${colIndex}`])}
                            alt={gear[`${slot}-${rowIndex}-${colIndex}`].ItemName}
                            className="w-16 h-16 object-contain"
                          />
                        ) : (
                          slot
                      )}
                      {gear[`${slot}-${rowIndex}-${colIndex}`] && (
                        <button
                          className="absolute top-0 right-0 m-1 text-red-400 text-xs hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleItemSelect(
                              `${slot}-${rowIndex}-${colIndex}`,
                              null
                            );
                          }}
                        >
                          ✖
                        </button>
                      )}
                    </div>

                    {activeSlot === `${slot}-${rowIndex}-${colIndex}` && (
                      <div className="absolute top-full mt-1 w-48 bg-gray-800 border border-yellow-300 rounded shadow-lg z-50">
                        <input
                          type="text"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                          placeholder="Search items..."
                          className="w-full p-1 text-sm bg-gray-700 text-white border-b border-yellow-300"
                        />
                        <div className="max-h-48 overflow-y-auto">
                          {filteredGearData.slice(0, 8).map((item, idx) => (
                            <div
                              key={idx}
                              className="px-2 py-1 hover:bg-yellow-600 cursor-pointer"
                              onClick={() =>
                                handleItemSelect(activeSlot, item)
                              }
                            >
                              {item.ItemName}
                            </div>
                          ))}
                          {filteredGearData.length === 0 && (
                            <div className="px-2 py-1 text-gray-400 text-sm">
                              No matches
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    key={`empty-${rowIndex}-${colIndex}`}
                    className="w-24 h-24"
                  />
                )
              )}
            </div>
          ))}
        </div>

        {/* Stat Panel */}
        <div className="bg-gray-800 p-4 rounded-lg shadow-xl w-[20rem] space-y-2">
          <h2 className="text-lg font-bold mb-2 text-center">Stats</h2>
          {statList.map((stat) => {
            let baseTotal = 0;
            let heroicTotal = 0;
            Object.values(gear).forEach((item) => {
              if (!item) return;
              if (stat.base && item[stat.base]) baseTotal += Number(item[stat.base]);
              if (stat.heroic && item[stat.heroic]) heroicTotal += Number(item[stat.heroic]);
              if (stat.heroic && item[stat.heroic]) baseTotal += Number(item[stat.heroic]);

            });
            return (
              <div
                key={stat.label}
                className="flex justify-between text-sm border-b border-gray-600 py-1"
              >
                <span>{stat.label}</span>
                <span className="text-green-400">
                  {baseTotal} <span className="text-yellow-300">+{heroicTotal}</span>
                </span>
              </div>
            );
          })}
          <div className="h-24" />
        </div>
      </div>
    </div>
    </div>
  );
}