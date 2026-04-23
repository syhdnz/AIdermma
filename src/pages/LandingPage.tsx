import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { motion } from 'motion/react';

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const [isHovering, setIsHovering] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(() => setIsInitialLoading(false), 600);
      }
      setLoadingProgress(progress);
    }, 150);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 60);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const navigate = useNavigate();

  const fadeToPage = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    document.body.classList.add('fading');
    setTimeout(() => {
      navigate(url);
    }, 500);
  };
  
  useEffect(() => {
    document.body.classList.remove('fading');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleSmoothScroll = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName.toLowerCase() === 'a' && target.getAttribute('href')?.startsWith('#')) {
        const id = target.getAttribute('href');
        if (id) {
          const el = document.querySelector(id);
          if (el) {
            e.preventDefault();
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }
    };
    document.addEventListener('click', handleSmoothScroll);
    return () => document.removeEventListener('click', handleSmoothScroll);
  }, []);

  return (
    <>
      <motion.div 
        initial={{ y: 0 }}
        animate={{ y: isInitialLoading ? 0 : '-100%' }}
        transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
        className="fixed inset-0 z-[9999] bg-[var(--bg-dark)] flex flex-col items-center justify-center font-[var(--font-display)]"
        style={{ pointerEvents: isInitialLoading ? 'auto' : 'none' }}
      >
        <div className="absolute top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] flex flex-col items-center text-center w-full px-[20px]">
          <h1 className="text-[var(--paper-text)] text-[48px] md:text-[72px] font-[800] leading-[1.1] tracking-tight mb-[16px]">
            Derma-<span className="text-[var(--teal-light)] italic font-[400] tracking-normal">Ai</span>
          </h1>
          <p className="text-[var(--teal-light)]/80 font-[var(--font-body)] text-[16px] md:text-[20px] font-[400] mb-[48px]">
            Your chaos, our clarity.
          </p>
          <div className="flex flex-col items-center w-full max-w-[300px]">
            <div className="w-full flex justify-between text-[var(--paper-muted)] font-[var(--font-body)] text-[11px] tracking-[0.2em] uppercase mb-[12px]">
              <span>Initializing</span>
              <span className="tabular-nums text-[var(--teal-light)]">{loadingProgress}%</span>
            </div>
            <div className="w-full h-[3px] bg-[rgba(255,255,255,0.1)] overflow-hidden relative rounded-full">
              <motion.div 
                className="absolute top-0 left-0 bottom-0 bg-[var(--teal-light)] transition-all duration-200 ease-out rounded-full"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
          </div>
        </div>
      </motion.div>

      <div 
        className={`custom-cursor hidden md:block ${isHovering ? 'hovering' : ''}`}
        style={{ left: cursorPos.x, top: cursorPos.y }}
      />

      <nav className={`nav-bar fixed top-0 w-full z-[1000] h-[68px] px-[24px] md:px-[100px] flex items-center justify-between ${scrolled ? 'scrolled' : ''}`}>
        <div className="flex items-center">
          <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '15px', color: 'var(--ink)', letterSpacing: '0.05em' }}>
            DERMA-AI.
          </span>
          <span className="w-[6px] h-[6px] bg-[var(--teal)] rounded-full inline-block ml-[3px]" />
        </div>
        <div className="hidden md:block"></div>
        <div className="flex items-center gap-[40px]">
          <a href="#how" className="hidden md:block font-[500] font-[var(--font-body)] text-[11px] tracking-[0.12em] text-[var(--ink-2)] hover:text-[var(--teal)] transition-colors decoration-transparent" onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => setIsHovering(false)}>HOW IT WORKS</a>
          <a href="#problem" className="hidden md:block font-[500] font-[var(--font-body)] text-[11px] tracking-[0.12em] text-[var(--ink-2)] hover:text-[var(--teal)] transition-colors decoration-transparent" onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => setIsHovering(false)}>THE PROBLEM</a>
          <div className="hidden md:block w-[1px] h-[16px] bg-[var(--border-light)]" />
          <a 
            href="/auth" 
            id="loginBtn"
            onClick={(e) => fadeToPage(e, '/auth')}
            className="border border-[var(--ink)] bg-transparent text-[var(--ink)] font-[500] font-[var(--font-body)] text-[12px] tracking-[0.06em] px-[22px] py-[9px] rounded-[2px] transition-all duration-200 hover:bg-[var(--ink)] hover:text-[var(--bg-base)]"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            Login / Register
          </a>
        </div>
      </nav>

      <main className="cinematic-container">
        {/* HERO SECTION */}
        <section className="relative w-full min-h-[720px] h-[100vh] grid grid-cols-1 md:grid-cols-[1fr_340px] bg-[var(--bg-base)]">
          <div className="relative px-[24px] md:px-[100px] flex flex-col justify-center">
             




             <video 
               className="hero-video" 
               src="ai_vid.mp4" 
               autoPlay 
               muted 
               loop 
               playsInline
               style={{
                 position: 'absolute',
                 top: 0, left: 0,
                 width: '100%', height: '100%',
                 objectFit: 'cover',
                 opacity: 0.18,
                 pointerEvents: 'none',
                 zIndex: 0
               }}
             />

             <h1 className="max-w-[780px] pt-[20px] z-10 relative">
                <span className="font-[700] font-[var(--font-display)] text-[56px] md:text-[96px] text-[var(--ink)] block leading-[0.92] tracking-[-2px] reveal" style={{ transitionDelay: '0s', transitionDuration: '1s' }}>Your skin,</span>
                <span className="italic font-[700] font-[var(--font-display)] text-[56px] md:text-[96px] text-[var(--teal)] block leading-[0.92] tracking-[-2px] mt-[-6px] ml-[-4px] md:ml-[-6px] reveal" style={{ transitionDelay: '0.15s', transitionDuration: '1s' }}>seen clearly.</span>
                <span className="font-[700] font-[var(--font-display)] text-[56px] md:text-[96px] text-[var(--ink)] block leading-[0.92] tracking-[-2px] mt-[-6px] reveal" style={{ transitionDelay: '0.3s', transitionDuration: '1s' }}>Expert care,</span>
                <span className="italic font-[700] font-[var(--font-display)] text-[56px] md:text-[96px] text-[var(--teal)] block leading-[0.92] tracking-[-2px] mt-[-2px] ml-[-4px] md:ml-[-6px] reveal" style={{ transitionDelay: '0.45s', transitionDuration: '1s' }}>within reach.</span>
             </h1>

             <p className="t-body-lg max-w-[460px] text-[var(--ink-2)] mt-[48px] relative z-10 reveal" style={{ transitionDelay: '0.65s' }}>
               Derma-AI analyzes your skin photo, classifies the condition among 10+ diagnoses, assesses urgency, and guides your next step — without replacing your doctor.
             </p>

             <div className="flex flex-col sm:flex-row gap-[16px] mt-[48px] relative z-10 reveal" style={{ transitionDelay: '0.8s' }}>
                <a 
                  href="/auth" 
                  onClick={(e) => fadeToPage(e, '/auth')}
                  className="bg-[var(--ink)] text-[var(--bg-base)] font-[500] font-[var(--font-body)] text-[13px] tracking-[0.04em] px-[36px] py-[15px] rounded-[2px] border-none hover:bg-[var(--teal)] transition-colors duration-250 text-center"
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                >
                  Start Screening &rarr;
                </a>
                <a 
                  href="#how" 
                  className="bg-transparent border border-[var(--border-light)] text-[var(--ink-2)] font-[500] font-[var(--font-body)] text-[13px] tracking-[0.04em] px-[36px] py-[15px] rounded-[2px] hover:border-[var(--ink)] hover:text-[var(--ink)] transition-colors duration-200 text-center"
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => setIsHovering(false)}
                >
                  See How It Works
                </a>
             </div>
          </div>


        </section>

        {/* PROBLEM SECTION */}
        <section id="problem" className="section-padding bg-[var(--bg-paper)]">
           <div className="t-label text-[var(--teal)] mb-[20px] flex items-center reveal">
             <div className="w-[28px] h-[1px] bg-[var(--teal)] mr-[14px]" />
             THE PROBLEM
           </div>

           <h2 className="t-h2 text-[var(--ink)] max-w-[600px] reveal stagger-1">
             Millions wait.<br/>
             <span className="italic text-[var(--teal)]">Conditions worsen.</span>
           </h2>

           <p className="t-body-lg text-[var(--ink-2)] max-w-[500px] mt-[24px] reveal stagger-2">
             Access to specialized skin care is severely limited in India, leading to delayed diagnoses and dangerous self-management.
           </p>

           <div className="grid grid-cols-1 md:grid-cols-5 gap-[1px] mt-[80px] bg-[var(--border-light)]/20 rounded-[12px] overflow-hidden reveal stagger-3 border border-white/20 shadow-2xl">
              {[
                { i: 'fa-chart-line', t: 'High Burden', d: 'Eczema, psoriasis, fungal infections, early melanoma — widespread and growing.' },
                { i: 'fa-clock', t: 'Limited Access', d: 'Critical shortage of dermatologists. Most patients wait months.' },
                { i: 'fa-times-circle', t: 'Incorrect Care', d: 'Self-diagnosis leads to wrong treatments and worsening conditions.' },
                { i: 'fa-question-circle', t: 'Unclear Urgency', d: "Patients can't tell if they need care today, this week, or urgently." },
                { i: 'fa-robot', t: 'Need for Scale', d: 'An AI triage solution can reach millions beyond specialist reach.' }
              ].map((card, idx) => (
                 <div key={idx} className="bg-white/40 backdrop-blur-xl p-[36px_28px] transition-all duration-300 hover:bg-white/60 group" style={{ borderTop: '3px solid var(--teal)' }} onMouseEnter={(e) => { (e.currentTarget.style.borderTopColor = 'var(--coral)') }} onMouseLeave={(e) => { (e.currentTarget.style.borderTopColor = 'var(--teal)') }}>
                    <i className={`fa-solid ${card.i} text-[20px] text-[var(--teal)] mb-[28px] group-hover:text-[var(--coral)] transition-colors duration-300`} />
                    <div className="t-card-title text-[var(--ink)] mb-[12px] transition-colors duration-300">{card.t}</div>
                    <div className="t-body text-[var(--ink-2)] transition-colors duration-300">{card.d}</div>
                 </div>
              ))}
           </div>
        </section>

        <section id="how" className="relative w-full h-[100vh] min-h-[800px] flex flex-col justify-center section-padding bg-[var(--bg-dark)] color-[var(--paper-text)] overflow-hidden">
           <video 
             id="how-video"
             src="how_vid.mp4" 
             autoPlay 
             muted 
             loop 
             playsInline
             style={{
               position: 'absolute',
               top: 0, left: 0,
               width: '100%', height: '100%',
               objectFit: 'cover',
               opacity: 0.2,
               pointerEvents: 'none',
               zIndex: 0
             }}
           />
           <div className="relative z-10 p-[48px] md:p-[64px] rounded-[24px] border border-[rgba(255,255,255,0.1)] bg-[rgba(20,20,20,0.4)] backdrop-blur-[20px] reveal">
              <div className="t-label text-[var(--teal-light)] mb-[20px] flex items-center">
                 <div className="w-[28px] h-[1px] bg-[var(--teal-light)] mr-[14px]" />
                 03 / HOW IT WORKS
              </div>

              <h2 className="t-h2 text-[var(--paper-text)]">
                Five steps.<br/>
                <span className="italic text-[var(--teal-light)]">One clear answer.</span>
              </h2>

              <div className="relative mt-[80px]">
                 <div className="hidden lg:block absolute top-[44px] left-[8%] right-[8%] h-[1px] bg-[rgba(255,255,255,0.08)]" />
                 
                 <div className="flex flex-col lg:flex-row justify-between items-center lg:items-start flex-wrap gap-[40px] lg:gap-0">
                    {[
                      { i: 'fa-upload', t: 'Photo Upload', d: 'Snap a clear photo of your skin concern' },
                      { i: 'fa-microchip', t: 'AI Classification', d: 'Matched against 10+ skin conditions' },
                      { i: 'fa-heartbeat', t: 'Urgency Assessment', d: 'Routine, Soon, or Urgent' },
                      { i: 'fa-percent', t: 'Clear Uncertainty', d: 'Confidence % on every result' },
                      { i: 'fa-stethoscope', t: 'Care or Referral', d: 'First-line advice or specialist referral' }
                    ].map((step, idx) => (
                       <div key={idx} className="flex flex-col items-center w-[180px] text-center z-10 reveal" style={{ transitionDelay: `${(idx + 1) * 80}ms` }}>
                          <div className="w-[80px] h-[80px] rounded-full bg-[var(--bg-dark-2)] border border-[rgba(255,255,255,0.12)] flex items-center justify-center relative hover:border-[var(--teal-light)] hover:shadow-[0_0_0_4px_rgba(42,155,130,0.15)] transition-all duration-300">
                             <div className="absolute -top-[4px] -right-[4px] w-[22px] h-[22px] rounded-full bg-[var(--teal)] text-[var(--bg-dark)] font-[500] font-[var(--font-body)] text-[11px] flex items-center justify-center">
                               {idx + 1}
                             </div>
                             <i className={`fa-solid ${step.i} text-[26px] text-[var(--teal-light)]`} />
                          </div>
                          <div className="font-[500] font-[var(--font-body)] text-[15px] text-[var(--paper-text)] mt-[24px]">{step.t}</div>
                          <div className="font-[300] font-[var(--font-body)] text-[13px] text-[var(--paper-muted)] mt-[8px] max-w-[140px] leading-[1.6]">
                            {step.d}
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
           </div>
        </section>

        {/* FEATURES SECTION */}
        <section className="section-padding bg-[var(--bg-base)]">
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-[40px] lg:gap-[100px] items-center">
              <div className="lg:col-span-5">
                 <div className="t-label text-[var(--teal)] mb-[20px] flex items-center reveal">
                   <div className="w-[28px] h-[1px] bg-[var(--teal)] mr-[14px]" />
                   WHY DERMA-AI
                 </div>
                 <h2 className="t-h2 !text-[52px] text-[var(--ink)] reveal stagger-1" dangerouslySetInnerHTML={{__html: "Designed for<br/>every skin tone."}} />
                 <p className="t-body-lg text-[var(--ink-2)] max-w-[380px] mt-[24px] reveal stagger-2">
                   Fitzpatrick skin tone calibration ensures accuracy across the full spectrum of Indian skin tones. This isn't a feature — it's the foundation.
                 </p>
                 <div className="w-[40px] h-[2px] bg-[var(--teal)] mt-[36px] reveal stagger-3" />
              </div>

              <div className="lg:col-span-7 flex flex-col gap-[2px]">
                  {[
                   { t: 'Multi-photo progression', d: 'Track your condition across multiple sessions' },
                   { t: 'Differential diagnosis', d: 'Top 3 possible conditions with distinguishing features' },
                   { t: 'Visit prep guide', d: 'Know exactly what photos and history to bring your doctor' },
                   { t: 'Confidence score', d: 'Uncertainty percentage shown on every single result' }
                 ].map((feat, idx) => (
                    <div key={idx} className={`flex gap-[20px] items-start p-[28px] bg-white/40 mb-[16px] rounded-[12px] backdrop-blur-xl border border-white/60 shadow-lg transition-all duration-300 hover:bg-white/60 hover:shadow-2xl group reveal stagger-${idx % 4 + 1}`}>
                       <div className="w-[38px] h-[38px] rounded-full flex-shrink-0 bg-[var(--teal)]/10 border border-[var(--teal)]/30 flex items-center justify-center group-hover:bg-[var(--teal)]/20 transition-colors">
                          <i className="fa-solid fa-check text-[13px] text-[var(--teal)]" />
                       </div>
                       <div>
                          <div className="font-[600] font-[var(--font-display)] text-[19px] text-[var(--ink)] transition-colors">{feat.t}</div>
                          <div className="t-body text-[14px] text-[var(--ink-2)] mt-[4px] transition-colors">{feat.d}</div>
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        </section>

        {/* URGENCY SECTION */}
        <section className="section-padding bg-[var(--bg-paper)]">
           <div className="max-w-[700px] mx-auto text-center bg-[var(--bg-base)] border border-[var(--border-light)] border-t-[3px] border-t-[var(--teal)] p-[64px] reveal">
              <div className="t-label text-[var(--teal)] mb-[20px] flex items-center justify-center">
                 URGENCY SYSTEM
              </div>
              <h2 className="t-h2 !text-[44px] text-[var(--ink)]">
                We tell you what we know.<br/>
                <span className="italic text-[var(--teal)]">And what we don't.</span>
              </h2>

              <div className="mt-[48px] flex flex-wrap gap-[20px] justify-center">
                 <div className="flex flex-col items-center gap-[8px]">
                    <div className="bg-[rgba(26,107,90,0.08)] border border-[rgba(26,107,90,0.3)] rounded-[2px] px-[24px] py-[12px] font-[500] font-[var(--font-body)] text-[12px] tracking-[0.1em] text-[var(--teal)]">● ROUTINE</div>
                    <div className="font-[300] font-[var(--font-body)] text-[12px] text-[var(--ink-2)]">Monitor at home</div>
                 </div>
                 <div className="flex flex-col items-center gap-[8px]">
                    <div className="bg-[rgba(200,137,10,0.08)] border border-[rgba(200,137,10,0.3)] rounded-[2px] px-[24px] py-[12px] font-[500] font-[var(--font-body)] text-[12px] tracking-[0.1em] text-[var(--amber)]">● SOON</div>
                    <div className="font-[300] font-[var(--font-body)] text-[12px] text-[var(--ink-2)]">See a doctor this week</div>
                 </div>
                 <div className="flex flex-col items-center gap-[8px]">
                    <div className="bg-[rgba(192,67,42,0.08)] border border-[rgba(192,67,42,0.3)] rounded-[2px] px-[24px] py-[12px] font-[500] font-[var(--font-body)] text-[12px] tracking-[0.1em] text-[var(--coral)]">● URGENT</div>
                    <div className="font-[300] font-[var(--font-body)] text-[12px] text-[var(--ink-2)]">Seek care immediately</div>
                 </div>
              </div>

              <div className="mt-[48px] pt-[32px] border-t border-[var(--border-light)] font-[300] font-[var(--font-body)] text-[13px] text-[var(--ink-3)] text-center">
                Urgency levels are screening indicators only, not clinical diagnoses. Always consult a qualified dermatologist.
              </div>
           </div>
        </section>

        {/* IMPACT SECTION */}
        <section className="section-padding bg-[var(--bg-dark)] color-[var(--paper-text)]">
           <div className="t-label text-[var(--teal-light)] mb-[20px] flex items-center reveal">
             <div className="w-[28px] h-[1px] bg-[var(--teal-light)] mr-[14px]" />
             THE IMPACT
           </div>
           
           <h2 className="t-h2 text-[var(--paper-text)] reveal stagger-1">
             What changes when<br/>
             <span className="italic text-[var(--teal-light)]">access exists.</span>
           </h2>

           <div className="mt-[64px] rounded-[16px] overflow-hidden shadow-2xl border border-white/10 gap-[1px] grid grid-cols-1 md:grid-cols-2 reveal stagger-2">
              {[
                { n: '01', t: 'Earlier Care', d: 'Conditions caught before they escalate' },
                { n: '02', t: 'Safer Self-Care', d: 'Evidence-based guidance, not guesswork' },
                { n: '03', t: 'Specialist Prep', d: 'Better informed patients, more efficient consults' },
                { n: '04', t: 'India-Wide', d: 'Scalable screening without specialist bottlenecks' }
              ].map((card, idx) => (
                 <div key={idx} className="bg-[rgba(255,255,255,0.05)] backdrop-blur-md p-[48px_40px] hover:bg-[rgba(255,255,255,0.1)] transition-colors border-b border-r border-white/5 duration-300">
                    <div className="font-[700] font-[var(--font-display)] text-[56px] text-[var(--teal-light)] mb-[16px] mix-blend-screen">{card.n}</div>
                    <div className="font-[500] font-[var(--font-body)] text-[18px] text-[var(--paper-text)]">{card.t}</div>
                    <div className="font-[300] font-[var(--font-body)] text-[14px] text-[var(--paper-muted)] mt-[8px]">{card.d}</div>
                 </div>
              ))}
           </div>
        </section>
      </main>

      <footer className="p-[40px_24px] md:p-[40px_100px] bg-[var(--bg-dark)] border-t border-[var(--border-dark)] flex flex-col md:flex-row justify-between items-center gap-[24px]">
        <div className="font-[500] font-[var(--font-body)] text-[13px] text-[var(--paper-muted)]">
          DERMA-AI.
        </div>
        <div className="font-[300] font-[var(--font-body)] text-[12px] text-[var(--paper-muted)] max-w-[400px] text-center">
          Derma-AI is a screening tool, not a diagnostic service. Consult a qualified dermatologist for medical advice.
        </div>
        <a 
          href="/auth" 
          id="loginBtnFooter"
          onClick={(e) => fadeToPage(e, '/auth')}
          className="font-[500] font-[var(--font-body)] text-[13px] text-[var(--teal-light)] hover:opacity-80 transition-opacity decoration-transparent"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          Login / Register &rarr;
        </a>
      </footer>
    </>
  );
}
