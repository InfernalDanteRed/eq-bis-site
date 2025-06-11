import React, { useMemo, useState, useEffect, useRef } from "react";
import indexJson from "/public/gear_chunks/v1/index.json";
import rawSpellMap from "/public/spell_map.json";
import { Analytics } from '@vercel/analytics/react';
import { getOrFetchChunk } from './gearChunkCache';


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
  { label: "HP", base: "HP" },
  { label: "MP", base: "Mana" },
  { label: "AC", base: "AC" },
  { label: "Haste", base: "Haste" },

  // === Core Attributes ===
  { label: "STR", heroic: "HStr", base: "Str" },
  { label: "STA", heroic: "HSta", base: "Sta" },
  { label: "AGI", heroic: "HAgi", base: "Agi" },
  { label: "DEX", heroic: "HDex", base: "Dex" },
  { label: "WIS", heroic: "HWis", base: "Wis" },
  { label: "INT", heroic: "HInt", base: "Int" },
  { label: "CHA", heroic: "HCha", base: "Cha" },

  // === Resistances ===
  { label: "MAGIC", heroic: "HMagic", base: "MagicResist" },
  { label: "FIRE", heroic: "HFire", base: "FireResist" },
  { label: "COLD", heroic: "HCold", base: "ColdResist" },
  { label: "POISON", heroic: "HPoison", base: "PoisonResist" },
  { label: "DISEASE", heroic: "HDisease", base: "DiseaseResist" },

  // === Physical Stats ===
  { label: "Attack", base: "Attack" },
  { label: "Accuracy", base: "Accuracy" },
  { label: "Avoidance", base: "Avoidance" },
  { label: "Shielding", base: "Shielding" },
  { label: "Strikethrough", base: "Strikethrough" },
  { label: "Damage Shield", base: "DmgShieldMit" },
  { label: "DS Mitigation", base: "DmgShieldMit" },

  // === Magic Stats ===
  { label: "Spell Damage", base: "SpellDamage" },
  { label: "Heal Amount", base: "HealAmount" },
  { label: "Combat Effects", base: "CombatEffects" },
  { label: "Stun Resist", base: "StunResist" },
  { label: "Spell Shield", base: "SpellShield" },
  { label: "DoT Shielding", base: "DoTShield" },
  { label: "Clairvoyance", base: "Clairvoyance" },
];


const defaultGear = Object.fromEntries(allSlots.map(({ id }) => [id, null]));

function decodeBase64urlMask(maskStr) {
  const base64 = maskStr.replace(/-/g, "+").replace(/_/g, "/").padEnd(4, "=");
  const binary = atob(base64);
  return (binary.charCodeAt(0) << 16) | (binary.charCodeAt(1) << 8) | binary.charCodeAt(2);
}

const BASE64URL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

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
      const isBard = selectedClasses.includes("BRD");


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


  // assume this exists somewhere above:
const idToClassMap = {
  2035001: "WAR",
  2035002: "CLR",
  2035003: "CLR",
  2035004: "RNG",
  2035005: "SHD",
  2035006: "DRU",
  2035007: "MNK",
  2035008: "BRD",
  2035009: "ROG",
  2035010: "SHM",
  2035011: "NEC",
  2035012: "WIZ",
  2035013: "MAG",
  2035014: "ENC",
  2035015: "BST",
  2035016: "BER",

  // …etc
};

// Make sure to mark this function async
const handleImportFile = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  // 1) Read & split lines (skip header)
  const text = await file.text();
  const rawLines = text.split(/\r?\n/).slice(1);

  // 2) Detect classes
  const seen = new Set();
  rawLines.forEach(line => {
    const parts = line.split("\t");
    const id = parseInt(parts[2], 10);
    if (idToClassMap[id]) seen.add(idToClassMap[id]);
  });
  const detected = Array.from(seen).slice(0,3);
  while (detected.length < 3) detected.push("");
  setSelectedClasses(detected);
  const isBard = detected.includes("BRD");

  // 3) Build queue & chunkIds
  const queue = {};
  const chunkIds = new Set();
  for (let i = 0; i < rawLines.length; i++) {
    const [loc,name,idStr] = rawLines[i].split("\t");
    const itemId = parseInt(idStr,10);
    if (!loc || isNaN(itemId) || itemId <= 0) continue;
    if (loc === "General" || loc === "Power Source") continue;

    const baseLoc  = loc.replace(/-Slot.*$/,"");
    const slotType = baseLoc.toLowerCase();
    const slotTypesToTry = (isBard && slotType === "range")
      ? ["primary","secondary","range"]
      : [slotType];

    // find chunk
    let info = null;
    for (const st of slotTypesToTry) {
      info = findChunkForSlotAndSearch(st, name);
      if (info) break;
    }
    if (info?.id) chunkIds.add(info.id);

    // assign to first free matching slot
    const matches = allSlots.filter(s => s.label === baseLoc);
    const slotObj = matches.find(s => !queue[s.id]);
    if (slotObj) {
      queue[slotObj.id] = itemId;
    }

    // process aug lookahead (same as before)
    let augIdx = 0, look = 1;
    while (rawLines[i+look] && rawLines[i+look].startsWith(`${baseLoc}-Slot`)) {
      const [, augName, augIdStr] = rawLines[i+look].split("\t");
      const augId = parseInt(augIdStr,10);
      const real = augName && isNaN(+augName) && augName.toLowerCase()!=="empty";
      if (augIdx<2 && real && augId>0 && slotObj) {
        queue[`${slotObj.id}-aug${augIdx}`] = augId;
        const augInfo = findChunkForSlotAndSearch("aug", augName);
        if (augInfo?.id) chunkIds.add(augInfo.id);
        augIdx++;
      }
      look++;
    }
    i += look - 1;
  }

  // 4) Fetch all needed chunks in parallel
  const filenames = Array.from(chunkIds)
    .map(id => idToChunkFilename[id])
    .filter(Boolean);
  const arrays = await Promise.all(
    filenames.map(fn => getOrFetchChunk(fn, `/gear_chunks/v1/${fn}`))
  );

  // 5) Build itemId → item map
  const itemMap = {};
  arrays.flat().forEach(item => {
    itemMap[item.itemId] = item;
  });

  // 6) Assemble new gear
  const newGear = { ...defaultGear };
  Object.entries(queue).forEach(([slotId, id]) => {
    if (itemMap[id]) newGear[slotId] = itemMap[id];
  });
  setGear(newGear);

  // 7) Update chunkKeys for URL & rebuild hash
  setChunkKeys(Array.from(chunkIds));
  rebuildHash(newGear);
};

function safeItemId(item) {
  return item && typeof item.itemId === "number" && item.itemId > 0 ? item.itemId : 0;
}

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
  if (!slotType || !searchText) return null;
  const key = searchText.slice(0, 3).toLowerCase();

  // 1) Determine which slot prefixes to look at
  const slotTypes = isBard && slotType === "range"
    ? ["primary", "secondary", "range"]
    : [slotType];


  // 2) Build a cleaned list of candidate chunks
  const chunks = [];
  for (const [filename, id] of Object.entries(chunkFilenameToId)) {
    for (const st of slotTypes) {
      const prefix = `v1_chunk_${st}_`;
      if (filename.startsWith(prefix)) {
        // strip prefix and ".json"
        const tail = filename.slice(prefix.length, -5);
        // split into up to 2 parts: the alpha start & alpha end
        const [rawStart = "", rawEnd = ""] = tail.split("_", 2);
        const start = rawStart.replace(/[^a-z]/gi, "").toLowerCase();
        const end   = rawEnd  .replace(/[^a-z]/gi, "").toLowerCase();
        chunks.push({ filename, id, start, end });
        break;
      }
    }
  }

  // 3) Exact‐end match (so "bre" hits "#11_bre_25")
  const exact = chunks.find(c => c.end === key);
  if (exact) return { filename: exact.filename, id: exact.id };

  // 4) Fallback to alphabetical range test
  return chunks.find(c => key >= c.start && key <= c.end) || null;
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
      const itemId  = safeItemId(currentGear[slotObj.id]);
      const aug0Id  = safeItemId(currentGear[`${slotObj.id}-aug0`]);
      const aug1Id  = safeItemId(currentGear[`${slotObj.id}-aug1`]);
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

    allSlots.forEach(slotObj => {
    ["-aug0", "-aug1"].forEach(suf => {
      const augName = currentGear[slotObj.id + suf]?.ItemName;
      if (augName) {
        const info = findChunkForSlotAndSearch("aug", augName);
        if (info) chunkIdSet.add(info.id);
      }
    });
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
  // Prevent the writer from immediately overwriting
  skipNextHashLoad.current = true;
  isInitializing.current = false;

  // Remember “this” hash so rebuildHash skips it
  lastParsedHash.current = window.location.hash;

  const rawHash     = window.location.hash.slice(1);
  const params      = new URLSearchParams(rawHash);
  const encoded     = params.get("build")    || rawHash.split("&")[0] || "";
  const classString = params.get("classes")  || "";

  if (classString) {
    setSelectedClasses(classString.split("-"));
  }

  if (encoded.length < ID_CHAR_LEN) {
    // nothing to do
    return;
  }

  const [ maskEncoded, idHexes, chunkBase64 ] = encoded.split(":");
  if (chunkBase64) {
    // decode _all_ the chunk IDs (main + any aug chunks)
    const parsedChunkIds = decodeChunkIdsFromBase64url(chunkBase64);
    setInitialChunkIds(Array.isArray(parsedChunkIds)
      ? parsedChunkIds
      : []);
  }

  // decode item IDs (main + augs)
  const mask = decodeBase64urlMask(maskEncoded);
  const parsedItemIds = [];
  let hexIndex = 0;

  allSlots.forEach((slotObj, sIndex) => {
    if (mask & (1 << sIndex)) {
      const len      = ID_CHAR_LEN;
      const idChunk  = idHexes.slice(hexIndex, hexIndex + len * 3);

      const mainId = decodeId(idChunk.slice(0, len));
      const a0     = decodeId(idChunk.slice(len,     len * 2));
      const a1     = decodeId(idChunk.slice(len * 2, len * 3));

      if (mainId) parsedItemIds.push(mainId);
      if (a0)     parsedItemIds.push(a0);
      if (a1)     parsedItemIds.push(a1);

      hexIndex += len * 3;
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
  if (!initialChunkIds || initialChunkIds.length === 0) return;

  initialChunkIds.forEach((chunkId) => {
    const filename = idToChunkFilename[chunkId];
    // only fetch if we haven’t already
    if (!filename || loadedChunks[filename]) return;

    // filename already includes “.json”
    getOrFetchChunk(filename, `/gear_chunks/v1/${filename}`)
      .then(itemsArray => {
        setLoadedChunks(prev => ({ ...prev, [filename]: itemsArray }));
      })
      .catch(() => {
        setLoadedChunks(prev => ({ ...prev, [filename]: [] }));
      });
  });
}, [initialChunkIds, idToChunkFilename, loadedChunks]);

useEffect(() => {
  if (!importQueue) return;
  // If there are no chunks to load, just apply the imported gear immediately,
  // rather than pruning everything.
  if (initialChunkIds.length === 0) {
    const newGear = { ...defaultGear };
    Object.entries(importQueue).forEach(([slotId, itemId]) => {
      // gearByItemId[itemId] should already be populated
      if (gearByItemId[itemId]) {
        newGear[slotId] = gearByItemId[itemId];
      }
    });
    setGear(newGear);
    setImportQueue(null);
    return;
  }
  const loadedChunkIds = Object.keys(loadedChunks)
    .map((filename) => chunkFilenameToId[filename])
    .filter((id) => typeof id === "number");

  const allItemsReady = initialItemIds.every((id) => gearByItemId[id]);

   // only bail out if we're still loading _and_ haven't retried enough yet
   if (initialChunkIds.length > 0) {
     const stillWaiting = loadedChunkIds.length < initialChunkIds.length || !allItemsReady;
     if (stillWaiting && window._gearRetryCount < 10) {
       return; // keep waiting until retryCount reaches 10
     }
     if (stillWaiting) {
       console.warn("⚠️ Chunk load retry limit reached; now pruning orphan slots.");
     }
   }

  const slotIds = Object.keys(importQueue);
  const orphaned = slotIds.filter((slotId) => {
    const itemId = importQueue[slotId];
    return itemId && !gearByItemId[itemId];
  });

  if (orphaned.length) {
    console.warn("Pruning slots with no data:", orphaned);
    const pruned = { ...importQueue };
    orphaned.forEach((s) => delete pruned[s]);
    setImportQueue(Object.keys(pruned).length ? pruned : null);
    return;
  }

  // All clear: load gear
  const newGear = { ...defaultGear };
  slotIds.forEach((slotId) => {
    const id = importQueue[slotId];
    newGear[slotId] = gearByItemId[id];
  });
  setGear(newGear);
  rebuildHash(newGear);
  setImportQueue(null);
}, [importQueue, gearByItemId, loadedChunks, initialChunkIds, initialItemIds]);

useEffect(() => {
  if (!Array.isArray(initialItemIds) || initialItemIds.length === 0) return;

  const presentCount = initialItemIds.filter((id) => gearByItemId[id]).length;
  const allPresent = presentCount === initialItemIds.length;

  // 🧠 Show a loading message in the console
  if (!allPresent) {
    console.log(`⏳ Waiting for gear chunks: ${presentCount}/${initialItemIds.length}`);

    // Track retry progress globally
    if (!window._gearRetryCount) window._gearRetryCount = 0;
    if (!window._gearRetryLastCount) window._gearRetryLastCount = 0;

    // Only retry if the count hasn't changed
    if (presentCount === window._gearRetryLastCount) {
      window._gearRetryCount++;
    } else {
      window._gearRetryCount = 0; // reset if we made progress
    }

    window._gearRetryLastCount = presentCount;

    if (window._gearRetryCount < 10) {
      const retry = setTimeout(() => {
        setInitialItemIds((prev) => [...prev]); // re-trigger effect
      }, 250);
      return () => clearTimeout(retry);
    } else {
      console.warn("⚠️ Gear fetch retry limit reached. Some items may be missing.");
    }

    return;
  }

  // ✅ All items are ready! Apply the gear
  const rawHash = window.location.hash.slice(1);
  const params = new URLSearchParams(rawHash);
  const [maskEncoded, idHexes] = (params.get("build") || rawHash).split(":");
  const mask = decodeBase64urlMask(maskEncoded);

  let hexIndex = 0;
  const newGear = {};

  allSlots.forEach((slotObj, sIndex) => {
    if (mask & (1 << sIndex)) {
      const len = ID_CHAR_LEN;
      const chunk = idHexes.slice(hexIndex, hexIndex + len * 3);
      const mainId = decodeId(chunk.slice(0, len));
      const aug0Id = decodeId(chunk.slice(len, len * 2));
      const aug1Id = decodeId(chunk.slice(len * 2, len * 3));
      hexIndex += len * 3;

      if (mainId && gearByItemId[mainId]) newGear[slotObj.id] = gearByItemId[mainId];
      if (aug0Id && gearByItemId[aug0Id]) newGear[`${slotObj.id}-aug0`] = gearByItemId[aug0Id];
      if (aug1Id && gearByItemId[aug1Id]) newGear[`${slotObj.id}-aug1`] = gearByItemId[aug1Id];
    }
  });

  setGear(newGear);
  isInitializing.current = false;

  // Reset retry tracking
  window._gearRetryCount = 0;
  window._gearRetryLastCount = 0;
}, [initialItemIds, gearByItemId]);


  useEffect(() => {
    if (!activeSlot || filter.length < 3) return;
  // if we're on an aug slot, force slotType = "aug"
    const isAugSlot = activeSlot.endsWith("-aug0") || activeSlot.endsWith("-aug1");
    const slotType = isAugSlot
      ? "aug"
      : activeSlot.split("-")[0].toLowerCase(); 
    // delegate to our centralized, letter-stripped, exact-end-first logic:
    const info = findChunkForSlotAndSearch(slotType, filter);
    if (info && !initialChunkIds.includes(info.id)) {
      setInitialChunkIds((p) => [...p, info.id]);
    }
  }, [activeSlot, filter, chunkFilenameToId, initialChunkIds]);

  // 1) Debounced rebuild effect (top‐level)
  useEffect(() => {
    if (isInitializing.current) {
      isInitializing.current = false;
      return;
    }
    if (skipNextHashLoad.current) {
      skipNextHashLoad.current = false;
      return;
    }
    const timer = setTimeout(() => rebuildHash(gear), 300);
    return () => clearTimeout(timer);
  }, [gear, selectedClasses, chunkKeys]);

  // 2) Click‐outside effect (top‐level)
  useEffect(() => {
    function handleClickOutside(e) {
      const dropdowns = document.querySelectorAll(".z-50");
      if (![...dropdowns].some(dd => dd.contains(e.target))) {
        setActiveSlot(null);
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

  // 1) Normalize
  const slotType = activeSlot.split("-")[0].toLowerCase();
  const nameMatch = item.ItemName.toLowerCase().includes(filter.toLowerCase());

  // 2) Turn SlotType into a lowercase array
  const itemSlots = Array.isArray(item.SlotType)
    ? item.SlotType.map((s) => s.toLowerCase())
    : [item.SlotType.toLowerCase()];

  // 3) Base match: itemSlots includes this slot
  const isBaseMatch = itemSlots.includes(slotType);

  // 4) Bard special: allow primary/secondary in range
  const isBardRange =
    isBard &&
    slotType === "range" &&
    itemSlots.some((s) => s === "primary" || s === "secondary");

  return nameMatch && (isBaseMatch || isBardRange);
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
            {["ClickyEffect", "FocusEffectId", "WeaponProc", "BardEffectId"].map((eKey) => {
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

          const isResistStart   = stat.label === "MAGIC";
          const isPhysicalStart = stat.label === "Attack";
          const isMagicStart    = stat.label === "Spell Damage";

          return (
            <React.Fragment key={stat.label}>
              {(isResistStart || isPhysicalStart || isMagicStart) && (
                <div className="border-t-2 border-gray-600 my-2" />
              )}
              <div className="flex justify-between text-sm border-b border-gray-600 py-1">
                <span>{stat.label}</span>
                <span className="text-green-400">
                  {baseTotal} <span className="text-yellow-300">+{heroicTotal}</span>
                </span>
              </div>
            </React.Fragment>
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