import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth, db, storage } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { GoogleGenAI, Type } from '@google/genai';
import { motion } from 'motion/react';

const getAi = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'undefined') {
    throw new Error("GEMINI_API_KEY is missing. Please add it to the Secrets panel (Gear icon -> Secrets).");
  }
  return new GoogleGenAI({ apiKey });
};

interface ScanRecord {
  id: string;
  imageUrl: string;
  condition: string;
  urgency: string;
  confidence: string;
  createdAt?: any;
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<'idle' | 'uploading' | 'analyzing' | 'saving'>('idle');
  const [scanResult, setScanResult] = useState<{ condition: string; urgency: string; confidence: string } | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const [isHovering, setIsHovering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.remove('fading');
    document.body.classList.add('fade-in-page');
    return () => { document.body.classList.remove('fade-in-page'); }
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        navigate('/auth');
      } else {
        setUser(currentUser);
        setLoading(false);

        // Fetch user scans
        const scansRef = collection(db, `users/${currentUser.uid}/scans`);
        const q = query(scansRef, where("userId", "==", currentUser.uid));
        const unsubScans = onSnapshot(q, (snapshot) => {
          const loadedScans = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as ScanRecord[];
          
          // Sort explicitly in JS to avoid composite index requirement
          loadedScans.sort((a, b) => {
             const timeA = a.createdAt?.toMillis?.() || 0;
             const timeB = b.createdAt?.toMillis?.() || 0;
             return timeB - timeA;
          });
          
          setScans(loadedScans);
        }, (error) => {
          console.error("Firestore error:", error);
        });
        
        return () => unsubScans();
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/auth');
    } catch (error) {
      console.error('Error signing out', error);
    }
  };

  const handleUploadClick = () => {
    if (isScanning) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      setIsScanning(true);
      setPreviewUrl(URL.createObjectURL(file));
      
      // 1. Read file as base64 immediately
      setScanStep('uploading');
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result?.toString().split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      if (!base64Data) throw new Error("Could not read image data");

      // 2. Analyze with Gemini 3 flash model (PRIORITY)
      setScanStep('analyzing');
      const ai = getAi();
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: file.type,
              },
            },
            {
              text: 'Analyze this skin photo. Identify the skin condition if visible (e.g. acne, eczema, flag for review). Assess urgency (Low, Medium, High). Provide confidence level (0-100%). You are an expert assistant.',
            },
          ],
        },
        config: {
          systemInstruction: "You are Derma-AI, a professional skin condition screening assistant. You analyze skin photos to identify potential conditions, assess urgency, and provide confidence levels. You must be accurate and concise. Always return results in the specified JSON format. Remember: You are NOT a diagnostic tool, use clinical but accessible language.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              condition: { type: Type.STRING, description: "Identified condition" },
              urgency: { type: Type.STRING, description: "Low, Medium, or High" },
              confidence: { type: Type.STRING, description: "e.g. '85%'" }
            },
            required: ["condition", "urgency", "confidence"]
          }
        }
      });

      if (!response.text) throw new Error("AI failed to provide an analysis result.");
      const result = JSON.parse(response.text);
      setScanResult(result);

      // Show result immediately!
      setIsScanning(false);
      setShowResultModal(true);
      setScanStep('idle');

      // 3. Save results to Firestore in the background
      try {
        let imageUrl = '';
        const storageRef = ref(storage, `scans/${user.uid}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        imageUrl = await getDownloadURL(storageRef);

        await addDoc(collection(db, `users/${user.uid}/scans`), {
          userId: user.uid,
          imageUrl: imageUrl || '',
          condition: result.condition,
          urgency: result.urgency,
          confidence: result.confidence,
          createdAt: serverTimestamp()
        });
      } catch (saveErr) {
        console.error("Background save failed:", saveErr);
        // We don't alert the user here because they already see the results in the modal
      }
      
    } catch (error: any) {
      console.error("Scan failed:", error);
      alert("Failed to analyze image: " + (error.message || "Unknown error"));
      setIsScanning(false);
      setScanStep('idle');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
        <p className="font-[var(--font-body)] text-[var(--ink-2)] text-[14px]">Verifying secure session...</p>
      </div>
    );
  }

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const navItems = ['Dashboard', 'New Scan', 'My History', 'Settings'];

  return (
    <>
      <div 
        className={`custom-cursor hidden md:block ${isHovering ? 'hovering' : ''}`}
        style={{ left: cursorPos.x, top: cursorPos.y }}
      />

      {/* RESULT MODAL */}
      {showResultModal && scanResult && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-[20px]">
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 bg-[var(--bg-dark)]/80 backdrop-blur-md" 
            onClick={() => setShowResultModal(false)}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative bg-[var(--bg-base)] w-full max-w-[500px] rounded-[4px] p-[48px] shadow-2xl border border-[var(--border-light)]"
          >
            <div className="flex justify-between items-start mb-[32px]">
              <div>
                <p className="font-[500] font-[var(--font-body)] text-[11px] uppercase tracking-[0.1em] text-[var(--teal)] mb-[8px]">Scan Analysis Complete</p>
                <h2 className="font-[600] font-[var(--font-display)] text-[32px] text-[var(--ink)] leading-[1.1]">Findings</h2>
              </div>
              <button 
                onClick={() => setShowResultModal(false)}
                className="w-[32px] h-[32px] rounded-full border border-[var(--border-light)] flex items-center justify-center text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors"
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="space-y-[24px] mb-[40px]">
              <div>
                <p className="font-[500] font-[var(--font-body)] text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)] mb-[4px]">Condition</p>
                <p className="font-[400] font-[var(--font-body)] text-[20px] text-[var(--ink)]">{scanResult.condition}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-[24px]">
                <div>
                  <p className="font-[500] font-[var(--font-body)] text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)] mb-[4px]">Urgency</p>
                  <span className={`inline-flex items-center px-[12px] py-[4px] rounded-full font-[600] font-[var(--font-body)] text-[11px] uppercase tracking-[0.05em] 
                    ${scanResult.urgency?.toLowerCase() === 'high' ? 'bg-red-500/10 text-red-700' : 
                      scanResult.urgency?.toLowerCase() === 'medium' ? 'bg-orange-500/10 text-orange-700' : 
                      'bg-[var(--teal)]/10 text-[var(--teal)]'}`}>
                    {scanResult.urgency}
                  </span>
                </div>
                <div>
                  <p className="font-[500] font-[var(--font-body)] text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)] mb-[4px]">AI Confidence</p>
                  <p className="font-[600] font-[var(--font-body)] text-[18px] text-[var(--ink)]">{scanResult.confidence}</p>
                </div>
              </div>
            </div>

            <div className="p-[20px] bg-[var(--bg-paper)] rounded-[2px] border border-[var(--border-light)] mb-[32px]">
              <p className="font-[400] font-[var(--font-body)] text-[12px] text-[var(--ink-2)] italic leading-[1.6]">
                "Note: This analysis is for informational purposes only. Please consult a qualified dermatologist for a formal diagnosis and treatment plan."
              </p>
            </div>

            <button 
              onClick={() => setShowResultModal(false)}
              className="btn-primary w-full"
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            >
              Done
            </button>
          </motion.div>
        </div>
      )}
      
      <div className="flex min-h-screen bg-[var(--bg-base)] relative overflow-hidden">
        {/* Subtle Liquid Glass / Blob Background */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[var(--teal-light)] opacity-[0.05] blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-[#A89885] opacity-[0.08] blur-[150px] rounded-full pointer-events-none" />

        {/* SIDEBAR */}
        <aside className="w-[240px] bg-[var(--bg-dark)] border-r border-[var(--border-dark)] flex shrink-0 flex-col py-[32px] px-[24px] z-10 sticky top-0 h-screen">
          <div className="flex items-center mb-[64px]">
            <span className="font-[500] font-[var(--font-body)] text-[15px] text-[var(--paper-text)] tracking-[0.05em]">
              DERMA-AI.
            </span>
            <span className="w-[6px] h-[6px] bg-[var(--teal)] rounded-full inline-block ml-[3px]" />
          </div>

          <nav className="flex-1 flex flex-col gap-[8px]">
            {navItems.map((item, idx) => (
              <button 
                key={item}
                className={`text-left px-[16px] py-[12px] rounded-[4px] font-[500] font-[var(--font-body)] text-[13px] tracking-[0.02em] transition-all duration-300 ${idx === 0 ? 'bg-white/10 text-white' : 'text-[var(--paper-muted)] hover:text-white hover:bg-white/5'}`}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
              >
                {item}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-[32px] border-t border-[var(--border-dark)]">
            <p className="font-[400] font-[var(--font-body)] text-[11px] text-[var(--paper-muted)] truncate mb-[16px] block px-[8px]">
              {user?.email}
            </p>
            <button 
              onClick={handleSignOut}
              className="w-full text-left px-[8px] py-[8px] font-[500] font-[var(--font-body)] text-[12px] text-white hover:text-[var(--teal-light)] transition-colors"
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 p-[48px] overflow-y-auto z-10">
          <motion.div 
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="flex flex-col md:flex-row md:items-end justify-between mb-[48px] gap-[16px]"
          >
            <div>
              <p className="font-[400] font-[var(--font-body)] text-[13px] text-[var(--ink-3)] tracking-[0.05em] uppercase mb-[8px]">Overview</p>
              <h1 className="font-[600] font-[var(--font-display)] text-[36px] text-[var(--ink)] leading-[1.1]">
                Welcome back, {user?.displayName ? user.displayName.split(' ')[0] : 'User'}
              </h1>
            </div>
            <div className="font-[400] font-[var(--font-body)] text-[13px] text-[var(--ink-2)]">
              {currentDate}
            </div>
          </motion.div>

          {/* ROW 1: STATS */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-[24px] mb-[48px]"
          >
            {[
              { label: 'Total Scans', value: scans.length.toString() },
              { label: 'Urgent Flags', value: scans.filter(s => s.urgency?.toLowerCase() === 'high').length.toString() },
              { label: 'Conditions Tracked', value: new Set(scans.map(s => s.condition)).size.toString() }
            ].map((stat, idx) => (
              <div key={idx} className="bg-white/40 backdrop-blur-md border border-white/60 shadow-sm p-[24px] border-t-[3px] border-t-[var(--teal)] rounded-b-[4px]">
                <p className="font-[500] font-[var(--font-body)] text-[12px] text-[var(--ink-3)] uppercase tracking-[0.05em] mb-[12px]">{stat.label}</p>
                <p className="font-[600] font-[var(--font-display)] text-[40px] text-[var(--ink)] leading-[1]">{stat.value}</p>
              </div>
            ))}
          </motion.div>

          {/* ROW 2: UPLOAD */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-[48px]"
          >
            <div className="bg-white/40 backdrop-blur-xl border border-dashed border-[var(--teal)]/50 rounded-[4px] p-[64px_32px] text-center flex flex-col items-center justify-center hover:bg-white/60 transition-colors duration-500">
              {isScanning ? (
                <div className="flex flex-col items-center w-full max-w-md mx-auto">
                  {previewUrl && (
                    <div className="relative w-[120px] h-[120px] rounded-[12px] overflow-hidden mb-[24px] border-[4px] border-white shadow-sm transition-all duration-300">
                      <img src={previewUrl} alt="Scanning target" className="object-cover w-full h-full opacity-60" />
                      <div className="absolute top-0 w-full h-[2px] bg-[var(--teal)] shadow-[0_0_10px_var(--teal)] animate-[scan_2s_ease-in-out_infinite]"></div>
                    </div>
                  )}
                  <h2 className="font-[600] font-[var(--font-display)] text-[24px] text-[var(--ink)] mb-[16px]">
                    {scanStep === 'uploading' && 'Uploading securely to cloud...'}
                    {scanStep === 'analyzing' && 'AI inspecting skin patterns...'}
                    {scanStep === 'saving' && 'Generating clinical record...'}
                  </h2>
                  <div className="w-full h-[6px] bg-[var(--teal)]/10 rounded-full overflow-hidden mb-[16px]">
                    <motion.div 
                      className="h-full bg-[var(--teal)] rounded-full"
                      initial={{ width: "0%" }}
                      animate={{ 
                        width: scanStep === 'uploading' ? '30%' : 
                               scanStep === 'analyzing' ? '70%' : 
                               scanStep === 'saving' ? '90%' : '100%' 
                      }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <p className="font-[400] font-[var(--font-body)] text-[13px] text-[var(--ink-2)] animate-pulse">
                    Please wait while Derma-AI processes your scan.
                  </p>
                </div>
              ) : (
                <>
                  <div className="w-[48px] h-[48px] rounded-full bg-[var(--teal)]/10 flex items-center justify-center mb-[24px]">
                    <i className="fa-solid fa-cloud-arrow-up text-[20px] text-[var(--teal)]"></i>
                  </div>
                  <h2 className="font-[600] font-[var(--font-display)] text-[32px] text-[var(--ink)] mb-[24px]">
                    Upload a skin photo to begin screening
                  </h2>
                  <button 
                    onClick={handleUploadClick}
                    className="btn-primary"
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                  >
                    Start New Scan &rarr;
                  </button>
                </>
              )}
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
              />
            </div>
          </motion.div>

          {/* ROW 3: RECENT SCANS */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
          >
            <h3 className="font-[600] font-[var(--font-display)] text-[24px] text-[var(--ink)] mb-[24px]">Recent Scans</h3>
            <div className="bg-white/40 backdrop-blur-md border border-white/60 shadow-sm rounded-[4px] overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/50">
                    <th className="py-[16px] px-[24px] font-[500] font-[var(--font-body)] text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Date</th>
                    <th className="py-[16px] px-[24px] font-[500] font-[var(--font-body)] text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Condition</th>
                    <th className="py-[16px] px-[24px] font-[500] font-[var(--font-body)] text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Urgency</th>
                    <th className="py-[16px] px-[24px] font-[500] font-[var(--font-body)] text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-[48px] px-[24px] text-center">
                        <p className="font-[400] font-[var(--font-body)] text-[14px] text-[var(--ink-2)]">
                          No scans yet. Upload your first photo above.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    scans.map((scan) => (
                      <tr key={scan.id} className="border-b border-light hover:bg-white/5 transition-colors">
                        <td className="py-[16px] px-[24px] font-[400] font-[var(--font-body)] text-[14px] text-[var(--ink)]">
                           {scan.createdAt?.toDate ? scan.createdAt.toDate().toLocaleDateString() : 'Just now'}
                        </td>
                        <td className="py-[16px] px-[24px] font-[400] font-[var(--font-body)] text-[14px] text-[var(--ink)]">
                           <div className="flex items-center gap-[12px]">
                             {scan.imageUrl ? (
                               <img src={scan.imageUrl} alt="scan" className="w-[32px] h-[32px] object-cover rounded-[4px]" />
                             ) : null}
                             <span>{scan.condition}</span>
                           </div>
                        </td>
                        <td className="py-[16px] px-[24px]">
                          <span className={`inline-flex items-center px-[10px] py-[4px] rounded-full font-[500] font-[var(--font-body)] text-[10px] uppercase tracking-[0.05em] 
                            ${scan.urgency?.toLowerCase() === 'high' ? 'bg-red-500/10 text-red-700' : 
                              scan.urgency?.toLowerCase() === 'medium' ? 'bg-orange-500/10 text-orange-700' : 
                              'bg-[var(--teal)]/10 text-[var(--teal)]'}`}>
                            {scan.urgency}
                          </span>
                        </td>
                        <td className="py-[16px] px-[24px] font-[400] font-[var(--font-body)] text-[14px] text-[var(--ink)]">
                          {scan.confidence}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </main>
      </div>
    </>
  );
}
