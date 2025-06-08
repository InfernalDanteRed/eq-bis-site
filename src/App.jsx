import React, { useMemo, useState, useEffect, useRef } from "react";
import indexJson from "/public/gear_chunks/v1/index.json";
import rawSpellMap from "/public/spell_map.json";
import { Analytics } from '@vercel/analytics/react';

const spellMap = Array.isArray(rawSpellMap)
  ? rawSpellMap.reduce((acc, cur) => ({ ...acc, ...cur }), {})
  : rawSpellMap;

const slotLayout = [
  ["Ear", "Head", "Face", "Ear"],
  ["Chest", null, null, "Neck"],
  ["Arms", null, null, "Back"],
  ["Waist", null, null, "Shoulders"],
  ["Wrist", null, null, "Wrist"],
  ["Legs", "Hands", "Charm", "Feet"],
  [null, "Fingers", "Fingers", null],
  ["Primary", "Secondary", "Range", "Ammo"],
];

const ID_CHAR_LEN = 4;   // 4×6 = 24 bits → up to ~16.7 million


const allSlots = slotLayout
  .flatMap((row, rowIndex) =>
    row
      .map((slot, colIndex) =>
        slot ? { id: `${slot}-${rowIndex}-${colIndex}`, label: slot } : null
      )
      .filter(Boolean)
  );

const classOptions = [
  "", "BER", "BRD", "BST", "CLR", "DRU", "ENC", "MAG", "MNK", "NEC", "PAL", "RNG", "ROG", "SHD", "SHM", "WAR", "WIZ",
];

const statList = [
  { label: "Shielding", base: "Shielding" },
  { label: "SpellShield", base: "SpellShield" },
  { label: "DoTShield", base: "DoTShield" },
  { label: "DmgShieldMit", base: "DmgShieldMit" },
  { label: "Avoidance", base: "Avoidance" },
  { label: "Attack", base: "Attack" },
  { label: "Accuracy", base: "Accuracy" },
  { label: "Strikethrough", base: "Strikethrough" },
  { label: "StunResist", base: "StunResist" },
  { label: "Spell Damage", base: "SpellDamage" },
  { label: "Heal Amount", base: "HealAmount" },
  { label: "Haste", base: "Haste" },
  { label: "HP", base: "HP" },
  { label: "MP", base: "Mana" },
  { label: "AC", base: "AC" },
  { label: "STR", heroic: "HStr", base: "Str" },
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

const defaultGear = Object.fromEntries(allSlots.map(({ id }) => [id, null]));

function decodeBase64urlMask(maskStr) {
  const base64 = maskStr.replace(/-/g, "+").replace(/_/g, "/").padEnd(4, "=");
  const binary = atob(base64);
  return (binary.charCodeAt(0) << 16) | (binary.charCodeAt(1) << 8) | binary.charCodeAt(2);
}

const BASE64URL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function decode18BitId(chunk) {
  const i1 = BASE64URL_CHARS.indexOf(chunk[0]);
  const i2 = BASE64URL_CHARS.indexOf(chunk[1]);
  const i3 = BASE64URL_CHARS.indexOf(chunk[2]);
  return (i1 << 12) | (i2 << 6) | i3;
}

function encode18BitId(id) {
  const c1 = (id >> 12) & 0b111111;
  const c2 = (id >> 6) & 0b111111;
  const c3 = id & 0b111111;
  return BASE64URL_CHARS[c1] + BASE64URL_CHARS[c2] + BASE64URL_CHARS[c3];
}

// Replace encode18BitId
function encodeId(id) {
  // Convert to a 24-bit binary string
  const bits = id.toString(2).padStart(ID_CHAR_LEN * 6, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 6) {
    const sextet = parseInt(bits.slice(i, i + 6), 2);
    out += BASE64URL_CHARS[sextet];
  }
  return out;
}

// Replace decode18BitId
function decodeId(str) {
  let bits = "";
  for (const c of str) {
    bits += BASE64URL_CHARS.indexOf(c).toString(2).padStart(6, "0");
  }
  return parseInt(bits, 2);
}

function encodeMaskToBase64url(mask) {
  const bytes = [(mask >> 16) & 0xff, (mask >> 8) & 0xff, mask & 0xff];
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeChunkIdsToBase64url(ids) {
  let bitString = ids.map((id) => id.toString(2).padStart(8, "0")).join("");
  while (bitString.length % 6 !== 0) bitString += "0";
  let result = "";
  for (let i = 0; i < bitString.length; i += 6) {
    const sextet = parseInt(bitString.slice(i, i + 6), 2);
    result += BASE64URL_CHARS[sextet];
  }
  return result;
}

function decodeChunkIdsFromBase64url(str) {
  const lookup = {};
  for (let i = 0; i < BASE64URL_CHARS.length; i++) lookup[BASE64URL_CHARS[i]] = i;
  let bitString = "";
  for (const char of str) {
    bitString += lookup[char].toString(2).padStart(6, "0");
  }
  while (bitString.length % 8 !== 0) bitString = bitString.slice(0, -1);
  const ids = [];
  for (let i = 0; i < bitString.length; i += 8) ids.push(parseInt(bitString.slice(i, i + 8), 2));
  return ids;
}

function getChunkKeyForQuery(activeSlot, filterText) {
  if (!activeSlot) return null;
  const slotType = activeSlot.split("-")[0].toLowerCase();
  const prefix = filterText.slice(0, 3).toLowerCase();
  return `v1_chunk_${slotType}_${prefix}`;
}

function getItemIconPath(item) {
  return `/item_icons/item_${item.iconId}.png`;
}

export default function EQBisPlanner() {
  const wrapperRef = useRef(null);
  const pickerRef = useRef(null);
  const isInitializing = useRef(true);
  const [gear, setGear] = useState(defaultGear);
  const [selectedClasses, setSelectedClasses] = useState(["", "", ""]);
  const [activeSlot, setActiveSlot] = useState(null);
  const [filter, setFilter] = useState("");
  const skipNextHashLoad = useRef(false);
  const lastParsedHash = useRef("");
  const hashWriteTimer = useRef(null);
  const [chunkKeys, setChunkKeys] = useState([]);
  const [loadedChunks, setLoadedChunks] = useState({});
  const [initialChunkIds, setInitialChunkIds] = useState([]);
  const [initialItemIds, setInitialItemIds] = useState([]);
  const [importQueue, setImportQueue] = useState(null);


  const { chunkFilenameToId, idToChunkFilename } = useMemo(() => {
    const f2i = {};
    const i2f = {};
    indexJson.forEach((obj) => {
      const filename = Object.keys(obj)[0];
      const id = obj[filename];
      f2i[filename] = id;
      i2f[id] = filename;
    });
    return { chunkFilenameToId: f2i, idToChunkFilename: i2f };
  }, []);

const handleImportFile = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const rawLines = reader.result.split(/\r?\n/);
    const lines    = rawLines.slice(1);      // skip header line
    const queue    = {};                     // slotId → itemId
    const chunkIds = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith("General")) break;  // stop on “General…”

      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const [loc, name, idStr, ...augParts] = parts;
      const mainId = parseInt(idStr, 10);
      if (!loc || isNaN(mainId) || mainId <= 0) continue;

      // —— PRIMARY SPECIAL CASE ——
      if (loc === "Primary") {
        const primarySlot = allSlots.find((s) => s.label === "Primary");
        if (primarySlot) {
          // 1) queue the main staff
          queue[primarySlot.id] = mainId;
          const mainChunk = findChunkForSlotAndSearch("primary", name);
          if (mainChunk?.id) chunkIds.add(mainChunk.id);

          // 2) read next 4 lines of aug data
          const augLines = lines.slice(i + 1, i + 5);
          augLines.forEach((augLine, j) => {
            const [_, augName, augIdStr] = augLine.split("\t");
            const augId = parseInt(augIdStr, 10);
            if (!augName || isNaN(augId) || augId <= 0) return;

            // map j → aug slot
            let targetSlotId;
            if (j < 2) {
              // first two augs go on Primary-aug0/1
              targetSlotId = `${primarySlot.id}-aug${j}`;
            } else {
              // last two go on Secondary-aug0/1 in same row
              const [, row] = primarySlot.id.split("-");
              const secondarySlot = allSlots.find(
                (s) => s.label === "Secondary" && s.id.split("-")[1] === row
              );
              if (!secondarySlot) return;
              targetSlotId = `${secondarySlot.id}-aug${j - 2}`;
            }

            queue[targetSlotId] = augId;
            const augChunk = findChunkForSlotAndSearch("aug", augName);
            if (augChunk?.id) chunkIds.add(augChunk.id);
          });
        }

        // skip over those 4 lines in the main loop
        i += 4;
        continue;
      }

      // —— NON‐PRIMARY SLOTS —— 
      // find the next free slot matching this loc
      const matches = allSlots.filter((s) => s.label === loc);
      const slot    = matches.find((s) => !queue[s.id]);
      if (!slot) continue;

      // queue main item
      queue[slot.id] = mainId;
      const mainChunk = findChunkForSlotAndSearch(loc.toLowerCase(), name);
      if (mainChunk?.id) chunkIds.add(mainChunk.id);

      // queue up to two augs
      const augKeys = [`${slot.id}-aug0`, `${slot.id}-aug1`];
      augKeys.forEach((augKey, j) => {
        const nameIdx = 2 * j;
        const idIdx   = nameIdx + 1;
        const augName = augParts[nameIdx];
        const augId   = parseInt(augParts[idIdx], 10);
        if (!augName || isNaN(augId) || augId <= 0) return;

        queue[augKey] = augId;
        const augChunk = findChunkForSlotAndSearch("aug", augName);
        if (augChunk?.id) chunkIds.add(augChunk.id);
      });
    }

    // kick off chunk loads & store our slot→id map
    setInitialChunkIds(Array.from(chunkIds));
    setImportQueue(queue);
  };

  reader.readAsText(file);
  e.target.value = "";
};

  const gearByItemId = useMemo(() => {
    const map = {};
    Object.values(loadedChunks).forEach((chunkArray) => {
      chunkArray.forEach((item) => {
        map[item.itemId] = item;
      });
    });
    return map;
  }, [loadedChunks]);

  const availableAugs = useMemo(
  () => Object.values(gearByItemId).filter((item) => item.SlotType === "Aug"),
  [gearByItemId]
  );

  const findChunkForSlotAndSearch = (slotType, searchText) => {
    if (!slotType || searchText.length === 0) return null;
    const key = searchText.slice(0, 3).toLowerCase();
    for (const filename of Object.keys(chunkFilenameToId)) {
      const core = filename.replace(/^v1_chunk_/, "").replace(/\.json$/, "");
      const parts = core.split("_");
      if (parts[0] !== slotType) continue;
      const start = parts[1];
      const end = parts[2];
      if (key >= start && key <= end) {
        return { filename, id: chunkFilenameToId[filename] };
      }
    }
    return null;
  };

     function rebuildHash(currentGear) {
  // exactly what you have in your writer useEffect:
  let mask = 0;
  allSlots.forEach((slotObj, sIndex) => {
    if (currentGear[slotObj.id]) mask |= 1 << sIndex;
  });
  const maskBase64 = encodeMaskToBase64url(mask);

  let encodedIds = "";
  allSlots.forEach((slotObj, sIndex) => {
    if (mask & (1 << sIndex)) {
      const itemId = currentGear[slotObj.id]?.itemId || 0;
      const aug0Id = currentGear[`${slotObj.id}-aug0`]?.itemId || 0;
      const aug1Id = currentGear[`${slotObj.id}-aug1`]?.itemId || 0;
      encodedIds += encodeId(itemId) + encodeId(aug0Id) + encodeId(aug1Id);
    }
  });

  // recompute chunkKeys too
  const chunkIdSet = new Set();
  allSlots.forEach((slotObj) => {
    const name = currentGear[slotObj.id]?.ItemName;
    if (name) {
      const slotType = slotObj.id.split("-")[0].toLowerCase();
      const info = findChunkForSlotAndSearch(slotType, name);
      if (info) chunkIdSet.add(info.id);
    }
  });
  const newChunkKeys = Array.from(chunkIdSet);
  const chunkBase64 = encodeChunkIdsToBase64url(newChunkKeys);

  const classCode = selectedClasses.map((c) => (c || "00")).join("-");
  const encoded = maskBase64 + ":" + encodedIds + (chunkBase64 ? ":" + chunkBase64 : "");
  const newHash = classCode
    ? `#build=${encoded}&classes=${classCode}`
    : `#build=${encoded}`;

  window.history.replaceState(null, "", newHash);
  lastParsedHash.current = newHash;
}
  function handleReset() {
    setGear(defaultGear);
    setSelectedClasses(["", "", ""]);
  }

  const loadFromHash = () => {
    skipNextHashLoad.current = true;
    // we’ve read the shared link, now permit writes
    isInitializing.current = false;
    const rawHash = window.location.hash.slice(1);
    const params = new URLSearchParams(rawHash);
    const encoded = params.get("build") || rawHash.split("&")[0] || "";
    const classString = params.get("classes") || "";
    if (classString) setSelectedClasses(classString.split("-"));
    if (encoded.length < 4) return;
    const [maskEncoded, idHexes, chunkBase64] = encoded.split(":");
    if (!maskEncoded || !idHexes) return;
    if (chunkBase64) {
      const parsedChunkIds = decodeChunkIdsFromBase64url(chunkBase64);
      setInitialChunkIds(Array.isArray(parsedChunkIds) ? parsedChunkIds : []);
    }
    const parsedItemIds = [];
    const mask = decodeBase64urlMask(maskEncoded);
    let hexIndex = 0;
    allSlots.forEach((slotObj, sIndex) => {
      if (mask & (1 << sIndex)) {
        const len      = ID_CHAR_LEN;
        const idChunk  = idHexes.slice(hexIndex, hexIndex + len * 3);
        const itemId   = decodeId(idChunk.slice(0, len));
        const aug0Id   = decodeId(idChunk.slice(len, len * 2));
        const aug1Id   = decodeId(idChunk.slice(len * 2, len * 3));
        if (itemId) parsedItemIds.push(itemId);
        if (aug0Id) parsedItemIds.push(aug0Id);
        if (aug1Id) parsedItemIds.push(aug1Id);
        hexIndex += 12;
      }
    });
    setInitialItemIds(parsedItemIds);
  };

  useEffect(() => {
    loadFromHash();
    window.addEventListener("hashchange", loadFromHash);
    return () => window.removeEventListener("hashchange", loadFromHash);
  }, []);

  useEffect(() => {
    if (!Array.isArray(initialChunkIds)) return;
    initialChunkIds.forEach((chunkId) => {
      const filename = idToChunkFilename[chunkId];
      if (!filename || loadedChunks[filename]) return;
      fetch(`/gear_chunks/v1/${filename}`)
        .then((res) => {
          if (!res.ok) throw new Error(`Chunk not found: ${filename}`);
          return res.json();
        })
        .then((itemsArray) => {
          setLoadedChunks((prev) => ({ ...prev, [filename]: itemsArray }));
        })
        .catch(() => setLoadedChunks((prev) => ({ ...prev, [filename]: [] })));
    });
  }, [initialChunkIds, idToChunkFilename, loadedChunks]);

useEffect(() => {
    if (!importQueue) return;
    const slotIds = Object.keys(importQueue);
    const allPresent = slotIds.every((slotId) => {
      const id = importQueue[slotId];
      return id && gearByItemId[id];
    });
    //if (!allPresent) return;

    // build a fresh gear state
    const newGear = { ...defaultGear };
    slotIds.forEach((slotId) => {
      const id = importQueue[slotId];
      newGear[slotId] = gearByItemId[id];
    });

   // 1) push it into state
    setGear(newGear);

   // 2) immediately rebuild the URL hash
   rebuildHash(newGear);

    // clear the queue so we only import once
    setImportQueue(null);
  }, [gearByItemId, importQueue]);

  useEffect(() => {
    if (!Array.isArray(initialItemIds) || initialItemIds.length === 0) return;
    const allPresent = initialItemIds.every((id) => gearByItemId[id]);
    if (!allPresent) return;
    const rawHash = window.location.hash.slice(1);
    const params = new URLSearchParams(rawHash);
    const encoded = params.get("build") || rawHash.split("&")[0] || "";
    const [maskEncoded, idHexes] = encoded.split(":");
    const mask = decodeBase64urlMask(maskEncoded);
    const newGear = {};
    let hexIndex = 0;
    allSlots.forEach((slotObj, sIndex) => {
      if (mask & (1 << sIndex)) {
      const len = ID_CHAR_LEN;                        // 4
      const idChunk = idHexes.slice(hexIndex, hexIndex + len * 3);
      const itemId  = decodeId(idChunk.slice(0, len));
      const aug0Id  = decodeId(idChunk.slice(len, len * 2));
      const aug1Id  = decodeId(idChunk.slice(len * 2, len * 3));
      hexIndex += len * 3;  
        if (itemId && gearByItemId[itemId]) newGear[slotObj.id] = gearByItemId[itemId];
        if (aug0Id && gearByItemId[aug0Id]) newGear[`${slotObj.id}-aug0`] = gearByItemId[aug0Id];
        if (aug1Id && gearByItemId[aug1Id]) newGear[`${slotObj.id}-aug1`] = gearByItemId[aug1Id];
      }
    });
    setGear(newGear);
    isInitializing.current = false;

  }, [initialItemIds, gearByItemId]);

  useEffect(() => {
    if (isInitializing.current) {
      return;
    }
    if (skipNextHashLoad.current) {
      skipNextHashLoad.current = false;
      return;
    }
    if (hashWriteTimer.current) clearTimeout(hashWriteTimer.current);
    hashWriteTimer.current = window.setTimeout(() => {
      skipNextHashLoad.current = true;
      let mask = 0;
      allSlots.forEach((slotObj, sIndex) => { if (gear[slotObj.id]) mask |= 1 << sIndex; });
      const maskBase64 = encodeMaskToBase64url(mask);
      let encodedIds = "";
      allSlots.forEach((slotObj, sIndex) => {
        if (mask & (1 << sIndex)) {
          const itemId = gear[slotObj.id]?.itemId || 0;
          const aug0Id = gear[`${slotObj.id}-aug0`]?.itemId || 0;
          const aug1Id = gear[`${slotObj.id}-aug1`]?.itemId || 0;
          encodedIds += encodeId(itemId)   + encodeId(aug0Id)   + encodeId(aug1Id);
        }
      });
      const chunkIdSet = new Set();
      allSlots.forEach((slotObj) => {
        const slotName = slotObj.id.split("-")[0].toLowerCase();
        const itemName = gear[slotObj.id]?.ItemName || "";
        if (itemName) {
          const key = itemName.slice(0, 3).toLowerCase();
          for (const filename of Object.keys(chunkFilenameToId)) {
            const core = filename.replace(/^v1_chunk_/, "").replace(/\.json$/, "");
            const [slot, start, end] = core.split("_");
            if (slot === slotName && key >= start && key <= end) {
              chunkIdSet.add(chunkFilenameToId[filename]);
              break;
            }
          }
        }
      });
      const newChunkKeys = Array.from(chunkIdSet);
      setChunkKeys(newChunkKeys);
      const chunkBase64 = encodeChunkIdsToBase64url(newChunkKeys);
      const classCode = selectedClasses.map((c) => (c ? c : "00")).join("-");
      let encoded = maskBase64 + ":" + encodedIds + (chunkBase64 ? ":" + chunkBase64 : "");
      const newHash = classCode ? `#build=${encoded}&classes=${classCode}` : `#build=${encoded}`;
      const current = window.location.hash;
      if (current !== newHash && lastParsedHash.current !== newHash) {
        lastParsedHash.current = newHash;
        window.history.replaceState(null, "", newHash);
      }
      hashWriteTimer.current = null;
    }, 300);
    return () => { if (hashWriteTimer.current) clearTimeout(hashWriteTimer.current); };
  }, [gear, selectedClasses, chunkKeys]);

  useEffect(() => {
    if (!activeSlot || filter.length < 3) return;
  // if we're on an aug slot, force slotType = "aug"
    const isAugSlot = activeSlot.endsWith("-aug0") || activeSlot.endsWith("-aug1");
    const slotType = isAugSlot
      ? "aug"
      : activeSlot.split("-")[0].toLowerCase();    const key = filter.slice(0, 3).toLowerCase();
    for (const filename of Object.keys(chunkFilenameToId)) {
      const core = filename.replace(/^v1_chunk_/, "").replace(/\.json$/, "");
      const [slot, start, end] = core.split("_");
      if (slot === slotType && key >= start && key <= end) {
        const chunkId = chunkFilenameToId[filename];
        if (!initialChunkIds.includes(chunkId)) setInitialChunkIds((p) => [...p, chunkId]);
        break;
      }
    }
  }, [activeSlot, filter, chunkFilenameToId, initialChunkIds]);

  useEffect(() => {
  function handleClickOutside(e) {
    // grab all open dropdowns (your item + aug lists both have z-50)
    const dropdowns = document.querySelectorAll(".z-50");
    const clickedInsideAny = Array.from(dropdowns).some(dd =>
      dd.contains(e.target)
    );
    if (!clickedInsideAny) {
      // close whatever was open…
      setActiveSlot(null);
      // …and clear the search box
      setFilter("");
    }
  }

  document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, []);

  const handleSlotClick = (slot) => { setTimeout(() => { setActiveSlot(slot); setFilter(""); }, 0); };
  const handleItemSelect = (slot, item) => { setGear((p) => ({ ...p, [slot]: item })); setActiveSlot(null); setFilter(""); };
  const handleClassChange = (idx, val) => { const dup = [...selectedClasses]; dup[idx] = val; setSelectedClasses(dup); };

  const filteredGearData = Object.values(gearByItemId).filter((item) => {
    if (!activeSlot) return false;
    const slotType = activeSlot.split("-")[0];
    const nameMatch = item.ItemName.toLowerCase().includes(filter.toLowerCase());
    const slotMatch = Array.isArray(item.SlotType) ? item.SlotType.includes(slotType) : item.SlotType === slotType;
    const allowedClasses = typeof item.CLASSES === "string" ? item.CLASSES.split(",").map((c) => c.trim()) : [];
    const anyClassSelected = selectedClasses.filter(Boolean);
    const classOK = anyClassSelected.length === 0 || anyClassSelected.some((c) => allowedClasses.includes(c));
    return slotMatch && nameMatch && classOK;
  });

  return (
    <div className="w-full bg-gray-900">
      <div ref={wrapperRef} className="min-h-screen w-full flex flex-col items-center bg-gray-900 text-white p-4 space-y-6">
        <h1 className="text-3xl font-extrabold">THJ Thats My Gear Planner</h1>
           <div className="flex flex-wrap items-center gap-2 justify-center">
            <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer">
              Import Inventory Data
              <input
                type="file"
                accept=".txt,.tsv"
                onChange={handleImportFile}
                className="hidden"
              />
            </label>
            <button
              onClick={() => navigator.clipboard.writeText(window.location.href)}
              className="px-4 py-2 bg-yellow-300 hover:bg-yellow-400 text-black font-semibold rounded"
            >
              Copy Build Link
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-red-400 hover:bg-red-500 text-white font-semibold rounded"
            >
              Reset Build
            </button>
        </div>      
        <div className="flex flex-wrap gap-2 justify-center w-full max-w-md">
          {selectedClasses.map((cls, idx) => (
            <select key={idx} value={cls} onChange={(e) => handleClassChange(idx, e.target.value)} className="px-4 py-2 bg-gray-800 border border-yellow-300 rounded text-white">
              {classOptions.filter((opt) => opt === "" || !selectedClasses.includes(opt) || selectedClasses[idx] === opt).map((opt) => (
                <option key={opt} value={opt}>{opt || "Select Class"}</option>
              ))}
            </select>
          ))}
        </div>
        <div className="flex flex-row flex-wrap lg:flex-nowrap gap-4 justify-center w-full">
          <div className="bg-gray-800 p-4 rounded-lg shadow-xl w-[20rem] space-y-2">
            <h2 className="text-lg font-bold mb-2 text-center">Effects</h2>
            {["ClickyEffect", "FocusEffectId", "WeaponProc"].map((eKey) => {
              const effectsWithSlots = Object.entries(gear)
                .filter(([slotId, item]) =>
                  item &&
                  typeof item[eKey] === "number" &&
                  item[eKey] !== -1
                )
                .map(([slotId, item]) => ({
                  slotName: slotId.split("-")[0],
                  effId: item[eKey],
                }));

              return (
                <div key={eKey} className="border-b border-gray-600 py-1">
                  <div className="text-sm font-semibold text-yellow-300">{eKey}</div>
                  {effectsWithSlots.length > 0 ? (
                    <ul className="list-disc list-inside text-sm text-gray-300">
                      {effectsWithSlots.map(({ slotName, effId }, i) => {
                        const name = spellMap[String(effId)] || effId;
                        return (
                          <li key={i}>
                            <span className="font-semibold">{slotName}:</span>{" "}
                            <a
                              href={`https://eqdb.net/spell/detail/${effId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-yellow-300"
                            >
                              {name}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="text-xs text-gray-500 italic">None</div>
                  )}
                </div>
              );
          })}
          </div>
          <div className="bg-gray-800 p-4 rounded-lg shadow-xl w-[36rem] space-y-2">
            <h2 className="text-lg font-bold mb-2 text-center">Equipped Items</h2>
            {allSlots.map(({ id, label }) => (
              <div key={id} className="flex justify-between text-sm border-b border-gray-600 py-1 relative">
                <span>{label}</span>
                <span className="text-gray-300 italic">
                  {gear[id] ? (
                    <a
                      href={`https://eqdb.net/item/detail/${gear[id].itemId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-yellow-400"
                    >
                      {gear[id].ItemName}
                    </a>
                  ) : (
                    "Not Equipped"
                  )}
                </span>                
              <div className="flex flex-col ml-2 space-y-1">
                  {[0, 1].map((i) => (
                    <div key={i} className="flex items-center space-x-2 relative">
                      <div className="w-3 h-3 bg-yellow-300 rounded-sm cursor-pointer hover:bg-yellow-500" onClick={() => handleSlotClick(`${id}-aug${i}`)} />
                      {gear[`${id}-aug${i}`] && (
                      <a
                        href={`https://eqdb.net/item/detail/${gear[`${id}-aug${i}`].itemId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs underline hover:text-yellow-400"
                      >
                        {gear[`${id}-aug${i}`].ItemName}
                      </a>
                      )}
                      {gear[`${id}-aug${i}`] && <button className="ml-1 text-red-400 text-xs hover:text-red-600" onClick={() => handleItemSelect(`${id}-aug${i}`, null)}>✖</button>}
                      {activeSlot === `${id}-aug${i}` && (
                        <div
                          ref={pickerRef}
                          className="absolute z-50 top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded shadow-lg"
                        >
                          <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search augs..." className="w-full p-1 text-sm bg-gray-700 text-white border-b border-yellow-300" />
                          <div className="max-h-48 overflow-y-auto">
                             {availableAugs
                              .filter(item => item.ItemName.toLowerCase().includes(filter.toLowerCase()))
                              .slice(0, 8)
                              .map((item, idx) => (
                              <div key={idx} className="px-2 py-1 hover:bg-yellow-600 cursor-pointer" onClick={() => handleItemSelect(`${id}-aug${i}`, item)}>{item.ItemName}</div>
                            ))}
                            {availableAugs.filter((item) => item.SlotType === "Aug" && item.ItemName.toLowerCase().includes(filter.toLowerCase())).length === 0 && <div className="px-2 py-1 text-gray-400 text-sm">No matches</div>}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl space-y-4 w-full max-w-[28rem] flex-shrink-0">
            {slotLayout.map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                {row.map((slot, colIndex) =>
                  slot ? (
                    <div key={`${slot}-${rowIndex}-${colIndex}`} className="relative">
                      <div className={`relative w-20 h-20 sm:w-24 sm:h-24 border border-yellow-300 rounded-lg cursor-pointer hover:bg-yellow-500 flex items-center justify-center text-white text-xs font-bold text-center ${gear[`${slot}-${rowIndex}-${colIndex}`] ? "bg-black" : "bg-gray-600"}`} onClick={() => handleSlotClick(`${slot}-${rowIndex}-${colIndex}`)}>                        {gear[`${slot}-${rowIndex}-${colIndex}`] ? (
                          <img src={getItemIconPath(gear[`${slot}-${rowIndex}-${colIndex}`])} alt={gear[`${slot}-${rowIndex}-${colIndex}`].ItemName} className="w-16 h-16 object-contain" />                        ) : (slot)}
                        {gear[`${slot}-${rowIndex}-${colIndex}`] && <button className="absolute top-0 right-0 m-1 text-red-400 text-xs hover:text-red-600" onClick={(e) => { e.stopPropagation(); handleItemSelect(`${slot}-${rowIndex}-${colIndex}`, null); }}>✖</button>}
                      </div>
                      {activeSlot === `${slot}-${rowIndex}-${colIndex}` && (
                        <div
                          ref={pickerRef}
                          className="absolute top-full mt-1 w-48 bg-gray-800 border border-gray-600 rounded shadow-lg z-50"
                        >
                          <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search items..." className="w-full p-1 text-sm bg-gray-700 text-white border-b border-yellow-300" />
                          <div className="max-h-48 overflow-y-auto">
                            {filteredGearData.slice(0, 8).map((item, idx) => (
                              <div key={idx} className="px-2 py-1 hover:bg-yellow-600 cursor-pointer" onClick={() => handleItemSelect(activeSlot, item)}>{item.ItemName}</div>
                            ))}
                            {filteredGearData.length === 0 && (<div className="px-2 py-1 text-gray-400 text-sm">No matches</div>)}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (<div key={`empty-${rowIndex}-${colIndex}`} className="w-24 h-24" />)
                )}
              </div>
            ))}
          </div>
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
                <div key={stat.label} className="flex justify-between text-sm border-b border-gray-600 py-1">
                  <span>{stat.label}</span>
                  <span className="text-green-400">{baseTotal} <span className="text-yellow-300">+{heroicTotal}</span></span>
                </div>
              );
            })}
            <div className="h-24" />
          </div>
        </div>
      </div>
      <Analytics />
    </div>
  );
}