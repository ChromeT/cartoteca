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
  isInjured?: boolean;
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
  const [workerSlotIds, setWorkerSlotIds] = useState<(string | null)[]>([null, null, null, null, null]);
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

  // Toast System State
  interface ToastState {
    message: string;
    type: 'info' | 'success' | 'error';
    id: number;
  }
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { message, type, id }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

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
  const [fIsInjured, setFIsInjured] = useState(false);
  const [fFrame, setFFrame] = useState('');
  const [fDye, setFDye] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fImageUrl, setFImageUrl] = useState('');
  const [cardSelectedTags, setCardSelectedTags] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
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
        showToast("Warning: Failed to load data from Cloud (" + error.message + "). Loading cache locally.", 'error');
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
    if (w) {
      try {
        const parsed = JSON.parse(w);
        if (Array.isArray(parsed)) {
          while (parsed.length < 5) {
            parsed.push(null);
          }
          setWorkerSlotIds(parsed.slice(0, 5));
        }
      } catch (e) {
        console.error(e);
      }
    }
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
      { name: 'waifu', color: '#8b5cf6', desc: 'Primary favorite character' },
      { name: 'trade', color: '#b85c5c', desc: 'Card is ready for trade / sale' },
      { name: 'deck-1', color: '#3b82f6', desc: 'Primary worker deck' },
      { name: 'keeper', color: '#e0b84c', desc: 'Collection keepers' }
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

    const cleanBulkText = bulkText.replace(/\r/g, '').replace(/^Owned by .*$/gim, '');
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

      segments.forEach((seg, idx) => {
        const s = seg.trim();
        if (!s) return;

        // Extract last word to bypass emojis like 1️⃣ which contains digit 1
        const words = s.split(/\s+/);
        const lastWord = words[words.length - 1] || '';
        const cleanedSeg = lastWord.replace(/[^a-zA-Z0-9]/g, '');

        const codeM = cleanedSeg.match(/^[a-zA-Z0-9]{5,8}$/);
        if (codeM && !pCode && idx === 0) {
          const check = cleanedSeg.toLowerCase();
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
      setBulkImportFeedback({ text: "❌ No valid cards detected from the text you provided.", isError: true, isSuccess: false });
      return;
    }

    setBulkImportFeedback({ text: `Processing ${newCards.length} cards... Please wait.`, isError: false, isSuccess: false });

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
        setBulkImportFeedback({ text: `✅ ${successCount} cards successfully imported & synchronized to the Cloud! Reloading page...`, isError: false, isSuccess: true });
      } catch (err: any) {
        setBulkImportFeedback({ text: `⚠️ Some cards failed to sync to the cloud: ${err.message}`, isError: true, isSuccess: false });
      }
    } else {
      setBulkImportFeedback({ text: `✅ ${successCount} cards successfully imported to the app!`, isError: false, isSuccess: true });
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

    const cleanText = batchKiwiText.replace(/\r/g, '').replace(/^Owned by .*$/gim, '').trim();
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

        newCardsArray[cardIndex] = {
          ...card,
          stats: newStats,
          effort: parsedEffort !== undefined ? parsedEffort : card.effort,
          isWorker: card.isWorker
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
      
      setBatchKiwiFeedback({ text: `✅ Successfully updated ${updatedCount} cards! (${notFoundCount} cards not found)`, isError: false, isSuccess: true });
      setTimeout(() => {
        setIsBatchKiwiModalOpen(false);
        setBatchKiwiText('');
        setBatchKiwiFeedback({ text: '', isError: false, isSuccess: false });
      }, 3000);
    } else {
      setBatchKiwiFeedback({ text: `⚠️ No cards matched. Make sure the k!wi text contains the (card_code).`, isError: true, isSuccess: false });
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
      
      setBatchImageFeedback({ text: `✅ Successfully updated images for ${updatedCount} cards!`, isError: false, isSuccess: true });
      setTimeout(() => {
        setIsBatchImageModalOpen(false);
        setBatchImageText('');
        setBatchImageFeedback({ text: '', isError: false, isSuccess: false });
      }, 3000);
    } else {
      setBatchImageFeedback({ text: `⚠️ No matching card codes found or invalid format.`, isError: true, isSuccess: false });
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
    const lines = kuiInputText.replace(/\r/g, '').split('\n');
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
      .replace(/\r/g, '')
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

        segments.forEach((seg, idx) => {
          const s = seg.trim();
          if (!s) return;

          // Extract last word to bypass emojis like 1️⃣ which contains digit 1
          const words = s.split(/\s+/);
          const lastWord = words[words.length - 1] || '';
          const cleanedSeg = lastWord.replace(/[^a-zA-Z0-9]/g, '');

          const codeM = cleanedSeg.match(/^[a-zA-Z0-9]{5,8}$/);
          if (codeM && !parsedCode && idx === 0) {
            const check = cleanedSeg.toLowerCase();
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

      setParserFeedback({ text: '✅ Card info successfully parsed!', isError: false, isSuccess: true });
    } else {
      setParserFeedback({ text: '❌ Character name or card code not found. Make sure the text format is correct.', isError: true, isSuccess: false });
    }
  }


  function handleParseEffortText() {
    if (!effortDiscordText.trim()) {
      setEffortParserFeedback({ text: '❌ Text is empty.', isError: true, isSuccess: false });
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
      }
      setEffortParserFeedback({ text: '✅ Worker stats successfully parsed!', isError: false, isSuccess: true });
    } else {
      setEffortParserFeedback({ text: '❌ Worker stats not found in text.', isError: true, isSuccess: false });
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
        showToast("Invalid text! Make sure you copied the k!wi (Work Info) reply from the Karuta bot.", 'error');
        return;
      }
      
      setFStats(parsedStats);
      showToast("Successfully extracted k!wi worker stats!", 'success');
    } catch (e) {
      showToast("Failed to read clipboard. Please allow clipboard access in your browser or paste the text manually.", 'error');
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
    setParserFeedback({ text: 'Ready to parse text', isError: false, isSuccess: false });
    setEffortDiscordText('');
    setEffortParserFeedback({ text: 'Paste stat text (keqing/k!wi)', isError: false, isSuccess: false });

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
      setFIsInjured(!!card.isInjured);
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
      setFIsInjured(false);
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
      showToast("Character name is required!", 'error');
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
      isInjured: fIsInjured,
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
        showToast("Failed to save to Firebase database: " + error.message, 'error');
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
    if (!(await customConfirm('Are you sure you want to delete this card?'))) return false;

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
    if (!(await customConfirm('Remove from wishlist?'))) return;

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
    if (!(await customConfirm(`Delete tag "${name}"? This tag will also be removed from all cards.`))) return;

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
    if (!(await customConfirm(`Remove tag "${name}" from all cards? (The tag itself will not be deleted)`))) return;

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
    if (!(await customConfirm(`Delete ${selectedCards.size} selected cards?`))) return;

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
          showToast('JSON file format is incorrect or corrupted.', 'error');
          setBackupFileContent(null);
        }
      };
      reader.readAsText(file);
    }
  }

  async function handleApplyRestore() {
    if (!backupFileContent || backupFileContent.app !== 'cartoteca') {
      showToast('Cartoteca JSON backup is invalid.', 'error');
      return;
    }

    if (await customConfirm('Warning: This feature will overwrite and merge your current data with the backup file. Processes on the Cloud (if active) may take some time. Proceed?')) {
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
          showToast("Starting Cloud Firestore synchronization. Do not close the app...", 'info');
          
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
          
          showToast("Cloud Synchronization Complete! Data restored successfully.", 'success');
        } catch (e: any) {
          showToast("Cloud sync failed: " + e.message, 'error');
        }
      } else {
        showToast('Data successfully restored locally!', 'success');
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
            <div className="brand-text">
              <h1>Cartoteca</h1>
              <p>Karuta Companion App</p>
            </div>
          </div>
          <div className="mini-stats">
            <div className="mini-stat"><b>{totalCards}</b><span>Cards</span></div>
            <div className="mini-stat"><b>{new Set(cards.map(c => c.series).filter(Boolean)).size}</b><span>Series</span></div>
            <div className="mini-stat"><b>{wishlist.length}</b><span>Wishlist</span></div>
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
                  onClick={() => {
                    if (user?.uid) {
                      const shareUrl = `${window.location.origin}/?p=${user.uid}`;
                      navigator.clipboard.writeText(shareUrl)
                        .then(() => showToast('Your public read-only profile link has been copied to clipboard!', 'success'))
                        .catch(() => showToast('Failed to copy link.', 'error'));
                    }
                  }}
                  title="Share Profile"
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
                  🔗 Share Profile
                </button>
                <button
                  onClick={() => signOut(auth)}
                  title="Logout"
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
                  Logout
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
              👤 User Info
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
              <button ref={el => tabRefs.current['stats'] = el} className={`tab-btn ${activeTab === 'stats' ? 'active-text' : ''}`} onClick={() => handleTabChange('stats')}>📈 Stats</button>
              {!isReadOnly && <button ref={el => tabRefs.current['tags-manager'] = el} className={`tab-btn ${activeTab === 'tags-manager' ? 'active-text' : ''}`} onClick={() => handleTabChange('tags-manager')}>🏷️ Manage Tags</button>}
            </>
          ) : (
            <>
              <button ref={el => tabRefs.current['kui-stats'] = el} className={`tab-btn ${activeTab === 'kui-stats' ? 'active-text' : ''}`} onClick={() => handleTabChange('kui-stats')}>📊 Player Stats</button>
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
              
              {/* KUI Import Parser Section */}
              {!isReadOnly && (
                <div style={{ background: '#1c1912', padding: '16px', borderRadius: '8px', border: '1px solid #3a3327', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h4 style={{ margin: 0, color: '#e8dbce', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📥 Import Karuta User Info (k!ui)
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--ink-soft)', margin: 0 }}>
                    Paste the entire <code>k!ui</code> command reply from Discord below to display player stats on your public profile page.
                  </p>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'stretch' }}>
                    <textarea 
                      className="input-dark"
                      rows={3} 
                      placeholder="Cards dropped · 141,273&#10;Cards grabbed · 19,990"
                      value={kuiInputText}
                      onChange={(e) => setKuiInputText(e.target.value)}
                      style={{ flex: 1, minWidth: '280px' }}
                    />
                    <button 
                      className="btn" 
                      onClick={handleKUIParse} 
                      disabled={!kuiInputText.trim() || (!!kuiFeedback.text && !kuiFeedback.isError)}
                      style={{ padding: '0 24px' }}
                    >
                      Update Stats
                    </button>
                  </div>
                  {kuiFeedback.text && (
                    <div style={{ padding: '10px', borderRadius: '4px', fontSize: '12px', 
                      background: kuiFeedback.isError ? '#b85c5c20' : kuiFeedback.isSuccess ? '#5ea39620' : '#d8923e20',
                      color: kuiFeedback.isError ? '#ff8c8c' : kuiFeedback.isSuccess ? '#5ea396' : '#d8923e',
                      border: `1px solid ${kuiFeedback.isError ? '#b85c5c50' : kuiFeedback.isSuccess ? '#5ea39650' : '#d8923e50'}` 
                    }}>
                      {kuiFeedback.text}
                    </div>
                  )}
                </div>
              )}

              {Object.keys(userKUI).length > 0 ? (
                <>
                  {/* Section: Cards */}
                  {(userKUI['Cards dropped'] || userKUI['Cards grabbed'] || userKUI['Cards burned']) && (
                    <div style={{ background: '#1c1912', border: '1px solid #3a3327', borderRadius: '8px', padding: '20px' }}>
                      <div style={{ fontSize: '11px', color: '#d8923e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px' }}>🎴 Cards</div>
                      <div className="kui-dashboard-grid">
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
                      <div className="kui-dashboard-grid">
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
                      <div className="kui-dashboard-grid">
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
                      <div className="kui-dashboard-grid">
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
                      <div className="kui-dashboard-grid">
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
                      <div style={{ fontSize: '11px', color: '#ff6b6b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '16px' }}>👤 Player Details (KUI)</div>
                      <div className="kui-dashboard-grid">
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
                      💡 <span style={{ color: '#e8dbce' }}>Insight:</span> Out of <b style={{ color: '#d8923e' }}>{Number(userKUI['Cards dropped']).toLocaleString()}</b> drops,
                      you grabbed <b style={{ color: '#5ea396' }}>{Number(userKUI['Cards grabbed']).toLocaleString()}</b> cards
                      (<b style={{ color: '#e8dbce' }}>{Math.round((Number(userKUI['Cards grabbed']) / Number(userKUI['Cards dropped'])) * 100)}%</b> grab rate).
                      {userKUI['Cards burned'] && (
                        <> You have burned <b style={{ color: '#c14e4e' }}>{Number(userKUI['Cards burned']).toLocaleString()}</b> cards.
                        Binder collection: <b style={{ color: '#d8923e' }}>{cards.length.toLocaleString()}</b> cards.</>)}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', background: '#17140f', borderRadius: '8px', border: '1px dashed #3a3327' }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
                  <h3 style={{ color: '#e8dbce', marginBottom: '8px' }}>No Player Stats Loaded</h3>
                  <p style={{ color: '#9c8f76', fontSize: '14px' }}>
                    Paste the text from your Karuta <code>k!ui</code> bot response into the input field above to initialize your player stats dashboard.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB: BINDER COLLECTION */}
          {activeTab === 'collection' && (
            <div>
              <div className="toolbar" style={{ marginBottom: showFilters ? '12px' : '24px' }}>
                <div className="search-wrapper">
                  <input 
                    className="search-box" 
                    type="text" 
                    placeholder="Search character, series, code, or tag..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && <span className="clear-search" onClick={() => setSearchQuery('')}>&times;</span>}
                </div>
                
                <button 
                  className={`btn secondary ${showFilters ? 'active' : ''}`}
                  onClick={() => setShowFilters(!showFilters)}
                  style={{ 
                    padding: '10px 16px', 
                    fontSize: '13.5px', 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '6px', 
                    minWidth: '100px',
                    borderColor: showFilters ? 'var(--jade)' : 'var(--paper-line)',
                    background: showFilters ? 'rgba(94, 163, 150, 0.15)' : 'transparent',
                    color: showFilters ? 'var(--jade)' : 'var(--ink)'
                  }}
                >
                  🎛️ Filter {showFilters ? '▲' : '▼'}
                </button>

                {!isReadOnly && (
                  <>
                    <button className="btn" onClick={() => openCardModal(null)}>+ Add Card</button>
                    <button className="btn secondary" onClick={() => setIsBulkImportModalOpen(true)}>📥 Bulk Import (k!c)</button>
                    <button className="btn secondary" onClick={() => setIsBatchKiwiModalOpen(true)}>⚡ Batch k!wi</button>
                    <button className="btn secondary" onClick={() => setIsBatchImageModalOpen(true)}>🖼️ Batch Images</button>
                  </>
                )}
              </div>

              <div className={`filter-panel ${showFilters ? 'show' : ''}`}>
                {/* Group: Sort By */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#9c8f76', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Sort By</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                      { value: 'recent', label: 'Recently Added' },
                      { value: 'effort-desc', label: 'Highest Effort' },
                      { value: 'effort-asc', label: 'Lowest Effort' },
                      { value: 'print-asc', label: 'Lowest Print' },
                      { value: 'edition-desc', label: 'Latest Edition (◈)' },
                      { value: 'wish-desc', label: 'Most Wishlisted' },
                      { value: 'name', label: 'Name A-Z' }
                    ].map(opt => {
                      const active = sortOption === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setSortOption(opt.value)}
                          className="tag-select-chip"
                          style={{
                            borderColor: active ? 'var(--stamp)' : 'var(--paper-line)',
                            background: active ? 'rgba(216, 146, 62, 0.15)' : 'transparent',
                            color: active ? 'var(--stamp)' : 'var(--ink-soft)'
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Group: Condition */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#9c8f76', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Condition</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                      { value: '', label: 'All Conditions' },
                      { value: 'Damaged', label: 'Damaged' },
                      { value: 'Poor', label: 'Poor' },
                      { value: 'Average', label: 'Average' },
                      { value: 'Good', label: 'Good' },
                      { value: 'Great', label: 'Great' },
                      { value: 'Mint', label: 'Mint' }
                    ].map(opt => {
                      const active = selectedCondition === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setSelectedCondition(opt.value)}
                          className="tag-select-chip"
                          style={{
                            borderColor: active ? 'var(--stamp)' : 'var(--paper-line)',
                            background: active ? 'rgba(216, 146, 62, 0.15)' : 'transparent',
                            color: active ? 'var(--stamp)' : 'var(--ink-soft)'
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Group: Tags */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#9c8f76', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Tags</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                      { value: '', label: 'All Tags' },
                      ...getUsedTags().map(t => ({ value: t, label: t }))
                    ].map(opt => {
                      const active = selectedTag === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setSelectedTag(opt.value)}
                          className="tag-select-chip"
                          style={{
                            borderColor: active ? 'var(--stamp)' : 'var(--paper-line)',
                            background: active ? 'rgba(216, 146, 62, 0.15)' : 'transparent',
                            color: active ? 'var(--stamp)' : 'var(--ink-soft)'
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '4px', background: '#1c1912', borderRadius: '6px', padding: '4px' }}>
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
                  <span className="batch-info"><b>{selectedCards.size}</b> cards selected</span>
                  <div className="batch-actions">
                    <button className="btn btn-sm" onClick={() => setIsCommandModalOpen(true)}>Generate Command</button>
                    <button className="btn btn-sm" style={{ background: '#c14e4e', color: 'white', borderColor: '#a34141' }} onClick={() => setIsBurnResolveModalOpen(true)}>Process Burn</button>
                    <button className="btn secondary btn-sm" onClick={() => { setBatchSelectedTags([]); setIsBatchTagModalOpen(true); }}>Add Tag</button>
                    <button className="btn secondary btn-sm" onClick={handleBatchDelete}>Delete Selected</button>
                    <button className="btn secondary btn-sm" onClick={() => setSelectedCards(new Set())}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Grid List */}
              {cards.length === 0 ? (
                <div className="empty">
                  <div className="stamp-big">🎴</div>
                  <h3>Binder is empty</h3>
                  <p>Add your Karuta cards manually or use Bulk Import above.</p>
                  {!isReadOnly && <button className="btn" onClick={() => openCardModal(null)}>+ Add First Card</button>}
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
                                title="Delete Card"
                                onClick={async (e) => { 
                                  e.stopPropagation(); 
                                  await handleDeleteCard(c.id); 
                                }}
                              >
                                ×
                              </button>
                              <button 
                                className="nc-edit-btn"
                                title="Edit Card"
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
                          {c.isInjured && <div className="nc-badge injured" title="Cedera">🩹</div>}
                          
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
                            {c.isInjured && <span className="chip injured-tag" title="Cedera" style={{ background: '#c14e4e', color: '#fff' }}>🩹 C</span>}
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
                            {c.price && <div><span>Est. Price:</span> <b>{c.price} Tickets</b></div>}
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
                            <span style={{ fontSize: '13px', color: 'var(--ink-soft)', cursor: 'pointer', fontWeight: 600 }}>Select</span>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); openCardModal(c); }}>✏️ Edit</button>
                            <button className="icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteCard(c.id); }}>🗑️ Delete</button>
                          </div>
                        </div>)}
                      </div>
                    );
                        })}
                        {totalPages > 1 && (
                          <div className="pagination" style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '24px', padding: '16px 0', borderTop: '1px dashed var(--paper-line)', flexWrap: 'wrap' }}>
                            <button className="pag-btn" disabled={safeCurrentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>←</button>
                            
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
                                    className={`pag-btn ${safeCurrentPage === p ? 'active' : ''}`}
                                    onClick={() => setCurrentPage(p as number)}
                                  >
                                    {p}
                                  </button>
                                )
                              ));
                            })()}

                            <button className="pag-btn" disabled={safeCurrentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>→</button>
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
                  placeholder="Search wishlist..." 
                  value={wishSearchQuery}
                  onChange={(e) => setWishSearchQuery(e.target.value)}
                />
                <select value={wishSortOption} onChange={(e) => setWishSortOption(e.target.value)}>
                  <option value="priority-desc">Highest Priority</option>
                  <option value="name">Name A-Z</option>
                  <option value="series">Series A-Z</option>
                </select>
                {!isReadOnly && <button className="btn" onClick={() => openWishModal(null)}>+ Add Wishlist</button>}
              </div>

              {wishlist.length === 0 ? (
                <div className="empty">
                  <div className="stamp-big">✨</div>
                  <h3>No wishlist items yet</h3>
                  <p>Keep track of your target characters so you don't miss them in drops.</p>
                  {!isReadOnly && <button className="btn" onClick={() => openWishModal(null)}>+ Add First Wishlist</button>}
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
                      <p className="card-series">{w.series || 'Series not set'}</p>

                      <div className="card-meta">
                        <span className={`wish-priority ${w.priority}`}>
                          {w.priority === 'high' ? '🚨 High Priority' : w.priority === 'med' ? '⚡ Medium Priority' : '🌱 Low Priority'}
                        </span>
                        {w.targetWish && <span className="chip">Target: {w.targetWish} wishes</span>}
                      </div>

                      {w.notes && <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '4px', fontStyle: 'italic' }}>"{w.notes}"</div>}

                      {!isReadOnly && (                      <div className="card-actions">
                        <button className="icon-btn" onClick={() => openWishModal(w)}>✏️ Edit</button>
                        <button className="icon-btn delete" onClick={() => handleDeleteWish(w.id)}>🗑️ Delete</button>
                        <button 
                          className="btn btn-sm" 
                          style={{ marginLeft: 'auto', background: 'var(--jade)', color: '#fff', borderColor: 'var(--jade-soft)' }}
                          onClick={() => handleClaimWish(w)}
                        >
                          🎉 Claim
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
                <div className="stat-card"><b>{totalCards}</b><span>Total Cards</span></div>
                <div className="stat-card"><b>{avgEffort}</b><span>Average Effort</span></div>
                <div className="stat-card"><b>{lowPrint}</b><span>Low Print (≤99)</span></div>
                <div className="stat-card"><b>{mintCount}</b><span>Mint Condition (MT)</span></div>
              </div>

              <div className="charts-layout">
                <div className="bars">
                  <h4>Condition Distribution</h4>
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
                  <h4>Top Series</h4>
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
                  }) : <p style={{ fontSize: '13px', color: 'var(--ink-soft)', textAlign: 'center', padding: '10px' }}>No series data yet.</p>}
                </div>
              </div>

              <div className="charts-layout" style={{ marginTop: '16px' }}>
                <div className="bars">
                  <h4>Card Editions</h4>
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
                  }) : <p style={{ fontSize: '13px', color: 'var(--ink-soft)', textAlign: 'center', padding: '10px' }}>No edition data yet.</p>}
                </div>

                <div className="bars">
                  <h4>Top Effort Contributors</h4>
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
                  }) : <p style={{ fontSize: '13px', color: 'var(--ink-soft)', textAlign: 'center', padding: '10px' }}>No effort data yet.</p>}
                </div>
              </div>
            </div>
          )}

          {/* TAB: TAGS MANAGER */}
          {activeTab === 'tags-manager' && (
            <div className="tags-manager-layout">
              <div className="tag-form-card">
                <h4>Add / Edit Tag</h4>
                <div className="field">
                  <label>Tag Name *</label>
                  <input 
                    type="text" 
                    placeholder="e.g., waifu, trade, deck-1"
                    value={tagNameInput}
                    onChange={(e) => setTagNameInput(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Tag Color</label>
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
                  <label>Tag Description</label>
                  <input 
                    type="text" 
                    placeholder="Optional description"
                    value={tagDescInput}
                    onChange={(e) => setTagDescInput(e.target.value)}
                  />
                </div>
                <button className="btn" style={{ width: '100%' }} onClick={handleSaveTag}>Save Tag</button>
              </div>

              <div className="tag-list-card">
                <h4>Custom Tags List</h4>
                <div className="tag-table-container">
                  <table className="tag-table">
                    <thead>
                      <tr>
                        <th>Tag</th>
                        <th>Description</th>
                        <th>Card Count</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customTags.length === 0 ? (
                        <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>No custom tags defined yet.</td></tr>
                      ) : (
                        customTags.map(t => {
                          const cardCount = cards.filter(c => c.tags?.split(',').map(tg => tg.trim().toLowerCase()).includes(t.name.toLowerCase())).length;
                          return (
                            <tr key={t.name}>
                              <td><span className="custom-tag-chip" style={{ backgroundColor: t.color }}>{t.name}</span></td>
                              <td>{t.desc || '—'}</td>
                              <td><b>{cardCount}</b> cards</td>
                              <td>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  <button className="icon-btn" onClick={() => handleViewTagCollection(t.name)}>🔍 View Collection</button>
                                  <button className="icon-btn" onClick={() => { setTagNameInput(t.name); setTagColorInput(t.color); setTagDescInput(t.desc); }}>✏️ Edit</button>
                                  <button className="icon-btn" style={{ color: '#d8923e' }} onClick={() => handleUntagAll(t.name)}>❌ Untag All</button>
                                  <button className="icon-btn delete" onClick={() => handleDeleteCustomTag(t.name)}>🗑️ Delete</button>
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
                <h3 style={{ marginBottom: '16px' }}>💼 Job Board Calculator (Node Optimizer)</h3>
                <p style={{ color: 'var(--ink-soft)', fontSize: '13px', marginBottom: '20px' }}>
                  Select your 5 best worker cards (Slots A - E), enter the estimated Node Multiplier, and see potential Bits generated.
                </p>
                
                <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', overflowX: 'auto' }}>
                  {[0, 1, 2, 3, 4].map(slotIdx => {
                    const card = cards.find(c => c.id === workerSlotIds[slotIdx]);
                    return (
                      <div key={slotIdx} style={{ flex: 1, minWidth: '150px', padding: '16px', background: '#1c1912', border: '1px dashed #3a3327', borderRadius: '8px', textAlign: 'center', position: 'relative' }}>
                        <h4 style={{ color: '#9c8f76', marginBottom: '12px' }}>Slot {String.fromCharCode(65 + slotIdx)}</h4>
                        {card ? (
                          <>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#e8dbce', marginBottom: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                              {card.name} {card.isInjured && <span title="Injured" style={{ cursor: 'help' }}>🩹</span>}
                            </div>
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
                            {!isReadOnly && <button className="btn secondary" style={{ padding: '4px 8px', fontSize: '11px', width: '100%' }} onClick={() => handleSetWorker(slotIdx, null)}>Unequip</button>}
                          </>
                        ) : (
                          <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Empty Slot</div>
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
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div style={{ fontSize: '12px', color: '#9c8f76' }}>
                      Total Effort (Contribution): <span style={{ fontWeight: 'bold', color: '#e8dbce', fontFamily: 'monospace' }}>{workerSlotIds.map(id => cards.find(c => c.id === id)?.effort || 0).reduce((a, b) => a + b, 0)}</span> / 800
                      {workerSlotIds.map(id => cards.find(c => c.id === id)?.effort || 0).reduce((a, b) => a + b, 0) >= 800 ? (
                        <span style={{ color: '#5ea396', marginLeft: '6px', fontWeight: 'bold' }}>✅ Good Board</span>
                      ) : (
                        <span style={{ color: '#c4964a', marginLeft: '6px' }}>{"⚠️ Target >= 800"}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9c8f76' }}>Est. Bits per Drop:</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#5ea396', fontFamily: 'monospace' }}>
                      {Math.round(workerSlotIds.map(id => cards.find(c => c.id === id)?.effort || 0).reduce((a, b) => a + b, 0) * nodeMultiplier)} 🔵
                    </div>
                  </div>
                </div>
              </div>

              {/* Guidelines / Tips from SKILL.md */}
              <div className="stat-card" style={{ gridColumn: '1 / -1', background: '#17140f', border: '1px solid #3a3327' }}>
                <h4 style={{ color: '#d8923e', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>💡 Karuta Job Board Guide</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', fontSize: '13px', color: '#9c8f76' }}>
                  <div style={{ background: '#1c1912', padding: '16px', borderRadius: '8px', border: '1px solid #2a251b' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#ede3ce', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🩹 Wellness & Injuries
                    </div>
                    <p style={{ margin: 0, lineHeight: '1.5' }}>Cards risk injury while working (7.5% per card). Injury sets the Wellness stat to 0, drastically reducing effort. Heal by manually checking the Injured 🩹 status or applying a Bandage.</p>
                  </div>
                  <div style={{ background: '#1c1912', padding: '16px', borderRadius: '8px', border: '1px solid #2a251b' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#ede3ce', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      📜 Work Permit
                    </div>
                    <p style={{ margin: 0, lineHeight: '1.5' }}>Required to work using the k!work command. Creating a Work Permit costs 2,000 Gold with an active period of 30 days.</p>
                  </div>
                  <div style={{ background: '#1c1912', padding: '16px', borderRadius: '8px', border: '1px solid #2a251b' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#ede3ce', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🗺️ Node & Taxes
                    </div>
                    <p style={{ margin: 0, lineHeight: '1.5' }}>Always look for the Node with the lowest tax to maximize returns. Gold Nodes always have a flat 50% tax regardless of clan ownership.</p>
                  </div>
                </div>
              </div>

              <div className="stat-card" style={{ gridColumn: '1 / -1' }}>
                <h4 style={{ marginBottom: '16px' }}>Your Worker Cards</h4>
                <p style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '16px' }}>Click a card below to assign it to an empty slot. (Shows cards flagged as 'Worker').</p>
                <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '16px' }}>
                  {cards.filter(c => c.isWorker || (c.tags && c.tags.split(',').map(t => t.trim().toLowerCase()).some(t => t === 'worker' || t === 'worker-deck'))).sort((a,b) => (b.effort||0)-(a.effort||0)).slice(0, 50).map(c => {
                    const isUsed = workerSlotIds.includes(c.id);
                    return (
                      <div 
                        key={c.id} 
                        onClick={() => {
                          if (isReadOnly) return;
                          if (!isUsed) {
                            const emptyIdx = workerSlotIds.findIndex(id => id === null);
                            if (emptyIdx !== -1) handleSetWorker(emptyIdx, c.id);
                            else handleSetWorker(4, c.id); // overwrite 5th slot if full
                          }
                        }}
                        style={{ 
                          minWidth: '120px', maxWidth: '140px', padding: '12px', background: isUsed ? '#2a251b' : '#1c1912', border: '1px solid #3a3327', 
                          borderRadius: '8px', cursor: isReadOnly ? 'default' : (isUsed ? 'not-allowed' : 'pointer'), opacity: isUsed ? 0.5 : 1, transition: '0.2s'
                        }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#e8dbce', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {c.name} {c.isInjured && <span title="Injured" style={{ color: '#ff8c8c' }}>🩹</span>}
                        </div>
                        <div style={{ fontSize: '14px', color: '#d8923e', fontWeight: 'bold', fontFamily: 'monospace' }}>{c.effort || 0} E</div>
                      </div>
                    );
                  })}
                  {cards.length > 0 && cards.filter(c => c.isWorker || (c.tags && c.tags.split(',').map(t => t.trim().toLowerCase()).some(t => t === 'worker' || t === 'worker-deck'))).length === 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>No cards are flagged as Workers.</div>
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
                    const lines = invPasteText.replace(/\r/g, '').split('\n');
                    const updates: Partial<typeof inventory> = {};

                    lines.forEach(line => {
                      // Clean bold, tildes, backticks, asterisks, underscores
                      const cleanLine = line.replace(/[\*_`~]/g, '').trim();
                      if (!cleanLine) return;

                      // Split by dot (·), bar (|), or bullet (•)
                      const parts = cleanLine.split(/\s*[\u00b7\|\u2022·•]\s*/);
                      if (parts.length < 2) return;

                      let count: number | null = null;
                      let rest = '';

                      parts.forEach(part => {
                        const p = part.trim();
                        // Remove emojis/clutter at start
                        const cleanPart = p.replace(/^[^a-zA-Z0-9]+/, '').trim();
                        
                        // Parse count if it is a number
                        const numStr = cleanPart.replace(/,/g, '');
                        if (/^\d+$/.test(numStr)) {
                          count = parseInt(numStr);
                        } else if (cleanPart) {
                          rest += ' ' + cleanPart.toLowerCase();
                        }
                      });

                      if (count !== null) {
                        const restStr = rest.trim();
                        if (restStr.includes('ticket')) updates.tickets = count;
                        else if (restStr.includes('gold')) updates.gold = count;
                        else if (restStr.includes('gem')) updates.gems = count;
                        else if (restStr.includes('work permit')) updates.workPermit = count;
                        else if (restStr.includes('trade license')) updates.tradeLicense = count;
                        else if (restStr.includes('bit') && !/(flower|wood|ice|stone|sugar|wool|uranium|bone|iron|copper|quartz|essence|magma|zinc)/.test(restStr)) updates.bits = count;
                        else if (restStr.includes('dust')) {
                          if (restStr.includes('damaged') || restStr.includes('\u2606\u2606\u2606\u2606') || restStr.includes('☆☆☆☆')) updates.dust0 = count;
                          else if (restStr.includes('poor') || restStr.includes('\u2605\u2606\u2606\u2606') || restStr.includes('★☆☆☆')) updates.dust1 = count;
                          else if (restStr.includes('good') || restStr.includes('\u2605\u2605\u2606\u2606') || restStr.includes('★★☆☆')) updates.dust2 = count;
                          else if (restStr.includes('excellent') || restStr.includes('\u2605\u2605\u2605\u2606') || restStr.includes('★★★☆')) updates.dust3 = count;
                          else if (restStr.includes('mint') || restStr.includes('\u2605\u2605\u2605\u2605') || restStr.includes('★★★★')) updates.dust4 = count;
                        }
                      }
                    });

                    if (Object.keys(updates).length > 0) {
                      handleUpdateInventory({ ...inventory, ...updates });
                      setInvParseFeedback({ text: `\u2705 ${Object.keys(updates).length} items successfully updated from k!inv!`, isError: false });
                      setInvPasteText('');
                      setTimeout(() => setInvParseFeedback(null), 3000);
                    } else {
                      setInvParseFeedback({ text: '\u26a0\ufe0f No items detected. Copy the entire response from the k!inv / k!i Karuta bot.', isError: true });
                    }
                  };

                  return (
                    <div style={{ background: '#17140f', border: '1px solid #3a3327', borderRadius: '8px', padding: '16px' }}>
                      <div style={{ fontSize: '12px', color: '#d8923e', fontWeight: 700, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        📋 Sync from k!inv
                      </div>
                      <p style={{ fontSize: '12px', color: '#9c8f76', margin: '0 0 10px 0' }}>
                        Type <code style={{ background: '#252118', padding: '1px 5px', borderRadius: '3px' }}>k!inv</code> in Discord, then paste the reply here. All values will be <b style={{ color: '#5ea396' }}>automatically updated</b>.
                      </p>
                      <textarea
                        className="form-control"
                        rows={4}
                        placeholder={"Inventory\nItems carried by @Username\n\n✨ 701 · poor dust · Dust (★☆☆☆)\n🪙 1,200 · gold · Gold\n..."}
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
                        Sync
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
              <h2>{cardFormId ? 'Edit Card Details' : 'Add New Card'}</h2>
              <button className="close-modal-btn" onClick={() => setIsCardModalOpen(false)}>&times;</button>
            </div>

            {/* Parser Section */}
            <div className="parser-section">
              <details>
                <summary>✨ <b>Auto-fill via Discord Text</b></summary>
                <div className="parser-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  
                  {/* Card Info (k!c) */}
                  <div style={{ background: '#1c1912', padding: '12px', borderRadius: '8px', border: '1px solid #3a3327' }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#d8923e', marginBottom: '8px' }}>1. Paste Card Info (k!c)</div>
                    <textarea 
                      placeholder="Paste card info text here..." 
                      rows={2}
                      value={discordText}
                      onChange={(e) => setDiscordText(e.target.value)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                      <span className={`parser-status ${parserFeedback.isError ? 'error' : parserFeedback.isSuccess ? 'success' : ''}`}>{parserFeedback.text}</span>
                      <button className="btn btn-sm" onClick={handleParseText}>Parse Card Info</button>
                    </div>
                  </div>

                  {/* Worker/Effort Info (k!w) */}
                  <div style={{ background: '#1c1912', padding: '12px', borderRadius: '8px', border: '1px solid #3a3327' }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#5ea396', marginBottom: '8px' }}>2. Paste Worker/Effort Info (k!w / k!wi)</div>
                    <textarea 
                      placeholder="Paste worker details text here..." 
                      rows={2}
                      value={effortDiscordText}
                      onChange={(e) => setEffortDiscordText(e.target.value)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                      <span className={`parser-status ${effortParserFeedback.isError ? 'error' : effortParserFeedback.isSuccess ? 'success' : ''}`}>{effortParserFeedback.text}</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-sm secondary" onClick={handleParseKiwi}>From Clipboard</button>
                        <button className="btn btn-sm" onClick={handleParseEffortText}>Parse Worker Info</button>
                      </div>
                    </div>
                  </div>
                  
                </div>
              </details>
            </div>
            
            {fStats && (
              <div style={{ background: '#1c1912', padding: '12px', borderRadius: '8px', border: '1px dashed #3a3327', marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <div style={{ width: '100%', fontSize: '11px', color: '#9c8f76', textAlign: 'center', marginBottom: '4px' }}>Worker Stats (k!wi)</div>
                {Object.entries(fStats).map(([k, v]) => (
                  <div key={k} style={{ background: '#2a251b', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#9c8f76', textTransform: 'capitalize' }}>{k.substring(0,3)}</span>
                    <span style={{ color: v === 'S' ? '#d8923e' : v === 'A' ? '#5ea396' : '#fff', fontWeight: 'bold' }}>{v}</span>
                  </div>
                ))}
                <button className="btn secondary btn-sm" style={{ padding: '2px 6px', fontSize: '10px' }} onClick={() => setFStats(undefined)}>Remove Stats</button>
              </div>
            )}

            <div className="field-row-3">
              <div className="field">
                <label>Card Code</label>
                <input type="text" placeholder="e.g., mz4xq" value={fCode} onChange={(e) => setFCode(e.target.value)} />
              </div>
              <div className="field">
                <label>Print Num</label>
                <input type="number" placeholder="e.g., 14" value={fPrint} onChange={(e) => setFPrint(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Edition ◈</label>
                <input type="number" placeholder="e.g., 3" value={fEdition} onChange={(e) => setFEdition(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
            </div>

            <div className="field">
              <label>Character Name *</label>
              <input type="text" placeholder="e.g., Megumi Kato" value={fName} onChange={(e) => setFName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Series</label>
              <input type="text" placeholder="e.g., Saekano" value={fSeries} onChange={(e) => setFSeries(e.target.value)} />
            </div>

            <div className="field-row-3">
              <div className="field">
                <label>Condition</label>
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
                <input type="number" placeholder="e.g., 420" value={fEffort} onChange={(e) => setFEffort(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Wish Count</label>
                <input type="number" placeholder="e.g., 1200" value={fWish} onChange={(e) => setFWish(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>Estimated Price (Tickets)</label>
                <input type="number" placeholder="e.g., 15" value={fPrice} onChange={(e) => setFPrice(e.target.value === '' ? '' : Number(e.target.value))} />
                {cardFormId && cards.find(c => c.id === cardFormId)?.priceHistory && cards.find(c => c.id === cardFormId)!.priceHistory!.length > 0 && (
                  <div style={{ background: '#17140f', padding: '8px', borderRadius: '4px', border: '1px solid #3a3327', marginTop: '8px' }}>
                    <div style={{ fontSize: '10px', color: '#9c8f76', marginBottom: '4px' }}>📉 Price History</div>
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
                <label style={{ marginBottom: '8px' }}>Status</label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', height: '36px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'normal', cursor: 'pointer' }}>
                    <input type="checkbox" checked={fIsWorker} onChange={(e) => setFIsWorker(e.target.checked)} style={{ width: 'auto' }} /> Worker Deck
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'normal', cursor: 'pointer' }}>
                    <input type="checkbox" checked={fIsTrade} onChange={(e) => setFIsTrade(e.target.checked)} style={{ width: 'auto' }} /> Trade / Sale
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'normal', cursor: 'pointer', color: fIsInjured ? '#ff8c8c' : 'inherit' }}>
                    <input type="checkbox" checked={fIsInjured} onChange={(e) => setFIsInjured(e.target.checked)} style={{ width: 'auto' }} /> Injured 🩹
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
                  <input type="text" placeholder="e.g., S" value={fStats?.purity || ''} onChange={(e) => updateFStat('purity', e.target.value)} />
                </div>
                <div className="field">
                  <label>Wellness</label>
                  <input type="text" placeholder="e.g., S" value={fStats?.wellness || ''} onChange={(e) => updateFStat('wellness', e.target.value)} />
                </div>
                <div className="field">
                  <label>Toughness</label>
                  <input type="text" placeholder="e.g., F" value={fStats?.toughness || ''} onChange={(e) => updateFStat('toughness', e.target.value)} />
                </div>
              </div>
              <div className="field-row-3">
                <div className="field">
                  <label>Quickness</label>
                  <input type="text" placeholder="e.g., B" value={fStats?.quickness || ''} onChange={(e) => updateFStat('quickness', e.target.value)} />
                </div>
                <div className="field">
                  <label>Style</label>
                  <input type="text" placeholder="e.g., F" value={fStats?.style || ''} onChange={(e) => updateFStat('style', e.target.value)} />
                </div>
                <div className="field">
                  <label>Grabber</label>
                  <input type="text" placeholder="e.g., S" value={fStats?.grabber || ''} onChange={(e) => updateFStat('grabber', e.target.value)} />
                </div>
              </div>
              <div className="field-row-3">
                <div className="field">
                  <label>Dropper</label>
                  <input type="text" placeholder="e.g., S" value={fStats?.dropper || ''} onChange={(e) => updateFStat('dropper', e.target.value)} />
                </div>
                <div className="field">
                  <label>Vanity</label>
                  <input type="text" placeholder="e.g., D" value={fStats?.vanity || ''} onChange={(e) => updateFStat('vanity', e.target.value)} />
                </div>
                <div className="field">
                  <label>Appeal</label>
                  <input type="text" placeholder="e.g., S" value={fStats?.appeal || ''} onChange={(e) => updateFStat('appeal', e.target.value)} />
                </div>
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>Frame Name</label>
                <input type="text" placeholder="e.g., Maple Frame" value={fFrame} onChange={(e) => setFFrame(e.target.value)} />
              </div>
              <div className="field">
                <label>Dye Name / Color</label>
                <input type="text" placeholder="e.g., Purple Haze" value={fDye} onChange={(e) => setFDye(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Collection Tags (Click to select)</label>
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
              <label>Additional Notes</label>
              <textarea placeholder="Write notes, trade details, etc..." rows={2} value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Card Image (Album View)</label>
              {fImageUrl && (
                <div style={{ marginBottom: '8px', position: 'relative', width: '120px', height: '180px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--paper-line)' }}>
                  <img src={fImageUrl} alt="Card" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button 
                    className="icon-btn delete" 
                    title="Delete Image"
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
                  placeholder="Paste image URL from Discord (optional)" 
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
                  Delete
                </button>
              ) : <div />}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn secondary" onClick={() => setIsCardModalOpen(false)}>Cancel</button>
                <button className="btn" onClick={handleSaveCard}>Save Card</button>
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
              <h3>Batch Add Tag</h3>
              <button className="close-modal-btn" onClick={() => setIsBatchTagModalOpen(false)}>&times;</button>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '0' }}>Select tags to add to the selected cards:</p>

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
              <button className="btn secondary" onClick={() => setIsBatchTagModalOpen(false)}>Cancel</button>
              <button className="btn" onClick={handleBatchSaveTags}>Apply</button>
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
              <label>Select Command Type</label>
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
                <label>Tag Name</label>
                <input 
                  type="text" 
                  value={commandArg} 
                  onChange={(e) => setCommandArg(e.target.value)} 
                  className="form-control" 
                  placeholder="e.g., Worker"
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
                  <p style={{ fontSize: '12px', margin: '0 0 8px 0', color: 'var(--ink-soft)' }}>Command Output:</p>
                  <code style={{ display: 'block', wordBreak: 'break-all', fontSize: '13px', color: 'var(--jade-soft)', fontFamily: 'monospace' }}>
                    {cmdStr}
                  </code>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <button 
                      className="btn btn-sm" 
                      onClick={(e) => {
                        navigator.clipboard.writeText(cmdStr);
                        e.currentTarget.innerText = '📋 Copied!';
                        setTimeout(() => { e.currentTarget.innerText = 'Copy to Clipboard'; }, 1000);
                      }}
                    >
                      Copy to Clipboard
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
              <h3>Process Burn</h3>
              <button className="close-modal-btn" onClick={() => setIsBurnResolveModalOpen(false)}>&times;</button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: 0 }}>
              Paste the response message from the Karuta bot after you run <code>k!mb</code> to automatically gain materials and delete {selectedCards.size} cards from your Cartoteca collection.
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
                    Warning: {selectedCards.size} selected cards will be deleted from Cartoteca.
                  </p>
                </div>
              );
            })()}

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button className="btn secondary" onClick={() => setIsBurnResolveModalOpen(false)}>Cancel</button>
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
                Resolve & Delete Cards
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
                <h4 style={{ color: '#e8dbce', marginBottom: '8px', fontSize: '14px' }}>Export (Back Up Data)</h4>
                <p style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '12px' }}>Download your entire card collection, wishlist, and settings as a JSON file.</p>
                <button className="btn" onClick={triggerExportJSON} style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                  📥 Download JSON File
                </button>
              </div>

              <div style={{ background: '#17140f', padding: '16px', borderRadius: '8px', border: '1px solid #3a3327' }}>
                <h4 style={{ color: '#e8dbce', marginBottom: '8px', fontSize: '14px' }}>Import (Restore Data)</h4>
                <p style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '12px' }}>Select a JSON backup file to restore your collection. (Warning: this will overwrite all existing local data).</p>
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={handleFileSelect} 
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                  <button className="btn secondary" onClick={() => fileInputRef.current?.click()} style={{ padding: '6px 12px', fontSize: '12px' }}>Select File...</button>
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
                  ⚠️ Start Restoring Data
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
                Open Discord, run the command <code style={{ background: '#1c1912', padding: '2px 4px', borderRadius: '4px' }}>k!c</code>, then copy the entire response text and paste it below:
              </p>
              <textarea 
                className="input-field" 
                style={{ width: '100%', height: '250px', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap', background: '#1c1912', color: '#e8dbce', border: '1px solid #3a3327', borderRadius: '8px', padding: '12px' }}
                placeholder={`Example:\nkd · mz4xq · ◈3 · #14 · Mint · 420 effort · Megumi Kato · Saekano\nkd · asdfg · ◈2 · #100 · Good · 330 effort · Rem · Re:Zero`}
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
                🚀 Process & Save All Cards
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
                <span style={{ color: '#d8923e' }}>⚡</span> Batch Worker Stats (k!wi)
              </h3>
              <button onClick={() => setIsBatchKiwiModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#9c8f76', fontSize: '24px', cursor: 'pointer', padding: '0' }}>&times;</button>
            </div>
            
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.5' }}>
                Paste multiple k!wi bot replies below at once. The system will automatically detect the card code in parentheses, e.g., <code>(a1b2c)</code>, and match it to your collection.
              </p>
              
              <textarea 
                className="input-dark"
                rows={10} 
                placeholder="Worker Details\nCharacter · ... (a1b2c)\nEffort · 200\n\n... paste more replies ..."
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
                🚀 Batch Update Stats
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
                <span style={{ color: '#d8923e' }}>🖼️</span> Batch Card Images
              </h3>
              <button onClick={() => { setIsBatchImageModalOpen(false); setQuickImageMode(false); }} style={{ background: 'transparent', border: 'none', color: '#9c8f76', fontSize: '24px', cursor: 'pointer', padding: '0' }}>&times;</button>
            </div>
            
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #3a3327', paddingBottom: '12px' }}>
                <button className={`tab-btn ${!quickImageMode ? 'active-text' : ''}`} onClick={() => setQuickImageMode(false)} style={{ flex: 1 }}>📜 Batch Text Format</button>
                <button className={`tab-btn ${quickImageMode ? 'active-text' : ''}`} onClick={() => { setQuickImageMode(true); setQuickImageIndex(0); }} style={{ flex: 1 }}>⚡ Quick Fill Mode</button>
              </div>

              {!quickImageMode ? (
                <>
                  <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.5' }}>
                    Paste in the format: <code>code|image_url</code> (one per line). Ideal for mass updates if you have data in a spreadsheet or notepad.
                  </p>
                  
                  <textarea 
                    className="input-dark"
                    rows={10} 
                    placeholder="a1b2c|https://...\nx9y8z|https://..."
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
                    🖼️ Batch Update Images
                  </button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: '1.5' }}>
                    The system will show your cards without images one by one. Paste the image URL and press Enter to save and continue.
                  </p>
                  {(() => {
                    const cardsWithoutImage = cards.filter(c => !c.imageUrl);
                    if (cardsWithoutImage.length === 0) {
                      return <div style={{ textAlign: 'center', padding: '40px 0', color: '#5ea396' }}>✅ All cards in your collection already have images!</div>;
                    }
                    if (quickImageIndex >= cardsWithoutImage.length) {
                      return <div style={{ textAlign: 'center', padding: '40px 0', color: '#5ea396' }}>✅ You have completed all image upload queues!</div>;
                    }
                    const c = cardsWithoutImage[quickImageIndex];
                    return (
                      <div style={{ background: '#17140f', padding: '16px', borderRadius: '8px', border: '1px solid #3a3327' }}>
                        <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '8px' }}>Card {quickImageIndex + 1} of {cardsWithoutImage.length}</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#e8dbce', marginBottom: '4px' }}>{c.name}</div>
                        <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '16px' }}>{c.series} • {c.code}</div>
                        
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input 
                            type="text" 
                            className="input-dark" 
                            placeholder="Paste image URL (https://...)"
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

      {/* Toast Notifications Container */}
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '350px',
        pointerEvents: 'none'
      }}>
        {toasts.map(t => (
          <div 
            key={t.id} 
            style={{
              padding: '12px 18px',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              background: t.type === 'success' ? '#5ea396' : t.type === 'error' ? '#c14e4e' : '#d8923e',
              border: `1px solid ${t.type === 'success' ? '#4d877d' : t.type === 'error' ? '#a34141' : '#b87a2e'}`,
              animation: 'slideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              pointerEvents: 'auto'
            }}
          >
            <span>{t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}</span>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button 
              onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                opacity: 0.7,
                cursor: 'pointer',
                fontSize: '16px',
                padding: '0 0 0 8px'
              }}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
