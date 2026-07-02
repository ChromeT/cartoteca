import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from './firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import LoginPage from './LoginPage';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  writeBatch 
} from 'firebase/firestore';

// --- TYPES ---
interface Card {
  id: string;
  code: string;
  print: number | null;
  edition: number | null;
  name: string;
  series: string;
  condition: string;
  effort: number | null;
  wish: number | null;
  price: number | null;
  isWorker: boolean;
  isTrade: boolean;
  frame: string;
  dye: string;
  tags: string; // Comma separated tag names
  notes: string;
  createdAt: number;
  stats?: {
    toughness: string;
    quickness: string;
    purity: string;
    style: string;
    wellness: string;
    appeal: string;
  };
  priceHistory?: {
    date: number;
    price: number;
  }[];
}

interface WishlistItem {
  id: string;
  name: string;
  series: string;
  priority: 'high' | 'med' | 'low';
  targetWish: number | null;
  notes: string;
}

interface CustomTag {
  name: string;
  color: string;
  desc: string;
}

interface Inventory {
  tickets: number;
  gold: number;
  gems: number;
  dusts: number;
  bits: number;
}

export default function App() {
  // --- STATE ---
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = loading
  const [cards, setCards] = useState<Card[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [customTags, setCustomTags] = useState<CustomTag[]>([]);
  const [inventory, setInventory] = useState<Inventory>({ tickets: 0, gold: 0, gems: 0, dusts: 0, bits: 0 });
  const [activeTab, setActiveTab] = useState<string>('collection');
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCondition, setSelectedCondition] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [sortOption, setSortOption] = useState('recent');
  
  // Wishlist Search & Sort
  const [wishSearchQuery, setWishSearchQuery] = useState('');
  const [wishSortOption, setWishSortOption] = useState('priority-desc');

  // Batch actions
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());

  // Modals Toggles
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [isWishModalOpen, setIsWishModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isBatchTagModalOpen, setIsBatchTagModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);

  // Timers State
  const [dropEnd, setDropEnd] = useState<number | null>(null);
  const [grabEnd, setGrabEnd] = useState<number | null>(null);
  const [workEnd, setWorkEnd] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [notified, setNotified] = useState<Record<string, boolean>>({ drop: true, grab: true, work: true });

  // Worker Optimizer State
  const [workerSlotIds, setWorkerSlotIds] = useState<(string | null)[]>([null, null, null]);
  const [nodeMultiplier, setNodeMultiplier] = useState<number>(1.15);

  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'album'>(
    (localStorage.getItem('cartoteca:viewMode') as 'list' | 'album') || 'album'
  );

  useEffect(() => {
    localStorage.setItem('cartoteca:viewMode', viewMode);
  }, [viewMode]);

  // Form Fields - Card
  const [cardFormId, setCardFormId] = useState('');
  const [fCode, setFCode] = useState('');
  const [fPrint, setFPrint] = useState<number | ''>('');
  const [fEdition, setFEdition] = useState<number | ''>('');
  const [fName, setFName] = useState('');
  const [fSeries, setFSeries] = useState('');
  const [fCondition, setFCondition] = useState('Good');
  const [fEffort, setFEffort] = useState<number | ''>('');
  const [fWish, setFWish] = useState<number | ''>('');
  const [fPrice, setFPrice] = useState<number | ''>('');
  const [fIsWorker, setFIsWorker] = useState(false);
  const [fIsTrade, setFIsTrade] = useState(false);
  const [fFrame, setFFrame] = useState('');
  const [fDye, setFDye] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [cardSelectedTags, setCardSelectedTags] = useState<string[]>([]);
  const [fStats, setFStats] = useState<Card['stats'] | undefined>(undefined);

  // Parser text area
  const [discordText, setDiscordText] = useState('');
  const [parserFeedback, setParserFeedback] = useState({ text: 'Siap memproses teks', isError: false, isSuccess: false });

  // Form Fields - Wishlist
  const [wishFormId, setWishFormId] = useState('');
  const [wName, setWName] = useState('');
  const [wSeries, setWSeries] = useState('');
  const [wPriority, setWPriority] = useState<'high' | 'med' | 'low'>('med');
  const [wTargetWish, setWTargetWish] = useState<number | ''>('');
  const [wNotes, setWNotes] = useState('');

  // Form Fields - Custom Tags
  const [tagNameInput, setTagNameInput] = useState('');
  const [tagColorInput, setTagColorInput] = useState('#5ea396');
  const [tagDescInput, setTagDescInput] = useState('');

  // Batch Tags Form
  const [batchSelectedTags, setBatchSelectedTags] = useState<string[]>([]);

  // Backup File Ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupFileName, setBackupFileName] = useState('Belum ada file terpilih');
  const [backupFileContent, setBackupFileContent] = useState<any>(null);

  // --- CHECK FIREBASE CONNECTION ---
  // If the user hasn't configured Firebase keys, fallback to LocalStorage
  const isFirebaseConfigured = () => {
    try {
      // Check if db config is initialized and has a valid project ID
      return db && (db as any)._databaseId && (db as any)._databaseId.projectId !== "YOUR_PROJECT_ID";
    } catch {
      return false;
    }
  };

  // --- AUTH STATE LISTENER ---
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      // Reset data when user changes
      setCards([]);
      setWishlist([]);
      setCustomTags([]);
    });
    return () => unsubAuth();
  }, []);

  // --- DATA LOADING & PERSISTENCE ---
  useEffect(() => {
    if (!user) return;

    if (isFirebaseConfigured()) {
      console.log('Firebase configured. Loading data for user:', user.uid);

      // Real-time cards sync (user-scoped)
      const unsubCards = onSnapshot(collection(db, 'users', user.uid, 'cards'), (snapshot) => {
        const list: Card[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Card));
        setCards(list);
      });

      // Real-time wishlist sync (user-scoped)
      const unsubWish = onSnapshot(collection(db, 'users', user.uid, 'wishlist'), (snapshot) => {
        const list: WishlistItem[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as WishlistItem));
        setWishlist(list);
      });

      // Real-time custom tags sync (user-scoped)
      const unsubTags = onSnapshot(collection(db, 'users', user.uid, 'tags'), (snapshot) => {
        const list: CustomTag[] = [];
        snapshot.forEach((d) => list.push(d.data() as CustomTag));
        if (list.length > 0) {
          setCustomTags(list);
        } else {
          setCustomTags(getDefaultTags());
        }
      });

      // Real-time inventory sync
      const unsubInv = onSnapshot(doc(db, 'users', user.uid, 'inventory', 'main'), (docSnap) => {
        if (docSnap.exists()) {
          setInventory(docSnap.data() as Inventory);
        } else {
          setInventory({ tickets: 0, gold: 0, gems: 0, dusts: 0, bits: 0 });
        }
      });

      return () => {
        unsubCards();
        unsubWish();
        unsubTags();
        unsubInv();
      };
    } else {
      console.log('Using LocalStorage fallback.');
      const uid = user.uid;
      const savedCards = localStorage.getItem(`cartoteca:${uid}:cards`);
      if (savedCards) setCards(JSON.parse(savedCards));

      const savedWishlist = localStorage.getItem(`cartoteca:${uid}:wishlist`);
      if (savedWishlist) setWishlist(JSON.parse(savedWishlist));

      const savedTags = localStorage.getItem(`cartoteca:${uid}:tags`);
      if (savedTags) {
        setCustomTags(JSON.parse(savedTags));
      } else {
        setCustomTags(getDefaultTags());
      }
      
      const savedInv = localStorage.getItem(`cartoteca:${uid}:inv`);
      if (savedInv) setInventory(JSON.parse(savedInv));
    }
  }, []);

  // --- TIMERS LOGIC ---
  useEffect(() => {
    if (!user) return;
    const loadT = (key: string) => {
      const v = localStorage.getItem(`cartoteca:${user.uid}:${key}`);
      return v ? parseInt(v, 10) : null;
    };
    const dEnd = loadT('drop');
    const gEnd = loadT('grab');
    const wEnd = loadT('work');
    setDropEnd(dEnd);
    setGrabEnd(gEnd);
    setWorkEnd(wEnd);

    const n = Date.now();
    setNotified({
      drop: !dEnd || n >= dEnd,
      grab: !gEnd || n >= gEnd,
      work: !wEnd || n >= wEnd,
    });

    const w = localStorage.getItem(`cartoteca:${user.uid}:workers`);
    if (w) setWorkerSlotIds(JSON.parse(w));
    const m = localStorage.getItem(`cartoteca:${user.uid}:nodemult`);
    if (m) setNodeMultiplier(parseFloat(m));

    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [user]);

  const handleSetWorker = (index: number, cardId: string | null) => {
    if (!user) return;
    const newSlots = [...workerSlotIds];
    newSlots[index] = cardId;
    setWorkerSlotIds(newSlots);
    localStorage.setItem(`cartoteca:${user.uid}:workers`, JSON.stringify(newSlots));
  };

  const handleSetNodeMultiplier = (val: number) => {
    if (!user) return;
    setNodeMultiplier(val);
    localStorage.setItem(`cartoteca:${user.uid}:nodemult`, val.toString());
  };

  useEffect(() => {
    const checkAlarm = (type: string, end: number | null) => {
      if (end && now >= end && !notified[type]) {
        if (Notification.permission === 'granted') {
          new Notification(`Karuta: ${type.toUpperCase()} is Ready!`, { icon: '/favicon.ico' });
        }
        try {
          const audio = new Audio('https://www.myinstants.com/media/sounds/discord-notification.mp3');
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch (e) {}
        setNotified(p => ({ ...p, [type]: true }));
      }
    };
    checkAlarm('drop', dropEnd);
    checkAlarm('grab', grabEnd);
    checkAlarm('work', workEnd);
  }, [now, dropEnd, grabEnd, workEnd, notified]);

  const startTimer = (type: 'drop' | 'grab' | 'work', minutes: number) => {
    if (!user) return;
    const target = Date.now() + minutes * 60 * 1000;
    localStorage.setItem(`cartoteca:${user.uid}:${type}`, target.toString());
    if (type === 'drop') setDropEnd(target);
    if (type === 'grab') setGrabEnd(target);
    if (type === 'work') setWorkEnd(target);
    setNotified(p => ({ ...p, [type]: false }));
    if (Notification.permission === 'default') Notification.requestPermission();
  };

  const renderTimer = (label: string, end: number | null, onClick: () => void) => {
    const diff = end ? end - now : 0;
    const isReady = diff <= 0;
    const m = isReady ? 0 : Math.floor(diff / 60000);
    const s = isReady ? 0 : Math.floor((diff % 60000) / 1000);
    return (
      <div 
        onClick={onClick}
        title={`Klik untuk memulai timer ${label}`}
        style={{ 
          background: isReady ? '#298246' : '#17140f',
          border: '1px solid #3a3327',
          padding: '6px 12px',
          borderRadius: '6px',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2px',
          transition: 'all 0.2s',
          minWidth: '55px'
        }}
      >
        <span style={{ fontSize: '10px', color: isReady ? '#e8dbce' : '#9c8f76', fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', color: '#fff' }}>
          {isReady ? 'READY' : `${m}:${s.toString().padStart(2, '0')}`}
        </span>
      </div>
    );
  };

  function getDefaultTags(): CustomTag[] {
    return [
      { name: 'waifu', color: '#8b5cf6', desc: 'Karakter favorit utama' },
      { name: 'trade', color: '#b85c5c', desc: 'Kartu siap barter / jual' },
      { name: 'deck-1', color: '#3b82f6', desc: 'Worker deck utama' },
      { name: 'keeper', color: '#e0b84c', desc: 'Koleksi disimpan' }
    ];
  }

  // LocalStorage save sync helper
  const syncLocal = (key: string, data: any) => {
    if (!isFirebaseConfigured() && user) {
      localStorage.setItem(`cartoteca:${user.uid}:${key}`, JSON.stringify(data));
    }
  };

  const handleUpdateInventory = async (newInv: Inventory) => {
    setInventory(newInv);
    if (isFirebaseConfigured() && user) {
      await setDoc(doc(db, 'users', user.uid, 'inventory', 'main'), newInv, { merge: true });
    } else {
      syncLocal('inv', newInv);
    }
  };

  // --- DYNAMIC COLOR HASH ---
  function getTagColor(tagName: string) {
    const found = customTags.find(t => t.name.toLowerCase() === tagName.toLowerCase().trim());
    if (found) return found.color;
    
    // Stable color hash
    let hash = 0;
    const name = tagName.trim();
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `hsl(${h}, 55%, 42%)`;
  }

  // --- DISCORD COMMAND TEXT PARSER ---
  async function handleBulkImportExecute() {
    if (!bulkText.trim()) return;

    const lines = bulkText.trim().split('\n');
    const newCards: Card[] = [];
    let successCount = 0;

    for (const line of lines) {
      const cleanLine = line.replace(/[\*_`~▫▪●○]/g, '').trim();
      if (!cleanLine) continue;

      const segments = cleanLine.split(/\s*·\s*|\s*\|\s*|\s*•\s*/);
      if (segments.length < 3) continue; // Not a valid Karuta card line

      let pCode = '';
      let pPrint: number | null = null;
      let pEdition: number | null = null;
      let pCondition = 'Good';
      let pEffort: number | null = null;
      let pWish: number | null = null;
      const unassigned: string[] = [];

      segments.forEach(seg => {
        const s = seg.trim();
        if (!s) return;

        const cleanedSeg = s.replace(/^[^a-zA-Z0-9]+/, '');

        const codeM = cleanedSeg.match(/^(?:[a-zA-Z]{2}\s+)?([a-zA-Z0-9]{5,8})$/) || cleanedSeg.match(/^[a-zA-Z0-9]{5,8}$/);
        if (codeM && !pCode) {
          const check = (codeM[1] || codeM[0]).toLowerCase();
          if (isNaN(Number(check))) {
            pCode = check;
            return;
          }
        }

        const printM = s.match(/#(\d+)/) || s.match(/^(\d+)$/);
        if (printM && pPrint === null) {
          if (s.startsWith('#') || s.length < 5) {
            pPrint = parseInt(printM[1]);
            return;
          }
        }

        const edM = s.match(/◈\s*(\d+)/) || s.match(/ed(?:isi)?\s*(\d+)/i);
        if (edM) { pEdition = parseInt(edM[1]); return; }

        const effM = s.match(/(\d+)\s*(?:eff|effort)/i) || s.match(/(?:eff|effort)\s*(\d+)/i);
        if (effM) { pEffort = parseInt(effM[1]); return; }

        const cond = mapConditionString(s);
        if (cond) { pCondition = cond; return; }

        const wishM = s.match(/(\d+)\s*(?:wishlist|wish)/i);
        if (wishM) { pWish = parseInt(wishM[1]); return; }

        if (s.toLowerCase().startsWith('kd ')) {
          const part = s.split(' ')[1];
          if (part && part.length >= 5) pCode = part.toLowerCase();
          return;
        }

        unassigned.push(s);
      });

      let pName = 'Unknown Character';
      let pSeries = '';
      if (unassigned.length >= 2) {
        pSeries = unassigned.pop() || '';
        pName = unassigned.join(' ').trim();
      } else if (unassigned.length === 1) {
        pName = unassigned[0];
      }

      if (pCode && pName && pName !== 'Unknown Character') {
        newCards.push({
          id: 'card-' + Date.now() + Math.random().toString(36).substr(2, 9),
          code: pCode,
          print: pPrint,
          edition: pEdition,
          name: pName,
          series: pSeries,
          condition: pCondition,
          effort: pEffort,
          wish: pWish,
          price: null,
          isWorker: false,
          isTrade: false,
          frame: '',
          dye: '',
          tags: '',
          notes: '',
          createdAt: Date.now()
        });
        successCount++;
      }
    }

    if (newCards.length === 0) {
      alert("Tidak ada kartu valid yang terdeteksi dari teks yang Anda masukkan.");
      return;
    }

    if (!confirm(`Berhasil mendeteksi ${newCards.length} kartu! Tambahkan ke koleksi?`)) return;

    const mergedCards = [...cards, ...newCards];
    setCards(mergedCards);
    syncLocal('cartoteca:cards', mergedCards);

    if (isFirebaseConfigured() && user) {
      try {
        const syncChunks = async (items: Card[]) => {
          for (let i = 0; i < items.length; i += 400) {
            const chunk = items.slice(i, i + 400);
            const batch = writeBatch(db);
            for (const item of chunk) {
              batch.set(doc(db, 'users', user.uid, 'cards', item.id), item);
            }
            await batch.commit();
          }
        };
        await syncChunks(newCards);
        alert(`${successCount} kartu berhasil diimpor & sinkron ke Cloud!`);
      } catch (err: any) {
        alert("Sebagian kartu mungkin belum tersinkron ke cloud: " + err.message);
      }
    } else {
      alert(`${successCount} kartu berhasil diimpor ke aplikasi!`);
    }

    setIsBulkImportModalOpen(false);
    setBulkText('');
  }

  function handleParseText() {
    if (!discordText.trim()) {
      setParserFeedback({ text: '❌ Teks kosong. Silakan paste teks info Discord.', isError: true, isSuccess: false });
      return;
    }

    const cleanText = discordText.replace(/[\*_`~|▫▪●○]/g, '').trim();

    // Try multi-line parsing
    const lines = cleanText.split('\n');
    let hasLabelMatch = false;

    let parsedName = '';
    let parsedSeries = '';
    let parsedCode = '';
    let parsedPrint: number | null = null;
    let parsedEdition: number | null = null;
    let parsedCondition = 'Good';
    let parsedEffort: number | null = null;
    let parsedWish: number | null = null;

    lines.forEach(line => {
      const charM = line.match(/(?:Character|Karakter)\s*:\s*(.+)/i);
      const seriesM = line.match(/(?:Series|Anime|Show)\s*:\s*(.+)/i);
      const codeM = line.match(/(?:Code|Kode)\s*:\s*([a-zA-Z0-9]{5,6})/i);
      const printM = line.match(/(?:Print|Nomor)\s*:\s*#?(\d+)/i);
      const edM = line.match(/(?:Edition|Edisi|Ed)\s*:\s*◈?(\d+)/i);
      const condM = line.match(/(?:Condition|Kondisi|Rating)\s*:\s*(\w+)/i);
      const effM = line.match(/(?:Effort|Eff)\s*:\s*(\d+)/i);
      const wishM = line.match(/(?:Wishlists|Wishlist|Wish)\s*:\s*([\d,.]+)/i);

      if (charM) { parsedName = charM[1].trim(); hasLabelMatch = true; }
      if (seriesM) { parsedSeries = seriesM[1].trim(); hasLabelMatch = true; }
      if (codeM) { parsedCode = codeM[1].toLowerCase().trim(); hasLabelMatch = true; }
      if (printM) { parsedPrint = parseInt(printM[1]); hasLabelMatch = true; }
      if (edM) { parsedEdition = parseInt(edM[1]); hasLabelMatch = true; }
      if (condM) {
        const cond = mapConditionString(condM[1]);
        if (cond) parsedCondition = cond;
        hasLabelMatch = true;
      }
      if (effM) { parsedEffort = parseInt(effM[1]); hasLabelMatch = true; }
      if (wishM) {
        parsedWish = parseInt(wishM[1].replace(/[,.]/g, ''));
        hasLabelMatch = true;
      }
    });

    if (!hasLabelMatch) {
      // Try single-line split parsing
      const segments = cleanText.split(/\s*·\s*|\s*\|\s*|\s*•\s*/);
      if (segments.length > 1) {
        const unassigned: string[] = [];

        segments.forEach(seg => {
          const s = seg.trim();
          if (!s) return;

          const cleanedSeg = s.replace(/^[^a-zA-Z0-9]+/, '');

          const codeM = cleanedSeg.match(/^(?:[a-zA-Z]{2}\s+)?([a-zA-Z0-9]{5,8})$/) || cleanedSeg.match(/^[a-zA-Z0-9]{5,8}$/);
          if (codeM && !parsedCode) {
            const check = (codeM[1] || codeM[0]).toLowerCase();
            if (isNaN(Number(check))) {
              parsedCode = check;
              return;
            }
          }

          const printM = s.match(/#(\d+)/) || s.match(/^(\d+)$/);
          if (printM && parsedPrint === null) {
            if (s.startsWith('#') || s.length < 5) {
              parsedPrint = parseInt(printM[1]);
              return;
            }
          }

          const edM = s.match(/◈\s*(\d+)/) || s.match(/ed(?:isi)?\s*(\d+)/i);
          if (edM) {
            parsedEdition = parseInt(edM[1]);
            return;
          }

          const effM = s.match(/(\d+)\s*(?:eff|effort)/i) || s.match(/(?:eff|effort)\s*(\d+)/i);
          if (effM) {
            parsedEffort = parseInt(effM[1]);
            return;
          }

          const cond = mapConditionString(s);
          if (cond) {
            parsedCondition = cond;
            return;
          }

          const wishM = s.match(/(\d+)\s*(?:wishlist|wish)/i);
          if (wishM) {
            parsedWish = parseInt(wishM[1]);
            return;
          }

          if (s.toLowerCase().startsWith('kd ') || s.toLowerCase().startsWith('kinfo ') || s.toLowerCase().startsWith('kv ')) {
            const part = s.split(' ')[1];
            if (part && part.length >= 5) parsedCode = part.toLowerCase();
            return;
          }

          unassigned.push(s);
        });

        if (unassigned.length > 0) parsedName = unassigned[0];
        if (unassigned.length > 1) parsedSeries = unassigned[1];
      } else {
        // Fallback simple word parse
        const words = cleanText.split(/\s+/);
        if (words.length === 1 && words[0].length >= 5 && words[0].length <= 6) {
          parsedCode = words[0].toLowerCase();
        } else if (words.length === 2 && ['kd', 'kinfo', 'kv'].includes(words[0].toLowerCase()) && words[1].length >= 5) {
          parsedCode = words[1].toLowerCase();
        }
      }
    }

    if (parsedName || parsedCode) {
      if (parsedCode) setFCode(parsedCode);
      if (parsedPrint !== null) setFPrint(parsedPrint);
      if (parsedEdition !== null) setFEdition(parsedEdition);
      if (parsedName) setFName(parsedName);
      if (parsedSeries) setFSeries(parsedSeries);
      setFCondition(parsedCondition);
      if (parsedEffort !== null) setFEffort(parsedEffort);
      if (parsedWish !== null) setFWish(parsedWish);

      setParserFeedback({ text: '✨ Pengisian otomatis berhasil!', isError: false, isSuccess: true });
    } else {
      setParserFeedback({ text: '❌ Gagal menganalisis teks. Isi manual.', isError: true, isSuccess: false });
    }
  }

  const handleParseKiwi = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const getStat = (name: string) => {
        const m = text.match(new RegExp(`${name}:?\\s*\\*?\\*?([A-S0-9]+)\\*?\\*?`, 'i'));
        return m ? m[1].toUpperCase() : 'E';
      };
      
      const parsedStats = {
        toughness: getStat('Toughness'),
        quickness: getStat('Quickness'),
        purity: getStat('Purity'),
        style: getStat('Style'),
        wellness: getStat('Wellness'),
        appeal: getStat('Appeal')
      };
      
      if (Object.values(parsedStats).every(v => v === 'E') && !text.toLowerCase().includes('toughness')) {
        alert("Teks tidak valid! Pastikan Anda meng-copy balasan k!wi (Work Info) dari bot Karuta.");
        return;
      }
      
      setFStats(parsedStats);
      alert("Berhasil ekstrak status pekerja k!wi!");
    } catch (e) {
      alert("Gagal membaca clipboard. Mohon izinkan akses di browser atau paste manual lalu gunakan fitur lain.");
    }
  };

  function mapConditionString(str: string): string | null {
    const s = str.trim().toLowerCase();
    if (['mint', 'mt', '★★★★'].includes(s)) return 'Mint';
    if (['excellent', 'ex', 'great', '★★★☆'].includes(s)) return 'Great';
    if (['fine', 'fn', 'good', 'gd', '★★☆☆'].includes(s)) return 'Good';
    if (['fair', 'fr', 'average', '★☆☆☆'].includes(s)) return 'Average';
    if (['poor', 'pr'].includes(s)) return 'Poor';
    if (['damaged', 'dm', '☆☆☆☆'].includes(s)) return 'Damaged';
    return null;
  }

  // --- CRUD CARD OPERATIONS ---
  function openCardModal(card: Card | null = null) {
    setDiscordText('');
    setParserFeedback({ text: 'Siap memproses teks', isError: false, isSuccess: false });

    if (card) {
      setCardFormId(card.id);
      setFCode(card.code);
      setFPrint(card.print !== null ? card.print : '');
      setFEdition(card.edition !== null ? card.edition : '');
      setFName(card.name);
      setFSeries(card.series);
      setFCondition(card.condition);
      setFEffort(card.effort !== null ? card.effort : '');
      setFWish(card.wish !== null ? card.wish : '');
      setFPrice(card.price !== null ? card.price : '');
      setFIsWorker(card.isWorker);
      setFIsTrade(card.isTrade);
      setFFrame(card.frame);
      setFDye(card.dye);
      setFNotes(card.notes);
      setFStats(card.stats);
      
      const tagsArray = card.tags ? card.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      setCardSelectedTags(tagsArray);
    } else {
      setCardFormId('');
      setFCode('');
      setFPrint('');
      setFEdition('');
      setFName('');
      setFSeries('');
      setFCondition('Good');
      setFEffort('');
      setFWish('');
      setFPrice('');
      setFIsWorker(false);
      setFIsTrade(false);
      setFFrame('');
      setFDye('');
      setFNotes('');
      setFStats(undefined);
      setCardSelectedTags([]);
    }
    setIsCardModalOpen(true);
  }

  async function handleSaveCard() {
    if (!fName.trim()) return;

    const oldCard = cardFormId ? cards.find(c => c.id === cardFormId) : null;
    const currentPriceHistory = oldCard?.priceHistory ? [...oldCard.priceHistory] : [];
    
    // Seed history if missing
    if (oldCard && oldCard.price !== null && currentPriceHistory.length === 0) {
      currentPriceHistory.push({ date: oldCard.createdAt, price: oldCard.price });
    }

    const parsedNewPrice = fPrice !== '' ? Number(fPrice) : null;
    if (parsedNewPrice !== null && parsedNewPrice !== oldCard?.price) {
      currentPriceHistory.push({ date: Date.now(), price: parsedNewPrice });
    }

    const data: Omit<Card, 'id'> = {
      code: fCode.trim().toLowerCase(),
      print: fPrint !== '' ? Number(fPrint) : null,
      edition: fEdition !== '' ? Number(fEdition) : null,
      name: fName.trim(),
      series: fSeries.trim(),
      condition: fCondition,
      effort: fEffort !== '' ? Number(fEffort) : null,
      wish: fWish !== '' ? Number(fWish) : null,
      price: parsedNewPrice,
      isWorker: fIsWorker,
      isTrade: fIsTrade,
      frame: fFrame.trim(),
      dye: fDye.trim(),
      tags: cardSelectedTags.join(', '),
      notes: fNotes.trim(),
      stats: fStats,
      priceHistory: currentPriceHistory,
      createdAt: oldCard ? oldCard.createdAt : Date.now()
    };

    if (isFirebaseConfigured() && user) {
      if (cardFormId) {
        await updateDoc(doc(db, 'users', user.uid, 'cards', cardFormId), data);
      } else {
        await addDoc(collection(db, 'users', user.uid, 'cards'), data);
      }
    } else {
      let updatedCards = [];
      if (cardFormId) {
        updatedCards = cards.map(c => c.id === cardFormId ? { ...data, id: cardFormId } : c);
      } else {
        const newCard = { ...data, id: 'card-' + Date.now() };
        updatedCards = [...cards, newCard];
      }
      setCards(updatedCards);
      syncLocal('cartoteca:cards', updatedCards);
    }

    setIsCardModalOpen(false);
    setSelectedCards(new Set()); // Reset selections
  }

  async function handleDeleteCard(id: string) {
    if (!confirm('Yakin ingin menghapus kartu ini?')) return;

    if (isFirebaseConfigured() && user) {
      await deleteDoc(doc(db, 'users', user.uid, 'cards', id));
    } else {
      const updated = cards.filter(c => c.id !== id);
      setCards(updated);
      syncLocal('cartoteca:cards', updated);
    }
    
    // Remove from selected set
    const updatedSelected = new Set(selectedCards);
    updatedSelected.delete(id);
    setSelectedCards(updatedSelected);
  }

  // --- CRUD WISHLIST OPERATIONS ---
  function openWishModal(w: WishlistItem | null = null) {
    if (w) {
      setWishFormId(w.id);
      setWName(w.name);
      setWSeries(w.series);
      setWPriority(w.priority);
      setWTargetWish(w.targetWish !== null ? w.targetWish : '');
      setWNotes(w.notes);
    } else {
      setWishFormId('');
      setWName('');
      setWSeries('');
      setWPriority('med');
      setWTargetWish('');
      setWNotes('');
    }
    setIsWishModalOpen(true);
  }

  async function handleSaveWish() {
    if (!wName.trim()) return;

    const data: Omit<WishlistItem, 'id'> = {
      name: wName.trim(),
      series: wSeries.trim(),
      priority: wPriority,
      targetWish: wTargetWish !== '' ? Number(wTargetWish) : null,
      notes: wNotes.trim()
    };

    if (isFirebaseConfigured() && user) {
      if (wishFormId) {
        await updateDoc(doc(db, 'users', user.uid, 'wishlist', wishFormId), data);
      } else {
        await addDoc(collection(db, 'users', user.uid, 'wishlist'), data);
      }
    } else {
      let updatedWish = [];
      if (wishFormId) {
        updatedWish = wishlist.map(w => w.id === wishFormId ? { ...data, id: wishFormId } : w);
      } else {
        const newWish = { ...data, id: 'wish-' + Date.now() };
        updatedWish = [...wishlist, newWish];
      }
      setWishlist(updatedWish);
      syncLocal('cartoteca:wishlist', updatedWish);
    }

    setIsWishModalOpen(false);
  }

  async function handleDeleteWish(id: string) {
    if (!confirm('Hapus dari wishlist?')) return;

    if (isFirebaseConfigured() && user) {
      await deleteDoc(doc(db, 'users', user.uid, 'wishlist', id));
    } else {
      const updated = wishlist.filter(w => w.id !== id);
      setWishlist(updated);
      syncLocal('cartoteca:wishlist', updated);
    }
  }

  function handleClaimWish(item: WishlistItem) {
    // Delete from wishlist first
    handleDeleteWish(item.id);
    
    // Open card modal pre-filled
    openCardModal({
      id: '',
      code: '',
      print: null,
      edition: null,
      name: item.name,
      series: item.series,
      condition: 'Good',
      effort: null,
      wish: item.targetWish,
      price: null,
      isWorker: false,
      isTrade: false,
      frame: '',
      dye: '',
      tags: '',
      notes: item.notes,
      createdAt: Date.now()
    });
  }

  // --- CUSTOM TAG OPERATIONS ---
  async function handleSaveTag() {
    const name = tagNameInput.trim().toLowerCase().replace(/,/g, '');
    if (!name) return;

    const newTag = { name, color: tagColorInput, desc: tagDescInput.trim() };
    const list = [...customTags];
    const index = list.findIndex(t => t.name.toLowerCase() === name);

    if (index > -1) {
      list[index] = newTag;
    } else {
      list.push(newTag);
    }

    if (isFirebaseConfigured() && user) {
      // Use tag name as doc ID to avoid duplicates
      const tagDocRef = doc(db, 'users', user.uid, 'tags', name);
      const { setDoc } = await import('firebase/firestore');
      await setDoc(tagDocRef, newTag);
    } else {
      setCustomTags(list);
      syncLocal('cartoteca:tags', list);
    }

    setTagNameInput('');
    setTagDescInput('');
  }

  async function handleDeleteCustomTag(name: string) {
    if (!confirm(`Hapus tag "${name}"? Tag ini juga akan dilepas dari kartu.`)) return;

    // Remove from custom tags config list
    const updatedTags = customTags.filter(t => t.name.toLowerCase() !== name.toLowerCase());
    setCustomTags(updatedTags);
    syncLocal('cartoteca:tags', updatedTags);

    // Strip tags from all cards
    const updatedCards = cards.map(c => {
      if (c.tags) {
        const arr = c.tags.split(',').map(t => t.trim()).filter(t => t.toLowerCase() !== name.toLowerCase());
        c.tags = arr.join(', ');
      }
      return c;
    });
    setCards(updatedCards);
    syncLocal('cartoteca:cards', updatedCards);

    if (isFirebaseConfigured() && user) {
      const tagDocRef = doc(db, 'users', user.uid, 'tags', name.toLowerCase());
      const { deleteDoc: delDoc } = await import('firebase/firestore');
      await delDoc(tagDocRef);
      // Also update all cards that have this tag
      const batch = writeBatch(db);
      const updatedCardsForFirestore = cards.filter(c =>
        c.tags && c.tags.split(',').map(t => t.trim().toLowerCase()).includes(name.toLowerCase())
      );
      updatedCardsForFirestore.forEach(c => {
        const arr = c.tags!.split(',').map(t => t.trim()).filter(t => t.toLowerCase() !== name.toLowerCase());
        batch.update(doc(db, 'users', user.uid, 'cards', c.id), { tags: arr.join(', ') });
      });
      await batch.commit();
    }
  }

  // --- SELECTION & BATCH ACTIONS ---
  function toggleSleeveSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = new Set(selectedCards);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    setSelectedCards(updated);
  }

  function handleSleeveContainerClick(id: string, e: React.MouseEvent) {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      toggleSleeveSelect(id, e);
    } else {
      const found = cards.find(c => c.id === id);
      if (found) openCardModal(found);
    }
  }

  async function handleBatchDelete() {
    if (!confirm(`Hapus ${selectedCards.size} kartu terpilih?`)) return;

    if (isFirebaseConfigured() && user) {
      const batch = writeBatch(db);
      selectedCards.forEach(id => {
        batch.delete(doc(db, 'users', user.uid, 'cards', id));
      });
      await batch.commit();
    } else {
      const updated = cards.filter(c => !selectedCards.has(c.id));
      setCards(updated);
      syncLocal('cartoteca:cards', updated);
    }
    setSelectedCards(new Set());
  }

  async function handleBatchSaveTags() {
    if (batchSelectedTags.length === 0) return;

    if (isFirebaseConfigured() && user) {
      const batch = writeBatch(db);
      cards.forEach(c => {
        if (selectedCards.has(c.id)) {
          const currentTags = c.tags ? c.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];
          batchSelectedTags.forEach(tag => {
            if (!currentTags.includes(tag.toLowerCase())) {
              currentTags.push(tag.toLowerCase());
            }
          });
          batch.update(doc(db, 'users', user.uid, 'cards', c.id), { tags: currentTags.join(', ') });
        }
      });
      await batch.commit();
    } else {
      const updated = cards.map(c => {
        if (selectedCards.has(c.id)) {
          const currentTags = c.tags ? c.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];
          batchSelectedTags.forEach(tag => {
            if (!currentTags.includes(tag.toLowerCase())) {
              currentTags.push(tag.toLowerCase());
            }
          });
          return { ...c, tags: currentTags.join(', ') };
        }
        return c;
      });
      setCards(updated);
      syncLocal('cartoteca:cards', updated);
    }

    setIsBatchTagModalOpen(false);
    setSelectedCards(new Set());
  }

  // Toggle card tag selection inside standard card modal
  function toggleCardModalTagChip(name: string) {
    const active = [...cardSelectedTags];
    const index = active.findIndex(t => t.toLowerCase() === name.toLowerCase());
    if (index > -1) {
      active.splice(index, 1);
    } else {
      active.push(name);
    }
    setCardSelectedTags(active);
  }

  function toggleBatchModalTagChip(name: string) {
    const active = [...batchSelectedTags];
    const index = active.findIndex(t => t.toLowerCase() === name.toLowerCase());
    if (index > -1) {
      active.splice(index, 1);
    } else {
      active.push(name);
    }
    setBatchSelectedTags(active);
  }

  // --- BACKUP & RESTORE ---
  function triggerExportJSON() {
    const exportData = {
      app: 'cartoteca',
      version: '1.3',
      exportedAt: new Date().toISOString(),
      cards,
      wishlist,
      customTags,
      inventory
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `cartoteca_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setBackupFileName(file.name);
      const reader = new FileReader();
      reader.onload = function(evt) {
        try {
          const parsed = JSON.parse(evt.target?.result as string);
          setBackupFileContent(parsed);
        } catch (err) {
          alert('Format file JSON salah atau korup.');
          setBackupFileContent(null);
        }
      };
      reader.readAsText(file);
    }
  }

  async function handleApplyRestore() {
    if (!backupFileContent || backupFileContent.app !== 'cartoteca') {
      alert('Backup JSON Cartoteca tidak valid.');
      return;
    }

    if (confirm('Perhatian: Fitur ini akan menimpa dan menggabungkan data Anda saat ini dengan isi file backup. Proses di cloud (jika aktif) mungkin memakan waktu. Lanjutkan?')) {
      const importedCards = backupFileContent.cards || [];
      const importedWishlist = backupFileContent.wishlist || [];
      const importedTags = backupFileContent.customTags || [];
      const importedInventory = backupFileContent.inventory || { tickets: 0, gold: 0, gems: 0, dusts: 0, bits: 0 };

      // Local State & LocalStorage update first for snappy UI
      setCards(importedCards);
      setWishlist(importedWishlist);
      setCustomTags(importedTags);
      setInventory(importedInventory);

      syncLocal('cartoteca:cards', importedCards);
      syncLocal('cartoteca:wishlist', importedWishlist);
      syncLocal('cartoteca:tags', importedTags);
      localStorage.setItem(`cartoteca:${user?.uid}:inventory`, JSON.stringify(importedInventory));

      if (isFirebaseConfigured() && user) {
        try {
          alert("Mulai menyinkronkan data ke Cloud Firestore. Jangan tutup aplikasi...");
          
          // Use writeBatch to write in chunks of 400 (limit is 500)
          const syncChunks = async (items: any[], path: string) => {
            for (let i = 0; i < items.length; i += 400) {
              const chunk = items.slice(i, i + 400);
              const batch = writeBatch(db);
              for (const item of chunk) {
                batch.set(doc(db, 'users', user.uid, path, item.id), item);
              }
              await batch.commit();
            }
          };

          await syncChunks(importedCards, 'cards');
          await syncChunks(importedWishlist, 'wishlist');
          
          const tagBatch = writeBatch(db);
          importedTags.forEach((t: any) => {
            tagBatch.set(doc(db, 'users', user.uid, 'tags', t.name.toLowerCase()), t);
          });
          tagBatch.set(doc(db, 'users', user.uid, 'inventory', 'main'), importedInventory);
          await tagBatch.commit();
          
          alert("Sinkronisasi Cloud Selesai! Data berhasil dipulihkan.");
        } catch (e: any) {
          alert("Gagal sinkronisasi cloud: " + e.message);
        }
      } else {
        alert('Data berhasil dipulihkan secara lokal!');
      }
      setIsBackupModalOpen(false);
    }
  }

  // --- FILTER & SORT ENGINE ---
  const getFilteredCards = () => {
    let list = [...cards];

    // Text search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(c => 
        (c.name || '').toLowerCase().includes(q) ||
        (c.series || '').toLowerCase().includes(q) ||
        (c.code || '').toLowerCase().includes(q) ||
        (c.tags || '').toLowerCase().includes(q) ||
        (c.notes || '').toLowerCase().includes(q)
      );
    }

    // Condition filter
    if (selectedCondition) {
      list = list.filter(c => c.condition === selectedCondition);
    }

    // Custom Tag filter
    if (selectedTag) {
      list = list.filter(c => {
        const itemTags = c.tags ? c.tags.split(',').map(t => t.trim().toLowerCase()) : [];
        return itemTags.includes(selectedTag.toLowerCase());
      });
    }

    // Sort order
    if (sortOption === 'effort-desc') list.sort((a, b) => (b.effort || 0) - (a.effort || 0));
    else if (sortOption === 'effort-asc') list.sort((a, b) => (a.effort || 0) - (b.effort || 0));
    else if (sortOption === 'print-asc') list.sort((a, b) => (a.print || 999999) - (b.print || 999999));
    else if (sortOption === 'edition-desc') list.sort((a, b) => (b.edition || 0) - (a.edition || 0));
    else if (sortOption === 'wish-desc') list.sort((a, b) => (b.wish || 0) - (a.wish || 0));
    else if (sortOption === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); // Recent

    return list;
  };

  const getFilteredWishlist = () => {
    let list = [...wishlist];

    if (wishSearchQuery.trim()) {
      const q = wishSearchQuery.toLowerCase().trim();
      list = list.filter(w => 
        (w.name || '').toLowerCase().includes(q) ||
        (w.series || '').toLowerCase().includes(q) ||
        (w.notes || '').toLowerCase().includes(q)
      );
    }

    if (wishSortOption === 'priority-desc') {
      const order = { high: 0, med: 1, low: 2 };
      list.sort((a, b) => order[a.priority] - order[b.priority]);
    } else if (wishSortOption === 'name') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (wishSortOption === 'series') {
      list.sort((a, b) => (a.series || '').localeCompare(b.series || ''));
    }

    return list;
  };

  // --- STATS CALCULATOR ---
  const totalCards = cards.length;
  const efforts = cards.map(c => Number(c.effort)).filter(n => !isNaN(n) && n > 0);
  const avgEffort = efforts.length ? Math.round(efforts.reduce((a, b) => a + b, 0) / efforts.length) : 0;
  const lowPrint = cards.filter(c => c.print !== null && Number(c.print) <= 99).length;
  const mintCount = cards.filter(c => c.condition === 'Mint').length;

  const getConditionStats = () => {
    const counts: Record<string, number> = { 'Damaged': 0, 'Poor': 0, 'Average': 0, 'Good': 0, 'Great': 0, 'Mint': 0 };
    cards.forEach(c => { if (counts[c.condition] !== undefined) counts[c.condition]++; });
    return counts;
  };

  const getTopSeriesStats = () => {
    const counts: Record<string, number> = {};
    cards.forEach(c => { const s = c.series || '(Tanpa series)'; counts[s] = (counts[s] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  };

  const getEditionStats = () => {
    const counts: Record<string, number> = {};
    cards.forEach(c => {
      const ed = c.edition !== null ? '◈' + c.edition : 'Tanpa Edisi';
      counts[ed] = (counts[ed] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[0].localeCompare(a[0]));
  };

  const getTopEffortCards = () => {
    return [...cards].filter(c => c.effort).sort((a, b) => (b.effort || 0) - (a.effort || 0)).slice(0, 5);
  };

  // Get dynamic dynamic tags actually used in binder
  const getUsedTags = () => {
    const used = new Set<string>();
    cards.forEach(c => {
      if (c.tags) {
        c.tags.split(',').forEach(t => { if (t.trim()) used.add(t.trim().toLowerCase()); });
      }
    });
    customTags.forEach(t => used.add(t.name.toLowerCase()));
    return Array.from(used).sort();
  };

  // Auth gating
  if (user === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#17140f' }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#9c8f76', fontSize: '14px' }}>Memuat...</div>
      </div>
    );
  }
  if (user === null) {
    return <LoginPage />;
  }

  // Extract username from email (username@cartoteca.app)
  const displayName = user.email?.replace('@cartoteca.app', '') || 'Pengguna';

  return (
    <div id="app">
      <div className="wrap">
        
        {/* HEADER */}
        <header className="hdr">
          <div className="brand">
            <div className="hanko">🎴</div>
            <div>
              <h1>Cartoteca</h1>
              <p>Karuta Companion App — Hybrid Edition</p>
            </div>
          </div>
          <div className="mini-stats">
            <div className="mini-stat"><b>{totalCards}</b><span>Kartu</span></div>
            <div className="mini-stat"><b>{new Set(cards.map(c => c.series).filter(Boolean)).size}</b><span>Series</span></div>
            <div className="mini-stat"><b>{wishlist.length}</b><span>Wishlist</span></div>
            <div className="mini-stat"><b>{avgEffort}</b><span>Avg Eff</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '8px', paddingLeft: '12px', borderLeft: '1px solid #3a3327' }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: '#9c8f76' }}>
                👤 {displayName}
              </span>
              <button
                onClick={() => setIsInventoryModalOpen(true)}
                title="Inventory"
                style={{
                  background: 'transparent', border: '1px solid #3a3327',
                  borderRadius: '6px', padding: '4px 10px',
                  fontFamily: "'IBM Plex Sans', sans-serif", fontSize: '11px',
                  fontWeight: 600, color: '#e8dbce', cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = '#3a3327'; }}
                onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'transparent'; }}
              >
                🎒 Inventory
              </button>
              <button
                onClick={() => setIsBackupModalOpen(true)}
                title="Data Backup"
                style={{
                  background: 'transparent', border: '1px solid #3a3327',
                  borderRadius: '6px', padding: '4px 10px',
                  fontFamily: "'IBM Plex Sans', sans-serif", fontSize: '11px',
                  fontWeight: 600, color: '#5ea396', cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = '#5ea396'; (e.target as HTMLButtonElement).style.color = '#fff'; }}
                onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'transparent'; (e.target as HTMLButtonElement).style.color = '#5ea396'; }}
              >
                💾 Backup
              </button>
              <button
                onClick={() => setIsProfileModalOpen(true)}
                title="Profil"
                style={{
                  background: 'transparent', border: '1px solid #3a3327',
                  borderRadius: '6px', padding: '4px 10px',
                  fontFamily: "'IBM Plex Sans', sans-serif", fontSize: '11px',
                  fontWeight: 600, color: '#d8923e', cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = '#d8923e'; (e.target as HTMLButtonElement).style.color = '#fff'; }}
                onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'transparent'; (e.target as HTMLButtonElement).style.color = '#d8923e'; }}
              >
                Profil
              </button>
              <button
                onClick={() => signOut(auth)}
                title="Keluar"
                style={{
                  background: 'transparent', border: '1px solid #3a3327',
                  borderRadius: '6px', padding: '4px 10px',
                  fontFamily: "'IBM Plex Sans', sans-serif", fontSize: '11px',
                  fontWeight: 600, color: '#9c8f76', cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = '#d8923e'; (e.target as HTMLButtonElement).style.color = '#fff'; (e.target as HTMLButtonElement).style.borderColor = '#d8923e'; }}
                onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'transparent'; (e.target as HTMLButtonElement).style.color = '#9c8f76'; (e.target as HTMLButtonElement).style.borderColor = '#3a3327'; }}
              >
                Keluar
              </button>
            </div>
          </div>
        </header>

        {/* NAVIGATION TABS */}
        <nav className="tabs">
          <button className={`tab-btn ${activeTab === 'collection' ? 'active' : ''}`} onClick={() => { setActiveTab('collection'); setSelectedCards(new Set()); }}>🎴 Koleksi</button>
          <button className={`tab-btn ${activeTab === 'wishlist' ? 'active' : ''}`} onClick={() => { setActiveTab('wishlist'); setSelectedCards(new Set()); }}>✨ Wishlist</button>
          <button className={`tab-btn ${activeTab === 'workers' ? 'active' : ''}`} onClick={() => { setActiveTab('workers'); setSelectedCards(new Set()); }}>💼 Pekerja</button>
          <button className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => { setActiveTab('stats'); setSelectedCards(new Set()); }}>📊 Statistik</button>
          <button className={`tab-btn ${activeTab === 'tags-manager' ? 'active' : ''}`} onClick={() => { setActiveTab('tags-manager'); setSelectedCards(new Set()); }}>🏷️ Kelola Tag</button>
        </nav>

        {/* MAIN BODY AREA */}
        <main className="content-area">
          
          {/* TAB: BINDER COLLECTION */}
          {activeTab === 'collection' && (
            <div>
              <div className="toolbar">
                <div className="search-wrapper">
                  <input 
                    className="search-box" 
                    type="text" 
                    placeholder="Cari nama karakter, series, kode, atau tag..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && <span className="clear-search" onClick={() => setSearchQuery('')}>&times;</span>}
                </div>
                
                <select value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
                  <option value="recent">Terbaru ditambahkan</option>
                  <option value="effort-desc">Effort tertinggi</option>
                  <option value="effort-asc">Effort terendah</option>
                  <option value="print-asc">Print number terendah</option>
                  <option value="edition-desc">Edisi terbaru (◈)</option>
                  <option value="wish-desc">Wish tertinggi (Value)</option>
                  <option value="name">Nama A-Z</option>
                </select>
                
                <select value={selectedCondition} onChange={(e) => setSelectedCondition(e.target.value)}>
                  <option value="">Semua kondisi</option>
                  <option value="Damaged">Damaged</option>
                  <option value="Poor">Poor</option>
                  <option value="Average">Average</option>
                  <option value="Good">Good</option>
                  <option value="Great">Great</option>
                  <option value="Mint">Mint</option>
                </select>

                <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)}>
                  <option value="">Semua Tag</option>
                  {getUsedTags().map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                
                <button className="btn" onClick={() => openCardModal(null)}>+ Tambah Kartu</button>
                <button className="btn secondary" onClick={() => setIsBulkImportModalOpen(true)}>📥 Bulk Import (Copas k!c)</button>
                
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', background: '#1c1912', borderRadius: '6px', padding: '4px' }}>
                  <button 
                    title="List View"
                    onClick={() => setViewMode('list')}
                    style={{ background: viewMode === 'list' ? '#3a3327' : 'transparent', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
                  >
                    📝
                  </button>
                  <button 
                    title="Album View"
                    onClick={() => setViewMode('album')}
                    style={{ background: viewMode === 'album' ? '#3a3327' : 'transparent', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
                  >
                    🎴
                  </button>
                </div>
              </div>

              {/* Batch Actions Panel */}
              {selectedCards.size > 0 && (
                <div className="batch-panel">
                  <span className="batch-info"><b>{selectedCards.size}</b> kartu terpilih</span>
                  <div className="batch-actions">
                    <button className="btn secondary btn-sm" onClick={() => { setBatchSelectedTags([]); setIsBatchTagModalOpen(true); }}>Tambah Tag</button>
                    <button className="btn secondary btn-sm" onClick={handleBatchDelete}>Hapus Terpilih</button>
                    <button className="btn secondary btn-sm" onClick={() => setSelectedCards(new Set())}>Batal</button>
                  </div>
                </div>
              )}

              {/* Grid List */}
              {cards.length === 0 ? (
                <div className="empty">
                  <div className="stamp-big">🎴</div>
                  <h3>Binder masih kosong</h3>
                  <p>Masukkan kartu Karuta Anda secara manual atau gunakan Bulk Import di atas.</p>
                  <button className="btn" onClick={() => openCardModal(null)}>+ Tambah Kartu Pertama</button>
                </div>
              ) : (
                <div className={viewMode === 'album' ? 'album-grid' : 'binder'}>
                  {getFilteredCards().map(c => {
                    const isSelected = selectedCards.has(c.id);
                    const itemTags = c.tags ? c.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
                    
                    if (viewMode === 'album') {
                      return (
                        <div 
                          key={c.id}
                          className={`native-card condition-${c.condition.toLowerCase()} ${isSelected ? 'selected' : ''}`}
                          onClick={(e) => handleSleeveContainerClick(c.id, e)}
                        >
                          <div 
                            className="select-indicator" 
                            style={{ display: selectedCards.size > 0 ? 'flex' : undefined }}
                            onClick={(e) => toggleSleeveSelect(c.id, e)}
                          />
                          <div className="nc-code">{c.code}</div>
                          <div className="nc-print">#{c.print !== null ? c.print : '—'}</div>
                          
                          {c.isWorker && <div className="nc-badge worker" title="Worker">🛠️</div>}
                          {c.isTrade && <div className="nc-badge trade" title="Trade">🔄</div>}
                          
                          <div className="nc-bottom">
                            <div className="nc-character">{c.name || '(Tanpa Nama)'}</div>
                            <div className="nc-series">{c.series || 'Unknown'}</div>
                            <div className="nc-meta">
                              <span>◈{c.edition || '?'}</span>
                              <span style={{ margin: '0 4px' }}>|</span>
                              <span>{c.condition}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Standard List View
                    return (
                      <div 
                        key={c.id}
                        className={`sleeve ${c.condition.toLowerCase() === 'mint' ? 'mint' : ''} ${c.condition.toLowerCase() === 'great' ? 'great' : ''} ${isSelected ? 'selected' : ''}`}
                        onClick={(e) => handleSleeveContainerClick(c.id, e)}
                      >
                        <div 
                          className="select-indicator" 
                          style={{ display: selectedCards.size > 0 ? 'flex' : undefined }}
                          onClick={(e) => toggleSleeveSelect(c.id, e)}
                        />

                        <div className="stampbadge">
                          <b>{c.print !== null ? `#${c.print}` : '—'}</b>
                          <span>PRINT</span>
                        </div>

                        <p className="card-name">{c.name || '(Tanpa Nama)'}</p>
                        <p className="card-series" title={c.series}>{c.series || 'Series belum diisi'}</p>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          {c.code ? <span className="card-code">{c.code}</span> : <span />}
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {c.isWorker && <span className="chip worker-tag" title="Worker Deck">🛠️ W</span>}
                            {c.isTrade && <span className="chip trade-tag" title="Up for Trade">🔄 T</span>}
                          </div>
                        </div>

                        <div className="card-meta">
                          {c.edition !== null && <span className="chip edition">◈{c.edition}</span>}
                          <span className="chip">{c.condition}</span>
                          {c.effort !== null && <span className="chip effort">{c.effort} eff</span>}
                          {itemTags.map(tag => (
                            <span key={tag} className="custom-tag-chip" style={{ backgroundColor: getTagColor(tag) }}>{tag}</span>
                          ))}
                        </div>

                        {(c.wish || c.price || c.frame || c.dye || c.notes) && (
                          <div className="card-details-row">
                            {c.wish && <div><span>Wishlists:</span> <b>{c.wish.toLocaleString()}</b></div>}
                            {c.price && <div><span>Est. Harga:</span> <b>{c.price} Tickets</b></div>}
                            {c.frame && <div><span>Frame:</span> <b>{c.frame}</b></div>}
                            {c.dye && <div><span>Dye:</span> <b>{c.dye}</b></div>}
                            {c.notes && <div style={{ display: 'block', fontStyle: 'italic', marginTop: '2px' }}>"{c.notes}"</div>}
                          </div>
                        )}

                        <div className="card-actions">
                          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); openCardModal(c); }}>✏️ Edit</button>
                          <button className="icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteCard(c.id); }}>🗑️ Hapus</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: WISHLIST */}
          {activeTab === 'wishlist' && (
            <div>
              <div className="toolbar">
                <input 
                  className="search-box" 
                  type="text" 
                  placeholder="Cari nama wishlist..." 
                  value={wishSearchQuery}
                  onChange={(e) => setWishSearchQuery(e.target.value)}
                />
                <select value={wishSortOption} onChange={(e) => setWishSortOption(e.target.value)}>
                  <option value="priority-desc">Prioritas tertinggi</option>
                  <option value="name">Nama A-Z</option>
                  <option value="series">Series A-Z</option>
                </select>
                <button className="btn" onClick={() => openWishModal(null)}>+ Tambah Wishlist</button>
              </div>

              {wishlist.length === 0 ? (
                <div className="empty">
                  <div className="stamp-big">✨</div>
                  <h3>Belum ada wishlist</h3>
                  <p>Catat karakter incaran kamu agar tidak terlewatkan saat drop muncul.</p>
                  <button className="btn" onClick={() => openWishModal(null)}>+ Tambah Wishlist Pertama</button>
                </div>
              ) : (
                <div className="binder">
                  {getFilteredWishlist().map(w => (
                    <div key={w.id} className="sleeve" style={{ borderLeft: '4px solid var(--jade)' }}>
                      <div className="stampbadge" style={{ borderColor: 'var(--jade)', color: 'var(--jade)' }}>
                        <b>願</b>
                        <span>WISH</span>
                      </div>
                      <p className="card-name">{w.name}</p>
                      <p className="card-series">{w.series || 'Series belum diisi'}</p>

                      <div className="card-meta">
                        <span className={`wish-priority ${w.priority}`}>
                          {w.priority === 'high' ? '🚨 Prioritas Tinggi' : w.priority === 'med' ? '⚡ Prioritas Sedang' : '🌱 Prioritas Rendah'}
                        </span>
                        {w.targetWish && <span className="chip">Target: {w.targetWish} wish</span>}
                      </div>

                      {w.notes && <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '4px', fontStyle: 'italic' }}>"{w.notes}"</div>}

                      <div className="card-actions">
                        <button className="icon-btn" onClick={() => openWishModal(w)}>✏️ Edit</button>
                        <button className="icon-btn delete" onClick={() => handleDeleteWish(w.id)}>🗑️ Hapus</button>
                        <button 
                          className="btn btn-sm" 
                          style={{ marginLeft: 'auto', background: 'var(--jade)', color: '#fff', borderColor: 'var(--jade-soft)' }}
                          onClick={() => handleClaimWish(w)}
                        >
                          🎉 Klaim
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: STATISTICS */}
          {activeTab === 'stats' && (
            <div>
              <div className="stats-grid">
                <div className="stat-card"><b>{totalCards}</b><span>Total Kartu</span></div>
                <div className="stat-card"><b>{avgEffort}</b><span>Rata-Rata Effort</span></div>
                <div className="stat-card"><b>{lowPrint}</b><span>Low Print (≤99)</span></div>
                <div className="stat-card"><b>{mintCount}</b><span>Kondisi Mint (MT)</span></div>
              </div>

              <div className="charts-layout">
                <div className="bars">
                  <h4>Distribusi Kondisi</h4>
                  {Object.entries(getConditionStats()).map(([k, v]) => {
                    const maxVal = Math.max(1, ...Object.values(getConditionStats()));
                    return (
                      <div className="bar-row" key={k}>
                        <div className="label">{k}</div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${(v / maxVal) * 100}%` }} />
                        </div>
                        <div className="count">{v}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="bars">
                  <h4>Series Terbanyak</h4>
                  {getTopSeriesStats().length > 0 ? getTopSeriesStats().map(([k, v]) => {
                    const maxVal = Math.max(1, ...getTopSeriesStats().map(s => s[1]));
                    return (
                      <div className="bar-row" key={k}>
                        <div className="label" title={k}>{k}</div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${(v / maxVal) * 100}%`, backgroundColor: 'var(--stamp)' }} />
                        </div>
                        <div className="count">{v}</div>
                      </div>
                    );
                  }) : <p style={{ fontSize: '13px', color: 'var(--ink-soft)', textAlign: 'center', padding: '10px' }}>Belum ada data series.</p>}
                </div>
              </div>

              <div className="charts-layout" style={{ marginTop: '16px' }}>
                <div className="bars">
                  <h4>Edisi Kartu ◈</h4>
                  {getEditionStats().length > 0 ? getEditionStats().map(([k, v]) => {
                    const maxVal = Math.max(1, ...getEditionStats().map(e => e[1]));
                    return (
                      <div className="bar-row" key={k}>
                        <div className="label">{k}</div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${(v / maxVal) * 100}%`, backgroundColor: 'var(--gold)' }} />
                        </div>
                        <div className="count">{v}</div>
                      </div>
                    );
                  }) : <p style={{ fontSize: '13px', color: 'var(--ink-soft)', textAlign: 'center', padding: '10px' }}>Belum ada data edisi.</p>}
                </div>

                <div className="bars">
                  <h4>Kontributor Effort Teratas</h4>
                  {getTopEffortCards().length > 0 ? getTopEffortCards().map(c => {
                    const maxVal = getTopEffortCards()[0]?.effort || 1;
                    return (
                      <div className="bar-row" key={c.id}>
                        <div className="label" title={c.name}>{c.name}</div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${((c.effort || 0) / maxVal) * 100}%`, backgroundColor: 'var(--jade-soft)' }} />
                        </div>
                        <div className="count">{c.effort}</div>
                      </div>
                    );
                  }) : <p style={{ fontSize: '13px', color: 'var(--ink-soft)', textAlign: 'center', padding: '10px' }}>Belum ada data effort.</p>}
                </div>
              </div>
            </div>
          )}

          {/* TAB: TAGS MANAGER */}
          {activeTab === 'tags-manager' && (
            <div className="tags-manager-layout">
              <div className="tag-form-card">
                <h4>Tambah / Edit Tag</h4>
                <div className="field">
                  <label>Nama Tag *</label>
                  <input 
                    type="text" 
                    placeholder="mis. waifu, trade, deck-1"
                    value={tagNameInput}
                    onChange={(e) => setTagNameInput(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Warna Tag</label>
                  <div className="tag-color-picker">
                    <input 
                      type="color" 
                      value={tagColorInput} 
                      onChange={(e) => setTagColorInput(e.target.value)}
                    />
                    <div className="color-presets">
                      {['#5ea396', '#d8923e', '#e0b84c', '#b85c5c', '#8b5cf6', '#3b82f6'].map(color => (
                        <span 
                          key={color} 
                          className="preset" 
                          style={{ backgroundColor: color }} 
                          onClick={() => setTagColorInput(color)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="field">
                  <label>Deskripsi Tag</label>
                  <input 
                    type="text" 
                    placeholder="Keterangan opsional"
                    value={tagDescInput}
                    onChange={(e) => setTagDescInput(e.target.value)}
                  />
                </div>
                <button className="btn" style={{ width: '100%' }} onClick={handleSaveTag}>Simpan Tag</button>
              </div>

              <div className="tag-list-card">
                <h4>Daftar Tag Kustom</h4>
                <div className="tag-table-container">
                  <table className="tag-table">
                    <thead>
                      <tr>
                        <th>Tag</th>
                        <th>Keterangan</th>
                        <th>Jumlah Kartu</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customTags.length === 0 ? (
                        <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>Belum ada tag kustom.</td></tr>
                      ) : (
                        customTags.map(t => {
                          const cardCount = cards.filter(c => c.tags?.split(',').map(tg => tg.trim().toLowerCase()).includes(t.name.toLowerCase())).length;
                          return (
                            <tr key={t.name}>
                              <td><span className="custom-tag-chip" style={{ backgroundColor: t.color }}>{t.name}</span></td>
                              <td>{t.desc || '—'}</td>
                              <td><b>{cardCount}</b> kartu</td>
                              <td>
                                <button className="icon-btn" onClick={() => { setTagNameInput(t.name); setTagColorInput(t.color); setTagDescInput(t.desc); }}>✏️ Edit</button>
                                <button className="icon-btn delete" onClick={() => handleDeleteCustomTag(t.name)}>🗑️ Hapus</button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: WORKER OPTIMIZER */}
          {activeTab === 'workers' && (
            <div className="stats-grid">
              <div className="stat-card" style={{ gridColumn: '1 / -1' }}>
                <h3 style={{ marginBottom: '16px' }}>💼 Kalkulator Pekerja (Node Optimizer)</h3>
                <p style={{ color: 'var(--ink-soft)', fontSize: '13px', marginBottom: '20px' }}>
                  Pilih 3 kartu pekerja terbaik Anda, masukkan estimasi Node Multiplier, dan lihat potensi Bits yang dihasilkan.
                </p>
                
                <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', overflowX: 'auto' }}>
                  {[0, 1, 2].map(slotIdx => {
                    const card = cards.find(c => c.id === workerSlotIds[slotIdx]);
                    return (
                      <div key={slotIdx} style={{ flex: 1, minWidth: '150px', padding: '16px', background: '#1c1912', border: '1px dashed #3a3327', borderRadius: '8px', textAlign: 'center' }}>
                        <h4 style={{ color: '#9c8f76', marginBottom: '12px' }}>Pekerja {slotIdx + 1}</h4>
                        {card ? (
                          <>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#e8dbce', marginBottom: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</div>
                            <div style={{ fontSize: '12px', color: '#d8923e', marginBottom: '12px', fontFamily: 'monospace' }}>Effort: {card.effort || 0}</div>
                            {card.stats && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center', marginBottom: '12px' }}>
                                {Object.entries(card.stats).map(([k,v]) => (
                                  <div key={k} style={{ fontSize: '9px', background: '#2a251b', padding: '2px 4px', borderRadius: '2px', color: v === 'S' ? '#d8923e' : v === 'A' ? '#5ea396' : '#e8dbce' }}>
                                    {k[0].toUpperCase()}:{v}
                                  </div>
                                ))}
                              </div>
                            )}
                            <button className="btn secondary" style={{ padding: '4px 8px', fontSize: '11px', width: '100%' }} onClick={() => handleSetWorker(slotIdx, null)}>Lepas</button>
                          </>
                        ) : (
                          <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Slot Kosong</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ background: '#1c1912', padding: '20px', borderRadius: '8px', border: '1px solid #3a3327', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontSize: '14px', color: '#9c8f76' }}>Node Multiplier:</div>
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0"
                      value={nodeMultiplier} 
                      onChange={e => handleSetNodeMultiplier(Number(e.target.value))}
                      style={{ width: '80px', padding: '8px', background: '#17140f', border: '1px solid #3a3327', color: '#e8dbce', borderRadius: '4px' }}
                    />
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', color: '#9c8f76', marginBottom: '4px' }}>Estimasi Bit per Drop:</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#5ea396', fontFamily: 'monospace' }}>
                      {Math.round(workerSlotIds.map(id => cards.find(c => c.id === id)?.effort || 0).reduce((a, b) => a + b, 0) * nodeMultiplier)} 🔵
                    </div>
                  </div>
                </div>
              </div>

              <div className="stat-card" style={{ gridColumn: '1 / -1' }}>
                <h4 style={{ marginBottom: '16px' }}>Daftar Kartu Pekerja Anda</h4>
                <p style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '16px' }}>Klik kartu di bawah ini untuk menugaskannya ke slot yang kosong (Hanya menampilkan kartu dengan centang 'Worker' atau memiliki nilai Effort tinggi).</p>
                <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '16px' }}>
                  {cards.filter(c => c.isWorker || c.tags.includes('worker') || c.tags.includes('deck-1') || (c.effort && c.effort > 0)).sort((a,b) => (b.effort||0)-(a.effort||0)).slice(0, 50).map(c => {
                    const isUsed = workerSlotIds.includes(c.id);
                    return (
                      <div 
                        key={c.id} 
                        onClick={() => {
                          if (!isUsed) {
                            const emptyIdx = workerSlotIds.findIndex(id => id === null);
                            if (emptyIdx !== -1) handleSetWorker(emptyIdx, c.id);
                            else handleSetWorker(2, c.id); // overwrite 3rd slot if full
                          }
                        }}
                        style={{ 
                          minWidth: '120px', maxWidth: '140px', padding: '12px', background: isUsed ? '#2a251b' : '#1c1912', border: '1px solid #3a3327', 
                          borderRadius: '8px', cursor: isUsed ? 'not-allowed' : 'pointer', opacity: isUsed ? 0.5 : 1, transition: '0.2s'
                        }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#e8dbce', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                        <div style={{ fontSize: '14px', color: '#d8923e', fontWeight: 'bold', fontFamily: 'monospace' }}>{c.effort || 0} E</div>
                      </div>
                    );
                  })}
                  {cards.length > 0 && cards.filter(c => c.isWorker || (c.effort && c.effort > 0)).length === 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Tidak ada kartu yang ditandai sebagai Worker atau memiliki nilai effort.</div>
                  )}
                </div>
              </div>
            </div>
          )}

        </main>

        {/* FOOTER */}
        <footer className="footer">
          <div>CARTOTECA • Karuta Companion App</div>
          <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.6 }}>© 2026 ChromeT • Didesain dengan estetika Hanko & Washi</div>
        </footer>

      </div>

      {/* MODAL: ADD / EDIT CARD */}
      {isCardModalOpen && (
        <div className="modal-overlay open">
          <div className="modal">
            <div className="modal-header">
              <h2>{cardFormId ? 'Edit Detail Kartu' : 'Tambah Kartu Baru'}</h2>
              <button className="close-modal-btn" onClick={() => setIsCardModalOpen(false)}>&times;</button>
            </div>

            {/* Parser Section */}
            <div className="parser-section">
              <details>
                <summary>✨ <b>Auto-fill via Discord Text</b> (Paste info Keqing / k!wi)</summary>
                <div className="parser-body">
                  <textarea 
                    placeholder="Tempel teks Discord di sini... (k!c atau k!wi)" 
                    rows={3}
                    value={discordText}
                    onChange={(e) => setDiscordText(e.target.value)}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                    <span className={`parser-status ${parserFeedback.isError ? 'error' : parserFeedback.isSuccess ? 'success' : ''}`}>{parserFeedback.text}</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-sm secondary" onClick={handleParseKiwi}>Parse k!wi (Dari Clipboard)</button>
                      <button className="btn btn-sm" onClick={handleParseText}>Parse k!c / Keqing</button>
                    </div>
                  </div>
                </div>
              </details>
            </div>
            
            {fStats && (
              <div style={{ background: '#1c1912', padding: '12px', borderRadius: '8px', border: '1px dashed #3a3327', marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <div style={{ width: '100%', fontSize: '11px', color: '#9c8f76', textAlign: 'center', marginBottom: '4px' }}>Status Pekerja (k!wi)</div>
                {Object.entries(fStats).map(([k, v]) => (
                  <div key={k} style={{ background: '#2a251b', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#9c8f76', textTransform: 'capitalize' }}>{k.substring(0,3)}</span>
                    <span style={{ color: v === 'S' ? '#d8923e' : v === 'A' ? '#5ea396' : '#fff', fontWeight: 'bold' }}>{v}</span>
                  </div>
                ))}
                <button className="btn secondary btn-sm" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={() => setFStats(undefined)}>Hapus Status</button>
              </div>
            )}

            <div className="field-row-3">
              <div className="field">
                <label>Kode Kartu</label>
                <input type="text" placeholder="mis. mz4xq" value={fCode} onChange={(e) => setFCode(e.target.value)} />
              </div>
              <div className="field">
                <label>Print Num</label>
                <input type="number" placeholder="mis. 14" value={fPrint} onChange={(e) => setFPrint(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Edisi ◈</label>
                <input type="number" placeholder="mis. 3" value={fEdition} onChange={(e) => setFEdition(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
            </div>

            <div className="field">
              <label>Nama Karakter *</label>
              <input type="text" placeholder="mis. Megumi Kato" value={fName} onChange={(e) => setFName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Series / Anime</label>
              <input type="text" placeholder="mis. Saekano" value={fSeries} onChange={(e) => setFSeries(e.target.value)} />
            </div>

            <div className="field-row-3">
              <div className="field">
                <label>Kondisi</label>
                <select value={fCondition} onChange={(e) => setFCondition(e.target.value)}>
                  <option value="Damaged">Damaged</option>
                  <option value="Poor">Poor</option>
                  <option value="Average">Average</option>
                  <option value="Good">Good</option>
                  <option value="Great">Great</option>
                  <option value="Mint">Mint</option>
                </select>
              </div>
              <div className="field">
                <label>Effort</label>
                <input type="number" placeholder="mis. 420" value={fEffort} onChange={(e) => setFEffort(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Wish Count</label>
                <input type="number" placeholder="mis. 1200" value={fWish} onChange={(e) => setFWish(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>Estimasi Harga (Ticket)</label>
                <input type="number" placeholder="mis. 15" value={fPrice} onChange={(e) => setFPrice(e.target.value === '' ? '' : Number(e.target.value))} />
                {cardFormId && cards.find(c => c.id === cardFormId)?.priceHistory && cards.find(c => c.id === cardFormId)!.priceHistory!.length > 0 && (
                  <div style={{ background: '#17140f', padding: '8px', borderRadius: '4px', border: '1px solid #3a3327', marginTop: '8px' }}>
                    <div style={{ fontSize: '10px', color: '#9c8f76', marginBottom: '4px' }}>📉 Riwayat Perubahan Harga</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '60px', overflowY: 'auto' }}>
                      {cards.find(c => c.id === cardFormId)!.priceHistory!.map((h, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#e8dbce', borderBottom: '1px dashed #3a3327', paddingBottom: '2px' }}>
                          <span style={{ color: 'var(--ink-soft)' }}>{new Date(h.date).toLocaleDateString()}</span>
                          <span style={{ fontWeight: 'bold', color: '#d8923e' }}>{h.price} 🎟️</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="field" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <label style={{ marginBottom: '8px' }}>Status / Posisi</label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', height: '36px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'normal', cursor: 'pointer' }}>
                    <input type="checkbox" checked={fIsWorker} onChange={(e) => setFIsWorker(e.target.checked)} style={{ width: 'auto' }} /> Worker Deck
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'normal', cursor: 'pointer' }}>
                    <input type="checkbox" checked={fIsTrade} onChange={(e) => setFIsTrade(e.target.checked)} style={{ width: 'auto' }} /> Trade / Sale
                  </label>
                </div>
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>Frame Name</label>
                <input type="text" placeholder="mis. Maple Frame" value={fFrame} onChange={(e) => setFFrame(e.target.value)} />
              </div>
              <div className="field">
                <label>Dye Name / Color</label>
                <input type="text" placeholder="mis. Purple Haze" value={fDye} onChange={(e) => setFDye(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Tag Koleksi (Klik untuk memilih)</label>
              <div className="tag-selector-grid">
                {customTags.map(t => {
                  const isSel = cardSelectedTags.includes(t.name.toLowerCase());
                  return (
                    <span 
                      key={t.name}
                      className={`tag-select-chip ${isSel ? 'selected' : ''}`}
                      style={isSel ? { backgroundColor: t.color, borderColor: 'transparent', color: '#fff' } : undefined}
                      onClick={() => toggleCardModalTagChip(t.name)}
                    >
                      {t.name}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="field">
              <label>Catatan Tambahan</label>
              <textarea placeholder="Tulis catatan, detail trade, dll..." rows={2} value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
            </div>

            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setIsCardModalOpen(false)}>Batal</button>
              <button className="btn" onClick={handleSaveCard}>Simpan Kartu</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT WISHLIST */}
      {isWishModalOpen && (
        <div className="modal-overlay open">
          <div className="modal">
            <div className="modal-header">
              <h2>{wishFormId ? 'Edit Detail Wishlist' : 'Tambah Ke Wishlist'}</h2>
              <button className="close-modal-btn" onClick={() => setIsWishModalOpen(false)}>&times;</button>
            </div>

            <div className="field">
              <label>Nama Karakter *</label>
              <input type="text" placeholder="mis. Nezuko Kamado" value={wName} onChange={(e) => setWName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Series / Anime</label>
              <input type="text" placeholder="mis. Kimetsu no Yaiba" value={wSeries} onChange={(e) => setWSeries(e.target.value)} />
            </div>

            <div className="field-row">
              <div className="field">
                <label>Prioritas</label>
                <select value={wPriority} onChange={(e) => setWPriority(e.target.value as any)}>
                  <option value="high">Tinggi</option>
                  <option value="med">Sedang</option>
                  <option value="low">Rendah</option>
                </select>
              </div>
              <div className="field">
                <label>Target Wish Count</label>
                <input type="number" placeholder="mis. 800" value={wTargetWish} onChange={(e) => setWTargetWish(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
            </div>

            <div className="field">
              <label>Catatan Target</label>
              <textarea placeholder="mis. Cari edisi 4 ke atas..." rows={2} value={wNotes} onChange={(e) => setWNotes(e.target.value)} />
            </div>

            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setIsWishModalOpen(false)}>Batal</button>
              <button className="btn" onClick={handleSaveWish}>Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BACKUP & RESTORE */}
      {isBackupModalOpen && (
        <div className="modal-overlay open">
          <div className="modal">
            <div className="modal-header">
              <h2>Backup & Restore Data</h2>
              <button className="close-modal-btn" onClick={() => setIsBackupModalOpen(false)}>&times;</button>
            </div>

            <div className="backup-section">
              <h3>💾 Ekspor Data</h3>
              <p>Simpan seluruh koleksi, wishlist, dan tag kustom Anda ke dalam file JSON.</p>
              <button className="btn" style={{ width: '100%' }} onClick={triggerExportJSON}>Unduh Backup (.json)</button>
            </div>

            <hr style={{ border: '0', borderTop: '1px dashed var(--paper-line)', margin: '20px 0' }} />

            <div className="backup-section">
              <h3>📥 Impor Data</h3>
              <p>Muat data koleksi dari file backup JSON sebelumnya. Data lama akan tertimpa.</p>
              <div className="import-area">
                <input 
                  type="file" 
                  accept=".json" 
                  style={{ display: 'none' }} 
                  ref={fileInputRef} 
                  onChange={handleFileSelect}
                />
                <button className="btn secondary" style={{ width: '100%' }} onClick={() => fileInputRef.current?.click()}>Pilih File JSON</button>
                <div style={{ marginTop: '8px', fontSize: '12.5px', color: 'var(--ink-soft)' }}>{backupFileName}</div>
              </div>
              <button 
                className="btn" 
                style={{ width: '100%', marginTop: '12px', background: 'var(--jade)', color: '#fff', borderColor: 'var(--jade-soft)' }} 
                disabled={!backupFileContent}
                onClick={handleApplyRestore}
              >
                Impor & Terapkan Data
              </button>
            </div>

            <div className="modal-actions" style={{ marginTop: '24px' }}>
              <button className="btn secondary" onClick={() => setIsBackupModalOpen(false)}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BATCH TAG ADD */}
      {isBatchTagModalOpen && (
        <div className="modal-overlay open">
          <div className="modal" style={{ maxWidth: '380px' }}>
            <div className="modal-header">
              <h3>Tambah Tag Massal</h3>
              <button className="close-modal-btn" onClick={() => setIsBatchTagModalOpen(false)}>&times;</button>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '0' }}>Pilih tag yang ingin ditambahkan ke kartu terpilih:</p>

            <div className="tag-selector-grid" style={{ marginBottom: '18px' }}>
              {customTags.map(t => {
                const isSel = batchSelectedTags.includes(t.name.toLowerCase());
                return (
                  <span 
                    key={t.name}
                    className={`tag-select-chip ${isSel ? 'selected' : ''}`}
                    style={isSel ? { backgroundColor: t.color, borderColor: 'transparent', color: '#fff' } : undefined}
                    onClick={() => toggleBatchModalTagChip(t.name)}
                  >
                    {t.name}
                  </span>
                );
              })}
            </div>

            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setIsBatchTagModalOpen(false)}>Batal</button>
              <button className="btn" onClick={handleBatchSaveTags}>Terapkan</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BACKUP & RESTORE */}
      {isBackupModalOpen && (
        <div className="modal-overlay open">
          <div className="modal" style={{ maxWidth: '400px', padding: '0', overflow: 'hidden' }}>
            <div style={{ background: '#1c1912', padding: '16px 20px', borderBottom: '1px solid #3a3327', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: '0', color: '#5ea396', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                💾 Data Backup & Restore
              </h3>
              <button onClick={() => setIsBackupModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#9c8f76', fontSize: '24px', cursor: 'pointer', padding: '0' }}>&times;</button>
            </div>
            
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: '#17140f', padding: '16px', borderRadius: '8px', border: '1px solid #3a3327' }}>
                <h4 style={{ color: '#e8dbce', marginBottom: '8px', fontSize: '14px' }}>Export (Cadangkan Data)</h4>
                <p style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '12px' }}>Unduh seluruh koleksi kartu, wishlist, dan pengaturan Anda sebagai file JSON.</p>
                <button className="btn" onClick={triggerExportJSON} style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                  📥 Download File JSON
                </button>
              </div>

              <div style={{ background: '#17140f', padding: '16px', borderRadius: '8px', border: '1px solid #3a3327' }}>
                <h4 style={{ color: '#e8dbce', marginBottom: '8px', fontSize: '14px' }}>Import (Pulihkan Data)</h4>
                <p style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '12px' }}>Pilih file JSON backup untuk memulihkan koleksi Anda. (Perhatian: akan menimpa data yang ada secara lokal).</p>
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={handleFileSelect} 
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                  <button className="btn secondary" onClick={() => fileInputRef.current?.click()} style={{ padding: '6px 12px', fontSize: '12px' }}>Pilih File...</button>
                  <span style={{ fontSize: '11px', color: '#9c8f76', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                    {backupFileName}
                  </span>
                </div>
                <button 
                  className="btn" 
                  style={{ width: '100%', background: backupFileContent ? '#b85c5c' : '#3a3327', color: backupFileContent ? '#fff' : '#9c8f76', opacity: backupFileContent ? 1 : 0.5, cursor: backupFileContent ? 'pointer' : 'not-allowed' }} 
                  onClick={handleApplyRestore}
                  disabled={!backupFileContent}
                >
                  ⚠️ Mulai Pulihkan Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BULK IMPORT */}
      {isBulkImportModalOpen && (
        <div className="modal-overlay open">
          <div className="modal" style={{ maxWidth: '600px', padding: '0', overflow: 'hidden' }}>
            <div style={{ background: '#1c1912', padding: '16px 20px', borderBottom: '1px solid #3a3327', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: '0', color: '#5ea396', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📥 Bulk Import via Text
              </h3>
              <button onClick={() => setIsBulkImportModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#9c8f76', fontSize: '24px', cursor: 'pointer', padding: '0' }}>&times;</button>
            </div>
            
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                Buka Discord, jalankan perintah <code style={{ background: '#1c1912', padding: '2px 4px', borderRadius: '4px' }}>k!c</code>, lalu <b>copy semua teks balasan</b> (hingga puluhan baris) dan paste di bawah ini:
              </p>
              <textarea 
                className="input-field" 
                style={{ width: '100%', height: '250px', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap', background: '#1c1912', color: '#e8dbce', border: '1px solid #3a3327', borderRadius: '8px', padding: '12px' }}
                placeholder={`Contoh:\nkd · mz4xq · ◈3 · #14 · Mint · 420 effort · Megumi Kato · Saekano\nkd · asdfg · ◈2 · #100 · Good · 330 effort · Rem · Re:Zero`}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
              <button className="btn" onClick={handleBulkImportExecute} style={{ padding: '12px' }}>
                🚀 Proses & Simpan Semua Kartu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COLLECTOR PROFILE */}
      {isProfileModalOpen && (
        <div className="modal-overlay open">
          <div className="modal" style={{ maxWidth: '420px', padding: '0', overflow: 'hidden' }}>
            <div style={{ background: '#d8923e', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#17140f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
                  👤
                </div>
                <div>
                  <h3 style={{ margin: '0', color: '#17140f', fontSize: '18px', fontWeight: 800 }}>{displayName}</h3>
                  <div style={{ color: '#6d481b', fontSize: '12px', fontWeight: 600 }}>Collector Profile</div>
                </div>
              </div>
              <button onClick={() => setIsProfileModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#17140f', fontSize: '24px', cursor: 'pointer', padding: '0' }}>&times;</button>
            </div>
            
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#17140f', padding: '12px', borderRadius: '8px', border: '1px solid #3a3327' }}>
                  <div style={{ fontSize: '11px', color: '#9c8f76', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Total Cards</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#e8dbce' }}>{totalCards}</div>
                </div>
                <div style={{ background: '#17140f', padding: '12px', borderRadius: '8px', border: '1px solid #3a3327' }}>
                  <div style={{ fontSize: '11px', color: '#9c8f76', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Wishlisted</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#e8dbce' }}>{cards.reduce((sum, c) => sum + (c.wish || 0), 0)}</div>
                </div>
              </div>

              <div style={{ background: '#17140f', padding: '16px', borderRadius: '8px', border: '1px solid #3a3327' }}>
                <div style={{ fontSize: '12px', color: '#d8923e', fontWeight: 700, marginBottom: '10px', textTransform: 'uppercase' }}>Prints</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span><span style={{ color: '#9c8f76' }}>SP (1-9):</span> <span style={{ color: '#e8dbce' }}>{cards.filter(c => c.print && c.print < 10).length}</span></span>
                  <span><span style={{ color: '#9c8f76' }}>LP (10-99):</span> <span style={{ color: '#e8dbce' }}>{cards.filter(c => c.print && c.print >= 10 && c.print <= 99).length}</span></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '6px' }}>
                  <span><span style={{ color: '#9c8f76' }}>MP (100-999):</span> <span style={{ color: '#e8dbce' }}>{cards.filter(c => c.print && c.print >= 100 && c.print <= 999).length}</span></span>
                  <span><span style={{ color: '#9c8f76' }}>HP (1000+):</span> <span style={{ color: '#e8dbce' }}>{cards.filter(c => c.print && c.print >= 1000).length}</span></span>
                </div>
              </div>

              <div style={{ background: '#17140f', padding: '16px', borderRadius: '8px', border: '1px solid #3a3327' }}>
                <div style={{ fontSize: '12px', color: '#d8923e', fontWeight: 700, marginBottom: '10px', textTransform: 'uppercase' }}>Editions</div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '13px', flexWrap: 'wrap' }}>
                  {[1, 2, 3, 4, 5, 6].map(ed => (
                    <span key={ed}><span style={{ color: '#9c8f76' }}>◈{ed}:</span> <span style={{ color: '#e8dbce' }}>{cards.filter(c => c.edition === ed).length}</span></span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#17140f', padding: '16px', borderRadius: '8px', border: '1px solid #3a3327' }}>
                  <div style={{ fontSize: '12px', color: '#d8923e', fontWeight: 700, marginBottom: '10px', textTransform: 'uppercase' }}>Conditions</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                    <span><span style={{ color: '#9c8f76' }}>Mint:</span> <span style={{ color: '#e8dbce' }}>{cards.filter(c => c.condition === 'Mint').length}</span></span>
                    <span><span style={{ color: '#9c8f76' }}>Excellent:</span> <span style={{ color: '#e8dbce' }}>{cards.filter(c => c.condition === 'Excellent' || c.condition === 'Great').length}</span></span>
                    <span><span style={{ color: '#9c8f76' }}>Good:</span> <span style={{ color: '#e8dbce' }}>{cards.filter(c => c.condition === 'Good' || c.condition === 'Average').length}</span></span>
                    <span><span style={{ color: '#9c8f76' }}>Poor:</span> <span style={{ color: '#e8dbce' }}>{cards.filter(c => c.condition === 'Poor' || c.condition === 'Damaged').length}</span></span>
                  </div>
                </div>
                
                <div style={{ background: '#17140f', padding: '16px', borderRadius: '8px', border: '1px solid #3a3327' }}>
                  <div style={{ fontSize: '12px', color: '#d8923e', fontWeight: 700, marginBottom: '10px', textTransform: 'uppercase' }}>Upgrades</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                    <span><span style={{ color: '#9c8f76' }}>Framed:</span> <span style={{ color: '#e8dbce' }}>{cards.filter(c => c.frame && c.frame.trim() !== '').length}</span></span>
                    <span><span style={{ color: '#9c8f76' }}>Dyed:</span> <span style={{ color: '#e8dbce' }}>{cards.filter(c => c.dye && c.dye.trim() !== '').length}</span></span>
                    <span><span style={{ color: '#9c8f76' }}>Worker:</span> <span style={{ color: '#e8dbce' }}>{cards.filter(c => c.isWorker).length}</span></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: INVENTORY TRACKER */}
      {isInventoryModalOpen && (
        <div className="modal-overlay open">
          <div className="modal" style={{ maxWidth: '360px', padding: '0', overflow: 'hidden' }}>
            <div style={{ background: '#1c1912', padding: '16px 20px', borderBottom: '1px solid #3a3327', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: '0', color: '#e8dbce', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🎒 Inventory
              </h3>
              <button onClick={() => setIsInventoryModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#9c8f76', fontSize: '24px', cursor: 'pointer', padding: '0' }}>&times;</button>
            </div>
            
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Tickets */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#e8dbce', display: 'flex', alignItems: 'center', gap: '8px' }}>🎟️ Tickets</span>
                <input 
                  type="number" 
                  value={inventory.tickets}
                  onChange={e => handleUpdateInventory({ ...inventory, tickets: Number(e.target.value) })}
                  style={{ width: '100px', background: '#17140f', border: '1px solid #3a3327', color: '#e8dbce', padding: '8px', borderRadius: '4px', textAlign: 'right' }}
                />
              </div>

              {/* Gold */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#e8dbce', display: 'flex', alignItems: 'center', gap: '8px' }}>🪙 Gold</span>
                <input 
                  type="number" 
                  value={inventory.gold}
                  onChange={e => handleUpdateInventory({ ...inventory, gold: Number(e.target.value) })}
                  style={{ width: '100px', background: '#17140f', border: '1px solid #3a3327', color: '#e8dbce', padding: '8px', borderRadius: '4px', textAlign: 'right' }}
                />
              </div>

              {/* Gems */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#e8dbce', display: 'flex', alignItems: 'center', gap: '8px' }}>💠 Gems</span>
                <input 
                  type="number" 
                  value={inventory.gems}
                  onChange={e => handleUpdateInventory({ ...inventory, gems: Number(e.target.value) })}
                  style={{ width: '100px', background: '#17140f', border: '1px solid #3a3327', color: '#e8dbce', padding: '8px', borderRadius: '4px', textAlign: 'right' }}
                />
              </div>

              {/* Dusts */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#e8dbce', display: 'flex', alignItems: 'center', gap: '8px' }}>🧪 Dusts</span>
                <input 
                  type="number" 
                  value={inventory.dusts}
                  onChange={e => handleUpdateInventory({ ...inventory, dusts: Number(e.target.value) })}
                  style={{ width: '100px', background: '#17140f', border: '1px solid #3a3327', color: '#e8dbce', padding: '8px', borderRadius: '4px', textAlign: 'right' }}
                />
              </div>

              {/* Bits */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#e8dbce', display: 'flex', alignItems: 'center', gap: '8px' }}>🔵 Bits</span>
                <input 
                  type="number" 
                  value={inventory.bits}
                  onChange={e => handleUpdateInventory({ ...inventory, bits: Number(e.target.value) })}
                  style={{ width: '100px', background: '#17140f', border: '1px solid #3a3327', color: '#e8dbce', padding: '8px', borderRadius: '4px', textAlign: 'right' }}
                />
              </div>

            </div>
          </div>
        </div>
      )}

      {/* FLOATING TIMERS */}
      <div style={{
        position: 'fixed', bottom: '24px', right: '24px',
        display: 'flex', gap: '8px', zIndex: 100,
        background: '#1c1912', padding: '8px',
        borderRadius: '10px', border: '1px solid #3a3327',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
      }}>
        {renderTimer('Drop', dropEnd, () => startTimer('drop', 30))}
        {renderTimer('Grab', grabEnd, () => startTimer('grab', 10))}
        {renderTimer('Work', workEnd, () => startTimer('work', 30))}
      </div>

    </div>
  );
}
