import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, googleProvider } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, sendPasswordResetEmail, updateProfile, onAuthStateChanged } from 'firebase/auth';
import { supabase } from '../lib/supabase';

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [currentPanel, setCurrentPanel] = useState<'login' | 'register' | 'forgot-password'>('login');
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const [isHovering, setIsHovering] = useState(false);
  const [sliderStyle, setSliderStyle] = useState({ width: 0, transform: 'translateX(0)' });

  const loginRef = useRef<HTMLButtonElement>(null);
  const registerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();

  useEffect(() => {
    // If user is already logged in, send them to dashboard
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        navigate('/dashboard');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleBackClick = (e: React.MouseEvent) => {
    e.preventDefault();
    document.body.classList.remove('fade-in-page');
    document.body.classList.add('fading');
    setTimeout(() => {
      navigate('/');
    }, 500);
  };

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
    const activeRef = activeTab === 'login' ? loginRef.current : registerRef.current;
    if (activeRef) {
      setSliderStyle({
        width: activeRef.offsetWidth,
        transform: `translateX(${activeRef.offsetLeft - 3}px)` // assuming 3px padding in the wrap
      });
    }
  }, [activeTab]);

  const handleTabChange = (tab: 'login' | 'register' | 'forgot-password') => {
    if (tab === activeTab && tab !== 'forgot-password') return;
    if (tab !== 'forgot-password') {
      setActiveTab(tab as 'login' | 'register');
    }
    setIsFadingOut(true);
    setTimeout(() => {
      setCurrentPanel(tab);
      setResetSent(false);
      requestAnimationFrame(() => {
        setIsFadingOut(false);
      });
    }, 150);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    if (currentPanel === 'forgot-password') {
      handleForgotPassword();
      return;
    }

    try {
      if (currentPanel === 'register') {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, {
          displayName: name
        });
        
        setIsSubmitting(false);
        setShowSuccess(true);
        setTimeout(() => navigate('/dashboard'), 1500);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setIsSubmitting(false);
        setShowSuccess(true);
        setTimeout(() => {
          navigate('/dashboard');
        }, 1500);
      }
    } catch (error: any) {
      console.error("Auth error details:", error);
      setIsSubmitting(false);
      
      let errorMessage = error.message || 'Authentication failed. Please try again.';
      if (error.code === 'auth/operation-not-allowed') {
        errorMessage = 'Email/Password authentication is not enabled. Please enable it in your Firebase Console under Authentication -> Sign-in method.';
      }
      alert(errorMessage);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      alert('Please enter your email address first.');
      setIsSubmitting(false);
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
      setIsSubmitting(false);
    } catch (error: any) {
      console.error(error);
      setIsSubmitting(false);
      alert(error.message || 'Failed to send reset email.');
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsSubmitting(true);
      await signInWithPopup(auth, googleProvider);
      navigate('/dashboard');
    } catch (error: any) {
      console.error(error);
      setIsSubmitting(false);
      if (error.code === 'auth/popup-closed-by-user') {
        // Just ignore it or show a mild message, do not alert a scary error
        return;
      }
      if (error.code === 'auth/operation-not-allowed') {
         alert('Google Sign-In is not enabled. Please enable it in your Firebase Console under Authentication -> Sign-in method.');
         return;
      }
      alert(error.message || 'Google Sign-In failed. Please try again.');
    }
  };

  return (
    <>
      <div 
        className={`custom-cursor hidden md:block ${isHovering ? 'hovering' : ''}`}
        style={{ left: cursorPos.x, top: cursorPos.y }}
      />
      
      <div className="min-h-[100vh] grid grid-cols-1 md:grid-cols-[45%_55%]">
        
        {/* LEFT PANEL */}
        <div className="bg-[var(--bg-dark)] border-r border-[var(--border-dark)] p-[72px_64px] flex flex-col justify-between">
           <div>
              <div className="flex items-center mb-[72px]">
                <span className="font-[500] font-[var(--font-body)] text-[15px] text-[var(--paper-text)] tracking-[0.05em]">
                  DERMA-AI.
                </span>
                <span className="w-[6px] h-[6px] bg-[var(--teal)] rounded-full inline-block ml-[3px]" />
              </div>

              <div>
                 <h1 className="font-[700] italic font-[var(--font-display)] text-[48px] leading-[1.05] text-[var(--paper-text)] max-w-[340px]" dangerouslySetInnerHTML={{__html: "Skin health starts<br/>with one photo."}} />
                 <p className="font-[300] font-[var(--font-body)] text-[16px] text-[var(--paper-muted)] mt-[24px] max-w-[320px]">
                   Upload a photo of your concern. Derma-AI analyzes it, assesses urgency, and guides your next step — all in seconds.
                 </p>
              </div>
           </div>

           <div className="mt-[64px]">
              {[
                { i: 'fa-lock', t: 'Photos private and never stored' },
                { i: 'fa-user-md', t: 'Not diagnostic — always see a doctor' },
                { i: 'fa-globe', t: "Built for India's skin diversity" }
              ].map((trust, idx) => (
                 <div key={idx} className="flex items-center gap-[12px] mb-[16px]">
                    <i className={`fa-solid ${trust.i} text-[14px] text-[var(--paper-muted)] w-[16px] text-center`} />
                    <span className="font-[400] font-[var(--font-body)] text-[13px] text-[var(--paper-muted)]">{trust.t}</span>
                 </div>
              ))}
           </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="bg-[var(--bg-base)] p-[72px_64px] flex flex-col justify-center">
           <a 
            href="/" 
            onClick={handleBackClick}
            className="font-[400] font-[var(--font-body)] text-[12px] text-[var(--ink-2)] hover:text-[var(--teal)] mb-[48px] self-start transition-colors decoration-transparent"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
           >
             &larr; Back to Home
           </a>

           <div className="w-full max-w-[380px] mx-auto md:mx-0">
             {showSuccess ? (
                <div className="text-center py-[48px]">
                   <h2 className="font-[600] font-[var(--font-display)] text-[36px] text-[var(--ink)]">Welcome to Derma-AI</h2>
                   <p className="font-[300] font-[var(--font-body)] text-[15px] text-[var(--ink-2)] mt-[12px] mb-[32px]">Setting up your dashboard...</p>
                   <div className="w-full h-[2px] bg-[var(--border-light)] relative overflow-hidden rounded-[2px]">
                      <div className="absolute top-0 left-0 h-full bg-[var(--teal)]" style={{ animation: 'slide-progress 1.5s ease forwards' }} />
                   </div>
                   <style dangerouslySetInnerHTML={{__html: `
                     @keyframes slide-progress {
                       from { width: 0%; }
                       to { width: 100%; }
                     }
                   `}} />
                </div>
             ) : (
                <>
                  <div ref={containerRef} className="relative inline-flex bg-[var(--bg-paper)] border border-[var(--border-light)] rounded-[2px] p-[3px] mb-[40px] gap-0">
                     <div 
                        className="absolute top-[3px] left-[3px] h-[calc(100%-6px)] rounded-[1px] bg-[var(--ink)] z-[0] pointer-events-none"
                        style={{
                           width: `${sliderStyle.width}px`,
                           transform: sliderStyle.transform,
                           transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)'
                        }}
                     />
                     <button 
                        ref={loginRef}
                        onClick={() => handleTabChange('login')}
                        className={`relative z-[1] font-[500] font-[var(--font-body)] text-[12px] tracking-[0.06em] px-[32px] py-[10px] rounded-[1px] bg-transparent border-none cursor-pointer transition-colors duration-300 ${activeTab === 'login' ? 'text-[var(--bg-base)]' : 'text-[var(--ink-2)]'}`}
                        type="button"
                     >
                       Login
                     </button>
                     <button 
                        ref={registerRef}
                        onClick={() => handleTabChange('register')}
                        className={`relative z-[1] font-[500] font-[var(--font-body)] text-[12px] tracking-[0.06em] px-[32px] py-[10px] rounded-[1px] bg-transparent border-none cursor-pointer transition-colors duration-300 ${activeTab === 'register' ? 'text-[var(--bg-base)]' : 'text-[var(--ink-2)]'}`}
                        type="button"
                     >
                       Register
                     </button>
                  </div>

                  <div 
                     style={{ 
                        opacity: isFadingOut ? 0 : 1,
                        transform: isFadingOut ? 'translateY(8px)' : 'translateY(0)',
                        pointerEvents: isFadingOut ? 'none' : 'auto',
                        transition: isFadingOut ? 'opacity 0.15s ease, transform 0.15s ease' : 'opacity 0.25s ease-out, transform 0.25s ease-out'
                     }}
                     className="w-full"
                  >
                     <form onSubmit={handleSubmit} className="w-full">
                        {currentPanel === 'register' && (
                          <div className="mb-[24px]">
                            <label className="block font-[500] font-[var(--font-body)] text-[11px] tracking-[0.1em] text-[var(--ink-3)] uppercase mb-[4px]">Full Name</label>
                            <input 
                              required type="text" 
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              className="w-full bg-transparent border-none border-b border-[var(--border-light)] rounded-none px-0 py-[14px] font-[300] font-[var(--font-body)] text-[15px] text-[var(--ink)] outline-none focus:border-[var(--teal)] transition-colors duration-200" 
                            />
                          </div>
                        )}

                        <div className="mb-[24px]">
                          <label className="block font-[500] font-[var(--font-body)] text-[11px] tracking-[0.1em] text-[var(--ink-3)] uppercase mb-[4px]">Email Address</label>
                          <input 
                            required type="email" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-transparent border-none border-b border-[var(--border-light)] rounded-none px-0 py-[14px] font-[300] font-[var(--font-body)] text-[15px] text-[var(--ink)] outline-none focus:border-[var(--teal)] transition-colors duration-200" 
                          />
                        </div>

                        {currentPanel !== 'forgot-password' && (
                          <div className="mb-[24px]">
                            <div className="flex justify-between items-end mb-[4px]">
                              <label className="block font-[500] font-[var(--font-body)] text-[11px] tracking-[0.1em] text-[var(--ink-3)] uppercase">Password</label>
                              {currentPanel === 'login' && (
                                <button 
                                  type="button"
                                  onClick={() => handleTabChange('forgot-password')}
                                  className="font-[500] font-[var(--font-body)] text-[11px] text-[var(--teal)] hover:text-[var(--teal-light)] transition-colors border-none bg-transparent cursor-pointer p-0"
                                >
                                  Forgot password?
                                </button>
                              )}
                            </div>
                            <input 
                              required type="password" 
                              minLength={6}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="w-full bg-transparent border-none border-b border-[var(--border-light)] rounded-none px-0 py-[14px] font-[300] font-[var(--font-body)] text-[15px] text-[var(--ink)] outline-none focus:border-[var(--teal)] transition-colors duration-200" 
                            />
                          </div>
                        )}

                        {currentPanel === 'forgot-password' && resetSent && (
                          <p className="font-[400] font-[var(--font-body)] text-[13px] text-[var(--teal)] mb-[24px]">
                            A password reset link has been sent to your email.
                          </p>
                        )}

                        {currentPanel === 'forgot-password' && (
                          <button 
                            type="button"
                            onClick={() => handleTabChange('login')}
                            className="font-[500] font-[var(--font-body)] text-[11px] text-[var(--teal)] hover:text-[var(--teal-light)] transition-colors border-none bg-transparent cursor-pointer p-0 mb-[24px] block"
                          >
                            &larr; Back to Login
                          </button>
                        )}

                        {currentPanel === 'register' && (
                          <div className="mb-[32px]">
                            <label className="block font-[500] font-[var(--font-body)] text-[11px] tracking-[0.1em] text-[var(--ink-3)] uppercase mb-[4px]">Confirm Password</label>
                            <input 
                              required type="password" 
                              minLength={6}
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="w-full bg-transparent border-none border-b border-[var(--border-light)] rounded-none px-0 py-[14px] font-[300] font-[var(--font-body)] text-[15px] text-[var(--ink)] outline-none focus:border-[var(--teal)] transition-colors duration-200" 
                            />
                          </div>
                        )}

                        <button 
                          type="submit" 
                          disabled={isSubmitting}
                          className="w-full h-[50px] bg-[var(--ink)] border-none rounded-[2px] font-[500] font-[var(--font-body)] text-[13px] tracking-[0.06em] text-[var(--bg-base)] cursor-pointer mt-[16px] hover:bg-[var(--teal)] transition-all duration-250 disabled:opacity-70 disabled:hover:bg-[var(--ink)]"
                          onMouseEnter={() => setIsHovering(true)}
                          onMouseLeave={() => setIsHovering(false)}
                        >
                          {isSubmitting ? 'Loading...' : (currentPanel === 'login' ? 'Sign In' : currentPanel === 'register' ? 'Create Account' : 'Send Reset Link')}
                        </button>
                     </form>
                     
                     <div className="flex items-center my-[24px]">
                        <div className="flex-1 h-[1px] bg-[var(--border-light)]"></div>
                        <span className="px-[16px] font-[400] font-[var(--font-body)] text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Or</span>
                        <div className="flex-1 h-[1px] bg-[var(--border-light)]"></div>
                     </div>

                     <button 
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={isSubmitting}
                        className="w-full h-[50px] bg-transparent border border-[var(--border-light)] rounded-[2px] font-[500] font-[var(--font-body)] text-[13px] tracking-[0.04em] text-[var(--ink)] cursor-pointer hover:border-[var(--ink)] hover:bg-[var(--bg-paper)] transition-all duration-250 disabled:opacity-70 flex lg:gap-[10px] items-center justify-center gap-[8px]"
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                     >
                        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
                           <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                           <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                           <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                           <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        Continue with Google
                     </button>
                  </div>
                </>
             )}
           </div>
        </div>
      </div>
    </>
  );
}
