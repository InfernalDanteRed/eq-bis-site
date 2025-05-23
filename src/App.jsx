import React, { useState, useEffect, useRef } from "react";
import gearData from "./data/gear_data";

const slotLayout = [
  ["Ear", "Head", "Face", "Ear"],
  ["Chest", null, null, "Neck"],
  ["Arms", null, null, "Back"],
  ["Waist", null, null, "Shoulders"],
  ["Wrist", null, null, "Wrist"],
  ["Legs", "Hands", "Charm", "Feet"],
  [null, "Fingers", "Fingers", "Power Source"],
  ["Primary", "Secondary", "Range", "Ammo"]
];

const allSlots = slotLayout.flatMap((row, rowIndex) =>
  row.map((slot, colIndex) =>
    slot ? { id: `${slot}-${rowIndex}-${colIndex}`, label: slot } : null
  ).filter(Boolean)
);

const classOptions = ["", "WIZ", "MAG", "DRU", "ENC", "BRD", "CLR", "SHM", "RNG", "ROG", "BER", "WAR", "PAL", "SHD", "BST", "MNK", "NEC"];

const statList = [
  { label: "Shielding", base: "Shielding" },
  { label: "Avoidance", base: "Avoidance" },
  { label: "Spell Damage", base: "SpellDamage" },
  { label: "Heal Amount", base: "HealAmount" },
  { label: "HP", base: "HP" },
  { label: "MP", base: "Mana" },
  { label: "AC", base: "AC" },
  { label: "STR", heroic: "HStr" },
  { label: "STA", heroic: "HSta" },
  { label: "AGI", heroic: "HAgi" },
  { label: "DEX", heroic: "HDex" },
  { label: "WIS", heroic: "HWis" },
  { label: "INT", heroic: "HInt" },
  { label: "CHA", heroic: "HCha" },
  { label: "MAGIC", base: "MagicResist", heroic: "HMagic" },
  { label: "FIRE", base: "FireResist", heroic: "HFire" },
  { label: "COLD", base: "ColdResist", heroic: "HCold" },
  { label: "DISEASE", base: "DiseaseResist", heroic: "HDisease" },
  { label: "POISON", base: "PoisonResist", heroic: "HPoison" }
];

const defaultGear = Object.fromEntries(
  allSlots.map(({ id }) => [id, null])
);

export default function EQBisPlanner() {
  const [gear, setGear] = useState(defaultGear);

  useEffect(() => {
    const loadFromHash = () => {
      const rawHash = window.location.hash.slice(1);
      const hash = rawHash.startsWith("build=")
        ? new URLSearchParams(rawHash).get("build")
        : rawHash;
      if (hash) {
        try {
          const fromHex = (hex) => parseInt(hex, 16).toString();
          const idList = Array.from({ length: hash.length / 2 }, (_, i) => fromHex(hash.slice(i * 2, i * 2 + 2)));
          const gearByItemId = {};
          gearData.forEach(item => gearByItemId[item.itemId] = item);

          const newGear = {};
          allSlots.forEach(({ id }, index) => {
            const itemId = idList[index];
            if (itemId !== "0" && gearByItemId[itemId]) newGear[id] = gearByItemId[itemId];
          });

          allSlots.forEach(({ id }, index) => {
            for (let i = 0; i < 2; i++) {
              const augId = idList[allSlots.length + index * 2 + i];
              if (augId !== "0" && gearByItemId[augId]) newGear[`${id}-aug${i}`] = gearByItemId[augId];
            }
          });

          setGear(newGear);
        } catch (e) {
          console.error("Failed to parse gear from URL", e);
        }
      }
    };

    loadFromHash();
    window.addEventListener("hashchange", loadFromHash);
    return () => window.removeEventListener("hashchange", loadFromHash);
  }, []);

  useEffect(() => {
    const allIds = allSlots.map(({ id }) => gear[id]?.itemId || null);
    const augIds = allSlots.flatMap(({ id }) => [gear[`${id}-aug0`]?.itemId || null, gear[`${id}-aug1`]?.itemId || null]);
    const toHex = (str) => parseInt(str).toString(16).padStart(2, '0');
    const allHex = [...allIds.map(id => toHex(id || "0")), ...augIds.map(id => toHex(id || "0"))];
    const encoded = allHex.join("");
    window.history.replaceState(null, "", `#build=${encoded}`);
  }, [gear]);
  const [selectedClasses, setSelectedClasses] = useState(["", "", ""]);
  const [activeSlot, setActiveSlot] = useState(null);
  const [filter, setFilter] = useState("");

  const handleSlotClick = (slot) => {
    setActiveSlot(slot);
    setFilter("");
  };

  const handleItemSelect = (slot, item) => {
    setGear({ ...gear, [slot]: item });
    setActiveSlot(null);
    setFilter("");
  };

  const handleClassChange = (index, value) => {
    const updated = [...selectedClasses];
    updated[index] = value;
    setSelectedClasses(updated);
  };

  const availableOptions = (currentIndex) =>
    classOptions.filter(
      (opt) => opt === "" || !selectedClasses.includes(opt) || selectedClasses[currentIndex] === opt
    );

  const filteredGearData = gearData.filter(item => {
    const slotMatch = item.SlotType === activeSlot?.split('-')[0];
    const nameMatch = (item.ItemName || "").toLowerCase().includes(filter.toLowerCase());
    const allowedClasses = item.CLASSES ? item.CLASSES.split(',').map(cls => cls.trim()) : [];
    const anyClassSelected = selectedClasses.filter(Boolean);
    const classMatch = anyClassSelected.length === 0 || anyClassSelected.some(cls => allowedClasses.includes(cls));
    return slotMatch && nameMatch && classMatch;
  });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white space-y-6">
      <h1 className="text-3xl font-extrabold">EverQuest BIS Planner</h1>

      <button
        onClick={() => navigator.clipboard.writeText(window.location.href)}
        className="px-4 py-2 bg-yellow-300 hover:bg-yellow-400 text-black font-semibold rounded"
      >
        Copy Build Link
      </button>

      <div className="flex space-x-4">
        {selectedClasses.map((cls, index) => (
          <select
            key={index}
            value={cls}
            onChange={(e) => handleClassChange(index, e.target.value)}
            className="px-4 py-2 bg-gray-800 border border-yellow-300 rounded text-white"
          >
            {availableOptions(index).map((opt) => (
              <option key={opt} value={opt}>{opt || "Select Class"}</option>
            ))}
          </select>
        ))}
      </div>

      <div className="flex space-x-8">
        {/* Effects Panel */}
        <div className="bg-gray-800 p-4 rounded-lg shadow-xl space-y-2 w-[20rem]">
          <h2 className="text-lg font-bold mb-2 text-center">Effects</h2>
          {["ClickyEffect", "FocusEffectOrSkillMod", "WeaponProc",].map((effectKey) => {
            const effects = Object.values(gear)
              .filter(item => item && item[effectKey])
              .map(item => item[effectKey]);
            return (
              <div key={effectKey} className="border-b border-gray-600 py-1">
                <div className="text-sm font-semibold text-yellow-300">{effectKey}</div>
                {effects.length > 0 ? (
                  <ul className="list-disc list-inside text-sm text-gray-300">
                    {effects.map((effect, idx) => (
                      <li key={idx}>{effect}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-gray-500 italic">None</div>
                )}
              </div>
            );
          })}
        </div>
        {/* Equipped Items */}
        <div className="bg-gray-800 p-4 rounded-lg shadow-xl space-y-2 w-[36rem]">
          <h2 className="text-lg font-bold mb-2 text-center">Equipped Items</h2>
          {allSlots.map(({ id, label }) => (
            <div key={id} className="flex justify-between text-sm border-b border-gray-600 py-1 relative">
              <span>{label}</span>
              <span className="text-gray-300 italic">{gear[id]?.ItemName || "Not Equipped"}</span>
              <div className="flex flex-col ml-2 space-y-1">
  {[0, 1].map(i => (
                <div key={i} className="flex items-center space-x-2 relative">
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
                      onClick={() => handleItemSelect(`${id}-aug${i}`, null)}
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
                        {gearData.filter(item => item.SlotType === "Aug" && (item.ItemName || '').toLowerCase().includes(filter.toLowerCase())).slice(0, 8).map((item, index) => (
                          <div
                            key={index}
                            className="px-2 py-1 hover:bg-yellow-600 cursor-pointer"
                            onClick={() => handleItemSelect(`${id}-aug${i}`, item)}
                          >
                            {item.ItemName}
                          </div>
                        ))}
                        {gearData.filter(item => item.SlotType === "Aug" && (item.ItemName || '').toLowerCase().includes(filter.toLowerCase())).length === 0 && (
                          <div className="px-2 py-1 text-gray-400 text-sm">No matches</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {activeSlot?.startsWith(id + '-aug') && (
                <div className="absolute z-50 top-full left-0 mt-1 w-48 bg-gray-800 border border-yellow-300 rounded shadow-lg">
                  <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search augs..."
                    className="w-full p-1 text-sm bg-gray-700 text-white border-b border-yellow-300"
                  />
                  <div className="max-h-48 overflow-y-auto">
                    {gearData.filter(item => item.SlotType === "Aug" && (item.ItemName || '').toLowerCase().includes(filter.toLowerCase())).slice(0, 8).map((item, index) => (
                      <div
                        key={index}
                        className="px-2 py-1 hover:bg-yellow-600 cursor-pointer"
                        onClick={() => handleItemSelect(activeSlot, item)}
                      >
                        {item.ItemName}
                      </div>
                    ))}
                    {gearData.filter(item => item.SlotType === "Aug" && (item.ItemName || '').toLowerCase().includes(filter.toLowerCase())).length === 0 && (
                      <div className="px-2 py-1 text-gray-400 text-sm">No matches</div>
                    )}
                  </div>
                </div>
              )}
</div>
            </div>
          ))}
        </div>

        {/* Gear Grid */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-xl space-y-4">
          {slotLayout.map((row, rowIndex) => (
            <div key={rowIndex} className="grid grid-cols-4 gap-4">
              {row.map((slot, colIndex) => (
                slot ? (
                  <div key={`${slot}-${rowIndex}-${colIndex}`} className="relative">
                    <div
                      className="w-24 h-24 bg-black border border-yellow-300 rounded-lg cursor-pointer hover:bg-yellow-500 flex items-center justify-center text-white text-xs font-bold text-center"
                      onClick={() => handleSlotClick(`${slot}-${rowIndex}-${colIndex}`)}
                    >
                      {gear[`${slot}-${rowIndex}-${colIndex}`]?.ItemName || slot}
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
                          {filteredGearData.slice(0, 8).map((item, index) => (
                            <div
                              key={index}
                              className="px-2 py-1 hover:bg-yellow-600 cursor-pointer"
                              onClick={() => handleItemSelect(activeSlot, item)}
                            >
                              {item.ItemName}
                            </div>
                          ))}
                          {filteredGearData.length === 0 && (
                            <div className="px-2 py-1 text-gray-400 text-sm">No matches</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div key={`empty-${rowIndex}-${colIndex}`} className="w-24 h-24" />
                )
              ))}
            </div>
          ))}
        </div>

        {/* Stat Panel */}
        <div className="bg-gray-800 p-4 rounded-lg shadow-xl space-y-2 w-[20rem]">
          <h2 className="text-lg font-bold mb-2 text-center">Stats</h2>
          {statList.map((stat) => {
            let baseTotal = 0;
            let heroicTotal = 0;
            Object.values(gear).forEach(item => {
              if (!item) return;
              if (stat.base && item[stat.base]) baseTotal += Number(item[stat.base] || 0);
              if (stat.heroic && item[stat.heroic]) heroicTotal += Number(item[stat.heroic] || 0);
            });
            return (
              <div key={stat.label} className="flex justify-between text-sm border-b border-gray-600 py-1">
                <span>{stat.label}</span>
                <span className="text-green-400">
                  {baseTotal} <span className="text-yellow-300">+{heroicTotal}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
   
