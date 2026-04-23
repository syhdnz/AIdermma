import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { auth } from '../lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { GoogleGenAI, Type } from '@google/genai';
import { motion } from 'motion/react';

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const getAi = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'undefined') {
    throw new Error("GEMINI_API_KEY is missing. Please add it to the Secrets panel (Gear icon -> Secrets).");
  }
  return new GoogleGenAI({ apiKey });
};

interface Differential {
  condition: string;
  distinguishingFeatures: string;
  probability: string;
}

interface AnalysisResult {
  condition: string;
  urgency: string;
  confidence: string;
  differentials: Differential[];
  progressionNotes: string;
  precautions: string[];
  recommendations: string[];
  suggestedMeds: string;
  dermatologistAdvice: string;
  fitzpatrickScale: string;
}

interface ScanRecord {
  id: string;
  imageUrl: string;
  condition: string;
  urgency: string;
  confidence: string;
  createdAt?: any;
  analysis?: AnalysisResult;
}

export default function Dashboard() {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [selectedSessionDate, setSelectedSessionDate] = useState<string | null>(null);
  
  const [isScanning, setIsScanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [scanStep, setScanStep] = useState<'idle' | 'uploading' | 'analyzing' | 'saving'>('idle');
  const [scanResult, setScanResult] = useState<AnalysisResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const [isHovering, setIsHovering] = useState(false);
  const [isEmailPrivate, setIsEmailPrivate] = useState(true);
  const [fitzpatrickType, setFitzpatrickType] = useState<string>('Type IV (Light Brown)');
  const [userCity, setUserCity] = useState<string>('Mumbai'); // Default to a major Indian city
  const reportTemplateRef = useRef<HTMLDivElement>(null);
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
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        navigate('/auth');
      } else {
        setUser(firebaseUser);
        setLoading(false);
        fetchScans(firebaseUser.uid);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const fetchScans = async (userId: string) => {
    const { data, error } = await supabase
      .from('scans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
    } else {
      setScans(data.map(s => ({
        id: s.id.toString(),
        imageUrl: s.image_url,
        condition: s.condition,
        urgency: s.urgency,
        confidence: s.confidence,
        createdAt: s.created_at,
        analysis: s.analysis // Assuming stored as jsonb
      })));
    }
  };

  const downloadPDFReport = async () => {
    if (!reportTemplateRef.current) return;
    try {
      console.log("Generating PDF report...");
      const element = reportTemplateRef.current;
      
      const canvas = await html2canvas(element, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#FCFAF7',
        scrollX: 0,
        scrollY: -window.scrollY,
        logging: false,
        onclone: (clonedDoc) => {
          // Fix for "oklch" error in html2canvas
          const target = clonedDoc.getElementById('report-action-bar');
          if (target) target.style.display = 'none'; // Hide action bar in PDF
          
          // Forcefully remove any oklch usage if found in computed styles
          const allElements = clonedDoc.getElementsByTagName('*');
          for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i] as HTMLElement;
            if (el.style && el.style.color && el.style.color.includes('oklch')) el.style.color = 'inherit';
            if (el.style && el.style.backgroundColor && el.style.backgroundColor.includes('oklch')) el.style.backgroundColor = 'transparent';
            if (el.style && el.style.borderColor && el.style.borderColor.includes('oklch')) el.style.borderColor = 'transparent';
          }
        }
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jsPDF('p', 'mm', 'a4', true);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      pdf.save(`DermaAI_Medical_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      console.log("PDF download complete.");
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF. Please try again or take a screenshot.");
    }
  };

  const findDermatologists = () => {
    const query = encodeURIComponent(`best dermatologists in ${userCity}`);
    window.open(`https://www.google.com/maps/search/${query}`, '_blank');
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/auth');
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleUploadClick = () => {
    if (isScanning) return;
    fileInputRef.current?.click();
  };

  const processFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;
    const fileList = Array.from(files);

    try {
      setIsScanning(true);
      const urls = fileList.map(f => URL.createObjectURL(f));
      setPreviewUrls(urls);
      
      // 1. Read files as base64
      setScanStep('uploading');
      const base64DataList = await Promise.all(fileList.map(file => {
        return new Promise<{ data: string, mimeType: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({
            data: reader.result?.toString().split(',')[1] || '',
            mimeType: file.type
          });
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }));

      // 2. Analyze with Gemini 3 Flash
      setScanStep('analyzing');
      const ai = getAi();
      
      const sessionContext = scans.length > 0 ? 
        `Previous scan history summary: ${scans.slice(0, 3).map(s => `${s.condition} (${s.urgency}) on ${new Date(s.createdAt).toLocaleDateString()}`).join(', ')}.` : '';

      const imageParts = base64DataList.map(img => ({
        inlineData: {
          data: img.data,
          mimeType: img.mimeType,
        },
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            ...imageParts,
            {
              text: `Analyze these skin photos (${imageParts.length} images provided) with clinical precision. 
              User Baseline: Fitzpatrick ${fitzpatrickType}.
              ${sessionContext}
              
              Identify the primary condition, but also provide 'differentials' (Top 3 possible conditions with distinguishing features). 
              Assess progression compared to previous history if applicable. 
              Provide specific precautions and recommendations.
              If urgency is Low/Medium, suggest common non-prescription care/meds.
              If urgency is Medium/High, provide a strict recommendation for a dermatology consult.
              Assess Fitzpatrick skin tone category from the images.`,
            },
          ],
        },
        config: {
          systemInstruction: "You are a Senior Dermatological Diagnostic System. Analyze inputs for diverse skin tones (especially Indian/South Asian contexts). Return a formal medical analysis JSON. Do not use generic filler. Be specific about distinguishing features and progression.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              condition: { type: Type.STRING },
              urgency: { type: Type.STRING, description: "Low, Medium, or High" },
              confidence: { type: Type.STRING },
              differentials: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    condition: { type: Type.STRING },
                    distinguishingFeatures: { type: Type.STRING },
                    probability: { type: Type.STRING }
                  }
                }
              },
              progressionNotes: { type: Type.STRING },
              precautions: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
              suggestedMeds: { type: Type.STRING, description: "Over-the-counter care or general precautions" },
              dermatologistAdvice: { type: Type.STRING },
              fitzpatrickScale: { type: Type.STRING }
            },
            required: ["condition", "urgency", "confidence", "differentials", "progressionNotes", "precautions", "recommendations", "suggestedMeds", "dermatologistAdvice", "fitzpatrickScale"]
          }
        }
      });

      if (!response.text) throw new Error("AI failed to provide an analysis result.");
      const result = JSON.parse(response.text);
      setScanResult(result);

      // Show result!
      setIsScanning(false);
      setShowResultModal(true);
      setScanStep('idle');

      // 3. Save result and ALL images to Supabase
      try {
        const uploadedUrls: string[] = [];
        
        // Upload all images
        await Promise.all(fileList.map(async (file) => {
          const fileExt = file.name.split('.').pop();
          const fileName = `${user.uid}/${Math.random()}.${fileExt}`;
          const { error: uploadError } = await supabase.storage
            .from('scans')
            .upload(fileName, file);

          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from('scans')
              .getPublicUrl(fileName);
            uploadedUrls.push(publicUrl);
          }
        }));

        const { error: insertError } = await supabase
          .from('scans')
          .insert({
            user_id: user.uid,
            image_url: uploadedUrls[0] || '', // Use first as thumbnail
            condition: result.condition,
            urgency: result.urgency,
            confidence: result.confidence,
            analysis: { ...result, all_image_urls: uploadedUrls }
          });

        if (insertError) throw insertError;
        fetchScans(user.uid);
      } catch (saveErr) {
        console.error("Background save failed:", saveErr);
      }
      
    } catch (error: any) {
      console.error("Scan failed:", error);
      let errorMsg = error.message || "Unknown error";
      if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
        errorMsg = "API Rate Limit Exceeded. Please wait a minute before trying again. The free tier of Gemini has usage limits.";
      }
      alert("Failed to analyze image: " + errorMsg);
      setIsScanning(false);
      setScanStep('idle');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
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

  const navItems = ['Dashboard', 'My History', 'Settings'];

  return (
    <>
      <div 
        className={`custom-cursor hidden md:block ${isHovering ? 'hovering' : ''}`}
        style={{ left: cursorPos.x, top: cursorPos.y }}
      />

      {/* RESULT MODAL (FULL CLINICAL REPORT) */}
      {showResultModal && scanResult && (
        <div className="fixed inset-0 z-[1000] flex justify-center p-0 md:p-[20px] overflow-y-auto bg-[var(--bg-dark)]/95 backdrop-blur-xl">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-transparent" 
            onClick={() => setShowResultModal(false)}
          />
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="relative bg-[#FCFAF7] w-full max-w-[950px] shadow-[0_0_80px_rgba(0,0,0,0.5)] border border-white/20 flex flex-col h-fit min-h-screen md:min-h-0 md:rounded-[12px] overflow-hidden"
          >
            {/* Action Bar */}
            <div 
              id="report-action-bar"
              className="sticky top-0 z-50 bg-[#FCFAF7]/90 backdrop-blur-md border-b border-[var(--border-light)] p-[24px_32px] flex justify-between items-center"
            >
              <div className="flex items-center gap-[16px]">
                <button 
                  id="pdf-download-btn"
                  onClick={downloadPDFReport}
                  className="flex items-center gap-[10px] px-[20px] py-[10px] bg-[var(--teal)] text-white text-[13px] font-[700] rounded-[6px] hover:bg-[var(--teal-dark)] transition-all shadow-lg active:scale-95"
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                >
                  <i className="fa-solid fa-file-pdf text-[16px]"></i>
                  DOWNLOAD MEDICAL REPORT
                </button>
                {['High', 'Medium'].includes(scanResult.urgency) && (
                  <button 
                    onClick={findDermatologists}
                    className="flex items-center gap-[8px] px-[16px] py-[8px] border border-[var(--teal)] text-[var(--teal)] text-[12px] font-[600] rounded-[4px] hover:bg-[var(--teal)]/5 transition-all"
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                  >
                    <i className="fa-solid fa-location-dot"></i>
                    Find Specialist near {userCity}
                  </button>
                )}
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

            {/* The actual Report (Targeted by html2canvas) */}
            <div ref={reportTemplateRef} className="p-[64px] bg-[#FCFAF7] text-[var(--ink)]">
              {/* Header */}
              <div className="flex justify-between items-start mb-[48px] border-b-2 border-[var(--teal)] pb-[24px]">
                <div>
                  <h1 className="font-[600] font-[var(--font-display)] text-[40px] leading-[1] mb-[8px] uppercase tracking-[-0.02em]">Derma-AI Clinical Report</h1>
                  <p className="text-[14px] text-[rgba(154,154,154,1)]">Automated Screening Result • Build ID: AI-284-91</p>
                </div>
                <div className="text-right">
                  <p className="font-[700] text-[12px] uppercase tracking-[0.1em] text-[var(--teal)]">Patient ID</p>
                  <p className="font-[500] text-[14px]">{user?.uid?.slice(0, 12)}...</p>
                  <p className="font-[700] text-[12px] uppercase tracking-[0.1em] text-[var(--teal)] mt-[12px]">Generated On</p>
                  <p className="font-[500] text-[14px]">{new Date().toLocaleString()}</p>
                </div>
              </div>

              {/* Main Analysis Section */}
              <div className="grid grid-cols-12 gap-[48px] mb-[48px]">
                <div className="col-span-4">
                  <div className="grid grid-cols-2 gap-[8px] mb-[16px]">
                    {previewUrls.slice(0, 4).map((url, i) => (
                      <div key={i} className="aspect-square rounded-[4px] overflow-hidden border border-[var(--border-light)] shadow-inner bg-white">
                        <img 
                          src={url} 
                          alt={`Scan view ${i+1}`} 
                          className="w-full h-full object-cover" 
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ))}
                    {previewUrls.length === 0 && (
                      <div className="col-span-2 aspect-square rounded-[8px] overflow-hidden border border-[var(--border-light)] shadow-inner flex items-center justify-center text-[var(--ink-3)] bg-white">No Image</div>
                    )}
                  </div>
                  <div className="p-[16px] bg-white border border-[var(--border-light)] rounded-[8px]">
                    <p className="text-[10px] uppercase font-[700] text-[var(--ink-3)] mb-[4px]">Fitzpatrick Category</p>
                    <p className="text-[14px] font-[600] text-[var(--teal)]">{scanResult.fitzpatrickScale}</p>
                  </div>
                </div>
                <div className="col-span-8 flex flex-col gap-[32px]">
                  <div>
                    <div className="flex items-center gap-[12px] mb-[8px]">
                      <span className={`px-[12px] py-[4px] rounded-full text-[10px] font-[800] uppercase tracking-[0.1em]
                        ${scanResult.urgency.toLowerCase() === 'high' ? 'bg-[#DC2626] text-white' : 
                          scanResult.urgency.toLowerCase() === 'medium' ? 'bg-[#F97316] text-white' : 
                          'bg-[#1A6B5A] text-white'}`}>
                        {scanResult.urgency} Urgency
                      </span>
                      <span className="text-[13px] font-[500] text-[var(--ink-2)]">| Confidence: {scanResult.confidence}</span>
                    </div>
                    <h2 className="text-[32px] font-[600] font-[var(--font-display)] text-[var(--ink)] mb-[16px]">{scanResult.condition}</h2>
                    <p className="text-[15px] leading-[1.6] text-[var(--ink-2)]">{scanResult.progressionNotes}</p>
                  </div>

                  {/* Differential Diagnosis */}
                  <div>
                    <h3 className="text-[12px] uppercase font-[700] text-[var(--teal)] border-b border-[rgba(26,107,90,0.2)] pb-[8px] mb-[16px]">Differential Diagnosis</h3>
                    <div className="space-y-[12px]">
                      {scanResult.differentials.map((diff, i) => (
                        <div key={i} className="flex gap-[16px]">
                          <div className="w-[32px] h-[32px] shrink-0 rounded-full border border-[rgba(26,107,90,0.3)] flex items-center justify-center text-[11px] font-[800]">0{i+1}</div>
                          <div>
                            <p className="text-[14px] font-[700] text-[var(--ink)]">{diff.condition} <span className="font-[400] text-[var(--ink-3)] text-[12px]">({diff.probability})</span></p>
                            <p className="text-[13px] text-[var(--ink-2)] italic leading-[1.4] mt-[2px]">{diff.distinguishingFeatures}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Recommendations & Management */}
              <div className="grid grid-cols-2 gap-[32px] mb-[48px]">
                <div className="p-[24px] bg-white border border-[var(--border-light)] rounded-[12px]">
                  <h3 className="text-[12px] uppercase font-[700] text-[var(--ink)] mb-[16px] flex items-center gap-[8px]">
                    <i className="fa-solid fa-notes-medical text-[var(--teal)]"></i>
                    Care & Management
                  </h3>
                  <ul className="space-y-[8px]">
                    {scanResult.recommendations.map((rec, i) => (
                      <li key={i} className="text-[13px] text-[var(--ink-2)] flex gap-[8px]">
                        <span className="text-[var(--teal)]">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-[20px] pt-[16px] border-t border-[var(--border-light)]">
                    <p className="text-[11px] uppercase font-[700] text-[var(--ink-3)] mb-[4px]">Suggested Care</p>
                    <p className="text-[13px] font-[500] text-[var(--ink)] leading-[1.5]">{scanResult.suggestedMeds}</p>
                  </div>
                </div>
                <div className="p-[24px] bg-[rgba(26,107,90,0.05)] border border-[rgba(26,107,90,0.2)] rounded-[12px]">
                  <h3 className="text-[12px] uppercase font-[700] text-[var(--ink)] mb-[16px] flex items-center gap-[8px]">
                    <i className="fa-solid fa-user-doctor text-[var(--teal)]"></i>
                    Dermatologist Advice
                  </h3>
                  <p className="text-[14px] font-[500] text-[var(--ink)] leading-[1.6] mb-[20px]">
                    {scanResult.dermatologistAdvice}
                  </p>
                  <div className="bg-[rgba(255,255,255,0.6)] p-[16px] rounded-[8px] border border-[rgba(26,107,90,0.1)]">
                    <p className="text-[11px] uppercase font-[700] text-[var(--teal)] mb-[8px]">Pre-Visit Check-list</p>
                    <ul className="space-y-[6px]">
                      <li className="text-[12px] flex items-center gap-[8px]"><i className="fa-solid fa-check text-[var(--teal)] text-[10px]"></i> Keep historical scan logs</li>
                      <li className="text-[12px] flex items-center gap-[8px]"><i className="fa-solid fa-check text-[var(--teal)] text-[10px]"></i> Note duration of symptoms</li>
                      <li className="text-[12px] flex items-center gap-[8px]"><i className="fa-solid fa-check text-[var(--teal)] text-[10px]"></i> Record any itchy or painful sensations</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-[24px] border-t border-[var(--border-light)] text-[rgba(74,74,74,0.5)] text-center">
                <p className="text-[11px] leading-[1.6]">
                  DISCLAIMER: This document is an automated clinical screening report generated by Derma-AI (Version 1.0.4). This is NOT a diagnostic medical device. This information should be reviewed with a board-certified dermatologist before making any treatment decisions. Derma-AI is not liable for outcomes resulting from the use of this report.
                </p>
              </div>
            </div>

            <div className="p-[32px] pt-0">
              <button 
                onClick={() => setShowResultModal(false)}
                className="btn-primary w-full"
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
              >
                Close Report View
              </button>
            </div>
          </motion.div>
        </div>
      )}
      
      <div className="flex h-screen bg-[var(--bg-base)] relative overflow-hidden">
        {/* Subtle Liquid Glass / Blob Background */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[var(--teal-light)] opacity-[0.05] blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-[#A89885] opacity-[0.08] blur-[150px] rounded-full pointer-events-none" />

        {/* SIDEBAR */}
        <aside className="w-[240px] bg-[var(--bg-dark)] border-r border-[var(--border-dark)] flex shrink-0 flex-col py-[32px] px-[24px] z-10 h-full overflow-y-auto">
          <div className="flex items-center mb-[64px]">
            <span className="font-[500] font-[var(--font-body)] text-[15px] text-[var(--paper-text)] tracking-[0.05em]">
              DERMA-AI.
            </span>
            <span className="w-[6px] h-[6px] bg-[var(--teal)] rounded-full inline-block ml-[3px]" />
          </div>

          <nav className="flex-1 flex flex-col gap-[8px]">
            {navItems.map((item) => (
              <button 
                key={item}
                onClick={() => {
                  setActiveTab(item);
                  setSelectedSessionDate(null);
                  if (item === 'New Scan') {
                    setActiveTab('Dashboard');
                    handleUploadClick();
                  }
                }}
                className={`text-left px-[16px] py-[12px] rounded-[4px] font-[500] font-[var(--font-body)] text-[13px] tracking-[0.02em] transition-all duration-300 ${activeTab === item ? 'bg-white/10 text-white' : 'text-[var(--paper-muted)] hover:text-white hover:bg-white/5'}`}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
              >
                {item}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-[32px] border-t border-[var(--border-dark)]">
            <p className="font-[400] font-[var(--font-body)] text-[12.5px] text-[var(--paper-muted)] truncate mb-[20px] block px-[4px] transition-all duration-500">
              {isEmailPrivate ? '••••••••••••••••' : user?.email}
            </p>
            <button 
              onClick={handleSignOut}
              className="w-full px-[16px] py-[10px] font-[600] font-[var(--font-body)] text-[12px] text-white/90 border border-white/10 rounded-[8px] bg-white/5 shadow-[0_3px_0_0_rgba(0,0,0,0.4)] hover:shadow-[0_1px_0_0_rgba(0,0,0,0.4)] hover:translate-y-[2px] active:shadow-none active:translate-y-[3px] transition-all flex items-center justify-center gap-[8px] group"
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            >
              <i className="fa-solid fa-arrow-right-from-bracket text-[10px] opacity-60 group-hover:opacity-100 transition-opacity"></i>
              Sign Out
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 p-[48px] overflow-y-auto z-10">
          {activeTab === 'Dashboard' && (
            <>
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

              {/* ROW 1: CALIBRATION & STATS */}
              <motion.div 
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
                className="grid grid-cols-1 md:grid-cols-4 gap-[24px] mb-[48px]"
              >
                <div className="bg-white/40 backdrop-blur-md border border-white/60 shadow-sm p-[24px] border-t-[3px] border-t-[var(--teal)] rounded-b-[4px] md:col-span-2">
                  <div className="flex justify-between items-start mb-[16px]">
                    <div>
                      <p className="font-[500] font-[var(--font-body)] text-[11px] text-[var(--ink-3)] uppercase tracking-[0.05em] mb-[4px]">Fitzpatrick Baseline</p>
                      <h3 className="font-[600] text-[16px] text-[var(--ink)]">Skin Tone Calibration</h3>
                    </div>
                    <i className="fa-solid fa-sliders text-[var(--teal)] text-[14px]"></i>
                  </div>
                  <div className="flex flex-wrap gap-[8px] mb-[16px]">
                    {[
                      { type: 'Type I', color: '#fef1e5', desc: 'Pale White' },
                      { type: 'Type II', color: '#f9e2d2', desc: 'Fair' },
                      { type: 'Type III', color: '#e8cb9d', desc: 'Light Brown' },
                      { type: 'Type IV', color: '#c79d71', desc: 'Moderate Brown' },
                      { type: 'Type V', color: '#9d6d4a', desc: 'Dark Brown' },
                      { type: 'Type VI', color: '#563529', desc: 'Deeply Pigmented' }
                    ].map((tone) => (
                      <button 
                        key={tone.type}
                        onClick={() => setFitzpatrickType(tone.type)}
                        className={`w-[32px] h-[32px] rounded-full border-2 transition-all shadow-sm ${fitzpatrickType === tone.type ? 'border-[var(--teal)] scale-110 shadow-lg' : 'border-transparent'}`}
                        style={{ backgroundColor: tone.color }}
                        title={`${tone.type} - ${tone.desc}`}
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between items-center text-[12px]">
                    <span className="text-[var(--ink-2)]">Current: <strong>{fitzpatrickType}</strong></span>
                    <button 
                      onClick={() => {
                        const city = prompt("Enter your city for specialist search:", userCity);
                        if (city) setUserCity(city);
                      }}
                      className="text-[var(--teal)] font-[600] underline"
                      onMouseEnter={() => setIsHovering(true)}
                      onMouseLeave={() => setIsHovering(false)}
                    >
                      Loc: {userCity}
                    </button>
                  </div>
                </div>

                {[
                  { label: 'Total Scans', value: scans.length.toString() },
                  { label: 'Urgent Flags', value: scans.filter(s => s.urgency?.toLowerCase() === 'high').length.toString() }
                ].map((stat, idx) => (
                  <div key={idx} className="bg-white/40 backdrop-blur-md border border-white/60 shadow-sm p-[24px] border-t-[3px] border-t-[var(--teal)] rounded-b-[4px]">
                    <p className="font-[500] font-[var(--font-body)] text-[12px] text-[var(--ink-3)] uppercase tracking-[0.05em] mb-[12px]">{stat.label}</p>
                    <p className="font-[600] font-[var(--font-display)] text-[32px] text-[var(--ink)] leading-[1]">{stat.value}</p>
                  </div>
                ))}
              </motion.div>

              {/* ROW 2: UPLOAD */}
              <motion.div 
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
                className="mb-[48px]"
              >
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`bg-white/40 backdrop-blur-xl border-2 border-dashed rounded-[4px] p-[64px_32px] text-center flex flex-col items-center justify-center transition-all duration-500 ${isDragging ? 'border-[var(--teal)] bg-[var(--teal)]/5' : 'border-[var(--teal)]/50'} hover:bg-white/60`}
                >
                  {isScanning ? (
                    <div className="flex flex-col items-center w-full max-w-md mx-auto">
                      <div className="flex gap-[8px] mb-[24px]">
                        {previewUrls.slice(0, 3).map((url, i) => (
                           <div key={i} className="relative w-[80px] h-[80px] rounded-[12px] overflow-hidden border-[4px] border-white shadow-sm transition-all duration-300">
                             <img src={url} alt="Scanning target" className="object-cover w-full h-full opacity-60" />
                           </div>
                        ))}
                        {previewUrls.length > 3 && <div className="w-[80px] h-[80px] rounded-[12px] bg-white border-[4px] border-white flex items-center justify-center text-[var(--ink-3)] shadow-sm text-[12px] font-[600]">+{previewUrls.length - 3}</div>}
                      </div>
                      <h2 className="font-[600] font-[var(--font-display)] text-[24px] text-[var(--ink)] mb-[16px]">
                        {scanStep === 'uploading' && 'Uploading securely...'}
                        {scanStep === 'analyzing' && `Analyzing ${previewUrls.length} photos...`}
                        {scanStep === 'saving' && 'Generating clinical report...'}
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
                      <h2 className="font-[600] font(--font-display) text-[32px] text-[var(--ink)] mb-[12px]">
                        {isDragging ? 'Drop files here' : 'Upload or Drag & Drop skin photos'}
                      </h2>
                      <p className="text-[14px] text-[var(--ink-2)] mb-[32px] opacity-70">Multiple images allowed for better diagnostic accuracy</p>
                      <motion.button 
                        whileHover={{ scale: 1.05, y: -4 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleUploadClick}
                        className="bg-[var(--teal)] text-white px-[48px] py-[20px] rounded-full font-[600] font-[var(--font-body)] text-[16px] shadow-[0_20px_40px_rgba(45,156,155,0.2)] hover:shadow-[0_25px_50px_rgba(45,156,155,0.3)] transition-all flex items-center gap-[12px] group"
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                      >
                        <span className="tracking-[0.02em]">Select Photos</span>
                        <i className="fa-solid fa-cloud-arrow-up text-[14px] group-hover:translate-y-[-2px] transition-transform duration-300"></i>
                      </motion.button>
                    </>
                  )}
                  
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*" 
                    multiple
                    className="hidden" 
                  />
                </div>
              </motion.div>

              {/* ROW 3: RECENT SCANS & TOOLS */}
              <motion.div 
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-[24px] mb-[48px]"
              >
                <div className="lg:col-span-2">
                  <h3 className="font-[600] font-[var(--font-display)] text-[24px] text-[var(--ink)] mb-[24px]">Progression Timeline</h3>
                  <div className="bg-white/40 backdrop-blur-md border border-white/60 shadow-sm rounded-[4px] p-[24px]">
                    {scans.length > 1 ? (
                      <div className="space-y-[20px]">
                        <div className="flex justify-between items-center mb-[16px]">
                          <p className="text-[13px] text-[var(--ink-2)]">Tracking condition changes across <strong>{scans.length} sessions</strong>.</p>
                          <span className="text-[var(--teal)] text-[12px] font-[600] bg-[var(--teal)]/5 px-[8px] py-[2px] rounded">Active Monitor</span>
                        </div>
                        <div className="relative h-[2px] bg-[var(--teal)]/10 my-[32px]">
                          <div className="absolute top-[-4px] left-0 right-0 flex justify-between">
                            {scans.slice(0, 5).reverse().map((s, i) => (
                              <div key={i} className="flex flex-col items-center group">
                                <div className="w-[10px] h-[10px] rounded-full bg-[var(--teal)] border-2 border-white shadow-sm mb-[8px]"></div>
                                <span className="text-[10px] text-[var(--ink-3)] rotate-[-45deg] origin-right translate-x-3">{new Date(s.createdAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <p className="text-[13px] text-[var(--ink-2)] mt-[40px] italic">
                          AI Observation: {scans[0]?.analysis?.progressionNotes || 'Stable condition observed. Continue monitoring weekly.'}
                        </p>
                      </div>
                    ) : (
                      <div className="py-[48px] text-center border border-dashed border-[var(--border-light)]">
                         <p className="text-[14px] text-[var(--ink-3)]">History tracking requires at least 2 sessions.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-[600] font-[var(--font-display)] text-[24px] text-[var(--ink)] mb-[24px]">Derm Visit Guide</h3>
                  <div className="flex flex-col gap-[20px]">
                  {Array.from(new Set(scans.map(s => s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'Today'))).slice(0, 5).map((date, idx) => (
                    <button 
                      key={date}
                      onClick={() => {
                        setActiveTab('My History');
                        setSelectedSessionDate(date);
                      }}
                      className="w-full text-left bg-white/40 backdrop-blur-md border border-white/60 p-[20px] rounded-[8px] hover:bg-white/60 transition-all flex items-center justify-between group shadow-sm"
                      onMouseEnter={() => setIsHovering(true)}
                      onMouseLeave={() => setIsHovering(false)}
                    >
                      <div className="flex items-center gap-[16px]">
                        <div className="w-[40px] h-[40px] rounded-full bg-[var(--teal)]/10 flex items-center justify-center text-[var(--teal)]">
                          <i className="fa-solid fa-clock-rotate-left text-[16px]"></i>
                        </div>
                        <div>
                          <p className="font-[700] text-[14px] text-[var(--ink)]">{date}</p>
                          <p className="text-[12px] text-[var(--ink-3)]">{scans.filter(s => (s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'Today') === date).length} analysis records</p>
                        </div>
                      </div>
                      <i className="fa-solid fa-arrow-right text-[14px] text-[var(--ink-3)] group-hover:translate-x-1 transition-transform"></i>
                    </button>
                  ))}
                  {scans.length === 0 && (
                    <div className="py-[40px] text-center border border-dashed border-[var(--border-light)] rounded-[8px]">
                       <p className="text-[13px] text-[var(--ink-3)]">Your future sessions will appear here.</p>
                    </div>
                  )}
                  <button 
                    onClick={() => handleUploadClick()}
                    className="w-full py-[12px] border-2 border-dashed border-[var(--teal)]/30 text-[var(--teal)] text-[13px] font-[600] rounded-[8px] hover:bg-[var(--teal)]/5 transition-all flex items-center justify-center gap-[8px]"
                  >
                    <i className="fa-solid fa-plus text-[12px]"></i>
                    Start a New Session
                  </button>
                </div>
                </div>
              </motion.div>
            </>
          )}

          {activeTab === 'My History' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
              <div className="mb-[48px] flex justify-between items-end">
                <div>
                  <h2 className="font-[700] font-[var(--font-display)] text-[48px] text-[var(--ink)] mb-[8px] leading-[1]">Scan Repository</h2>
                  <p className="font-[400] font-[var(--font-body)] text-[16px] text-[var(--ink-2)]">Your historical analysis sessions, secured and organized.</p>
                </div>
                <button 
                  onClick={() => {
                    setActiveTab('Dashboard');
                    setTimeout(() => handleUploadClick(), 100);
                  }}
                  className="px-[24px] py-[12px] bg-[var(--teal)] text-white rounded-full font-[600] text-[13px] shadow-lg hover:shadow-xl transition-all active:scale-95"
                >
                  New Analysis Session
                </button>
              </div>

              {!selectedSessionDate ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-[24px]">
                  {Array.from(new Set(scans.map(s => s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'Today'))).map((date, idx) => (
                    <button 
                      key={date}
                      onClick={() => setSelectedSessionDate(date)}
                      className="group relative bg-white/40 backdrop-blur-md border border-white/60 p-[32px] rounded-[16px] hover:bg-white/60 transition-all flex flex-col gap-[24px] shadow-sm hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] text-left overflow-hidden"
                      onMouseEnter={() => setIsHovering(true)}
                      onMouseLeave={() => setIsHovering(false)}
                    >
                      {/* Decorative background element */}
                      <div className="absolute top-[-20px] right-[-20px] w-[100px] h-[100px] bg-[var(--teal)] opacity-[0.03] rounded-full group-hover:scale-150 transition-transform duration-700" />
                      
                      <div className="flex justify-between items-start">
                        <div className="w-[48px] h-[48px] rounded-[12px] bg-white shadow-sm flex items-center justify-center text-[var(--teal)]">
                          <i className="fa-solid fa-folder-open text-[20px]"></i>
                        </div>
                        <div className="px-[12px] py-[4px] bg-[var(--teal)]/10 text-[var(--teal)] text-[10px] font-[800] uppercase tracking-[0.1em] rounded-full">
                          {scans.filter(s => (s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'Today') === date).length} Records
                        </div>
                      </div>

                      <div className="relative z-10">
                        <p className="font-[500] font-[var(--font-body)] text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)] mb-[8px]">Session ID: 00{idx + 1}</p>
                        <p className="font-[600] font-[var(--font-display)] text-[28px] text-[var(--ink)] group-hover:text-[var(--teal)] transition-colors">{date}</p>
                      </div>

                      <div className="flex items-center gap-[8px] text-[12px] font-[600] text-[var(--teal)] opacity-0 group-hover:opacity-100 translate-x-[-10px] group-hover:translate-x-0 transition-all">
                        <span>VIEW SESSION DETAILS</span>
                        <i className="fa-solid fa-arrow-right text-[10px]"></i>
                      </div>
                    </button>
                  ))}
                  {scans.length === 0 && (
                    <div className="text-center py-[120px] border border-dashed border-[var(--border-light)] rounded-[4px]">
                      <p className="font-[400] font-[var(--font-body)] text-[15px] text-[var(--ink-3)]">No storage records found yet.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="session-view">
                  <button 
                    onClick={() => setSelectedSessionDate(null)}
                    className="mb-[32px] text-[var(--teal)] font-[500] text-[13px] hover:underline"
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                  >
                    &larr; Back to Sessions
                  </button>
                  <h3 className="font-[600] font-[var(--font-display)] text-[24px] text-[var(--ink)] mb-[32px]">Session findings for {selectedSessionDate}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-[20px]">
                    {scans.filter(s => (s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'Today') === selectedSessionDate).map((scan) => (
                      <motion.button
                        key={scan.id}
                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        onClick={() => {
                          if (scan.analysis) {
                            setScanResult(scan.analysis);
                            if (scan.analysis.all_image_urls) {
                              setPreviewUrls(scan.analysis.all_image_urls);
                            } else {
                              setPreviewUrls([scan.imageUrl]);
                            }
                          } else {
                            setScanResult({ 
                              condition: scan.condition, 
                              urgency: scan.urgency, 
                              confidence: scan.confidence,
                              differentials: [],
                              progressionNotes: 'Full report not available for legacy scans.',
                              precautions: [],
                              recommendations: [],
                              suggestedMeds: 'Consult a dermatologist.',
                              dermatologistAdvice: 'Consult a dermatologist.',
                              fitzpatrickScale: 'Not Calibrated'
                            });
                            setPreviewUrls([scan.imageUrl]);
                          }
                          setShowResultModal(true);
                        }}
                        className="group relative aspect-square rounded-[4px] overflow-hidden border border-white/60 shadow-sm"
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                      >
                        <img src={scan.imageUrl} alt="scan" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-[16px]">
                           <span className="text-white font-[600] text-[11px] uppercase tracking-[0.05em] text-center mb-[4px]">{scan.condition}</span>
                           <span className="text-white/80 font-[400] text-[10px] uppercase">{scan.urgency}</span>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'Settings' && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="max-w-4xl"
            >
               <div className="mb-[48px]">
                 <h2 className="font-[600] font-[var(--font-display)] text-[32px] text-[var(--ink)] mb-[8px]">Settings</h2>
                 <p className="font-[400] font-[var(--font-body)] text-[14px] text-[var(--ink-2)]">Manage your account preferences, data privacy, and application behavior.</p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-[24px]">
                 {/* ACCOUNT SECTION */}
                 <motion.div 
                   whileHover={{ 
                     y: -12, 
                     scale: 1.02,
                     rotateX: 2,
                     rotateY: 2,
                     transition: { duration: 0.3, ease: "easeOut" }
                   }}
                   style={{ perspective: 1000 }}
                   className="bg-white/40 backdrop-blur-md border border-white/60 p-[32px] rounded-[8px] flex flex-col gap-[24px] shadow-sm hover:shadow-[0_20px_40px_rgba(0,0,0,0.12)] transition-all"
                 >
                    <div className="flex items-center gap-[12px] pb-[16px] border-b border-white/40">
                      <i className="fa-solid fa-user-circle text-[20px] text-[var(--teal)]"></i>
                      <h3 className="font-[600] text-[16px] text-[var(--ink)]">Account Preferences</h3>
                    </div>
                    <div className="space-y-[16px]">
                      <div className="flex justify-between items-center">
                        <span className="text-[13px] text-[var(--ink-2)]">Email visibility</span>
                        <button 
                          onClick={() => setIsEmailPrivate(!isEmailPrivate)}
                          className={`px-[10px] py-[4px] rounded-full text-[10px] font-[700] uppercase tracking-[0.05em] transition-all ${isEmailPrivate ? 'bg-[var(--teal)]/10 text-[var(--teal)]' : 'bg-orange-500/10 text-orange-600'}`}
                          onMouseEnter={() => setIsHovering(true)}
                          onMouseLeave={() => setIsHovering(false)}
                        >
                          {isEmailPrivate ? 'Private' : 'Public'}
                        </button>
                      </div>
                      <button 
                        className="w-full py-[10px] border border-[var(--teal)]/30 text-[var(--teal)] text-[12px] font-[600] rounded-[4px] hover:bg-[var(--teal)]/5 transition-colors"
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                      >
                        Change Password
                      </button>
                    </div>
                 </motion.div>

                 {/* PRIVACY SECTION */}
                 <motion.div 
                   whileHover={{ 
                     y: -12, 
                     scale: 1.02,
                     rotateX: 2,
                     rotateY: -2,
                     transition: { duration: 0.3, ease: "easeOut" }
                   }}
                   style={{ perspective: 1000 }}
                   className="bg-white/40 backdrop-blur-md border border-white/60 p-[32px] rounded-[8px] flex flex-col gap-[24px] shadow-sm hover:shadow-[0_20px_40px_rgba(0,0,0,0.12)] transition-all"
                 >
                    <div className="flex items-center gap-[12px] pb-[16px] border-b border-white/40">
                      <i className="fa-solid fa-shield-halved text-[20px] text-[var(--teal)]"></i>
                      <h3 className="font-[600] text-[16px] text-[var(--ink)]">Data & Privacy</h3>
                    </div>
                    <div className="space-y-[16px]">
                      <div className="flex justify-between items-center">
                        <span className="text-[13px] text-[var(--ink-2)]">Automatic history saving</span>
                        <div className="w-[32px] h-[18px] bg-[var(--teal)] rounded-full relative"><div className="absolute right-[2px] top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow-sm"></div></div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[13px] text-[var(--ink-2)]">Anonymous data training</span>
                        <div className="w-[32px] h-[18px] bg-[var(--ink-3)]/20 rounded-full relative"><div className="absolute left-[2px] top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow-sm"></div></div>
                      </div>
                      <button 
                        className="w-full py-[10px] border border-red-500/20 text-red-500 text-[12px] font-[600] rounded-[4px] hover:bg-red-500/5 transition-colors"
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                      >
                        Clear History
                      </button>
                    </div>
                 </motion.div>

                 {/* APP SETTINGS */}
                 <motion.div 
                   whileHover={{ 
                     y: -12, 
                     scale: 1.02,
                     rotateX: -2,
                     rotateY: 2,
                     transition: { duration: 0.3, ease: "easeOut" }
                   }}
                   style={{ perspective: 1000 }}
                   className="bg-white/40 backdrop-blur-md border border-white/60 p-[32px] rounded-[8px] flex flex-col gap-[24px] shadow-sm hover:shadow-[0_20px_40px_rgba(0,0,0,0.12)] transition-all"
                 >
                    <div className="flex items-center gap-[12px] pb-[16px] border-b border-white/40">
                      <i className="fa-solid fa-sliders text-[20px] text-[var(--teal)]"></i>
                      <h3 className="font-[600] text-[16px] text-[var(--ink)]">App Features</h3>
                    </div>
                    <div className="space-y-[16px]">
                      <div className="flex justify-between items-center">
                        <span className="text-[13px] text-[var(--ink-2)]">High Precision Scans</span>
                        <span className="text-[11px] font-[500] text-[var(--ink-3)] italic">Standard Mode</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[13px] text-[var(--ink-2)]">Notification warnings</span>
                        <div className="w-[32px] h-[18px] bg-[var(--teal)] rounded-full relative"><div className="absolute right-[2px] top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow-sm"></div></div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[13px] text-[var(--ink-2)]">Dark Mode</span>
                        <div className="w-[32px] h-[18px] bg-[var(--ink-3)]/20 rounded-full relative"><div className="absolute left-[2px] top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow-sm"></div></div>
                      </div>
                    </div>
                 </motion.div>

                 {/* SUPPORT SECTION */}
                 <motion.div 
                   whileHover={{ 
                     y: -12, 
                     scale: 1.02,
                     rotateX: -2,
                     rotateY: -2,
                     transition: { duration: 0.3, ease: "easeOut" }
                   }}
                   style={{ perspective: 1000 }}
                   className="bg-white/40 backdrop-blur-md border border-white/60 p-[32px] rounded-[8px] flex flex-col gap-[24px] shadow-sm hover:shadow-[0_20px_40px_rgba(0,0,0,0.12)] transition-all"
                 >
                    <div className="flex items-center gap-[12px] pb-[16px] border-b border-white/40">
                      <i className="fa-solid fa-headset text-[20px] text-[var(--teal)]"></i>
                      <h3 className="font-[600] text-[16px] text-[var(--ink)]">Support & Feedback</h3>
                    </div>
                    <div className="space-y-[12px]">
                      <a 
                        href="mailto:support@derma-ai.com"
                        className="flex items-center justify-between p-[12px] bg-white/30 rounded-[6px] hover:bg-white/50 transition-all text-[13px]"
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                      >
                        <span className="text-[var(--ink)]">Contact Support</span>
                        <i className="fa-solid fa-envelope text-[var(--ink-3)] text-[12px]"></i>
                      </a>
                      <button 
                        className="w-full flex items-center justify-between p-[12px] bg-white/30 rounded-[6px] hover:bg-white/50 transition-all text-[13px]"
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                      >
                        <span className="text-[var(--ink)]">Submit Feedback</span>
                        <i className="fa-solid fa-comment-dots text-[var(--ink-3)] text-[12px]"></i>
                      </button>
                      <button 
                        className="w-full flex items-center justify-between p-[12px] bg-white/30 rounded-[6px] hover:bg-white/50 transition-all text-[13px]"
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                      >
                        <span className="text-[var(--ink)]">Terms of Service</span>
                        <i className="fa-solid fa-file-contract text-[var(--ink-3)] text-[12px]"></i>
                      </button>
                    </div>
                 </motion.div>
               </div>

               <div className="mt-[64px] pb-[64px] text-center border-t border-white/20 pt-[32px]">
                 <p className="text-[12px] text-[var(--ink-3)] font-[400] font-[var(--font-body)]">Derma-AI Version 1.0.4 • Build 8292</p>
               </div>
            </motion.div>
          )}
        </main>
      </div>
    </>
  );
}
