import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from './firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import LoginPage from './LoginPage';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  writeBatch,
  onSnapshot
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
  imageUrl?: string;
  createdAt: number;
  stats?: {
    toughness: string;
    quickness: string;
    purity: string;
    style: string;
    wellness: string;
    appeal: string;
    grabber: string;
    dropper: string;
    vanity: string;
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
  dust0: number;
  dust1: number;
  dust2: number;
  dust3: number;
  dust4: number;
  bits: number;
  tradeLicense: number;
  workPermit: number;
}

const ConditionWatermark = ({ condition }: { condition: string }) => {
  const c = condition.toLowerCase();
  
  let icon = null;
  let color = 'rgba(255,255,255,0.05)';

  switch (c) {
    case 'mint':
      color = 'rgba(255, 215, 0, 0.15)';
      icon = (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
      break;
    case 'great':
      color = 'rgba(120, 255, 180, 0.1)';
      icon = (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8l4 4-4 4M8 12h8" />
        </svg>
      );
      break;
    case 'good':
      color = 'rgba(200, 200, 200, 0.1)';
      icon = (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
      break;
    case 'average':
      color = 'rgba(150, 150, 150, 0.05)';
      icon = (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      );
      break;
    case 'poor':
      color = 'rgba(211, 93, 93, 0.08)';
      icon = (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
      break;
    case 'damaged':
      color = 'rgba(255, 50, 50, 0.15)';
      icon = (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3l18 18M21 3L3 21" />
        </svg>
      );
      break;
    default:
      icon = null;
  }

  if (!icon) return null;

  return (
    <div className="nc-watermark" style={{ color }}>
      {icon}
    </div>
  );
};

export default function App() {
  // --- STATE ---
  const queryParams = new URLSearchParams(window.location.search);
  const pUid = queryParams.get('p') || null;

  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = loading
  type UserStats = Record<string, string>;
  const [userKUI, setUserKUI] = useState<UserStats>({});
  const [publicProfileId] = useState<string | null>(pUid);
  const isReadOnly = publicProfileId !== null && (user ? publicProfileId !== user!.uid : true);
  const targetUid = publicProfileId || user?.uid;
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [publicDisplayName, setPublicDisplayName] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [customTags, setCustomTags] = useState<CustomTag[]>([]);
  const [inventory, setInventory] = useState<Inventory>({ tickets: 0, gold: 0, gems: 0, dust0: 0, dust1: 0, dust2: 0, dust3: 0, dust4: 0, bits: 0, tradeLicense: 0, workPermit: 0 });
  const [activeMode, setActiveMode] = useState<'collection' | 'gameplay'>(() => {
    const saved = localStorage.getItem('cartoteca:activeMode');
    return (saved === 'collection' || saved === 'gameplay') ? saved : 'collection';
  });
  const [activeTab, setActiveTab] = useState<string>(() => {
    const savedTab = localStorage.getItem('cartoteca:activeTab');
    const savedMode = localStorage.getItem('cartoteca:activeMode') || 'collection';
    if (savedMode === 'gameplay') {
      return (savedTab === 'kui-stats' || savedTab === 'workers' || savedTab === 'inventory') ? savedTab : 'kui-stats';
    } else {
      return (savedTab === 'collection' || savedTab === 'wishlist' || savedTab === 'stats' || savedTab === 'tags-manager') ? savedTab : 'collection';
    }
  });
  const [tabIndicatorStyle, setTabIndicatorStyle] = useState<{ left: number; width: number; opacity: number }>({ left: 0, width: 0, opacity: 0 });
  const tabRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  const handleModeChange = (mode: 'collection' | 'gameplay') => {
    setActiveMode(mode);
    localStorage.setItem('cartoteca:activeMode', mode);
    const targetTab = mode === 'collection' ? 'collection' : 'kui-stats';
    setActiveTab(targetTab);
    localStorage.setItem('cartoteca:activeTab', targetTab);
    setSelectedCards(new Set());
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    localStorage.setItem('cartoteca:activeTab', tab);
    setSelectedCards(new Set());
  };

  useEffect(() => {
    const updateIndicator = () => {
      const activeEl = tabRefs.current[activeTab];
      if (activeEl) {
        setTabIndicatorStyle({
          left: activeEl.offsetLeft,
          width: activeEl.offsetWidth,
          opacity: 1
        });
      }
    };
    updateIndicator();
    // A small delay ensures font/layout shifts are settled
    setTimeout(updateIndicator, 50);
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [activeTab, user]);
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCondition, setSelectedCondition] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [sortOption, setSortOption] = useState('recent');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCondition, selectedTag, sortOption, activeTab]);
  
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
  const [isCommandModalOpen, setIsCommandModalOpen] = useState(false);
  const [isBurnResolveModalOpen, setIsBurnResolveModalOpen] = useState(false);
  const [burnDiscordText, setBurnDiscordText] = useState('');
  const [commandType, setCommandType] = useState('mt');
  const [commandArg, setCommandArg] = useState('');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Batch Input Modals
  const [isBatchKiwiModalOpen, setIsBatchKiwiModalOpen] = useState(false);
  const [batchKiwiText, setBatchKiwiText] = useState('');
  const [batchKiwiFeedback, setBatchKiwiFeedback] = useState({ text: '', isError: false, isSuccess: false });
  const [isBatchImageModalOpen, setIsBatchImageModalOpen] = useState(false);
  const [batchImageText, setBatchImageText] = useState('');
  const [batchImageFeedback, setBatchImageFeedback] = useState({ text: '', isError: false, isSuccess: false });
  const [quickImageMode, setQuickImageMode] = useState(false);
  const [quickImageIndex, setQuickImageIndex] = useState(0);
  // Custom Confirm Modal State
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }>({ isOpen: false, message: '', onConfirm: () => {}, onCancel: () => {} });

  const [kuiInputText, setKuiInputText] = useState('');
  const [kuiFeedback, setKuiFeedback] = useState({ text: '', isError: false, isSuccess: false });
  const [invPasteText, setInvPasteText] = useState('');
  const [invParseFeedback, setInvParseFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  const customConfirm = (message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        message,
        onConfirm: () => {
          setConfirmState(prev => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setConfirmState(prev => ({ ...prev, isOpen: false }));
          resolve(false);
        }
      });
    });
  };

  // Worker Optimizer State
  const [workerSlotIds, setWorkerSlotIds] = useState<(string | null)[]>([null, null, null]);
  const [nodeMultiplier, setNodeMultiplier] = useState<number>(1.15);

  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkImportFeedback, setBulkImportFeedback] = useState({ text: '', isError: false, isSuccess: false });
  
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
  const [fImageUrl, setFImageUrl] = useState('');
  const [cardSelectedTags, setCardSelectedTags] = useState<string[]>([]);
  const [fStats, setFStats] = useState<Card['stats'] | undefined>(undefined);

  // Parser text area
  const [discordText, setDiscordText] = useState('');
  const [parserFeedback, setParserFeedback] = useState({ text: 'Siap memproses teks', isError: false, isSuccess: false });
  const [effortDiscordText, setEffortDiscordText] = useState('');
  const [effortParserFeedback, setEffortParserFeedback] = useState({ text: 'Siap memproses teks', isError: false, isSuccess: false });

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
      return db && db.app && db.app.options.projectId && db.app.options.projectId !== "YOUR_PROJECT_ID";
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

      if (firebaseUser) {
        const username = firebaseUser.email?.replace('@cartoteca.app', '') || 'Pengguna';
        setDoc(doc(db, 'users', firebaseUser.uid), { displayName: username }, { merge: true })
          .catch(err => console.error("Gagal sinkronisasi nama profil ke Firestore:", err));
      }
    });
    return () => unsubAuth();
  }, []);

  // --- DATA LOADING & PERSISTENCE ---
  useEffect(() => {
    if (!targetUid) return;

    if (isFirebaseConfigured()) {
      console.log('Firebase configured. Setting up real-time listeners for target:', targetUid);

      let unsubProfile: (() => void) | undefined;
      let unsubCards: (() => void) | undefined;
      let unsubWishlist: (() => void) | undefined;
      let unsubTags: (() => void) | undefined;
      let unsubInventory: (() => void) | undefined;

      try {
        // Profile Info
        unsubProfile = onSnapshot(doc(db, 'users', targetUid), (profileSnap) => {
          if (profileSnap.exists()) {
            setPublicDisplayName(profileSnap.data().displayName || null);
            setUserKUI(profileSnap.data().kuiStats || {});
          } else {
            setPublicDisplayName(null);
            setUserKUI({});
          }
        }, (error) => {
          console.error("Profile listener error:", error);
        });

        // Cards
        unsubCards = onSnapshot(collection(db, 'users', targetUid as string, 'cards'), (cardsSnap) => {
          const cList: Card[] = [];
          cardsSnap.forEach((d) => cList.push({ id: d.id, ...d.data() } as Card));
          setCards(cList);
          if (!isReadOnly) syncLocal('cards', cList);
        }, (error) => {
          console.error("Cards listener error:", error);
        });

        // Wishlist
        unsubWishlist = onSnapshot(collection(db, 'users', targetUid as string, 'wishlist'), (wishSnap) => {
          const wList: WishlistItem[] = [];
          wishSnap.forEach((d) => wList.push({ id: d.id, ...d.data() } as WishlistItem));
          setWishlist(wList);
          if (!isReadOnly) syncLocal('wishlist', wList);
        }, (error) => {
          console.error("Wishlist listener error:", error);
        });

        // Tags
        unsubTags = onSnapshot(collection(db, 'users', targetUid as string, 'tags'), (tagsSnap) => {
          const tList: CustomTag[] = [];
          tagsSnap.forEach((d) => tList.push(d.data() as CustomTag));
          if (tList.length > 0) {
            setCustomTags(tList);
            if (!isReadOnly) syncLocal('tags', tList);
          } else {
            setCustomTags(getDefaultTags());
          }
        }, (error) => {
          console.error("Tags listener error:", error);
        });

        // Inventory
        unsubInventory = onSnapshot(doc(db, 'users', targetUid as string, 'inventory', 'main'), (invSnap) => {
          if (invSnap.exists()) {
            setInventory(invSnap.data() as Inventory);
            if (!isReadOnly) syncLocal('inv', invSnap.data());
          } else {
            setInventory({ tickets: 0, gold: 0, gems: 0, dust0: 0, dust1: 0, dust2: 0, dust3: 0, dust4: 0, bits: 0, tradeLicense: 0, workPermit: 0 });
          }
        }, (error) => {
          console.error("Inventory listener error:", error);
        });

      } catch (error: any) {
        console.error("Firebase setup error:", error);
        alert("Peringatan: Gagal memuat data dari Cloud (" + error.message + "). Memuat data dari cache lokal.");
        // Fallback if network blocked
        const savedCards = localStorage.getItem(`cartoteca:${targetUid}:cards`);
        if (savedCards) setCards(JSON.parse(savedCards));
      }

      return () => {
        if (unsubProfile) unsubProfile();
        if (unsubCards) unsubCards();
        if (unsubWishlist) unsubWishlist();
        if (unsubTags) unsubTags();
        if (unsubInventory) unsubInventory();
      };
    } else {
      console.log('Using LocalStorage fallback.');
      setPublicDisplayName(null);
      const uid = targetUid;
      const savedKUI = localStorage.getItem(`cartoteca:${uid}:kui`);
      if (savedKUI) setUserKUI(JSON.parse(savedKUI));
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
  }, [user, targetUid, isReadOnly]);

  useEffect(() => {
    if (!user) return;

    const w = localStorage.getItem(`cartoteca:${user!.uid}:workers`);
    if (w) setWorkerSlotIds(JSON.parse(w));
    const m = localStorage.getItem(`cartoteca:${user!.uid}:nodemult`);
    if (m) setNodeMultiplier(parseFloat(m));
  }, [user]);

  const handleSetWorker = (index: number, cardId: string | null) => {
    if (!user) return;
    const newSlots = [...workerSlotIds];
    newSlots[index] = cardId;
    setWorkerSlotIds(newSlots);
    localStorage.setItem(`cartoteca:${user!.uid}:workers`, JSON.stringify(newSlots));
  };

  const handleSetNodeMultiplier = (val: number) => {
    if (!user) return;
    setNodeMultiplier(val);
    localStorage.setItem(`cartoteca:${user!.uid}:nodemult`, val.toString());
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
      localStorage.setItem(`cartoteca:${user!.uid}:${key}`, JSON.stringify(data));
    }
  };

  const handleUpdateInventory = async (newInv: Inventory) => {
    setInventory(newInv);
    if (isFirebaseConfigured() && user) {
      await setDoc(doc(db, 'users', user!.uid, 'inventory', 'main'), newInv, { merge: true });
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

    const cleanBulkText = bulkText.replace(/^Owned by .*$/gim, '');
    const lines = cleanBulkText.trim().split('\n');
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

        const cond = mapConditionString(s);
        if (cond) { pCondition = cond; return; }

        if (s.match(/^[★☆]+$/)) return; // Ignore star ratings if they get separated and not matched above

        const effM = s.match(/(\d+)\s*(?:eff|effort)/i) || s.match(/(?:eff|effort)\s*(\d+)/i) || s.match(/[✧✦]\s*(\d+)/);
        if (effM) { pEffort = parseInt(effM[1]); return; }

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
      
      // Filter out purely decorative strings like ★★☆☆
      const validUnassigned = unassigned.filter(u => !u.match(/^[★☆]+$/));

      if (validUnassigned.length >= 2) {
        // First is Series, Second is Character (Based on standard Karuta k!c format: Series · Character)
        pSeries = validUnassigned[0];
        pName = validUnassigned.slice(1).join(' ').trim();
      } else if (validUnassigned.length === 1) {
        pName = validUnassigned[0];
      }

      if (pCode && pName && pName !== 'Unknown Character') {
        const isDuplicateInBinder = cards.some(c => c.code && c.code.toLowerCase() === pCode.toLowerCase());
        const isDuplicateInBatch = newCards.some(c => c.code && c.code.toLowerCase() === pCode.toLowerCase());
        
        if (!isDuplicateInBinder && !isDuplicateInBatch) {
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
    }

    if (newCards.length === 0) {
      setBulkImportFeedback({ text: "❌ Tidak ada kartu valid yang terdeteksi dari teks yang Anda masukkan.", isError: true, isSuccess: false });
      return;
    }

    setBulkImportFeedback({ text: `Memproses ${newCards.length} kartu... Mohon tunggu.`, isError: false, isSuccess: false });

    const mergedCards = [...cards, ...newCards];
    setCards(mergedCards);
    syncLocal('cards', mergedCards);

    if (isFirebaseConfigured() && user) {
      try {
        const syncChunks = async (items: Card[]) => {
          for (let i = 0; i < items.length; i += 400) {
            const chunk = items.slice(i, i + 400);
            const batch = writeBatch(db);
            for (const item of chunk) {
              batch.set(doc(db, 'users', user!.uid, 'cards', item.id), item);
            }
            await batch.commit();
          }
        };
        await syncChunks(newCards);
        setBulkImportFeedback({ text: `✅ ${successCount} kartu berhasil diimpor & sinkron ke Cloud! Halaman akan dimuat ulang.`, isError: false, isSuccess: true });
      } catch (err: any) {
        setBulkImportFeedback({ text: `⚠️ Sebagian kartu belum tersinkron ke cloud: ${err.message}`, isError: true, isSuccess: false });
      }
    } else {
      setBulkImportFeedback({ text: `✅ ${successCount} kartu berhasil diimpor ke aplikasi!`, isError: false, isSuccess: true });
    }

    setTimeout(() => {
      setIsBulkImportModalOpen(false);
      setBulkText('');
      setBulkImportFeedback({ text: '', isError: false, isSuccess: false });
    }, 2500);
  }

  // --- BATCH KIWI PARSER ---
  async function handleBatchKiwiParse() {
    if (!batchKiwiText.trim()) return;

    const cleanText = batchKiwiText.replace(/^Owned by .*$/gim, '').trim();
    const blocks = cleanText.split(/Worker Details/i).map(b => b.trim()).filter(Boolean);
    
    let updatedCount = 0;
    let notFoundCount = 0;
    let newCardsArray = [...cards];
    const updatedCardsToSync: Card[] = [];

    blocks.forEach(block => {
      let parsedCode = '';
      const charM = block.match(/(?:Character|Karakter)\s*[·:]\s*.+?\s*\(([a-zA-Z0-9]+)\)/i);
      if (charM) {
        parsedCode = charM[1].toLowerCase();
      } else {
        const bracketCodeM = block.match(/\(([a-zA-Z0-9]{5,8})\)/);
        if (bracketCodeM) {
          parsedCode = bracketCodeM[1].toLowerCase();
        }
      }

      if (!parsedCode) return;

      const getStat = (name: string) => {
        const m2 = block.match(new RegExp(`(?:\\d+\\s*)?\\(([A-S])\\)\\s*${name}`, 'i'));
        if (m2) return m2[1].toUpperCase();
        
        const m3 = block.match(new RegExp(`${name}\\s*:\\s*([A-S])`, 'i'));
        if (m3) return m3[1].toUpperCase();

        return undefined;
      };

      const parsedPurity = getStat('Purity');
      const parsedWellness = getStat('Wellness');
      const parsedToughness = getStat('Toughness');
      const parsedQuickness = getStat('Quickness');
      const parsedStyle = getStat('Style');
      const parsedAppeal = getStat('Appeal');
      const parsedGrabber = getStat('Grabber');
      const parsedDropper = getStat('Dropper');
      const parsedVanity = getStat('Vanity');
      
      const effM = block.match(/(?:Effort|Eff)\s*[·:-]\s*(\d+)/i);
      const parsedEffort = effM ? parseInt(effM[1]) : undefined;

      const cardIndex = newCardsArray.findIndex(c => c.code?.toLowerCase() === parsedCode);
      if (cardIndex > -1) {
        const card = newCardsArray[cardIndex];
        const newStats = {
          purity: parsedPurity || card.stats?.purity || '',
          wellness: parsedWellness || card.stats?.wellness || '',
          toughness: parsedToughness || card.stats?.toughness || '',
          quickness: parsedQuickness || card.stats?.quickness || '',
          style: parsedStyle || card.stats?.style || '',
          appeal: parsedAppeal || card.stats?.appeal || '',
          grabber: parsedGrabber || card.stats?.grabber || '',
          dropper: parsedDropper || card.stats?.dropper || '',
          vanity: parsedVanity || card.stats?.vanity || '',
        };

        const isWorker = checkWorkerIndicator(newStats, parsedEffort !== undefined ? parsedEffort : card.effort || null);

        newCardsArray[cardIndex] = {
          ...card,
          stats: newStats,
          effort: parsedEffort !== undefined ? parsedEffort : card.effort,
          isWorker
        };
        updatedCardsToSync.push(newCardsArray[cardIndex]);
        updatedCount++;
      } else {
        notFoundCount++;
      }
    });

    if (updatedCount > 0) {
      setCards(newCardsArray);
      syncLocal('cards', newCardsArray);

      if (isFirebaseConfigured() && user) {
        const batch = writeBatch(db);
        for (const card of updatedCardsToSync) {
          batch.update(doc(db, 'users', user!.uid, 'cards', card.id), {
            stats: card.stats,
            effort: card.effort,
            isWorker: card.isWorker
          });
        }
        await batch.commit();
      }
      
      setBatchKiwiFeedback({ text: `✅ Berhasil update ${updatedCount} kartu! (${notFoundCount} kartu tidak ditemukan)`, isError: false, isSuccess: true });
      setTimeout(() => {
        setIsBatchKiwiModalOpen(false);
        setBatchKiwiText('');
        setBatchKiwiFeedback({ text: '', isError: false, isSuccess: false });
      }, 3000);
    } else {
      setBatchKiwiFeedback({ text: `⚠️ Tidak ada kartu yang berhasil dicocokkan. Pastikan teks k!wi memuat (kode_kartu).`, isError: true, isSuccess: false });
    }
  }

  // --- BATCH IMAGE URL PARSER ---
  async function handleBatchImageUpdate() {
    if (!batchImageText.trim()) return;
    const lines = batchImageText.trim().split('\n');
    let updatedCount = 0;
    let newCardsArray = [...cards];
    const updatedCardsToSync: Card[] = [];

    lines.forEach(line => {
      const parts = line.split('|');
      if (parts.length >= 2) {
        const code = parts[0].trim().toLowerCase();
        const url = parts.slice(1).join('|').trim();
        if (code && url) {
          const cardIndex = newCardsArray.findIndex(c => c.code?.toLowerCase() === code);
          if (cardIndex > -1) {
            newCardsArray[cardIndex] = { ...newCardsArray[cardIndex], imageUrl: url };
            updatedCardsToSync.push(newCardsArray[cardIndex]);
            updatedCount++;
          }
        }
      }
    });

    if (updatedCount > 0) {
      setCards(newCardsArray);
      syncLocal('cards', newCardsArray);

      if (isFirebaseConfigured() && user) {
        const batch = writeBatch(db);
        for (const card of updatedCardsToSync) {
          batch.update(doc(db, 'users', user!.uid, 'cards', card.id), {
            imageUrl: card.imageUrl
          });
        }
        await batch.commit();
      }
      
      setBatchImageFeedback({ text: `✅ Berhasil update gambar ${updatedCount} kartu!`, isError: false, isSuccess: true });
      setTimeout(() => {
        setIsBatchImageModalOpen(false);
        setBatchImageText('');
        setBatchImageFeedback({ text: '', isError: false, isSuccess: false });
      }, 3000);
    } else {
      setBatchImageFeedback({ text: `⚠️ Tidak ada kode kartu yang cocok atau format salah.`, isError: true, isSuccess: false });
    }
  }

  async function handleQuickImageSave(url: string, cardId: string) {
    if (!url.trim()) return;
    let newCardsArray = [...cards];
    const cardIndex = newCardsArray.findIndex(c => c.id === cardId);
    if (cardIndex > -1) {
      const updatedCard = { ...newCardsArray[cardIndex], imageUrl: url.trim() };
      newCardsArray[cardIndex] = updatedCard;
      setCards(newCardsArray);
      syncLocal('cards', newCardsArray);

      if (isFirebaseConfigured() && user) {
        const { updateDoc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'users', user!.uid, 'cards', cardId), { imageUrl: url.trim() });
      }
      // Move to next card
      setBatchImageText(''); // clear input
      setQuickImageIndex(prev => prev + 1);
    }
  }

  // --- KUI PARSER ---
  // Real k!ui format: "NUMBER · Label" (number is on the LEFT)
  // Parser must use Label as key, NUMBER as value.
  const handleKUIParse = async () => {
    if (!kuiInputText.trim()) return;
    const lines = kuiInputText.split('\n');
    const newKUI: Record<string, string> = {};

    lines.forEach(line => {
      // Clean brackets, asterisks, underscores, backticks, tildes
      let cleanLine = line.replace(/[\*\_`~\[\]]/g, '').trim();
      
      // Match key-value separated by middle dot (·), dash (-), or colon (:)
      const sepMatch = cleanLine.match(/^(.*?)\s*[\u00b7\-\:]\s*(.*)$/);
      if (sepMatch) {
        const left = sepMatch[1].trim();
        const right = sepMatch[2].trim();
        
        // Find digit sequences
        const leftNumMatch = left.match(/\b\d+(?:,\d+)*\b/);
        const rightNumMatch = right.match(/\b\d+(?:,\d+)*\b/);
        
        if (leftNumMatch && !rightNumMatch) {
          const val = leftNumMatch[0].replace(/,/g, '');
          const label = right;
          newKUI[label] = val;
        } else if (rightNumMatch && !leftNumMatch) {
          const val = rightNumMatch[0].replace(/,/g, '');
          const label = left.replace(/^[\p{Emoji}\s]+/u, '').trim();
          newKUI[label] = val;
        } else if (leftNumMatch && rightNumMatch) {
          const val = leftNumMatch[0].replace(/,/g, '');
          const label = right;
          newKUI[label] = val;
        }
      } else {
        // Fallback for space-separated format (e.g. "52 Cards burned" or "Cards burned 52")
        const leftNumMatch = cleanLine.match(/^\s*(\d+(?:,\d+)*)\s+(.+)$/);
        const rightNumMatch = cleanLine.match(/^(.+?)\s+(\d+(?:,\d+)*)\s*$/);
        
        if (leftNumMatch) {
          const val = leftNumMatch[1].replace(/,/g, '');
          const label = leftNumMatch[2].trim();
          newKUI[label] = val;
        } else if (rightNumMatch) {
          const val = rightNumMatch[2].replace(/,/g, '');
          const label = rightNumMatch[1].replace(/^[\p{Emoji}\s]+/u, '').trim();
          newKUI[label] = val;
        }
      }
    });

    if (Object.keys(newKUI).length > 0) {
      setUserKUI(prev => {
        const merged = { ...prev, ...newKUI };
        syncLocal('kui', merged);
        if (isFirebaseConfigured() && user) {
          import('firebase/firestore').then(({ updateDoc }) => {
            updateDoc(doc(db, 'users', user.uid), { kuiStats: merged });
          });
        }
        return merged;
      });

      setKuiFeedback({ text: `✅ Berhasil import ${Object.keys(newKUI).length} stat KUI!`, isError: false, isSuccess: true });
      setTimeout(() => {
        setKuiInputText('');
        setKuiFeedback({ text: '', isError: false, isSuccess: false });
      }, 3000);
    } else {
      setKuiFeedback({ text: '⚠️ Tidak ada data KUI yang valid. Salin semua teks dari balasan k!ui Karuta.', isError: true, isSuccess: false });
    }
  };

  const updateFStat = (key: keyof NonNullable<Card['stats']>, value: string) => {
    setFStats(prev => ({
      ...(prev || { toughness: '', quickness: '', purity: '', style: '', wellness: '', appeal: '', grabber: '', dropper: '', vanity: '' }),
      [key]: value
    }));
  };

  function handleParseText() {
    if (!discordText.trim()) {
      setParserFeedback({ text: '❌ Teks kosong. Silakan paste teks info Discord.', isError: true, isSuccess: false });
      return;
    }

    const cleanText = discordText
      .replace(/^Owned by .*$/gim, '')
      .replace(/[\*_`~▫▪●○]/g, '')
      .trim();

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

    let parsedPurity = '';
    let parsedWellness = '';
    let parsedToughness = '';
    let parsedQuickness = '';
    let parsedStyle = '';
    let parsedAppeal = '';
    let parsedGrabber = '';
    let parsedDropper = '';
    let parsedVanity = '';

    lines.forEach(line => {
      const charM = line.match(/(?:Character|Karakter)\s*·?\s*(.+?)(?:\s*\([a-zA-Z0-9]+\))?$|Character\s*:\s*(.+)/i);
      const seriesM = line.match(/(?:Series|Anime|Show)\s*·?\s*(.+?)(?:\s*\([a-zA-Z0-9]+\))?$|Series\s*:\s*(.+)/i);
      const charFallbackM = line.match(/Character\s*·?\s*(.+?)\s*\(\s*([a-zA-Z0-9]+)\s*\)/i);
      if (charFallbackM && !parsedCode) parsedCode = charFallbackM[2].toLowerCase();

      const codeM = line.match(/(?:Code|Kode)\s*:\s*([a-zA-Z0-9]{5,6})/i);
      const printM = line.match(/(?:Print|Nomor)\s*:\s*#?(\d+)/i);
      const edM = line.match(/(?:Edition|Edisi|Ed)\s*:\s*◈?(\d+)/i);
      const condM = line.match(/(?:Condition|Kondisi|Rating)\s*:\s*[·•]?\s*([a-zA-Z★☆]+)/i);
      const effM = line.match(/(?:Effort|Eff)\s*[·:-]?\s*(\d+)/i);
      const wishM = line.match(/(?:Wishlisted|Wishlists|Wishlist|Wish)\s*[:·-]?\s*([\d,.]+)/i);

      // Support both Keqing `Purity: A` and Karuta `1 (S) Purity` formats
      const purM = line.match(/(?:Purity)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Purity/i);
      const wellM = line.match(/(?:Wellness)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Wellness/i);
      const toughM = line.match(/(?:Toughness)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Toughness/i);
      const quickM = line.match(/(?:Quickness)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Quickness/i);
      const styleM = line.match(/(?:Style)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Style/i);
      const appealM = line.match(/(?:Appeal)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Appeal/i);
      const grabM = line.match(/(?:Grabber)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Grabber/i);
      const dropM = line.match(/(?:Dropper)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Dropper/i);
      const vanM = line.match(/(?:Vanity)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Vanity/i);

      if (charM) { parsedName = (charFallbackM ? charFallbackM[1] : (charM[1] || charM[2])).trim(); hasLabelMatch = true; }
      if (seriesM) { parsedSeries = (seriesM[1] || seriesM[2]).trim(); hasLabelMatch = true; }
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

      if (purM) { parsedPurity = purM[1].toUpperCase(); hasLabelMatch = true; }
      if (wellM) { parsedWellness = wellM[1].toUpperCase(); hasLabelMatch = true; }
      if (toughM) { parsedToughness = toughM[1].toUpperCase(); hasLabelMatch = true; }
      if (quickM) { parsedQuickness = quickM[1].toUpperCase(); hasLabelMatch = true; }
      if (styleM) { parsedStyle = styleM[1].toUpperCase(); hasLabelMatch = true; }
      if (appealM) { parsedAppeal = appealM[1].toUpperCase(); hasLabelMatch = true; }
      if (grabM) { parsedGrabber = grabM[1].toUpperCase(); hasLabelMatch = true; }
      if (dropM) { parsedDropper = dropM[1].toUpperCase(); hasLabelMatch = true; }
      if (vanM) { parsedVanity = vanM[1].toUpperCase(); hasLabelMatch = true; }
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

          const wishM = s.match(/(\d+)\s*(?:wishlisted|wishlist|wish)/i) || s.match(/(?:wishlisted|wishlist|wish)\s*[:·-]?\s*([\d,.]+)/i);
          if (wishM) {
            parsedWish = parseInt((wishM[1] || wishM[2]).replace(/[,.]/g, ''));
            return;
          }

          if (s.toLowerCase().startsWith('kd ') || s.toLowerCase().startsWith('kinfo ') || s.toLowerCase().startsWith('kv ')) {
            const part = s.split(' ')[1];
            if (part && part.length >= 5) parsedCode = part.toLowerCase();
            return;
          }

          unassigned.push(s);
        });

        const validUnassigned = unassigned.filter(u => !u.match(/^[★☆]+$/));
        if (validUnassigned.length >= 2) {
          parsedSeries = validUnassigned[0];
          parsedName = validUnassigned.slice(1).join(' ').trim();
        } else if (validUnassigned.length === 1) {
          parsedName = validUnassigned[0];
        }
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

      if (parsedPurity || parsedWellness || parsedToughness || parsedQuickness || parsedStyle || parsedAppeal || parsedGrabber || parsedDropper || parsedVanity) {
        setFStats(prev => ({
          ...(prev || { toughness: '', quickness: '', purity: '', style: '', wellness: '', appeal: '', grabber: '', dropper: '', vanity: '' }),
          ...(parsedPurity && { purity: parsedPurity }),
          ...(parsedWellness && { wellness: parsedWellness }),
          ...(parsedToughness && { toughness: parsedToughness }),
          ...(parsedQuickness && { quickness: parsedQuickness }),
          ...(parsedStyle && { style: parsedStyle }),
          ...(parsedAppeal && { appeal: parsedAppeal }),
          ...(parsedGrabber && { grabber: parsedGrabber }),
          ...(parsedDropper && { dropper: parsedDropper }),
          ...(parsedVanity && { vanity: parsedVanity })
        }));
      }

      setParserFeedback({ text: '✅ Info kartu berhasil diparse!', isError: false, isSuccess: true });
    } else {
      setParserFeedback({ text: '❌ Tidak dapat menemukan nama karakter atau kode kartu. Pastikan format teks benar.', isError: true, isSuccess: false });
    }
  }

  const checkWorkerIndicator = (stats: any, effort: number | null) => {
    if (effort !== null && effort > 250) return true;
    if (!stats) return false;
    
    let highGrades = 0;
    const keyStats = [stats.purity, stats.wellness, stats.toughness, stats.quickness];
    keyStats.forEach(grade => {
      if (grade === 'S' || grade === 'A') highGrades++;
    });
    
    if (stats.purity === 'S' && highGrades >= 3) return true;
    
    return false;
  };

  function handleParseEffortText() {
    if (!effortDiscordText.trim()) {
      setEffortParserFeedback({ text: '❌ Teks kosong.', isError: true, isSuccess: false });
      return;
    }

    const cleanText = effortDiscordText
      .replace(/^Owned by .*$/gim, '')
      .replace(/[\*_`~▫▪●○]/g, '')
      .trim();
    const lines = cleanText.split('\n');
    let hasMatch = false;

    let parsedPurity = '';
    let parsedWellness = '';
    let parsedToughness = '';
    let parsedQuickness = '';
    let parsedStyle = '';
    let parsedAppeal = '';
    let parsedGrabber = '';
    let parsedDropper = '';
    let parsedVanity = '';
    let parsedEffort: number | null = null;
    let parsedName = '';
    let parsedCode = '';

    lines.forEach(line => {
      const charFallbackM = line.match(/Character\s*[·:]?\s*(.+?)(?:\s*\(\s*([a-zA-Z0-9]+)\s*\))?/i);
      const effM = line.match(/(?:Effort|Eff)\s*[·:]\s*(\d+)/i);

      const purM = line.match(/(?:Purity)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Purity/i);
      const wellM = line.match(/(?:Wellness)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Wellness/i);
      const toughM = line.match(/(?:Toughness)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Toughness/i);
      const quickM = line.match(/(?:Quickness)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Quickness/i);
      const styleM = line.match(/(?:Style)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Style/i);
      const appealM = line.match(/(?:Appeal)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Appeal/i);
      const grabM = line.match(/(?:Grabber)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Grabber/i);
      const dropM = line.match(/(?:Dropper)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Dropper/i);
      const vanM = line.match(/(?:Vanity)\s*:\s*([a-zA-Z0-9]+)/i) || line.match(/\((.*?)\)\s*Vanity/i);

      if (charFallbackM) { parsedName = charFallbackM[1].trim(); if (charFallbackM[2]) parsedCode = charFallbackM[2].toLowerCase(); hasMatch = true; }
      if (effM) { parsedEffort = parseInt(effM[1]); hasMatch = true; }
      
      if (purM) { parsedPurity = purM[1].toUpperCase(); hasMatch = true; }
      if (wellM) { parsedWellness = wellM[1].toUpperCase(); hasMatch = true; }
      if (toughM) { parsedToughness = toughM[1].toUpperCase(); hasMatch = true; }
      if (quickM) { parsedQuickness = quickM[1].toUpperCase(); hasMatch = true; }
      if (styleM) { parsedStyle = styleM[1].toUpperCase(); hasMatch = true; }
      if (appealM) { parsedAppeal = appealM[1].toUpperCase(); hasMatch = true; }
      if (grabM) { parsedGrabber = grabM[1].toUpperCase(); hasMatch = true; }
      if (dropM) { parsedDropper = dropM[1].toUpperCase(); hasMatch = true; }
      if (vanM) { parsedVanity = vanM[1].toUpperCase(); hasMatch = true; }
    });

    if (hasMatch) {
      if (parsedName && !fName) setFName(parsedName);
      if (parsedCode && !fCode) setFCode(parsedCode);
      if (parsedEffort !== null) setFEffort(parsedEffort);

      if (parsedPurity || parsedWellness || parsedToughness || parsedQuickness || parsedStyle || parsedAppeal || parsedGrabber || parsedDropper || parsedVanity) {
        const statsObj = {
          purity: parsedPurity, wellness: parsedWellness, toughness: parsedToughness, quickness: parsedQuickness,
          style: parsedStyle, appeal: parsedAppeal, grabber: parsedGrabber, dropper: parsedDropper, vanity: parsedVanity
        };
        setFStats(prev => ({
          ...(prev || { toughness: '', quickness: '', purity: '', style: '', wellness: '', appeal: '', grabber: '', dropper: '', vanity: '' }),
          ...statsObj
        }));
        setFIsWorker(checkWorkerIndicator(statsObj, parsedEffort));
      } else if (parsedEffort !== null) {
        setFIsWorker(checkWorkerIndicator(null, parsedEffort));
      }
      setEffortParserFeedback({ text: '✅ Status worker berhasil diparse!', isError: false, isSuccess: true });
    } else {
      setEffortParserFeedback({ text: '❌ Tidak dapat menemukan status worker di teks.', isError: true, isSuccess: false });
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
        appeal: getStat('Appeal'),
        grabber: getStat('Grabber'),
        dropper: getStat('Dropper'),
        vanity: getStat('Vanity')
      };
      
      if (Object.values(parsedStats).every(v => v === 'E') && !text.toLowerCase().includes('toughness')) {
        alert("Teks tidak valid! Pastikan Anda meng-copy balasan k!wi (Work Info) dari bot Karuta.");
        return;
      }
      
      setFStats(parsedStats);
      setFIsWorker(checkWorkerIndicator(parsedStats, null));
      alert("Berhasil ekstrak status pekerja k!wi!");
    } catch (e) {
      alert("Gagal membaca clipboard. Mohon izinkan akses di browser atau paste manual lalu gunakan fitur lain.");
    }
  };

  function mapConditionString(str: string): string | null {
    const s = str.replace(/[·•]/g, '').trim().toLowerCase();
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
    setEffortDiscordText('');
    setEffortParserFeedback({ text: 'Tempel teks stat (keqing/k!wi)', isError: false, isSuccess: false });

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
      setFImageUrl(card.imageUrl || '');
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
      setFImageUrl('');
      setFStats(undefined);
      setCardSelectedTags([]);
    }
    setIsCardModalOpen(true);
  }

  async function handleSaveCard() {
    if (!fName.trim()) {
      alert("Nama karakter wajib diisi!");
      return;
    }

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
      imageUrl: fImageUrl,
      stats: fStats,
      priceHistory: currentPriceHistory,
      createdAt: oldCard ? oldCard.createdAt : Date.now()
    };
    
    // Remove undefined values to prevent Firestore crashes
    if (data.stats === undefined) {
      delete data.stats;
    }
    if (data.priceHistory === undefined) {
      delete data.priceHistory;
    }

    let finalId = cardFormId;
    if (isFirebaseConfigured() && user) {
      try {
        if (cardFormId) {
          await updateDoc(doc(db, 'users', user!.uid, 'cards', cardFormId), data);
        } else {
          const docRef = await addDoc(collection(db, 'users', targetUid as string, 'cards'), data);
          finalId = docRef.id;
        }
      } catch (error: any) {
        alert("Gagal menyimpan ke database Firebase: " + error.message);
        return; // Hentikan proses jika gagal
      }
    }

    let updatedCards = [];
    if (finalId) {
      updatedCards = cards.map(c => c.id === finalId ? { ...data, id: finalId } : c);
      // If finalId is from addDoc but it wasn't in cards yet, push it
      if (!cards.some(c => c.id === finalId)) {
        updatedCards.push({ ...data, id: finalId });
      }
    } else {
      const newCard = { ...data, id: 'card-' + Date.now() };
      updatedCards = [...cards, newCard];
    }
    setCards(updatedCards);
    syncLocal('cards', updatedCards);

    setIsCardModalOpen(false);
    setSelectedCards(new Set()); // Reset selections
  }

  async function handleDeleteCard(id: string): Promise<boolean> {
    if (!(await customConfirm('Yakin ingin menghapus kartu ini?'))) return false;

    if (isFirebaseConfigured() && user) {
      await deleteDoc(doc(db, 'users', user!.uid, 'cards', id));
    }
    const updated = cards.filter(c => c.id !== id);
    setCards(updated);
    syncLocal('cards', updated);
    
    // Remove from selected set
    const updatedSelected = new Set(selectedCards);
    updatedSelected.delete(id);
    setSelectedCards(updatedSelected);
    return true;
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

    let finalId = wishFormId;
    if (isFirebaseConfigured() && user) {
      if (wishFormId) {
        await updateDoc(doc(db, 'users', user!.uid, 'wishlist', wishFormId), data);
      } else {
        const docRef = await addDoc(collection(db, 'users', targetUid as string, 'wishlist'), data);
        finalId = docRef.id;
      }
    }

    let updatedWish = [];
    if (finalId) {
      updatedWish = wishlist.map(w => w.id === finalId ? { ...data, id: finalId } : w);
      if (!wishlist.some(w => w.id === finalId)) {
        updatedWish.push({ ...data, id: finalId });
      }
    } else {
      const newWish = { ...data, id: 'wish-' + Date.now() };
      updatedWish = [...wishlist, newWish];
    }
    setWishlist(updatedWish);
    syncLocal('wishlist', updatedWish);

    setIsWishModalOpen(false);
  }

  async function handleDeleteWish(id: string) {
    if (!(await customConfirm('Hapus dari wishlist?'))) return;

    if (isFirebaseConfigured() && user) {
      await deleteDoc(doc(db, 'users', user!.uid, 'wishlist', id));
    }
    const updated = wishlist.filter(w => w.id !== id);
    setWishlist(updated);
    syncLocal('wishlist', updated);
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
      imageUrl: '',
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
      const tagDocRef = doc(db, 'users', user!.uid, 'tags', name);
      const { setDoc } = await import('firebase/firestore');
      await setDoc(tagDocRef, newTag);
    } else {
      setCustomTags(list);
      syncLocal('tags', list);
    }

    setTagNameInput('');
    setTagDescInput('');
  }

  async function handleDeleteCustomTag(name: string) {
    if (!(await customConfirm(`Hapus tag "${name}"? Tag ini juga akan dilepas dari kartu.`))) return;

    // Remove from custom tags config list
    const updatedTags = customTags.filter(t => t.name.toLowerCase() !== name.toLowerCase());
    setCustomTags(updatedTags);
    syncLocal('tags', updatedTags);

    // Strip tags from all cards
    const updatedCards = cards.map(c => {
      if (c.tags) {
        const arr = c.tags.split(',').map(t => t.trim()).filter(t => t.toLowerCase() !== name.toLowerCase());
        c.tags = arr.join(', ');
      }
      return c;
    });
    setCards(updatedCards);
    syncLocal('cards', updatedCards);

    if (isFirebaseConfigured() && user) {
      const tagDocRef = doc(db, 'users', user!.uid, 'tags', name.toLowerCase());
      const { deleteDoc: delDoc } = await import('firebase/firestore');
      await delDoc(tagDocRef);
      // Also update all cards that have this tag
      const batch = writeBatch(db);
      const updatedCardsForFirestore = cards.filter(c =>
        c.tags && c.tags.split(',').map(t => t.trim().toLowerCase()).includes(name.toLowerCase())
      );
      updatedCardsForFirestore.forEach(c => {
        const arr = c.tags!.split(',').map(t => t.trim()).filter(t => t.toLowerCase() !== name.toLowerCase());
        batch.update(doc(db, 'users', user!.uid, 'cards', c.id), { tags: arr.join(', ') });
      });
      await batch.commit();
    }
  }

  async function handleUntagAll(name: string) {
    if (!(await customConfirm(`Lepas tag "${name}" dari semua kartu? (Tag ini sendiri tidak akan dihapus dari daftar)`))) return;

    // Strip tags from all cards
    const updatedCards = cards.map(c => {
      if (c.tags) {
        const arr = c.tags.split(',').map(t => t.trim()).filter(t => t.toLowerCase() !== name.toLowerCase());
        c.tags = arr.join(', ');
      }
      return c;
    });
    setCards(updatedCards);
    syncLocal('cards', updatedCards);

    if (isFirebaseConfigured() && user) {
      const batch = writeBatch(db);
      const updatedCardsForFirestore = cards.filter(c =>
        c.tags && c.tags.split(',').map(t => t.trim().toLowerCase()).includes(name.toLowerCase())
      );
      updatedCardsForFirestore.forEach(c => {
        const arr = c.tags!.split(',').map(t => t.trim()).filter(t => t.toLowerCase() !== name.toLowerCase());
        batch.update(doc(db, 'users', user!.uid, 'cards', c.id), { tags: arr.join(', ') });
      });
      await batch.commit();
    }
  }

  function handleViewTagCollection(name: string) {
    setSearchQuery(name.toLowerCase());
    handleTabChange('collection');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (isReadOnly) {
      const card = cards.find(c => c.id === id);
      if (card?.imageUrl) {
        setLightboxImageUrl(card.imageUrl);
      }
      return;
    }
    toggleSleeveSelect(id, e);
  }

  async function handleBatchDelete() {
    if (!(await customConfirm(`Hapus ${selectedCards.size} kartu terpilih?`))) return;

    if (isFirebaseConfigured() && user) {
      const batch = writeBatch(db);
      selectedCards.forEach(id => {
        batch.delete(doc(db, 'users', user!.uid, 'cards', id));
      });
      await batch.commit();
    }
    const updated = cards.filter(c => !selectedCards.has(c.id));
    setCards(updated);
    syncLocal('cards', updated);
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
          batch.update(doc(db, 'users', user!.uid, 'cards', c.id), { tags: currentTags.join(', ') });
        }
      });
      await batch.commit();
    }
    
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
    syncLocal('cards', updated);

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

    if (await customConfirm('Perhatian: Fitur ini akan menimpa dan menggabungkan data Anda saat ini dengan isi file backup. Proses di cloud (jika aktif) mungkin memakan waktu. Lanjutkan?')) {
      const importedCards = backupFileContent.cards || [];
      const importedWishlist = backupFileContent.wishlist || [];
      const importedTags = backupFileContent.customTags || [];
      const importedInventory = backupFileContent.inventory || { tickets: 0, gold: 0, gems: 0, dust0: 0, dust1: 0, dust2: 0, dust3: 0, dust4: 0, bits: 0, tradeLicense: 0, workPermit: 0 };
      if (importedInventory.dusts !== undefined) {
        importedInventory.dust1 = (importedInventory.dust1 || 0) + importedInventory.dusts;
        delete importedInventory.dusts;
      }

      // Local State & LocalStorage update first for snappy UI
      setCards(importedCards);
      setWishlist(importedWishlist);
      setCustomTags(importedTags);
      setInventory(importedInventory);

      syncLocal('cards', importedCards);
      syncLocal('wishlist', importedWishlist);
      syncLocal('tags', importedTags);
      syncLocal('inv', importedInventory);

      if (isFirebaseConfigured() && user) {
        try {
          alert("Mulai menyinkronkan data ke Cloud Firestore. Jangan tutup aplikasi...");
          
          // Use writeBatch to write in chunks of 400 (limit is 500)
          const syncChunks = async (items: any[], path: string) => {
            for (let i = 0; i < items.length; i += 400) {
              const chunk = items.slice(i, i + 400);
              const batch = writeBatch(db);
              for (const item of chunk) {
                batch.set(doc(db, 'users', user!.uid, path, item.id), item);
              }
              await batch.commit();
            }
          };

          await syncChunks(importedCards, 'cards');
          await syncChunks(importedWishlist, 'wishlist');
          
          const tagBatch = writeBatch(db);
          importedTags.forEach((t: any) => {
            tagBatch.set(doc(db, 'users', user!.uid, 'tags', t.name.toLowerCase()), t);
          });
          tagBatch.set(doc(db, 'users', user!.uid, 'inventory', 'main'), importedInventory);
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
  if (user === null && !publicProfileId) {
    return <LoginPage />;
  }

  // Extract username from email or display public name
  const displayName = publicProfileId && isReadOnly
    ? (publicDisplayName ? `Profil Publik: ${publicDisplayName}` : `Profil Publik: ${publicProfileId.substring(0, 8)}`)
    : (user?.email?.replace('@cartoteca.app', '') || 'Pengguna');

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
          </div>
          <div className="user-menu" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: '#9c8f76' }}>
              👤 {displayName}
            </span>
            {!isReadOnly && (
              <>
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
              </>
            )}
            {isReadOnly && (
              <button
                onClick={() => window.location.href = '/'}
                title="Kembali"
                style={{
                  background: '#5ea396', border: 'none',
                  borderRadius: '6px', padding: '4px 10px',
                  fontFamily: "'IBM Plex Sans', sans-serif", fontSize: '11px',
                  fontWeight: 600, color: '#fff', cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                Kembali ke Koleksi Sendiri
              </button>
            )}
          </div>
        </header>

        {/* MODE SWITCHER */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', background: '#1c1912', padding: '4px', borderRadius: '8px', border: '1px solid #3a3327' }}>
            <button
              onClick={() => handleModeChange('collection')}
              style={{
                padding: '8px 24px', borderRadius: '6px', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', transition: '0.2s',
                background: activeMode === 'collection' ? '#d8923e' : 'transparent',
                color: activeMode === 'collection' ? '#1c1912' : '#9c8f76'
              }}
            >
              🎴 Collection
            </button>
            <button
              onClick={() => handleModeChange('gameplay')}
              style={{
                padding: '8px 24px', borderRadius: '6px', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', transition: '0.2s',
                background: activeMode === 'gameplay' ? '#5ea396' : 'transparent',
                color: activeMode === 'gameplay' ? '#1c1912' : '#9c8f76'
              }}
            >
              🎮 Gameplay
            </button>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <nav className="tabs" style={{ position: 'relative' }}>
          <div className="tab-indicator" style={{
            position: 'absolute',
            top: '6px',
            bottom: '6px',
            left: `${tabIndicatorStyle.left}px`,
            width: `${tabIndicatorStyle.width}px`,
            opacity: tabIndicatorStyle.opacity,
            background: 'var(--stamp)',
            backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 100%)',
            borderRadius: 'var(--border-radius)',
            border: '1px solid var(--stamp-dark)',
            boxShadow: '0 2px 8px rgba(216, 146, 62, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
            transition: 'var(--transition-snappy)',
            zIndex: 1,
            pointerEvents: 'none'
          }}></div>
          {activeMode === 'collection' ? (
            <>
              <button ref={el => tabRefs.current['collection'] = el} className={`tab-btn ${activeTab === 'collection' ? 'active-text' : ''}`} onClick={() => handleTabChange('collection')}>🎴 Binder</button>
              <button ref={el => tabRefs.current['wishlist'] = el} className={`tab-btn ${activeTab === 'wishlist' ? 'active-text' : ''}`} onClick={() => handleTabChange('wishlist')}>✨ Wishlist</button>
              <button ref={el => tabRefs.current['stats'] = el} className={`tab-btn ${activeTab === 'stats' ? 'active-text' : ''}`} onClick={() => handleTabChange('stats')}>📈 Statistik</button>
              {!isReadOnly && <button ref={el => tabRefs.current['tags-manager'] = el} className={`tab-btn ${activeTab === 'tags-manager' ? 'active-text' : ''}`} onClick={() => handleTabChange('tags-manager')}>🏷️ Kelola Tag</button>}
            </>
          ) : (
            <>
              <button ref={el => tabRefs.current['kui-stats'] = el} className={`tab-btn ${activeTab === 'kui-stats' ? 'active-text' : ''}`} onClick={() => handleTabChange('kui-stats')}>📊 KUI Dashboard</button>
              <button ref={el => tabRefs.current['workers'] = el} className={`tab-btn ${activeTab === 'workers' ? 'active-text' : ''}`} onClick={() => handleTabChange('workers')}>💼 Job Board</button>
              {!isReadOnly && <button ref={el => tabRefs.current['inventory'] = el} className={`tab-btn ${activeTab === 'inventory' ? 'active-text' : ''}`} onClick={() => handleTabChange('inventory')}>🎒 Inventory</button>}
            </>
          )}
        </nav>

        {/* MAIN BODY AREA */}
        <main className="content-area">
          
          {/* TAB: KUI DASHBOARD */}
          {activeTab === 'kui-stats' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {Object.keys(userKUI).length > 0 ? (
                <>
                  {/* Section: Cards */}
                  {(userKUI['Cards dropped'] || userKUI['Cards grabbed'] || userKUI['Cards burned']) && (
                    <div style={{ background: '#1c1912', border: '1px solid #3a3327', borderRadius: '8px', padding: '20px' }}>
                      <div style={{ fontSize: '11px', color: '#d8923e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px' }}>🎴 Cards</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
                        {[['Cards dropped', '📥 Dropped'], ['Cards grabbed', '🤲 Grabbed'], ['Cards burned', '🔥 Burned'],
                          ['Cards given', '🎁 Given'], ['Successful card upgrades', '⬆️ Upgrades OK'], ['Failed card upgrades', '❌ Upgrades Fail']].map(([k, label]) =>
                          userKUI[k] ? (
                            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ fontSize: '10px', color: '#9c8f76', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
                              <div style={{ fontSize: '22px', color: '#e8dbce', fontWeight: 'bold', fontFamily: 'monospace' }}>{Number(userKUI[k]).toLocaleString()}</div>
                            </div>
                          ) : null
                        )}
                      </div>
                    </div>
                  )}

                  {/* Section: Fights & Trades */}
                  {(userKUI['Fights won'] || userKUI['Total fights won'] || userKUI['Fights lost'] || userKUI['Trades completed']) && (
                    <div style={{ background: '#1c1912', border: '1px solid #3a3327', borderRadius: '8px', padding: '20px' }}>
                      <div style={{ fontSize: '11px', color: '#5ea396', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px' }}>⚔️ Fights & Trades</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
                        {[
                          [userKUI['Fights won'] || userKUI['Total fights won'], '🏆 Fights Won'],
                          [userKUI['Fights lost'] || userKUI['Total fights lost'], '💀 Fights Lost'],
                          [userKUI['Trades completed'], '🔄 Trades'],
                          [userKUI['Gold spent'], '🪙 Gold Spent'],
                          [userKUI['Total power gained'], '⚡ Power Gained'],
                        ].filter(([v]) => v).map(([v, label], i) => (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontSize: '10px', color: '#9c8f76', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
                            <div style={{ fontSize: '22px', color: '#e8dbce', fontWeight: 'bold', fontFamily: 'monospace' }}>{Number(v).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Section: Jobs */}
                  {(userKUI['Job works completed'] || userKUI['Job worker injuries'] || userKUI['Total times worked'] || userKUI['Total bandages applied']) && (
                    <div style={{ background: '#1c1912', border: '1px solid #3a3327', borderRadius: '8px', padding: '20px' }}>
                      <div style={{ fontSize: '11px', color: '#c4964a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px' }}>⚒️ Jobs</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
                        {[
                          [userKUI['Job works completed'] || userKUI['Total times worked'], '💼 Works Done'],
                          [userKUI['Job worker injuries'] || userKUI['Total worker injuries'], '🩹 Injuries'],
                          [userKUI['Total bandages applied'], '🩹 Bandages Used'],
                          [userKUI['Total bits spent'], '🔵 Bits Spent'],
                        ].filter(([v]) => v).map(([v, label], i) => (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontSize: '10px', color: '#9c8f76', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
                            <div style={{ fontSize: '22px', color: '#e8dbce', fontWeight: 'bold', fontFamily: 'monospace' }}>{Number(v).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Section: Support & Affection */}
                  {(userKUI['Votes'] || userKUI['Number of votes'] || userKUI['Affection Points gained'] || userKUI['Tickets spent']) && (
                    <div style={{ background: '#1c1912', border: '1px solid #3a3327', borderRadius: '8px', padding: '20px' }}>
                      <div style={{ fontSize: '11px', color: '#b07cc6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px' }}>💎 Support & Affection</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
                        {[
                          [userKUI['Votes'] || userKUI['Number of votes'], '🗳️ Votes'],
                          [userKUI['Affection Points gained'], '❤️ AP Gained'],
                          [userKUI['Affection questions answered'], '❓ AP Questions'],
                          [userKUI['Tickets spent'], '🎟️ Tickets Spent'],
                          [userKUI['Gems contributed to server chest'], '💎 Gems Contributed'],
                        ].filter(([v]) => v).map(([v, label], i) => (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontSize: '10px', color: '#9c8f76', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
                            <div style={{ fontSize: '22px', color: '#e8dbce', fontWeight: 'bold', fontFamily: 'monospace' }}>{Number(v).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Section: Collection Stats (KUI) */}
                  {(userKUI['Wishlist items'] || userKUI['Tags created'] || userKUI['Albums created'] || userKUI['Album pages added'] || userKUI['Cards added to albums'] || userKUI['Koibito affection']) && (
                    <div style={{ background: '#1c1912', border: '1px solid #3a3327', borderRadius: '8px', padding: '20px' }}>
                      <div style={{ fontSize: '11px', color: '#c4a673', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px' }}>📚 Collection (KUI)</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
                        {[
                          [userKUI['Wishlist items'], '✨ Wishlist Items'],
                          [userKUI['Tags created'], '🏷️ Tags Created'],
                          [userKUI['Albums created'], '📖 Albums Created'],
                          [userKUI['Album pages added'], '📄 Album Pages'],
                          [userKUI['Cards added to albums'], '🖼️ Album Cards'],
                          [userKUI['Koibito affection'], '💖 Koibito Affection'],
                        ].filter(([v]) => v).map(([v, label], i) => (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontSize: '10px', color: '#9c8f76', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
                            <div style={{ fontSize: '22px', color: '#e8dbce', fontWeight: 'bold', fontFamily: 'monospace' }}>{Number(v).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Section: Gameplay Stats (KUI) */}
                  {(userKUI['Total morphs rolled'] || userKUI['Total morphs applied'] || userKUI['Morph attempts'] || userKUI['Total dyes applied'] || userKUI['Dye refills'] || userKUI['Total trims applied']) && (
                    <div style={{ background: '#1c1912', border: '1px solid #3a3327', borderRadius: '8px', padding: '20px' }}>
                      <div style={{ fontSize: '11px', color: '#ff6b6b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px' }}>🎮 Gameplay Details (KUI)</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
                        {[
                          [userKUI['Total morphs rolled'], '🌀 Morphs Rolled'],
                          [userKUI['Total morphs applied'], '🎨 Morphs Applied'],
                          [userKUI['Morph attempts'], '🎯 Morph Attempts'],
                          [userKUI['Total dyes applied'], '🧪 Dyes Applied'],
                          [userKUI['Dye refills'], '🔄 Dye Refills'],
                          [userKUI['Total trims applied'], '✂️ Trims Applied'],
                        ].filter(([v]) => v).map(([v, label], i) => (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontSize: '10px', color: '#9c8f76', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
                            <div style={{ fontSize: '22px', color: '#e8dbce', fontWeight: 'bold', fontFamily: 'monospace' }}>{Number(v).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Insight: grab rate */}
                  {userKUI['Cards grabbed'] && userKUI['Cards dropped'] && (
                    <div style={{ background: '#17140f', border: '1px solid #3a3327', borderRadius: '8px', padding: '16px', fontSize: '13px', color: '#9c8f76' }}>
                      💡 <span style={{ color: '#e8dbce' }}>Insight:</span> Dari <b style={{ color: '#d8923e' }}>{Number(userKUI['Cards dropped']).toLocaleString()}</b> drop,
                      kamu grab <b style={{ color: '#5ea396' }}>{Number(userKUI['Cards grabbed']).toLocaleString()}</b> kartu
                      (<b style={{ color: '#e8dbce' }}>{Math.round((Number(userKUI['Cards grabbed']) / Number(userKUI['Cards dropped'])) * 100)}%</b> grab rate).
                      {userKUI['Cards burned'] && (
                        <> Kamu sudah burn <b style={{ color: '#c14e4e' }}>{Number(userKUI['Cards burned']).toLocaleString()}</b> kartu.
                        Koleksi binder: <b style={{ color: '#d8923e' }}>{cards.length.toLocaleString()}</b> kartu.</>)}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', background: '#17140f', borderRadius: '8px', border: '1px dashed #3a3327' }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
                  <h3 style={{ color: '#e8dbce', marginBottom: '8px' }}>Belum Ada Data Statistik</h3>
                  <p style={{ color: '#9c8f76', fontSize: '14px' }}>
                    Buka menu <b>Profil</b> dan paste semua teks dari balasan <code>k!ui</code> Karuta untuk memunculkan dashboard statistik di sini.
                  </p>
                </div>
              )}
            </div>
          )}

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
                
                {!isReadOnly && (
                  <>
                    <button className="btn" onClick={() => openCardModal(null)}>+ Tambah Kartu</button>
                    <button className="btn secondary" onClick={() => setIsBulkImportModalOpen(true)}>📥 Bulk Import (k!c)</button>
                    <button className="btn secondary" onClick={() => setIsBatchKiwiModalOpen(true)}>⚡ Batch k!wi</button>
                    <button className="btn secondary" onClick={() => setIsBatchImageModalOpen(true)}>🖼️ Batch Gambar</button>
                  </>
                )}
                
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
              {selectedCards.size > 0 && !isReadOnly && (
                <div className="batch-panel">
                  <span className="batch-info"><b>{selectedCards.size}</b> kartu terpilih</span>
                  <div className="batch-actions">
                    <button className="btn btn-sm" onClick={() => setIsCommandModalOpen(true)}>Buat Command</button>
                    <button className="btn btn-sm" style={{ background: '#c14e4e', color: 'white', borderColor: '#a34141' }} onClick={() => setIsBurnResolveModalOpen(true)}>Proses Burn</button>
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
                  {!isReadOnly && <button className="btn" onClick={() => openCardModal(null)}>+ Tambah Kartu Pertama</button>}
                </div>
              ) : (
                <div className={viewMode === 'album' ? 'album-grid' : 'binder'}>
                  {(() => {
                    const filtered = getFilteredCards();
                    const CARDS_PER_PAGE = 12;
                    const totalPages = Math.max(1, Math.ceil(filtered.length / CARDS_PER_PAGE));
                    const safeCurrentPage = Math.min(currentPage, totalPages);
                    const paginated = filtered.slice((safeCurrentPage - 1) * CARDS_PER_PAGE, safeCurrentPage * CARDS_PER_PAGE);
                    
                    return (
                      <>
                        {paginated.map(c => {
                    const isSelected = selectedCards.has(c.id);
                    const itemTags = c.tags ? c.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
                    
                    if (viewMode === 'album') {
                      return (
                        <div 
                          key={c.id}
                          className={`native-card condition-${c.condition.toLowerCase()} ${isSelected ? 'selected' : ''} ${c.imageUrl ? 'has-image' : ''}`}
                          onClick={(e) => handleSleeveContainerClick(c.id, e)}
                        >
                          {c.imageUrl && (
                            <div className="nc-bg-image" style={{ backgroundImage: `url(${c.imageUrl})` }} onClick={(e) => { e.stopPropagation(); setLightboxImageUrl(c.imageUrl || null); }} />
                          )}
                          {!isReadOnly && (
                            <>
                              <div 
                                className="select-indicator" 
                                style={{ display: selectedCards.size > 0 ? 'flex' : undefined }}
                                onClick={(e) => toggleSleeveSelect(c.id, e)}
                              />
                              <button 
                                className="nc-delete-btn"
                                title="Hapus Kartu"
                                onClick={async (e) => { 
                                  e.stopPropagation(); 
                                  await handleDeleteCard(c.id); 
                                }}
                              >
                                ×
                              </button>
                              <button 
                                className="nc-edit-btn"
                                title="Edit Kartu"
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  openCardModal(c); 
                                }}
                              >
                                ✏️
                              </button>
                            </>
                          )}

                          <div className="nc-print">#{c.print !== null ? c.print : '-'}</div>
                          
                          <ConditionWatermark condition={c.condition} />
                          
                          {c.isWorker && <div className="nc-badge worker" title="Worker">🛠️</div>}
                          {c.isTrade && <div className="nc-badge trade" title="Trade">🔄</div>}
                          
                          <div className="nc-bottom">
                            <div className="nc-character">{c.name || '(Tanpa Nama)'}</div>
                            <div className="nc-series">{c.series || 'Unknown'}</div>
                            <div className="nc-meta">
                              <div className="nc-meta-stats">
                                {c.edition && <span className="nc-badge-chip">◈{c.edition}</span>}
                                {c.condition && <span className={`nc-badge-chip condition-text condition-${c.condition.toLowerCase()}`}>{c.condition}</span>}
                                {c.effort !== null && <span className="nc-badge-chip">{c.effort} eff</span>}
                                {c.wish !== null && <span className="nc-badge-chip">♡ {c.wish.toLocaleString()}</span>}
                              </div>
                              {c.code && (
                                <div 
                                  className="nc-code-block" 
                                  title="Salin Kode"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(c.code!);
                                    const el = e.currentTarget;
                                    const oldText = el.innerHTML;
                                    el.innerHTML = '📋 Copied!';
                                    setTimeout(() => { el.innerHTML = oldText; }, 800);
                                  }}
                                >
                                  📋 {c.code}
                                </div>
                              )}
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

                        <div className="stampbadge">
                          <b>{c.print !== null ? `#${c.print}` : '—'}</b>
                          <span>PRINT</span>
                        </div>

                        <p className="card-name">{c.name || '(Tanpa Nama)'}</p>
                        <p className="card-series" title={c.series}>{c.series || 'Series belum diisi'}</p>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          {c.code ? (
                            <span 
                              className="card-code" 
                              title="Salin Kode"
                              style={{ cursor: 'pointer' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(c.code!);
                                const el = e.currentTarget;
                                const oldText = el.innerHTML;
                                el.innerHTML = '📋 Copied!';
                                setTimeout(() => { el.innerHTML = oldText; }, 800);
                              }}
                            >
                              📋 {c.code}
                            </span>
                          ) : <span />}
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {c.isWorker && <span className="chip worker-tag" title="Worker Deck">🛠️ W</span>}
                            {c.isTrade && <span className="chip trade-tag" title="Up for Trade">🔄 T</span>}
                          </div>
                        </div>

                        <div className="card-meta">
                          {c.edition !== null && <span className="chip edition">◈{c.edition}</span>}
                          <span className="chip">{c.condition}</span>
                          {c.effort !== null && <span className="chip effort">{c.effort} eff</span>}
                          {c.wish !== null && <span className="chip wish">♡ {c.wish.toLocaleString()}</span>}
                          {itemTags.map(tag => (
                            <span key={tag} className="custom-tag-chip" style={{ backgroundColor: getTagColor(tag) }}>{tag}</span>
                          ))}
                        </div>

                        {(c.price || c.frame || c.dye || c.notes) && (
                          <div className="card-details-row">
                            {c.price && <div><span>Est. Harga:</span> <b>{c.price} Tickets</b></div>}
                            {c.frame && <div><span>Frame:</span> <b>{c.frame}</b></div>}
                            {c.dye && <div><span>Dye:</span> <b>{c.dye}</b></div>}
                            {c.notes && <div style={{ display: 'block', fontStyle: 'italic', marginTop: '2px' }}>"{c.notes}"</div>}
                          </div>
                        )}

                        {!isReadOnly && (                        <div className="card-actions" style={{ justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => { e.stopPropagation(); toggleSleeveSelect(c.id, e as any); }}>
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              readOnly
                              style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--stamp)', margin: 0 }}
                            />
                            <span style={{ fontSize: '13px', color: 'var(--ink-soft)', cursor: 'pointer', fontWeight: 600 }}>Pilih</span>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); openCardModal(c); }}>✏️ Edit</button>
                            <button className="icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteCard(c.id); }}>🗑️ Hapus</button>
                          </div>
                        </div>)}
                      </div>
                    );
                        })}
                        {totalPages > 1 && (
                          <div className="pagination" style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '24px', padding: '16px 0', borderTop: '1px dashed var(--paper-line)', flexWrap: 'wrap' }}>
                            <button className="btn" disabled={safeCurrentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>&larr;</button>
                            
                            {(() => {
                              const pages = [];
                              if (totalPages <= 7) {
                                for (let i = 1; i <= totalPages; i++) pages.push(i);
                              } else {
                                if (safeCurrentPage <= 4) {
                                  pages.push(1, 2, 3, 4, 5, '...', totalPages);
                                } else if (safeCurrentPage >= totalPages - 3) {
                                  pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
                                } else {
                                  pages.push(1, '...', safeCurrentPage - 1, safeCurrentPage, safeCurrentPage + 1, '...', totalPages);
                                }
                              }
                              return pages.map((p, i) => (
                                p === '...' ? (
                                  <span key={`dots-${i}`} style={{ color: 'var(--ink-soft)', padding: '0 4px', fontWeight: 600 }}>...</span>
                                ) : (
                                  <button 
                                    key={`page-${p}`} 
                                    className="btn"
                                    style={{ 
                                      padding: '8px 12px', 
                                      minWidth: '36px',
                                      background: safeCurrentPage === p ? '#5ea396' : 'transparent',
                                      color: safeCurrentPage === p ? '#fff' : 'var(--ink)',
                                      borderColor: safeCurrentPage === p ? '#5ea396' : 'var(--paper-line)'
                                    }}
                                    onClick={() => setCurrentPage(p as number)}
                                  >
                                    {p}
                                  </button>
                                )
                              ));
                            })()}

                            <button className="btn" disabled={safeCurrentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>&rarr;</button>
                          </div>
                        )}
                      </>
                    );
                  })()}
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
                {!isReadOnly && <button className="btn" onClick={() => openWishModal(null)}>+ Tambah Wishlist</button>}
              </div>

              {wishlist.length === 0 ? (
                <div className="empty">
                  <div className="stamp-big">✨</div>
                  <h3>Belum ada wishlist</h3>
                  <p>Catat karakter incaran kamu agar tidak terlewatkan saat drop muncul.</p>
                  {!isReadOnly && <button className="btn" onClick={() => openWishModal(null)}>+ Tambah Wishlist Pertama</button>}
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

                      {!isReadOnly && (                      <div className="card-actions">
                        <button className="icon-btn" onClick={() => openWishModal(w)}>✏️ Edit</button>
                        <button className="icon-btn delete" onClick={() => handleDeleteWish(w.id)}>🗑️ Hapus</button>
                        <button 
                          className="btn btn-sm" 
                          style={{ marginLeft: 'auto', background: 'var(--jade)', color: '#fff', borderColor: 'var(--jade-soft)' }}
                          onClick={() => handleClaimWish(w)}
                        >
                          🎉 Klaim
                        </button>
                      </div>)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: STATISTIK COLLECTION */}
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
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  <button className="icon-btn" onClick={() => handleViewTagCollection(t.name)}>🔍 Lihat Koleksi</button>
                                  <button className="icon-btn" onClick={() => { setTagNameInput(t.name); setTagColorInput(t.color); setTagDescInput(t.desc); }}>✏️ Edit</button>
                                  <button className="icon-btn" style={{ color: '#d8923e' }} onClick={() => handleUntagAll(t.name)}>❌ Untag Semua</button>
                                  <button className="icon-btn delete" onClick={() => handleDeleteCustomTag(t.name)}>🗑️ Hapus</button>
                                </div>
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
                            {!isReadOnly && <button className="btn secondary" style={{ padding: '4px 8px', fontSize: '11px', width: '100%' }} onClick={() => handleSetWorker(slotIdx, null)}>Lepas</button>}
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
                      disabled={isReadOnly}
                      style={{ width: '80px', padding: '8px', background: '#17140f', border: '1px solid #3a3327', color: '#e8dbce', borderRadius: '4px', opacity: isReadOnly ? 0.6 : 1 }}
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
                          if (isReadOnly) return;
                          if (!isUsed) {
                            const emptyIdx = workerSlotIds.findIndex(id => id === null);
                            if (emptyIdx !== -1) handleSetWorker(emptyIdx, c.id);
                            else handleSetWorker(2, c.id); // overwrite 3rd slot if full
                          }
                        }}
                        style={{ 
                          minWidth: '120px', maxWidth: '140px', padding: '12px', background: isUsed ? '#2a251b' : '#1c1912', border: '1px solid #3a3327', 
                          borderRadius: '8px', cursor: isReadOnly ? 'default' : (isUsed ? 'not-allowed' : 'pointer'), opacity: isUsed ? 0.5 : 1, transition: '0.2s'
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

          {/* TAB: INVENTORY TRACKER */}
          {activeTab === 'inventory' && !isReadOnly && (
            <div style={{ background: '#1c1912', padding: '24px', borderRadius: '12px', border: '1px solid #3a3327', maxWidth: '600px', margin: '0 auto' }}>
              <h3 style={{ margin: '0 0 24px 0', color: '#e8dbce', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #3a3327', paddingBottom: '16px' }}>
                🎒 Inventory & Assets
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* === k!inv PARSER === */}
                {(() => {
                  const handleInvParse = () => {
                    if (!invPasteText.trim()) return;
                    const lines = invPasteText.split('\n');
                    const updates: Partial<typeof inventory> = {};

                    lines.forEach(line => {
                      const clean = line.replace(/^[\p{Emoji}\s]+/u, '').trim();
                      const parts = clean.split('\u00b7').map(s => s.trim());
                      if (parts.length < 2) return;

                      const numStr = parts[0].replace(/,/g, '');
                      if (!/^\d+$/.test(numStr)) return;
                      const num = parseInt(numStr);
                      const rest = parts.slice(1).join(' ').toLowerCase();

                      if (rest.includes('ticket')) updates.tickets = num;
                      else if (rest.includes('gold')) updates.gold = num;
                      else if (rest.includes('gem')) updates.gems = num;
                      else if (rest.includes('work permit')) updates.workPermit = num;
                      else if (rest.includes('trade license')) updates.tradeLicense = num;
                      else if (rest.includes('bit') && !/(flower|wood|ice|stone|sugar|wool|uranium|bone|iron|copper|quartz|essence|magma|zinc)/.test(rest)) updates.bits = num;
                      else if (rest.includes('dust')) {
                        if (rest.includes('damaged') || rest.includes('\u2606\u2606\u2606\u2606')) updates.dust0 = num;
                        else if (rest.includes('poor') || rest.includes('\u2605\u2606\u2606\u2606')) updates.dust1 = num;
                        else if (rest.includes('good') || rest.includes('\u2605\u2605\u2606\u2606')) updates.dust2 = num;
                        else if (rest.includes('excellent') || rest.includes('\u2605\u2605\u2605\u2606')) updates.dust3 = num;
                        else if (rest.includes('mint') || rest.includes('\u2605\u2605\u2605\u2605')) updates.dust4 = num;
                      }
                    });

                    if (Object.keys(updates).length > 0) {
                      handleUpdateInventory({ ...inventory, ...updates });
                      setInvParseFeedback({ text: `\u2705 ${Object.keys(updates).length} item berhasil diperbarui dari k!inv!`, isError: false });
                      setInvPasteText('');
                      setTimeout(() => setInvParseFeedback(null), 3000);
                    } else {
                      setInvParseFeedback({ text: '\u26a0\ufe0f Tidak ada item terdeteksi. Salin teks lengkap dari balasan k!inv / k!i Karuta.', isError: true });
                    }
                  };

                  return (
                    <div style={{ background: '#17140f', border: '1px solid #3a3327', borderRadius: '8px', padding: '16px' }}>
                      <div style={{ fontSize: '12px', color: '#d8923e', fontWeight: 700, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        \ud83d\udccb Sync dari k!inv
                      </div>
                      <p style={{ fontSize: '12px', color: '#9c8f76', margin: '0 0 10px 0' }}>
                        Ketik <code style={{ background: '#252118', padding: '1px 5px', borderRadius: '3px' }}>k!inv</code> di Discord, lalu paste teks balasannya di sini. Semua nilai akan <b style={{ color: '#5ea396' }}>diperbarui otomatis</b>.
                      </p>
                      <textarea
                        className="form-control"
                        rows={4}
                        placeholder={"Inventory\nItems carried by @Username\n\n\u2728 701 \u00b7 poor dust \u00b7 Dust (\u2605\u2606\u2606\u2606)\n\ud83e\ude99 1,200 \u00b7 gold \u00b7 Gold\n..."}
                        value={invPasteText}
                        onChange={e => setInvPasteText(e.target.value)}
                        style={{ fontSize: '12px', fontFamily: 'monospace', resize: 'vertical' }}
                      />
                      {invParseFeedback && (
                        <div style={{
                          marginTop: '8px', padding: '8px 12px', borderRadius: '6px', fontSize: '12px',
                          background: invParseFeedback.isError ? '#b85c5c20' : '#5ea39620',
                          color: invParseFeedback.isError ? '#ff8c8c' : '#5ea396',
                          border: `1px solid ${invParseFeedback.isError ? '#b85c5c50' : '#5ea39650'}`
                        }}>
                          {invParseFeedback.text}
                        </div>
                      )}
                      <button
                        className="btn"
                        style={{ marginTop: '10px', width: '100%' }}
                        onClick={handleInvParse}
                        disabled={!invPasteText.trim()}
                      >
                        \ud83d\udd04 Sync Inventory dari k!inv
                      </button>
                    </div>
                  );
                })()}


                {/* Tickets */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#17140f', padding: '12px 16px', borderRadius: '8px' }}>
                  <span style={{ color: '#e8dbce', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>🎟️ Tickets</span>
                  <input 
                    type="number" 
                    value={inventory.tickets === 0 ? '' : inventory.tickets}
                    placeholder="0"
                    onChange={e => handleUpdateInventory({ ...inventory, tickets: Number(e.target.value) })}
                    style={{ width: '120px', background: '#252118', border: '1px solid #4a4132', color: '#e8dbce', padding: '8px', borderRadius: '4px', textAlign: 'right', fontSize: '16px', fontWeight: 'bold' }}
                  />
                </div>

                {/* Gold */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#17140f', padding: '12px 16px', borderRadius: '8px' }}>
                  <span style={{ color: '#e8dbce', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>🪙 Gold</span>
                  <input 
                    type="number" 
                    value={inventory.gold === 0 ? '' : inventory.gold}
                    placeholder="0"
                    onChange={e => handleUpdateInventory({ ...inventory, gold: Number(e.target.value) })}
                    style={{ width: '120px', background: '#252118', border: '1px solid #4a4132', color: '#e8dbce', padding: '8px', borderRadius: '4px', textAlign: 'right', fontSize: '16px', fontWeight: 'bold' }}
                  />
                </div>

                {/* Gems */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#17140f', padding: '12px 16px', borderRadius: '8px' }}>
                  <span style={{ color: '#e8dbce', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>💠 Gems</span>
                  <input 
                    type="number" 
                    value={inventory.gems === 0 ? '' : inventory.gems}
                    placeholder="0"
                    onChange={e => handleUpdateInventory({ ...inventory, gems: Number(e.target.value) })}
                    style={{ width: '120px', background: '#252118', border: '1px solid #4a4132', color: '#e8dbce', padding: '8px', borderRadius: '4px', textAlign: 'right', fontSize: '16px', fontWeight: 'bold' }}
                  />
                </div>

                {/* Trade License */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#17140f', padding: '12px 16px', borderRadius: '8px' }}>
                  <span style={{ color: '#e8dbce', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>📜 Trade License</span>
                  <input 
                    type="number" 
                    value={inventory.tradeLicense === 0 ? '' : (inventory.tradeLicense || '')}
                    placeholder="0"
                    onChange={e => handleUpdateInventory({ ...inventory, tradeLicense: Number(e.target.value) })}
                    style={{ width: '120px', background: '#252118', border: '1px solid #4a4132', color: '#e8dbce', padding: '8px', borderRadius: '4px', textAlign: 'right', fontSize: '16px', fontWeight: 'bold' }}
                  />
                </div>

                {/* Work Permit */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#17140f', padding: '12px 16px', borderRadius: '8px' }}>
                  <span style={{ color: '#e8dbce', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>📜 Work Permit</span>
                  <input 
                    type="number" 
                    value={inventory.workPermit === 0 ? '' : (inventory.workPermit || '')}
                    placeholder="0"
                    onChange={e => handleUpdateInventory({ ...inventory, workPermit: Number(e.target.value) })}
                    style={{ width: '120px', background: '#252118', border: '1px solid #4a4132', color: '#e8dbce', padding: '8px', borderRadius: '4px', textAlign: 'right', fontSize: '16px', fontWeight: 'bold' }}
                  />
                </div>

                {/* Bits */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#17140f', padding: '12px 16px', borderRadius: '8px' }}>
                  <span style={{ color: '#e8dbce', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>🔵 Bits</span>
                  <input 
                    type="number" 
                    value={inventory.bits === 0 ? '' : inventory.bits}
                    placeholder="0"
                    onChange={e => handleUpdateInventory({ ...inventory, bits: Number(e.target.value) })}
                    style={{ width: '120px', background: '#252118', border: '1px solid #4a4132', color: '#e8dbce', padding: '8px', borderRadius: '4px', textAlign: 'right', fontSize: '16px', fontWeight: 'bold' }}
                  />
                </div>

                <div style={{ marginTop: '16px', fontSize: '14px', color: '#9c8f76', borderBottom: '1px solid #3a3327', paddingBottom: '8px' }}>✨ Dusts</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#17140f', padding: '8px 12px', borderRadius: '8px' }}>
                    <span style={{ color: '#e8dbce', fontSize: '12px' }}>Damaged (☆☆☆☆)</span>
                    <input type="number" value={inventory.dust0 === 0 ? '' : (inventory.dust0 || '')} placeholder="0" onChange={e => handleUpdateInventory({ ...inventory, dust0: Number(e.target.value) })} style={{ width: '60px', background: '#252118', border: '1px solid #4a4132', color: '#e8dbce', padding: '4px', borderRadius: '4px', textAlign: 'right' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#17140f', padding: '8px 12px', borderRadius: '8px' }}>
                    <span style={{ color: '#e8dbce', fontSize: '12px' }}>Poor (★☆☆☆)</span>
                    <input type="number" value={inventory.dust1 === 0 ? '' : (inventory.dust1 || '')} placeholder="0" onChange={e => handleUpdateInventory({ ...inventory, dust1: Number(e.target.value) })} style={{ width: '60px', background: '#252118', border: '1px solid #4a4132', color: '#e8dbce', padding: '4px', borderRadius: '4px', textAlign: 'right' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#17140f', padding: '8px 12px', borderRadius: '8px' }}>
                    <span style={{ color: '#e8dbce', fontSize: '12px' }}>Good (★★☆☆)</span>
                    <input type="number" value={inventory.dust2 === 0 ? '' : (inventory.dust2 || '')} placeholder="0" onChange={e => handleUpdateInventory({ ...inventory, dust2: Number(e.target.value) })} style={{ width: '60px', background: '#252118', border: '1px solid #4a4132', color: '#e8dbce', padding: '4px', borderRadius: '4px', textAlign: 'right' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#17140f', padding: '8px 12px', borderRadius: '8px' }}>
                    <span style={{ color: '#e8dbce', fontSize: '12px' }}>Excellent (★★★☆)</span>
                    <input type="number" value={inventory.dust3 === 0 ? '' : (inventory.dust3 || '')} placeholder="0" onChange={e => handleUpdateInventory({ ...inventory, dust3: Number(e.target.value) })} style={{ width: '60px', background: '#252118', border: '1px solid #4a4132', color: '#e8dbce', padding: '4px', borderRadius: '4px', textAlign: 'right' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#17140f', padding: '8px 12px', borderRadius: '8px' }}>
                    <span style={{ color: '#e8dbce', fontSize: '12px' }}>Mint (★★★★)</span>
                    <input type="number" value={inventory.dust4 === 0 ? '' : (inventory.dust4 || '')} placeholder="0" onChange={e => handleUpdateInventory({ ...inventory, dust4: Number(e.target.value) })} style={{ width: '60px', background: '#252118', border: '1px solid #4a4132', color: '#e8dbce', padding: '4px', borderRadius: '4px', textAlign: 'right' }} />
                  </div>
                </div>

              </div>
            </div>
          )}

        </main>

        {/* FOOTER */}
        <footer className="footer">
          <div>CARTOTECA • Karuta Companion App</div>
          <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.6 }}>© 2026 ChromeT</div>
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
                <summary>✨ <b>Auto-fill via Discord Text</b></summary>
                <div className="parser-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  
                  {/* Card Info (k!c) */}
                  <div style={{ background: '#1c1912', padding: '12px', borderRadius: '8px', border: '1px solid #3a3327' }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#d8923e', marginBottom: '8px' }}>1. Paste Info Kartu (k!c)</div>
                    <textarea 
                      placeholder="Tempel teks info kartu di sini..." 
                      rows={2}
                      value={discordText}
                      onChange={(e) => setDiscordText(e.target.value)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                      <span className={`parser-status ${parserFeedback.isError ? 'error' : parserFeedback.isSuccess ? 'success' : ''}`}>{parserFeedback.text}</span>
                      <button className="btn btn-sm" onClick={handleParseText}>Baca Info Kartu</button>
                    </div>
                  </div>

                  {/* Worker/Effort Info (k!w) */}
                  <div style={{ background: '#1c1912', padding: '12px', borderRadius: '8px', border: '1px solid #3a3327' }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#5ea396', marginBottom: '8px' }}>2. Paste Info Worker/Effort (k!w / k!wi)</div>
                    <textarea 
                      placeholder="Tempel teks detail worker di sini..." 
                      rows={2}
                      value={effortDiscordText}
                      onChange={(e) => setEffortDiscordText(e.target.value)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                      <span className={`parser-status ${effortParserFeedback.isError ? 'error' : effortParserFeedback.isSuccess ? 'success' : ''}`}>{effortParserFeedback.text}</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-sm secondary" onClick={handleParseKiwi}>Dari Clipboard</button>
                        <button className="btn btn-sm" onClick={handleParseEffortText}>Baca Info Worker</button>
                      </div>
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

            {/* WORKER STATS (EFFORT MODIFIERS) */}
            <div className="worker-stats-section" style={{ background: 'var(--paper-dark)', padding: '16px', borderRadius: 'var(--border-radius)', border: '1px solid var(--paper-line)', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--stamp)', textTransform: 'uppercase', marginBottom: '12px' }}>Worker Stats (Effort Modifiers)</div>
              <div className="field-row-3">
                <div className="field">
                  <label>Purity</label>
                  <input type="text" placeholder="mis. S" value={fStats?.purity || ''} onChange={(e) => updateFStat('purity', e.target.value)} />
                </div>
                <div className="field">
                  <label>Wellness</label>
                  <input type="text" placeholder="mis. S" value={fStats?.wellness || ''} onChange={(e) => updateFStat('wellness', e.target.value)} />
                </div>
                <div className="field">
                  <label>Toughness</label>
                  <input type="text" placeholder="mis. F" value={fStats?.toughness || ''} onChange={(e) => updateFStat('toughness', e.target.value)} />
                </div>
              </div>
              <div className="field-row-3">
                <div className="field">
                  <label>Quickness</label>
                  <input type="text" placeholder="mis. B" value={fStats?.quickness || ''} onChange={(e) => updateFStat('quickness', e.target.value)} />
                </div>
                <div className="field">
                  <label>Style</label>
                  <input type="text" placeholder="mis. F" value={fStats?.style || ''} onChange={(e) => updateFStat('style', e.target.value)} />
                </div>
                <div className="field">
                  <label>Grabber</label>
                  <input type="text" placeholder="mis. S" value={fStats?.grabber || ''} onChange={(e) => updateFStat('grabber', e.target.value)} />
                </div>
              </div>
              <div className="field-row-3">
                <div className="field">
                  <label>Dropper</label>
                  <input type="text" placeholder="mis. S" value={fStats?.dropper || ''} onChange={(e) => updateFStat('dropper', e.target.value)} />
                </div>
                <div className="field">
                  <label>Vanity</label>
                  <input type="text" placeholder="mis. D" value={fStats?.vanity || ''} onChange={(e) => updateFStat('vanity', e.target.value)} />
                </div>
                <div className="field">
                  <label>Appeal</label>
                  <input type="text" placeholder="mis. S" value={fStats?.appeal || ''} onChange={(e) => updateFStat('appeal', e.target.value)} />
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

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Gambar Kartu (Album View)</label>
              {fImageUrl && (
                <div style={{ marginBottom: '8px', position: 'relative', width: '120px', height: '180px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--paper-line)' }}>
                  <img src={fImageUrl} alt="Card" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button 
                    className="icon-btn delete" 
                    title="Hapus Gambar"
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.7)', padding: '2px 6px', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    onClick={() => setFImageUrl('')}
                  >
                    ×
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input 
                  type="text" 
                  placeholder="Paste URL gambar dari Discord (opsional)" 
                  value={fImageUrl}
                  onChange={(e) => setFImageUrl(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              {cardFormId ? (
                <button 
                  className="btn secondary" 
                  style={{ color: '#d35d5d', borderColor: '#d35d5d' }} 
                  onClick={async () => {
                    const deleted = await handleDeleteCard(cardFormId);
                    if (deleted) setIsCardModalOpen(false);
                  }}
                >
                  Hapus
                </button>
              ) : <div />}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn secondary" onClick={() => setIsCardModalOpen(false)}>Batal</button>
                <button className="btn" onClick={handleSaveCard}>Simpan Kartu</button>
              </div>
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

      {/* MODAL: COMMAND COMPANION */}
      {isCommandModalOpen && (
        <div className="modal-overlay open">
          <div className="modal" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3>Command Companion</h3>
              <button className="close-modal-btn" onClick={() => setIsCommandModalOpen(false)}>&times;</button>
            </div>
            
            <div className="form-group" style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label>Pilih Jenis Command</label>
              <select value={commandType} onChange={(e) => setCommandType(e.target.value)} className="form-control">
                <option value="mt">Multi Tag (ktag)</option>
                <option value="mut">Multi Untag (kuntag)</option>
                <option value="mb">Multi Burn (kmb)</option>
                <option value="ta">Trade Add (kta)</option>
                <option value="wi">Worker Info (kwi)</option>
              </select>
            </div>

            {(commandType === 'mt' || commandType === 'mut' || commandType === 'mb') && (
              <div className="form-group" style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label>Nama Tag</label>
                <input 
                  type="text" 
                  value={commandArg} 
                  onChange={(e) => setCommandArg(e.target.value)} 
                  className="form-control" 
                  placeholder="Misal: Worker"
                />
              </div>
            )}

            {(() => {
              const selectedCodes = Array.from(selectedCards).map(id => cards.find(c => c.id === id)?.code).filter(Boolean);
              let cmdStr = '';
              if (commandType === 'mt') {
                cmdStr = `ktag ${commandArg} ${selectedCodes.join(' ')}`.trim();
              } else if (commandType === 'mut') {
                cmdStr = `kuntag ${commandArg} ${selectedCodes.join(' ')}`.trim();
              } else if (commandType === 'mb') {
                cmdStr = `kmb t:${commandArg.trim() || 'burn'}`;
              } else if (commandType === 'ta') {
                cmdStr = `kta ${selectedCodes.join(' ')}`;
              } else if (commandType === 'wi') {
                cmdStr = `kwi ${selectedCodes.join(' ')}`;
              }
              
              return (
                <div style={{ background: 'var(--paper-dark)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: '12px', margin: '0 0 8px 0', color: 'var(--ink-soft)' }}>Hasil Command:</p>
                  <code style={{ display: 'block', wordBreak: 'break-all', fontSize: '13px', color: 'var(--jade-soft)', fontFamily: 'monospace' }}>
                    {cmdStr}
                  </code>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <button 
                      className="btn btn-sm" 
                      onClick={(e) => {
                        navigator.clipboard.writeText(cmdStr);
                        e.currentTarget.innerText = '📋 Tersalin!';
                        setTimeout(() => { e.currentTarget.innerText = 'Salin ke Clipboard'; }, 1000);
                      }}
                    >
                      Salin ke Clipboard
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL: BURN RESOLVER */}
      {isBurnResolveModalOpen && (
        <div className="modal-overlay open">
          <div className="modal" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3>Proses Burn</h3>
              <button className="close-modal-btn" onClick={() => setIsBurnResolveModalOpen(false)}>&times;</button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: 0 }}>
              Tempel pesan respons dari bot Karuta setelah Anda melakukan <code>k!mb</code> untuk mendapatkan material secara otomatis dan menghapus {selectedCards.size} kartu dari koleksi Cartoteca Anda.
            </p>
            <div className="form-group">
              <textarea 
                className="form-control"
                placeholder="Misal: 🔥 You burned 5 cards and received 100 Gold and 15 Dust."
                rows={4}
                value={burnDiscordText}
                onChange={(e) => setBurnDiscordText(e.target.value)}
              />
            </div>
            
            {(() => {
              if (!burnDiscordText.trim()) return null;
              let cleanText = burnDiscordText.replace(/[\*_`~▫▪●○]/g, '');
              let gold = 0, dust0 = 0, dust1 = 0, dust2 = 0, dust3 = 0, dust4 = 0, tickets = 0, bits = 0;
              const gMatch = cleanText.match(/([\d,]+)\s+Gold/i);
              if (gMatch) gold = parseInt(gMatch[1].replace(/,/g, ''));
              const d0Match = cleanText.match(/([\d,]+)\s+Dust\s*\(☆☆☆☆\)/i);
              if (d0Match) dust0 = parseInt(d0Match[1].replace(/,/g, ''));
              const d1Match = cleanText.match(/([\d,]+)\s+Dust\s*\(★☆☆☆\)/i);
              if (d1Match) dust1 = parseInt(d1Match[1].replace(/,/g, ''));
              const d2Match = cleanText.match(/([\d,]+)\s+Dust\s*\(★★☆☆\)/i);
              if (d2Match) dust2 = parseInt(d2Match[1].replace(/,/g, ''));
              const d3Match = cleanText.match(/([\d,]+)\s+Dust\s*\(★★★☆\)/i);
              if (d3Match) dust3 = parseInt(d3Match[1].replace(/,/g, ''));
              const d4Match = cleanText.match(/([\d,]+)\s+Dust\s*\(★★★★\)/i);
              if (d4Match) dust4 = parseInt(d4Match[1].replace(/,/g, ''));
              const tMatch = cleanText.match(/([\d,]+)\s+Ticket/i);
              if (tMatch) tickets = parseInt(tMatch[1].replace(/,/g, ''));
              const bMatch = cleanText.match(/([\d,]+)\s+Bit/i);
              if (bMatch) bits = parseInt(bMatch[1].replace(/,/g, ''));
              
              if (gold === 0 && dust0 === 0 && dust1 === 0 && dust2 === 0 && dust3 === 0 && dust4 === 0 && tickets === 0 && bits === 0) {
                return <p style={{ fontSize: '12px', color: '#c14e4e' }}>Tidak ada hadiah terdeteksi di teks.</p>;
              }

              return (
                <div style={{ background: 'var(--paper-dark)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '12px' }}>
                  <p style={{ fontSize: '12px', margin: '0 0 8px 0', color: 'var(--ink-soft)' }}>Hasil Deteksi:</p>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--jade-soft)' }}>
                    {gold > 0 && <li>+{gold} Gold</li>}
                    {dust0 > 0 && <li>+{dust0} Damaged Dust (☆☆☆☆)</li>}
                    {dust1 > 0 && <li>+{dust1} Poor Dust (★☆☆☆)</li>}
                    {dust2 > 0 && <li>+{dust2} Good Dust (★★☆☆)</li>}
                    {dust3 > 0 && <li>+{dust3} Excellent Dust (★★★☆)</li>}
                    {dust4 > 0 && <li>+{dust4} Mint Dust (★★★★)</li>}
                    {tickets > 0 && <li>+{tickets} Ticket</li>}
                    {bits > 0 && <li>+{bits} Bit</li>}
                  </ul>
                  <p style={{ fontSize: '12px', color: '#c14e4e', margin: '8px 0 0 0', fontWeight: 'bold' }}>
                    Peringatan: {selectedCards.size} kartu terpilih akan dihapus dari Cartoteca.
                  </p>
                </div>
              );
            })()}

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button className="btn secondary" onClick={() => setIsBurnResolveModalOpen(false)}>Batal</button>
              <button 
                className="btn" 
                style={{ 
                  background: burnDiscordText.trim() ? '#c14e4e' : 'transparent',
                  color: burnDiscordText.trim() ? 'white' : 'var(--ink-soft)',
                  borderColor: burnDiscordText.trim() ? '#a34141' : 'var(--paper-line)'
                }}
                disabled={!burnDiscordText.trim()}
                onClick={() => {
                  let cleanText = burnDiscordText.replace(/[\*_`~▫▪●○]/g, '');
                  let gold = 0, dust0 = 0, dust1 = 0, dust2 = 0, dust3 = 0, dust4 = 0, tickets = 0, bits = 0;
                  const gMatch = cleanText.match(/([\d,]+)\s+Gold/i);
                  if (gMatch) gold = parseInt(gMatch[1].replace(/,/g, ''));
                  const d0Match = cleanText.match(/([\d,]+)\s+Dust\s*\(☆☆☆☆\)/i);
                  if (d0Match) dust0 = parseInt(d0Match[1].replace(/,/g, ''));
                  const d1Match = cleanText.match(/([\d,]+)\s+Dust\s*\(★☆☆☆\)/i);
                  if (d1Match) dust1 = parseInt(d1Match[1].replace(/,/g, ''));
                  const d2Match = cleanText.match(/([\d,]+)\s+Dust\s*\(★★☆☆\)/i);
                  if (d2Match) dust2 = parseInt(d2Match[1].replace(/,/g, ''));
                  const d3Match = cleanText.match(/([\d,]+)\s+Dust\s*\(★★★☆\)/i);
                  if (d3Match) dust3 = parseInt(d3Match[1].replace(/,/g, ''));
                  const d4Match = cleanText.match(/([\d,]+)\s+Dust\s*\(★★★★\)/i);
                  if (d4Match) dust4 = parseInt(d4Match[1].replace(/,/g, ''));
                  const tMatch = cleanText.match(/([\d,]+)\s+Ticket/i);
                  if (tMatch) tickets = parseInt(tMatch[1].replace(/,/g, ''));
                  const bMatch = cleanText.match(/([\d,]+)\s+Bit/i);
                  if (bMatch) bits = parseInt(bMatch[1].replace(/,/g, ''));

                  handleUpdateInventory({
                    ...inventory,
                    gold: inventory.gold + gold,
                    dust0: (inventory.dust0 || 0) + dust0,
                    dust1: (inventory.dust1 || 0) + dust1,
                    dust2: (inventory.dust2 || 0) + dust2,
                    dust3: (inventory.dust3 || 0) + dust3,
                    dust4: (inventory.dust4 || 0) + dust4,
                    tickets: inventory.tickets + tickets,
                    bits: inventory.bits + bits
                  });
                  
                  // Delete burned cards from Firebase
                  if (isFirebaseConfigured() && user) {
                    const batch = writeBatch(db);
                    selectedCards.forEach(cardId => {
                      batch.delete(doc(db, 'users', user!.uid, 'cards', cardId));
                    });
                    batch.commit().catch(err => console.error("Burn delete error:", err));
                  }
                  
                  const newCards = cards.filter(c => !selectedCards.has(c.id));
                  setCards(newCards);
                  syncLocal('cards', newCards);
                  setSelectedCards(new Set());
                  setBurnDiscordText('');
                  setIsBurnResolveModalOpen(false);
                }}
              >
                Selesaikan & Hapus Kartu
              </button>
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
              
              {bulkImportFeedback.text && (
                <div style={{ padding: '12px', borderRadius: '6px', fontSize: '13px', 
                  background: bulkImportFeedback.isError ? '#b85c5c20' : bulkImportFeedback.isSuccess ? '#5ea39620' : '#d8923e20',
                  color: bulkImportFeedback.isError ? '#ff8c8c' : bulkImportFeedback.isSuccess ? '#5ea396' : '#d8923e',
                  border: `1px solid ${bulkImportFeedback.isError ? '#b85c5c50' : bulkImportFeedback.isSuccess ? '#5ea39650' : '#d8923e50'}` 
                }}>
                  {bulkImportFeedback.text}
                </div>
              )}

              <button className="btn" onClick={handleBulkImportExecute} style={{ padding: '12px' }} disabled={!!bulkImportFeedback.text && !bulkImportFeedback.isError}>
                🚀 Proses & Simpan Semua Kartu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BATCH KIWI */}
      {isBatchKiwiModalOpen && (
        <div className="modal-overlay open">
          <div className="modal" style={{ maxWidth: '600px', padding: '0', overflow: 'hidden' }}>
            <div style={{ background: '#1c1912', padding: '16px 20px', borderBottom: '1px solid #3a3327', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#e8dbce', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#d8923e' }}>⚡</span> Batch Stats Pekerja (k!wi)
              </h3>
              <button onClick={() => setIsBatchKiwiModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#9c8f76', fontSize: '24px', cursor: 'pointer', padding: '0' }}>&times;</button>
            </div>
            
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.5' }}>
                Paste banyak balasan bot <b>k!wi</b> sekaligus di bawah ini (bisa sekaligus 10, 20 kartu dst). Sistem akan mendeteksi kode kartu dalam kurung, misalnya <code>(a1b2c)</code> dan mencocokkannya dengan koleksi Anda secara otomatis.
              </p>
              
              <textarea 
                className="input-dark"
                rows={10} 
                placeholder="Worker Details&#10;Character · ... (a1b2c)&#10;Effort · 200&#10;&#10;... paste balasan lainnya ..."
                value={batchKiwiText}
                onChange={(e) => setBatchKiwiText(e.target.value)}
              />

              {batchKiwiFeedback.text && (
                <div style={{ padding: '12px', borderRadius: '6px', fontSize: '13px', 
                  background: batchKiwiFeedback.isError ? '#b85c5c20' : batchKiwiFeedback.isSuccess ? '#5ea39620' : '#d8923e20',
                  color: batchKiwiFeedback.isError ? '#ff8c8c' : batchKiwiFeedback.isSuccess ? '#5ea396' : '#d8923e',
                  border: `1px solid ${batchKiwiFeedback.isError ? '#b85c5c50' : batchKiwiFeedback.isSuccess ? '#5ea39650' : '#d8923e50'}` 
                }}>
                  {batchKiwiFeedback.text}
                </div>
              )}

              <button className="btn" onClick={handleBatchKiwiParse} style={{ padding: '12px' }} disabled={!!batchKiwiFeedback.text && !batchKiwiFeedback.isError}>
                🚀 Update Stats Massal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BATCH IMAGE */}
      {isBatchImageModalOpen && (
        <div className="modal-overlay open">
          <div className="modal" style={{ maxWidth: '600px', padding: '0', overflow: 'hidden' }}>
            <div style={{ background: '#1c1912', padding: '16px 20px', borderBottom: '1px solid #3a3327', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#e8dbce', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#d8923e' }}>🖼️</span> Batch Gambar Kartu
              </h3>
              <button onClick={() => { setIsBatchImageModalOpen(false); setQuickImageMode(false); }} style={{ background: 'transparent', border: 'none', color: '#9c8f76', fontSize: '24px', cursor: 'pointer', padding: '0' }}>&times;</button>
            </div>
            
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #3a3327', paddingBottom: '12px' }}>
                <button className={`tab-btn ${!quickImageMode ? 'active-text' : ''}`} onClick={() => setQuickImageMode(false)} style={{ flex: 1 }}>📜 Format Teks Massal</button>
                <button className={`tab-btn ${quickImageMode ? 'active-text' : ''}`} onClick={() => { setQuickImageMode(true); setQuickImageIndex(0); }} style={{ flex: 1 }}>⚡ Quick Fill Mode</button>
              </div>

              {!quickImageMode ? (
                <>
                  <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.5' }}>
                    Paste dengan format: <code>kode|url_gambar</code> (satu per baris). Cocok untuk mass update jika Anda punya data di spreadsheet/notepad.
                  </p>
                  
                  <textarea 
                    className="input-dark"
                    rows={10} 
                    placeholder="a1b2c|https://...&#10;x9y8z|https://..."
                    value={batchImageText}
                    onChange={(e) => setBatchImageText(e.target.value)}
                  />

                  {batchImageFeedback.text && (
                    <div style={{ padding: '12px', borderRadius: '6px', fontSize: '13px', 
                      background: batchImageFeedback.isError ? '#b85c5c20' : batchImageFeedback.isSuccess ? '#5ea39620' : '#d8923e20',
                      color: batchImageFeedback.isError ? '#ff8c8c' : batchImageFeedback.isSuccess ? '#5ea396' : '#d8923e',
                      border: `1px solid ${batchImageFeedback.isError ? '#b85c5c50' : batchImageFeedback.isSuccess ? '#5ea39650' : '#d8923e50'}` 
                    }}>
                      {batchImageFeedback.text}
                    </div>
                  )}

                  <button className="btn" onClick={handleBatchImageUpdate} style={{ padding: '12px' }} disabled={!!batchImageFeedback.text && !batchImageFeedback.isError}>
                    🖼️ Update Gambar Massal
                  </button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.5' }}>
                    Sistem akan memunculkan kartu Anda yang <b>belum memiliki gambar</b> satu per satu. Paste URL dan tekan Enter untuk menyimpan & lanjut.
                  </p>
                  {(() => {
                    const cardsWithoutImage = cards.filter(c => !c.imageUrl);
                    if (cardsWithoutImage.length === 0) {
                      return <div style={{ textAlign: 'center', padding: '40px 0', color: '#5ea396' }}>✅ Semua kartu di koleksi Anda sudah memiliki gambar!</div>;
                    }
                    if (quickImageIndex >= cardsWithoutImage.length) {
                      return <div style={{ textAlign: 'center', padding: '40px 0', color: '#5ea396' }}>✅ Anda telah menyelesaikan semua antrean pengisian gambar!</div>;
                    }
                    const c = cardsWithoutImage[quickImageIndex];
                    return (
                      <div style={{ background: '#17140f', padding: '16px', borderRadius: '8px', border: '1px solid #3a3327' }}>
                        <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '8px' }}>Kartu {quickImageIndex + 1} dari {cardsWithoutImage.length}</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#e8dbce', marginBottom: '4px' }}>{c.name}</div>
                        <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '16px' }}>{c.series} • {c.code}</div>
                        
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input 
                            type="text" 
                            className="input-dark" 
                            placeholder="Paste URL gambar (https://...)"
                            value={batchImageText}
                            onChange={(e) => setBatchImageText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleQuickImageSave(batchImageText, c.id);
                            }}
                            style={{ flex: 1 }}
                            autoFocus
                          />
                          <button className="btn secondary" onClick={() => { setBatchImageText(''); setQuickImageIndex(prev => prev + 1); }}>Skip</button>
                          <button className="btn" onClick={() => handleQuickImageSave(batchImageText, c.id)}>Save</button>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
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
              {/* User Account Info */}
              <div style={{ background: '#17140f', padding: '16px', borderRadius: '8px', border: '1px solid #3a3327', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                  <span style={{ color: '#9c8f76' }}>Username:</span>
                  <span style={{ color: '#e8dbce', fontWeight: 600 }}>{displayName}</span>
                </div>
                <button
                  className="btn"
                  style={{ width: '100%', marginTop: '4px', background: '#5ea396', color: '#fff', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                  onClick={() => {
                    if (user?.uid) {
                      const shareUrl = `${window.location.origin}/?p=${user.uid}`;
                      navigator.clipboard.writeText(shareUrl)
                        .then(() => alert('Link profil publik Anda (read-only) berhasil disalin ke clipboard!'))
                        .catch(() => alert('Gagal menyalin link.'));
                    }
                  }}
                >
                  🔗 Salin Link Profil Publik
                </button>
              </div>

              {/* KUI Import Section */}
              <div style={{ background: '#17140f', padding: '16px', borderRadius: '8px', border: '1px solid #3a3327', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ margin: 0, color: '#e8dbce', fontSize: '14px' }}>Karuta User Info (k!ui)</h4>
                <p style={{ fontSize: '12px', color: 'var(--ink-soft)', lineHeight: '1.5', margin: 0 }}>
                  Paste balasan perintah <code>k!ui</code> dari Discord ke bawah ini untuk menampilkan statistik akun di halaman profil publik Anda.
                </p>
                <textarea 
                  className="input-dark"
                  rows={4} 
                  placeholder="Cards dropped · 141,273&#10;Cards grabbed · 19,990"
                  value={kuiInputText}
                  onChange={(e) => setKuiInputText(e.target.value)}
                />
                {kuiFeedback.text && (
                  <div style={{ padding: '10px', borderRadius: '4px', fontSize: '12px', 
                    background: kuiFeedback.isError ? '#b85c5c20' : kuiFeedback.isSuccess ? '#5ea39620' : '#d8923e20',
                    color: kuiFeedback.isError ? '#ff8c8c' : kuiFeedback.isSuccess ? '#5ea396' : '#d8923e',
                    border: `1px solid ${kuiFeedback.isError ? '#b85c5c50' : kuiFeedback.isSuccess ? '#5ea39650' : '#d8923e50'}` 
                  }}>
                    {kuiFeedback.text}
                  </div>
                )}
                <button className="btn secondary" onClick={handleKUIParse} disabled={!!kuiFeedback.text && !kuiFeedback.isError}>
                  📥 Update Statistik
                </button>
              </div>

              {/* KUI Raw Data Display */}
              {Object.keys(userKUI).length > 0 && (
                <div style={{ background: '#1c1912', padding: '16px', borderRadius: '8px', border: '1px solid #3a3327' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#e8dbce', fontSize: '13px' }}>Semua Data KUI Anda:</h4>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                    {Object.entries(userKUI).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #3a3327', paddingBottom: '4px' }}>
                        <span style={{ color: '#9c8f76' }}>{k}</span>
                        <span style={{ color: '#e8dbce', fontWeight: 600, fontFamily: 'monospace' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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


      {confirmState.isOpen && (
        <div className="modal-overlay open" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: '400px', padding: '24px', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--font-serif)', fontSize: '22px', color: 'var(--ink)' }}>Konfirmasi</h3>
            <p style={{ margin: '0 0 24px', fontSize: '14.5px', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
              {confirmState.message}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="btn secondary" onClick={confirmState.onCancel}>Batal</button>
              <button className="btn" style={{ background: '#b93c3c', color: '#fff', borderColor: '#8c2d2d', textShadow: 'none' }} onClick={confirmState.onConfirm}>Ya, Lanjutkan</button>
            </div>
          </div>
        </div>
      )}

      {lightboxImageUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxImageUrl(null)}>
          <button className="lightbox-close" onClick={() => setLightboxImageUrl(null)}>&times;</button>
          <img src={lightboxImageUrl} alt="Fullscreen Card" className="lightbox-image" />
        </div>
      )}
    </div>
  );
}
